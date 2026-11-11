// Document의 유효성을 판정하는 유일한 곳 (AD-9).
// web의 가져오기, api의 저장, engine의 불러오기가 모두 이 파일의 함수를 쓴다.
// 어떤 값을 넣어도 예외를 던지지 않고, 틀리면 구별되는 오류 코드를 돌려준다.

import { errorInfo } from "./codes";
import type { ErrorInfo } from "./codes";
import { isPortName } from "./document";
import type { DeviceKind, TopologyDocument } from "./document";
import { TOPOLOGY_EXPORT_KIND } from "./export-file";
import { CURRENT_SCHEMA_VERSION, LIMITS } from "./limits";
import { checkRipConfig, checkRouterInterfaceOverlap, checkStaticRoute } from "./router-config";
import { topologyDocumentSchema, traceSchema } from "./schema";
import type { ParsedDocument } from "./schema";
import type { Trace } from "./trace";
import {
  checkDeviceName,
  checkTopologyName,
  checkGateway,
  checkInterfaceAddress,
  checkVlanId,
  checkVlanName,
  isUuid,
  utf8ByteLength,
} from "./values";

export type DocumentResult =
  | { readonly ok: true; readonly document: TopologyDocument }
  | { readonly ok: false; readonly error: ErrorInfo };

/** 내보낸 파일을 읽은 결과 (T7.1.2) */
export type ExportFileResult =
  | { readonly ok: true; readonly name: string; readonly document: TopologyDocument }
  | { readonly ok: false; readonly error: ErrorInfo };

export type TraceCheckResult =
  | { readonly ok: true; readonly trace: Trace }
  | { readonly ok: false; readonly error: ErrorInfo };

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function fail(error: ErrorInfo): { readonly ok: false; readonly error: ErrorInfo } {
  return { ok: false, error };
}

function shapeError(path: string): ErrorInfo {
  return errorInfo("DOCUMENT_INVALID_SHAPE", { path: path.slice(0, 200) });
}

