// `show running-config`의 출력 줄 (T3.4.1). 구성을 명령어 줄로 쓴다.
// 기본값과 같은 설정은 쓰지 않는다. 출력을 새 Switch의 설정 모드에 그대로 입력하면 같은 구성이 된다.
// 출처: docs/superpowers/specs/2026-11-05-switch-vlan-design.md 7.4절.

import { DEFAULT_VLAN_ID, defaultVlanName, switchPorts, switchVlans } from "@ping9/shared";
import type { SwitchDevice } from "@ping9/shared";

import { formatVlanList } from "./vlan-list";

/** 구역 사이를 가르는 줄. 다시 입력할 때는 설명 줄로 무시된다 */
const SEPARATOR = "!";

export function runningConfigLines(device: SwitchDevice): string[] {
  const lines = [`hostname ${device.name}`, SEPARATOR];

  // VLAN 1은 항상 있으므로 쓰지 않는다. 이름이 기본 이름이면 name 줄을 생략한다
  for (const vlan of switchVlans(device.config)) {
    if (vlan.id === DEFAULT_VLAN_ID) continue;
    lines.push(`vlan ${vlan.id}`);
    if (vlan.name !== defaultVlanName(vlan.id)) lines.push(` name ${vlan.name}`);
    lines.push(SEPARATOR);
  }

  // 기본값과 다른 설정이 있는 포트만, 포트 순번대로
  for (const port of switchPorts(device.config)) {
    const settings: string[] = [];
    if (port.mode === "trunk") settings.push(" switchport mode trunk");
    if (port.accessVlan !== DEFAULT_VLAN_ID) settings.push(` switchport access vlan ${port.accessVlan}`);
    const allowed = formatVlanList(port.allowedVlans);
    if (allowed !== "all") settings.push(` switchport trunk allowed vlan ${allowed}`);
    if (!port.adminUp) settings.push(" shutdown");

    if (settings.length > 0) lines.push(`interface ${port.name}`, ...settings, SEPARATOR);
  }

  lines.push("end");
  return lines;
}
