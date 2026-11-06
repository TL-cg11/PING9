// 링크에 붙일 VLAN 표시를 정한다 (설계 8.1절). 포트의 모드와 VLAN은 shared의 구성 읽기 함수로 읽는다 (AD-7).
// 화면이 정하는 것은 "무엇을 보일까"뿐이다.

import { DEFAULT_VLAN_ID, switchPort } from "@ping9/shared";
import type { Link, TopologyDocument } from "@ping9/shared";

export type LinkVlan =
  /** Switch의 access 포트에 연결된 링크. VLAN 1은 기본값이라 표시하지 않는다 */
  { readonly kind: "access"; readonly vlan: number };

/** 이 링크에 붙일 표시. 표시할 것이 없으면 undefined */
export function linkVlan(document: TopologyDocument, link: Link): LinkVlan | undefined {
  for (const end of link.ends) {
    const device = document.devices.find((candidate) => candidate.id === end.deviceId);
    if (device?.kind !== "switch") continue;

    const port = switchPort(device.config, end.port);
    if (port.mode === "access" && port.accessVlan !== DEFAULT_VLAN_ID) return { kind: "access", vlan: port.accessVlan };
  }
  return undefined;
}
