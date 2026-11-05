// Switch를 다루는 Command 처리기가 함께 쓰는 것: 장비 찾기, 구성 정규화, 구성 바꿔 끼우기.
// 출처: docs/superpowers/specs/2026-11-05-switch-vlan-design.md 5.2절, 5.3절.

import { VLAN_ID_MAX, VLAN_ID_MIN, errorInfo, portIndex, switchVlans } from "@ping9/shared";
import type {
  ErrorInfo,
  SwitchConfig,
  SwitchDevice,
  SwitchPortConfig,
  TopologyDocument,
} from "@ping9/shared";

export type FoundSwitch =
  | { readonly ok: true; readonly device: SwitchDevice }
  | { readonly ok: false; readonly error: ErrorInfo };

/** Command가 가리키는 Switch. 경계 밖에서 온 값일 수 있어 `deviceId`의 타입을 믿지 않는다 */
export function findSwitch(document: TopologyDocument, deviceId: unknown): FoundSwitch {
  const device =
    typeof deviceId === "string" ? document.devices.find((candidate) => candidate.id === deviceId) : undefined;
  if (device === undefined) {
    return { ok: false, error: errorInfo("DEVICE_NOT_FOUND", { deviceId: String(deviceId).slice(0, 64) }) };
  }
  if (device.kind !== "switch") {
    return {
      ok: false,
      error: errorInfo("DEVICE_KIND_MISMATCH", { deviceId: device.id, expected: "switch", actual: device.kind }),
    };
  }
  return { ok: true, device };
}

/** 기본값과 같은 설정을 뺀 포트 구성. 전부 기본값이면 undefined */
function normalizePort(port: SwitchPortConfig): SwitchPortConfig | undefined {
  const accessVlan = port.accessVlan === 1 ? undefined : port.accessVlan;
  const allowsAll =
    port.allowedVlans?.length === 1 &&
    port.allowedVlans[0]![0] === VLAN_ID_MIN &&
    port.allowedVlans[0]![1] === VLAN_ID_MAX;
  const allowedVlans = allowsAll ? undefined : port.allowedVlans;

  if (port.adminUp && port.mode === "access" && accessVlan === undefined && allowedVlans === undefined) {
    return undefined;
  }
  return {
    adminUp: port.adminUp,
    mode: port.mode,
    ...(accessVlan !== undefined && { accessVlan }),
    ...(allowedVlans !== undefined && { allowedVlans }),
  };
}

/**
 * 같은 구성은 항상 같은 값이 되게 한다. `show running-config` 왕복을 비교하는 기준이다.
 * - VLAN 1이 없으면 넣고, VLAN을 번호순으로 놓는다.
 * - 포트에서 기본값과 같은 설정(access VLAN 1, 전부 허용)을 지우고, 전부 기본값인 포트는 뺀다.
 * - 포트를 순번대로 놓는다.
 */
export function normalizeSwitchConfig(config: SwitchConfig): SwitchConfig {
  const ports: Record<string, SwitchPortConfig> = {};
  const names = Object.keys(config.ports).sort((a, b) => portIndex("switch", a) - portIndex("switch", b));
  for (const name of names) {
    const port = normalizePort(config.ports[name]!);
    if (port !== undefined) ports[name] = port;
  }

  return {
    vlans: switchVlans(config).map((vlan) => ({ id: vlan.id, name: vlan.name })),
    ports,
  };
}

/** Switch 하나의 구성을 바꾼 새 Document. 구성은 정규화해서 끼운다. 다른 장비는 같은 참조로 남는다 */
export function withSwitchConfig(
  document: TopologyDocument,
  deviceId: string,
  config: SwitchConfig,
): TopologyDocument {
  return {
    ...document,
    devices: document.devices.map((device) =>
      device.id === deviceId && device.kind === "switch"
        ? { ...device, config: normalizeSwitchConfig(config) }
        : device,
    ),
  };
}
