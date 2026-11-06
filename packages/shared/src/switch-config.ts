// Switch 구성을 읽는 함수. 기본값 규칙과 VLAN 소속을 한 곳에서 계산한다.
// reducer, 전달 규칙, `show` 명령(engine)과 화면(web)이 모두 이 함수로 구성을 읽는다.
// 화면은 engine에서 Simulator만 가져올 수 있으므로(AD-16) 이 함수의 자리는 shared다.
// 출처: docs/superpowers/specs/2026-11-05-switch-vlan-design.md 5.1절, 5.4절.

import { PORT_NAMES } from "./document";
import type { SwitchConfig, SwitchportMode, Vlan, VlanRange } from "./document";
import { VLAN_ID_MAX, VLAN_ID_MIN } from "./limits";

export const DEFAULT_VLAN_ID = 1;
export const DEFAULT_VLAN_NAME = "default";

/** 모든 VLAN을 허용하는 trunk 허용 목록 */
export const ALL_VLANS: readonly VlanRange[] = [[VLAN_ID_MIN, VLAN_ID_MAX]];

/** 포트 하나의 실제 값. 구성에 없는 값은 기본값으로 채워져 있다 */
export interface EffectiveSwitchPort {
  /** 전체 이름 */
  readonly name: string;
  readonly adminUp: boolean;
  readonly mode: SwitchportMode;
  readonly accessVlan: number;
  readonly allowedVlans: readonly VlanRange[];
}

/** 이름 없이 만든 VLAN의 이름. 번호를 4자리로 채운다 (10 → `VLAN0010`) */
export function defaultVlanName(vlanId: number): string {
  return `VLAN${String(vlanId).padStart(4, "0")}`;
}

/** `ports`에 없는 포트는 켜짐, access, VLAN 1, 전부 허용이다 */
export function switchPort(config: SwitchConfig, port: string): EffectiveSwitchPort {
  const stored = config.ports[port];
  return {
    name: port,
    adminUp: stored?.adminUp ?? true,
    mode: stored?.mode ?? "access",
    accessVlan: stored?.accessVlan ?? DEFAULT_VLAN_ID,
    allowedVlans: stored?.allowedVlans ?? ALL_VLANS,
  };
}

/** Switch의 모든 포트. 포트 순번대로 */
export function switchPorts(config: SwitchConfig): readonly EffectiveSwitchPort[] {
  return PORT_NAMES.switch.map((port) => switchPort(config, port));
}

/**
 * Switch의 VLAN 목록. 번호 오름차순.
 * VLAN 1은 항상 있다. 구성에 없으면 이름 `default`로 넣어 돌려준다.
 */
export function switchVlans(config: SwitchConfig): readonly Vlan[] {
  const vlans = [...config.vlans].sort((a, b) => a.id - b.id);
  if (!vlans.some((vlan) => vlan.id === DEFAULT_VLAN_ID)) {
    vlans.unshift({ id: DEFAULT_VLAN_ID, name: DEFAULT_VLAN_NAME });
  }
  return vlans;
}

/** 그 VLAN에 속한 access 포트의 전체 이름. 포트 순번대로. trunk 포트는 들어가지 않는다 */
export function vlanAccessPorts(config: SwitchConfig, vlanId: number): readonly string[] {
  return switchPorts(config)
    .filter((port) => port.mode === "access" && port.accessVlan === vlanId)
    .map((port) => port.name);
}
