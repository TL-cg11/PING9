// 캔버스의 포트 주소와 케이블 대역 (T6.4.1: 포트 위에 주소 끝자리, 케이블 가운데에 대역, 케이블 바깥에 놓기).
// 값은 문서의 설정에서 읽기만 한다. 대역 계산은 shared의 함수를 쓴다.

import { maskToPrefixLength, networkAddress } from "@ping9/shared";
import type { PortRef, TopologyDocument } from "@ping9/shared";

export interface PortAddress {
  readonly ip: string;
  readonly mask: string;
  readonly prefix: number;
}

/** 포트의 IP. PC는 장비의 IP, Router는 그 인터페이스의 IP. Switch와 IP가 없는 포트는 null */
export function portAddress(document: TopologyDocument, ref: PortRef): PortAddress | null {
  const device = document.devices.find(candidate => candidate.id === ref.deviceId);
  if (device === undefined) return null;
  let ip: string | undefined;
  let mask: string | undefined;
  if (device.kind === "pc") {
    ip = device.config.ip;
    mask = device.config.mask;
  } else if (device.kind === "router") {
    const face = device.config.interfaces[ref.port];
    ip = face?.ip;
    mask = face?.mask;
  }
  if (ip === undefined || mask === undefined) return null;
  const prefix = maskToPrefixLength(mask);
  return prefix === null ? null : { ip, mask, prefix };
}

/** 포트 위에 쓰는 끝자리. `10.0.12.1` → `.1` */
export function lastOctet(ip: string): string {
  return `.${ip.split(".").at(-1) ?? ""}`;
}

/** `10.0.12.0/30`. 계산하지 못하면 null */
export function bandOf(address: PortAddress): string | null {
  const network = networkAddress(address.ip, address.mask);
  return network === null ? null : `${network}/${address.prefix}`;
}

/** 링크의 대역. 양 끝 중 IP가 있는 쪽(앞쪽 먼저)에서 계산한다 */
export function linkBand(document: TopologyDocument, link: TopologyDocument["links"][number]): string | null {
  for (const end of link.ends) {
    const address = portAddress(document, end);
    if (address !== null) return bandOf(address);
  }
  return null;
}

/**
 * 케이블 가운데에 대역을 보일 링크와 그 대역 (Switch 구간마다 한 번).
 * - Switch가 없는 링크(PC–PC, PC–Router, Router–Router): 그 링크의 대역
 * - Switch–Switch 링크: 없음 (양쪽 다 IP가 없다)
 * - Switch가 한쪽에 있는 링크: Switch로 이어진 구간마다 하나. Router 쪽 링크를 먼저 고르고, 없으면 문서 순서의 첫 링크
 */
export function segmentBands(document: TopologyDocument): ReadonlyMap<string, string> {
  const kindOf = new Map(document.devices.map(device => [device.id, device.kind]));
  const parent = new Map(document.devices.map(device => [device.id, device.id]));
  const find = (id: string): string => {
    let current = id;
    while (parent.get(current) !== current) current = parent.get(current) ?? current;
    return current;
  };
  for (const link of document.links) {
    const [a, b] = link.ends;
    if (kindOf.get(a.deviceId) === "switch" && kindOf.get(b.deviceId) === "switch") parent.set(find(a.deviceId), find(b.deviceId));
  }

  const result = new Map<string, string>();
  const taken = new Set<string>();
  const touchesRouter = (link: TopologyDocument["links"][number]) => link.ends.some(end => kindOf.get(end.deviceId) === "router");
  const ordered = [...document.links].sort((left, right) => Number(touchesRouter(right)) - Number(touchesRouter(left)));
  for (const link of ordered) {
    const switches = link.ends.filter(end => kindOf.get(end.deviceId) === "switch");
    const band = linkBand(document, link);
    if (band === null || switches.length === 2) continue;
    if (switches.length === 0) {
      result.set(link.id, band);
      continue;
    }
    const segment = find(switches[0]!.deviceId);
    if (taken.has(segment)) continue;
    taken.add(segment);
    result.set(link.id, band);
  }
  return result;
}

interface Vector {
  readonly x: number;
  readonly y: number;
}

/**
 * 포트 이름을 케이블의 어느 쪽에 띄울지 (단위 벡터).
 * `along`은 장비에서 케이블이 뻗는 방향, `others`는 같은 장비의 다른 케이블들이 뻗는 방향이다.
 * - 다른 케이블이 없으면 위쪽 (가로에 가까우면 위, 똑바로 세로면 오른쪽)
 * - 있으면 다른 케이블들이 있는 쪽의 반대편(바깥). 그쪽으로 기운 정도가 작으면(35% 미만) 위쪽 그대로
 */
export function labelSide(along: Vector, others: readonly Vector[]): Vector {
  let nx = along.y;
  let ny = -along.x;
  if (ny > 0 || (ny === 0 && nx < 0)) {
    nx = -nx;
    ny = -ny;
  }
  if (others.length === 0) return { x: nx, y: ny };
  const sx = others.reduce((sum, other) => sum + other.x, 0);
  const sy = others.reduce((sum, other) => sum + other.y, 0);
  const size = Math.hypot(sx, sy);
  if (size > 0 && (nx * sx + ny * sy) / size > 0.35) return { x: -nx, y: -ny };
  return { x: nx, y: ny };
}

/** 대역 칩의 폭 (글자 9px 고정폭 글꼴 기준) */
export function bandChipWidth(band: string): number {
  return band.length * 5.5 + 12;
}

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** 글자 한 줄의 대략적인 상자. `y`는 글자의 바닥선, `charWidth`는 글자 하나의 폭 */
export function textBox(x: number, y: number, text: string, charWidth: number, height: number, anchor: "start" | "middle" | "end"): Box {
  const width = text.length * charWidth;
  const left = anchor === "start" ? x : anchor === "end" ? x - width : x - width / 2;
  return { left, top: y - height, right: left + width, bottom: y + 2 };
}

export function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/**
 * 주소를 포트 이름 위에 둘지 아래에 둘지. 위에 두면 장비(아이콘, 이름, PC의 IP)나 다른 글자와 겹치고
 * 아래는 겹치지 않으면 아래 (T6.4.1)
 */
export function addressBelow(above: Box, below: Box, obstacles: readonly Box[]): boolean {
  const hits = (box: Box) => obstacles.some(obstacle => overlaps(box, obstacle));
  return hits(above) && !hits(below);
}
