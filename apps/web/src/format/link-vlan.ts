// 링크에 붙일 VLAN 표시를 정한다 (설계 8.1절). 포트의 모드와 VLAN은 shared의 구성 읽기 함수로 읽는다 (AD-7).
// 화면이 정하는 것은 "무엇을 보일까"뿐이다.

import { DEFAULT_VLAN_ID, VLAN_ID_MAX, VLAN_ID_MIN, switchPort } from "@ping9/shared";
import type { Link, TopologyDocument, VlanRange } from "@ping9/shared";

export type LinkVlan =
  /** Switch의 access 포트에 연결된 링크. VLAN 1은 기본값이라 표시하지 않는다 */
  | { readonly kind: "access"; readonly vlan: number }
  /**
   * 한쪽 끝이라도 trunk 포트인 링크. `ends`는 링크의 두 끝 순서대로,
   * 그 끝이 trunk 포트이면 허용 목록의 글(`허용 10, 20`)이고 아니면 undefined다
   */
  | { readonly kind: "trunk"; readonly ends: readonly [string | undefined, string | undefined] };

/** 허용 목록을 화면의 글로. 전부 허용은 `전체`, 빈 목록은 `없음`, 그 밖은 `10, 20-30` */
export function formatAllowedVlans(ranges: readonly VlanRange[]): string {
  if (ranges.length === 0) return "없음";
  if (ranges.length === 1 && ranges[0]![0] === VLAN_ID_MIN && ranges[0]![1] === VLAN_ID_MAX) return "전체";
  return ranges.map(([start, end]) => (start === end ? `${start}` : `${start}-${end}`)).join(", ");
}

/** 이 링크에 붙일 표시. 표시할 것이 없으면 undefined */
export function linkVlan(document: TopologyDocument, link: Link): LinkVlan | undefined {
  const ports = link.ends.map((end) => {
    const device = document.devices.find((candidate) => candidate.id === end.deviceId);
    return device?.kind === "switch" ? switchPort(device.config, end.port) : undefined;
  });

  if (ports.some((port) => port?.mode === "trunk")) {
    const [first, second] = ports.map((port) =>
      port?.mode === "trunk" ? `허용 ${formatAllowedVlans(port.allowedVlans)}` : undefined,
    );
    return { kind: "trunk", ends: [first, second] };
  }

  const access = ports.find((port) => port !== undefined && port.accessVlan !== DEFAULT_VLAN_ID);
  return access === undefined ? undefined : { kind: "access", vlan: access.accessVlan };
}
