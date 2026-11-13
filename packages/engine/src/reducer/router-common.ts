import { errorInfo, isPortName, normalizeRouterConfig, validateDocument } from "@ping9/shared";
import type { ErrorInfo, Notice, RouterConfig, RouterDevice, TopologyDocument } from "@ping9/shared";

import { describeValue } from "../describe";
import type { ReduceResult } from "../reducer";

export function findRouter(document: TopologyDocument, deviceId: unknown):
  | { readonly ok: true; readonly device: RouterDevice }
  | { readonly ok: false; readonly error: ErrorInfo } {
  const device = document.devices.find(candidate => candidate.id === deviceId);
  if (device === undefined) return { ok: false, error: errorInfo("DEVICE_NOT_FOUND", { deviceId: describeValue(deviceId) }) };
  if (device.kind !== "router") {
    return { ok: false, error: errorInfo("DEVICE_KIND_MISMATCH", {
      deviceId: device.id, expected: "router", actual: device.kind,
    }) };
  }
  return { ok: true, device };
}

export function checkRouterPort(device: RouterDevice, port: unknown): ErrorInfo | null {
  return typeof port === "string" && isPortName("router", port)
    ? null
    : errorInfo("UNKNOWN_PORT", { deviceId: device.id, kind: "router", port: describeValue(port) });
}

/** 설정 변경을 정규화한 뒤 공통 문서 검증기로 전체 제약을 확인한다. */
export function withRouterConfig(
  document: TopologyDocument, device: RouterDevice, config: RouterConfig, notices: readonly Notice[] = [],
): ReduceResult {
  // 다른 편집 경로에서 바뀐 compiled 설정으로 옛 VyOS 트리를 덮어쓰지 않는다.
  const relevant = (value: RouterConfig) => JSON.stringify([value.interfaces, value.staticRoutes, value.tunnels, value.ipsec]);
  if (config.vyos !== undefined && config.vyos === device.config.vyos && relevant(config) !== relevant(device.config)) config = { ...config, vyos: undefined };
  const checked = validateDocument({
    ...document,
    devices: document.devices.map(candidate => candidate.id === device.id
      ? { ...device, config: normalizeRouterConfig(config) } : candidate),
  });
  return checked.ok ? { ok: true, document: checked.document, notices } : checked;
}
