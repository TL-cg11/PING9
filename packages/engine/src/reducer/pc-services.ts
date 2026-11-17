// reducer: 서버로 쓰는 PC의 서비스 (T0.20). `pc/set-service`, `pc/add-dns-record`, `pc/remove-dns-record`.
// 속성 패널의 서비스 구역과 서버 콘솔의 `systemctl`이 같은 Command를 낸다 (AD-3).
// 종류가 Server인 PC에만 쓴다. 다른 종류로 바꿔도 서비스 구성은 문서에 남아, 다시 Server로 고르면 그대로다.

import {
  LIMITS,
  SERVICE_KINDS,
  checkHostIpv4,
  checkHostName,
  dnsRecordsOf,
  errorInfo,
  isServer,
  normalizeServices,
  servicesOf,
  validateDocument,
} from "@ping9/shared";
import type { ErrorInfo, PcConfig, PcDevice, ServiceKind, TopologyDocument } from "@ping9/shared";

import { describeValue } from "../describe";
import type { CommandHandler, ReduceResult } from "../reducer";

const fail = (error: ErrorInfo): ReduceResult => ({ ok: false, error });

function findServer(document: TopologyDocument, deviceId: unknown):
  | { readonly ok: true; readonly device: PcDevice }
  | { readonly ok: false; readonly error: ErrorInfo } {
  const device = document.devices.find((candidate) => candidate.id === deviceId);
  if (device === undefined) return { ok: false, error: errorInfo("DEVICE_NOT_FOUND", { deviceId: describeValue(deviceId) }) };
  if (device.kind !== "pc") {
    return { ok: false, error: errorInfo("DEVICE_KIND_MISMATCH", { deviceId: device.id, expected: "pc", actual: device.kind }) };
  }
  if (!isServer(device.config)) return { ok: false, error: errorInfo("PC_NOT_SERVER", { deviceId: device.id }) };
  return { ok: true, device };
}

function withConfig(document: TopologyDocument, device: PcDevice, config: PcConfig): ReduceResult {
  const checked = validateDocument({
    ...document,
    devices: document.devices.map((candidate) => (candidate.id === device.id ? { ...device, config } : candidate)),
  });
  return checked.ok ? { ok: true, document: checked.document, notices: [] } : checked;
}

export const setPcService: CommandHandler<"pc/set-service"> = (document, command) => {
  const found = findServer(document, command.deviceId);
  if (!found.ok) return found;
  const { device } = found;
  if (typeof command.service !== "string" || !(SERVICE_KINDS as readonly string[]).includes(command.service)) {
    return fail(errorInfo("DOCUMENT_INVALID_SHAPE", { path: "service" }));
  }
  if (typeof command.enabled !== "boolean") return fail(errorInfo("DOCUMENT_INVALID_SHAPE", { path: "enabled" }));
  const enabled = servicesOf(device.config);
  if (enabled.includes(command.service) === command.enabled) return { ok: true, document, notices: [] };
  const next: readonly ServiceKind[] = command.enabled
    ? [...enabled, command.service]
    : enabled.filter((kind) => kind !== command.service);
  return withConfig(document, device, { ...device.config, services: normalizeServices(next) });
};

export const addPcDnsRecord: CommandHandler<"pc/add-dns-record"> = (document, command) => {
  const found = findServer(document, command.deviceId);
  if (!found.ok) return found;
  const { device } = found;
  if (typeof command.name !== "string") return fail(errorInfo("DNS_NAME_INVALID", { value: describeValue(command.name) }));
  if (typeof command.address !== "string" || command.address.length > 64) {
    return fail(errorInfo("INVALID_IPV4", { value: describeValue(command.address) }));
  }
  // 이름은 대소문자를 가리지 않는다. 소문자로 맞춰 저장한다
  const name = command.name.toLowerCase();
  const error = checkHostName(name) ?? checkHostIpv4(command.address);
  if (error !== null) return fail(error);

  const records = dnsRecordsOf(device.config);
  const record = { name, address: command.address };
  if (records.some((candidate) => candidate.name === name)) {
    return withConfig(document, device, {
      ...device.config, dnsRecords: records.map((candidate) => (candidate.name === name ? record : candidate)),
    });
  }
  if (records.length >= LIMITS.maxDnsRecords) {
    return fail(errorInfo("LIMIT_EXCEEDED", { limit: "dnsRecords", max: LIMITS.maxDnsRecords }));
  }
  return withConfig(document, device, { ...device.config, dnsRecords: [...records, record] });
};

export const removePcDnsRecord: CommandHandler<"pc/remove-dns-record"> = (document, command) => {
  const found = findServer(document, command.deviceId);
  if (!found.ok) return found;
  const { device } = found;
  const name = typeof command.name === "string" ? command.name.toLowerCase() : undefined;
  const records = dnsRecordsOf(device.config);
  if (name === undefined || !records.some((candidate) => candidate.name === name)) {
    return fail(errorInfo("DNS_RECORD_NOT_FOUND", { deviceId: device.id, name: describeValue(command.name) }));
  }
  return withConfig(document, device, { ...device.config, dnsRecords: records.filter((candidate) => candidate.name !== name) });
};