/** 금지 키와 중첩 깊이를 확인한다 (SEC-8). 순환 참조는 깊이 한도에서 걸린다 */
function scanStructure(input: unknown): ErrorInfo | null {
  const stack: { value: unknown; depth: number }[] = [{ value: input, depth: 1 }];

  for (let item = stack.pop(); item !== undefined; item = stack.pop()) {
    const { value, depth } = item;
    if (typeof value !== "object" || value === null) continue;
    if (depth > LIMITS.maxDocumentDepth) {
      return errorInfo("DOCUMENT_TOO_DEEP", { limit: LIMITS.maxDocumentDepth });
    }

    if (Array.isArray(value)) {
      for (const element of value) stack.push({ value: element, depth: depth + 1 });
      continue;
    }

    for (const key of Object.keys(value)) {
      if (FORBIDDEN_KEYS.has(key)) {
        return errorInfo("DOCUMENT_FORBIDDEN_KEY", { key });
      }
      stack.push({ value: (value as Record<string, unknown>)[key], depth: depth + 1 });
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `schemaVersion`이 1과 현재 버전 사이의 정수인지 (SEC-8) */
function checkVersion(input: Record<string, unknown>): ErrorInfo | null {
  const version = input.schemaVersion;
  if (typeof version !== "number") return shapeError("schemaVersion");
  if (!Number.isInteger(version) || version < 1 || version > CURRENT_SCHEMA_VERSION) {
    return errorInfo("DOCUMENT_UNSUPPORTED_VERSION", { current: CURRENT_SCHEMA_VERSION });
  }
  return null;
}

type ParsedDevice = ParsedDocument["devices"][number];

function checkPcConfig(
  config: Extract<ParsedDevice, { kind: "pc" }>["config"],
  path: string,
): ErrorInfo | null {
  const { ip, mask, gateway } = config;
  if (ip === undefined) {
    return mask === undefined && gateway === undefined ? null : shapeError(`${path}.ip`);
  }
  if (mask === undefined) return shapeError(`${path}.mask`);

  return (
    checkInterfaceAddress(ip, mask) ??
    (gateway === undefined ? null : checkGateway(gateway, ip, mask))
  );
}

function checkSwitchConfig(
  deviceId: string,
  config: Extract<ParsedDevice, { kind: "switch" }>["config"],
  path: string,
): ErrorInfo | null {
  if (config.vlans.length > LIMITS.maxVlansPerSwitch) {
    return errorInfo("LIMIT_EXCEEDED", { limit: "vlans", max: LIMITS.maxVlansPerSwitch });
  }

  const vlanIds = new Set<number>();
  for (const vlan of config.vlans) {
    const error = checkVlanId(vlan.id) ?? checkVlanName(vlan.name);
    if (error) return error;
    if (vlanIds.has(vlan.id)) return errorInfo("DUPLICATE_VLAN", { deviceId, vlanId: vlan.id });
    vlanIds.add(vlan.id);
  }

  for (const [port, portConfig] of Object.entries(config.ports)) {
    if (!isPortName("switch", port)) {
      return errorInfo("UNKNOWN_PORT", { deviceId, kind: "switch", port });
    }
    if (portConfig.accessVlan !== undefined) {
      const error = checkVlanId(portConfig.accessVlan);
      if (error) return error;
    }

    const ranges = portConfig.allowedVlans ?? [];
    if (ranges.length > LIMITS.maxAllowedVlanRanges) {
      return errorInfo("LIMIT_EXCEEDED", {
        limit: "allowedVlanRanges",
        max: LIMITS.maxAllowedVlanRanges,
      });
    }
    for (const [start, end] of ranges) {
      const error = checkVlanId(start) ?? checkVlanId(end);
      if (error) return error;
      if (start > end) return shapeError(`${path}.ports.${port}.allowedVlans`);
    }
  }
  return null;
}

function checkRouterConfig(
  deviceId: string,
  config: Extract<ParsedDevice, { kind: "router" }>["config"],
  path: string,
): ErrorInfo | null {
  for (const [port, iface] of Object.entries(config.interfaces)) {
    if (!isPortName("router", port)) {
      return errorInfo("UNKNOWN_PORT", { deviceId, kind: "router", port });
    }
    if ((iface.ip === undefined) !== (iface.mask === undefined)) {
      return shapeError(`${path}.interfaces.${port}`);
    }
    if (iface.ip !== undefined && iface.mask !== undefined) {
      const error = checkInterfaceAddress(iface.ip, iface.mask);
      if (error) return error;
    }
  }

  for (const [port, iface] of Object.entries(config.interfaces)) {
    if (iface.ip !== undefined && iface.mask !== undefined) {
      const overlap = checkRouterInterfaceOverlap(deviceId, port, iface.ip, iface.mask, config.interfaces);
      if (overlap !== null) return overlap;
    }
  }

  if (config.staticRoutes.length > LIMITS.maxStaticRoutesPerRouter) {
    return errorInfo("LIMIT_EXCEEDED", {
      limit: "staticRoutes",
      max: LIMITS.maxStaticRoutesPerRouter,
    });
  }
  for (const route of config.staticRoutes) {
    const error = checkStaticRoute(deviceId, route, config.interfaces);
    if (error) return error;
  }
  if (config.rip !== undefined) {
    const error = checkRipConfig(deviceId, config.rip);
    if (error) return error;
    const repeated = new Set(config.rip.networks).size !== config.rip.networks.length ||
      new Set(config.rip.passiveInterfaces).size !== config.rip.passiveInterfaces.length;
    if (repeated) return shapeError(`${path}.rip`);
  }
  return null;
}

function checkDeviceConfig(device: ParsedDevice, path: string): ErrorInfo | null {
  switch (device.kind) {
    case "pc":
      return checkPcConfig(device.config, path);
    case "switch":
      return checkSwitchConfig(device.id, device.config, path);
    case "router":
      return checkRouterConfig(device.id, device.config, path);
  }
}

/** 형태를 통과한 문서의 값, 참조, 유일성, 한도를 확인한다 */
function checkSemantics(document: ParsedDocument): ErrorInfo | null {
  if (document.devices.length > LIMITS.maxDevices) {
    return errorInfo("LIMIT_EXCEEDED", { limit: "devices", max: LIMITS.maxDevices });
  }
  if (document.links.length > LIMITS.maxLinks) {
    return errorInfo("LIMIT_EXCEEDED", { limit: "links", max: LIMITS.maxLinks });
  }

  const ids = new Set<string>();
  const names = new Set<string>();
  const kinds = new Map<string, DeviceKind>();

  for (const [index, device] of document.devices.entries()) {
    if (!isUuid(device.id)) return errorInfo("INVALID_ID", { id: device.id });
    if (ids.has(device.id)) return errorInfo("DUPLICATE_ID", { id: device.id });
    ids.add(device.id);

    const nameError = checkDeviceName(device.name);
    if (nameError) return nameError;
    if (names.has(device.name)) {
      return errorInfo("DUPLICATE_DEVICE_NAME", { name: device.name });
    }
    names.add(device.name);

    const configError = checkDeviceConfig(device, `devices.${index}.config`);
    if (configError) return configError;

    kinds.set(device.id, device.kind);
  }

  const usedPorts = new Set<string>();
  for (const link of document.links) {
    if (!isUuid(link.id)) return errorInfo("INVALID_ID", { id: link.id });
    if (ids.has(link.id)) return errorInfo("DUPLICATE_ID", { id: link.id });
    ids.add(link.id);

    for (const end of link.ends) {
      const kind = kinds.get(end.deviceId);
      if (kind === undefined) {
        return errorInfo("LINK_DEVICE_NOT_FOUND", {
          linkId: link.id,
          deviceId: end.deviceId,
        });
      }
      if (!isPortName(kind, end.port)) {
        return errorInfo("LINK_PORT_NOT_FOUND", {
          linkId: link.id,
          deviceId: end.deviceId,
          port: end.port,
        });
      }
    }

    const [first, second] = link.ends;
    if (first.deviceId === second.deviceId) {
      return errorInfo("LINK_SAME_DEVICE", { linkId: link.id, deviceId: first.deviceId });
    }

    for (const end of link.ends) {
      const key = `${end.deviceId} ${end.port}`;
      if (usedPorts.has(key)) {
        return errorInfo("PORT_IN_USE", { deviceId: end.deviceId, port: end.port });
      }
      usedPorts.add(key);
    }
  }
  return null;
}

/** 공백 없이 직렬화한 문서의 UTF-8 바이트 수 (SEC-12) */
export function documentByteSize(document: TopologyDocument): number {
  return utf8ByteLength(JSON.stringify(document));
}

function validateDocumentUnchecked(input: unknown): DocumentResult {
  const structureError = scanStructure(input);
  if (structureError) return fail(structureError);

  if (!isRecord(input)) return fail(shapeError(""));
  const versionError = checkVersion(input);
  if (versionError) return fail(versionError);

  const parsed = topologyDocumentSchema.safeParse(input);
  if (!parsed.success) {
    const path = parsed.error.issues[0]?.path.map(String).join(".") ?? "";
    return fail(shapeError(path));
  }

  const semanticError = checkSemantics(parsed.data);
  if (semanticError) return fail(semanticError);

  const size = documentByteSize(parsed.data);
  if (size > LIMITS.maxDocumentBytes) {
    return fail(errorInfo("DOCUMENT_TOO_LARGE", { size, limit: LIMITS.maxDocumentBytes }));
  }

  return { ok: true, document: parsed.data };
}

/**
 * 문서가 유효한지 판정한다. 유효하면 **검증된 값**을 돌려주며, 호출한 쪽은 넣은 값이 아니라 이 값을 써야 한다.
 * 정의되지 않은 필드는 돌려준 값에 없다.
 */
export function validateDocument(input: unknown): DocumentResult {
  try {
    return validateDocumentUnchecked(input);
  } catch {
    // 읽을 때 예외를 던지는 값(접근자, Proxy 등)
    return fail(shapeError(""));
  }
}

/**
 * 옛 버전의 문서를 현재 버전으로 올린다 (AD-9). 지금은 버전이 1뿐이라 그대로 돌려준다.
 * 형태를 바꿔 `schemaVersion`을 올릴 때 여기에 변환을 넣는다.
 */
export function migrateDocument(input: unknown): unknown {
  return input;
}

type JsonResult = { readonly ok: true; readonly raw: unknown } | { readonly ok: false; readonly error: ErrorInfo };

/** 공통 절차의 앞부분: 크기 → JSON 해석 → 금지 키와 중첩 깊이 (SEC-8) */
function readJson(text: string): JsonResult {
  if (typeof text !== "string") return fail(errorInfo("DOCUMENT_INVALID_JSON", {}));

  // 글자 수가 한도를 넘으면 바이트 수도 넘는다. 긴 입력을 끝까지 세지 않는다
  const size = text.length > LIMITS.maxImportBytes ? text.length : utf8ByteLength(text);
  if (size > LIMITS.maxImportBytes) {
    return fail(errorInfo("DOCUMENT_TOO_LARGE", { size, limit: LIMITS.maxImportBytes }));
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail(errorInfo("DOCUMENT_INVALID_JSON", {}));
  }

  const structureError = scanStructure(raw);
  return structureError ? fail(structureError) : { ok: true, raw };
}

/** 공통 절차의 뒷부분: `schemaVersion` → `migrateDocument()` → `validateDocument()` */
function readDocument(raw: unknown): DocumentResult {
  if (!isRecord(raw)) return fail(shapeError(""));
  const versionError = checkVersion(raw);
  if (versionError) return fail(versionError);
  return validateDocument(migrateDocument(raw));
}

/**
 * JSON 글자에서 문서를 읽는 공통 절차 (SEC-8). 가져오기와 저장이 같은 순서로 실행한다:
 * 크기 → JSON 해석 → 금지 키와 중첩 깊이 → `schemaVersion` → `migrateDocument()` → `validateDocument()`.
 * 내보낸 파일의 겉 포장은 `parseExportJson`이 읽는다.
 */
export function parseDocumentJson(text: string): DocumentResult {
  try {
    const json = readJson(text);
    return json.ok ? readDocument(json.raw) : json;
  } catch {
    return fail(shapeError(""));
  }
}

/**
 * 내보낸 파일(`{ kind: "topology-export", name, document }`)을 읽는다 (T7.1.2, FR-7).
 * `parseDocumentJson`과 같은 절차에 겉 포장 확인을 더한다: 크기 → JSON 해석 → 금지 키와 중첩 깊이 →
 * `kind` → `name`(토폴로지 이름 규칙) → `document`(`schemaVersion` → 변환 → 검증).
 * 겉 포장 없이 Document만 있는 파일은 받지 않는다 (설계 결정 4). 겉 포장의 다른 키는 무시한다.
 * 안쪽 문서의 형태 오류 위치는 파일 기준(`document.devices.0...`)으로 알려 준다
 */
export function parseExportJson(text: string): ExportFileResult {
  try {
    const json = readJson(text);
    if (!json.ok) return json;
    const { raw } = json;
    if (!isRecord(raw) || raw.kind !== TOPOLOGY_EXPORT_KIND) return fail(errorInfo("IMPORT_NOT_EXPORT_FILE", {}));

    const { name } = raw;
    if (typeof name !== "string") return fail(shapeError("name"));
    const nameError = checkTopologyName(name);
    if (nameError) return fail(nameError);

    const document = readDocument(raw.document);
    if (!document.ok) {
      const { error } = document;
      if (error.code !== "DOCUMENT_INVALID_SHAPE") return document;
      const { path } = error.params as { readonly path: string };
      return fail(shapeError(path === "" ? "document" : `document.${path}`));
    }
    return { ok: true, name, document: document.document };
  } catch {
    return fail(shapeError(""));
  }
}

function traceError(path: string): { readonly ok: false; readonly error: ErrorInfo } {
  return fail(errorInfo("TRACE_INVALID", { path: path.slice(0, 200) }));
}

/**
 * Trace의 형태와 이벤트 사이의 관계를 확인한다 (AD-6). 예시 자료와 engine 테스트에서 쓴다.
 * - `seq`는 0부터 차례대로이고 `time`은 줄어들지 않는다
 * - `parentSeq`는 앞선 이벤트를 가리킨다
 * - `dropReason`은 `action`이 `drop`일 때만 있고 `reason.code`와 같다
 * - `primaryDropSeq`는 실패한 Trace에만 있고 폐기 이벤트를 가리킨다
 */
export function validateTrace(input: unknown): TraceCheckResult {
  try {
    const parsed = traceSchema.safeParse(input);
    if (!parsed.success) {
      return traceError(parsed.error.issues[0]?.path.map(String).join(".") ?? "");
    }

    const { events, result } = parsed.data;
    let previousTime = 0;
    for (const [index, event] of events.entries()) {
      const path = `events.${index}`;
      if (event.seq !== index) return traceError(`${path}.seq`);
      if (event.time < previousTime) return traceError(`${path}.time`);
      previousTime = event.time;
      if (event.parentSeq !== undefined && event.parentSeq >= event.seq) {
        return traceError(`${path}.parentSeq`);
      }

      const isDrop = event.action === "drop";
      if (isDrop !== (event.dropReason !== undefined)) return traceError(`${path}.dropReason`);
      if (isDrop && event.dropReason !== event.reason.code) {
        return traceError(`${path}.dropReason`);
      }
    }

    const primary = result.primaryDropSeq;
    if (primary !== undefined) {
      if (result.status === "success") return traceError("result.primaryDropSeq");
      if (events[primary]?.action !== "drop") return traceError("result.primaryDropSeq");
    }

    return { ok: true, trace: parsed.data as unknown as Trace };
  } catch {
    return traceError("");
  }
}
