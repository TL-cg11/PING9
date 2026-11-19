// 케이블을 어떤 모양으로 그릴지 정한다 (T0.8). 포트 설정은 shared의 읽기 함수와 Router 구성으로 읽는다 (AD-7).
// 화면이 정하는 것은 "무엇을 보일까"뿐이다. 그리는 일은 components/cable.tsx가 한다.

import { DEFAULT_VLAN_ID, VLAN_ID_MAX, VLAN_ID_MIN, switchPort } from "@ping9/shared";
import type { Device, Link, TopologyDocument, VlanRange } from "@ping9/shared";

/** 차선을 이 수까지 그린다. 넘으면 무지개 길이다 */
export const MAX_LANES = 4;

/** 차선 하나. `blockedAt`은 이 VLAN을 허용하지 않는 끝 (링크 ends의 순번). 그 끝 앞에서 차선이 막힌다 */
export interface Lane {
  readonly vlan: number;
  readonly blockedAt?: 0 | 1;
}

/** 차선들, 또는 모두(`all`, 무지개 길) */
export type Lanes = readonly Lane[] | "all";

export interface CableLook {
  /** road: 기본 눈길, trunk: 넓은 길, bridge: 라우터 사이 얼음 다리 */
  readonly shape: "road" | "trunk" | "bridge";
  /** 한쪽 끝이라도 꺼진 포트면 금 간 얼음 */
  readonly down: boolean;
  /** road일 때 access VLAN (VLAN 1이 아닐 때만). 테두리를 그 VLAN 색으로 그린다 */
  readonly vlan?: number;
  /** trunk일 때만 */
  readonly lanes?: Lanes;
}

function isFull(ranges: readonly VlanRange[]): boolean {
  return ranges.length === 1 && ranges[0]![0] === VLAN_ID_MIN && ranges[0]![1] === VLAN_ID_MAX;
}

function allows(ranges: readonly VlanRange[], vlan: number): boolean {
  return ranges.some(([start, end]) => start <= vlan && vlan <= end);
}

/**
 * 차선. 허용 목록이 정해진 끝들의 VLAN을 모두 그리고, 다른 trunk 끝이 허용하지 않으면 그 끝에서 막는다.
 * 모든 끝이 "전체"이거나 VLAN이 MAX_LANES보다 많으면 무지개다
 */
function lanesOf(trunks: readonly { readonly end: 0 | 1; readonly allowed: readonly VlanRange[] }[]): Lanes {
  const limited = trunks.filter(({ allowed }) => !isFull(allowed));
  if (limited.length === 0) return "all";
  const ids = new Set<number>();
  for (const { allowed } of limited) {
    for (const [start, end] of allowed) {
      for (let id = start; id <= end && ids.size <= MAX_LANES; id += 1) ids.add(id);
    }
  }
  if (ids.size > MAX_LANES) return "all";
  return [...ids].sort((a, b) => a - b).map((vlan) => {
    const blocker = trunks.find(({ allowed }) => !allows(allowed, vlan));
    return blocker === undefined ? { vlan } : { vlan, blockedAt: blocker.end };
  });
}

function portDown(device: Device | undefined, port: string): boolean {
  if (device?.kind === "switch") return !switchPort(device.config, port).adminUp;
  // 설정한 적이 없는 Router 인터페이스는 켜진 것으로 그린다 (설계안 정할 것 3)
  if (device?.kind === "router") return device.config.interfaces[port]?.adminUp === false;
  return false;
}

export function cableLook(document: TopologyDocument, link: Link): CableLook {
  const ends = link.ends.map((end, index) => ({
    index: index as 0 | 1,
    device: document.devices.find((candidate) => candidate.id === end.deviceId),
    port: end.port,
  }));
  const down = ends.some(({ device, port }) => portDown(device, port));

  if (ends.every(({ device }) => device?.kind === "router")) return { shape: "bridge", down };

  const switchEnds = ends.flatMap(({ index, device, port }) =>
    device?.kind === "switch" ? [{ end: index, port: switchPort(device.config, port) }] : [],
  );
  const trunks = switchEnds
    .filter(({ port }) => port.mode === "trunk")
    .map(({ end, port }) => ({ end, allowed: port.allowedVlans }));
  if (trunks.length > 0) return { shape: "trunk", down, lanes: lanesOf(trunks) };

  const access = switchEnds.find(({ port }) => port.accessVlan !== DEFAULT_VLAN_ID);
  return access === undefined ? { shape: "road", down } : { shape: "road", down, vlan: access.port.accessVlan };
}
