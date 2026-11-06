// Switch를 다루는 Command 처리기가 함께 쓰는 것: 장비 찾기, 구성 정규화, 구성 바꿔 끼우기.
// 출처: docs/superpowers/specs/2026-11-05-switch-vlan-design.md 5.2절, 5.3절.

import {
  DEFAULT_VLAN_ID,
  LIMITS,
  VLAN_ID_MAX,
  VLAN_ID_MIN,
  errorInfo,
  isPortName,
  portIndex,
  switchPort,
  switchVlans,
} from "@ping9/shared";
import type {
  ErrorInfo,
  SwitchConfig,
  SwitchDevice,
  SwitchPortConfig,
  TopologyDocument,
} from "@ping9/shared";

import { describeValue } from "../describe";

export type FoundSwitch =
  | { readonly ok: true; readonly device: SwitchDevice }
  | { readonly ok: false; readonly error: ErrorInfo };

/** Command가 가리키는 Switch. 경계 밖에서 온 값일 수 있어 `deviceId`의 타입을 믿지 않는다 */
export function findSwitch(document: TopologyDocument, deviceId: unknown): FoundSwitch {
  const device =
    typeof deviceId === "string" ? document.devices.find((candidate) => candidate.id === deviceId) : undefined;
  if (device === undefined) {
    return { ok: false, error: errorInfo("DEVICE_NOT_FOUND", { deviceId: describeValue(deviceId) }) };
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
 * - VLAN 1이 없으면 넣고, VLAN을 번호순으로 놓는다. 넣으면 한도(64개)를 넘는 경우에는 넣지 않는다.
 *   (VLAN 1 없이 64개가 든 문서를 가져온 경우. 넣으면 validateDocument를 통과하지 못한다)
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

  const hasDefaultVlan = config.vlans.some((vlan) => vlan.id === DEFAULT_VLAN_ID);
  const hasRoom = config.vlans.length < LIMITS.maxVlansPerSwitch;

  return {
    vlans: switchVlans(config)
      .filter((vlan) => vlan.id !== DEFAULT_VLAN_ID || hasDefaultVlan || hasRoom)
      .map((vlan) => ({ id: vlan.id, name: vlan.name })),
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

/** Command가 가리키는 Switch 포트의 이름이 맞는지. 전체 이름만 받는다 (줄임은 CLI가 푼다) */
export function checkSwitchPort(device: SwitchDevice, port: unknown): ErrorInfo | null {
  return typeof port === "string" && isPortName("switch", port)
    ? null
    : errorInfo("UNKNOWN_PORT", { deviceId: device.id, kind: "switch", port: describeValue(port) });
}

/** 포트 하나의 설정 일부를 바꾼 새 Document. 나머지 설정은 그대로 두고, 구성은 정규화해서 끼운다 */
export function withSwitchPort(
  document: TopologyDocument,
  device: SwitchDevice,
  port: string,
  change: Partial<SwitchPortConfig>,
): TopologyDocument {
  const current = switchPort(device.config, port);
  const next: SwitchPortConfig = {
    adminUp: current.adminUp,
    mode: current.mode,
    accessVlan: current.accessVlan,
    allowedVlans: current.allowedVlans,
    ...change,
  };
  return withSwitchConfig(document, device.id, { ...device.config, ports: { ...device.config.ports, [port]: next } });
}
