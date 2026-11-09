// 링크 선의 양 끝 (T0.6, T0.8). 장비 아이콘 뒤에 좁은 타원 받침이 있고(canvas.tsx의 `.rings`),
// 선은 그 타원의 테두리에서 끝난다. 길은 나팔처럼 벌어지는 이음목으로 타원에 이어진다 (`ringJoint`, 시안 C).
// 타원의 가운데는 장비 위치에서 RING_DY만큼 아래(아이콘의 아랫부분)다. 시안 B-3d.

import type { Position } from "@ping9/shared";

/** 타원의 가로 반지름. 아이콘(50)보다 조금 넓다 */
export const RING_RX = 36;
/** 타원의 세로 반지름. 위아래가 좁다 */
export const RING_RY = 12;
/** 타원의 가운데가 장비 위치보다 아래인 정도 */
export const RING_DY = 5;

export interface LineEnds {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/** 중심에서 타원 경계까지가 선 길이의 몇 분의 몇인지 */
function exitFraction(dx: number, dy: number): number {
  return 1 / Math.hypot(dx / RING_RX, dy / RING_RY);
}

interface Point {
  readonly x: number;
  readonly y: number;
}

/** 장비 아래 타원의 가운데 */
export function ringCenter(device: Position): Point {
  return { x: device.x, y: device.y + RING_DY };
}

/** 길이 이음목에 넘겨주는 거리. 길은 타원 테두리에서 이만큼 앞에서 끝나고, 그 사이를 이음목이 잇는다 */
export const JOINT_LENGTH = 12;
/** 이음목이 길 가장자리가 타원에 닿는 곳에서 테두리를 따라 바깥으로 벌어지는 길이 */
const JOINT_GROW = 7;
/** 길이 타원보다 넓을 때 이음목이 타원의 위아래 끝에서 이만큼 안쪽에 닿는다 (비율) */
const JOINT_NARROW = 0.85;

/** 이음목 하나. 길의 테두리 색과 안쪽 색으로 하나씩 채운다 */
export interface RingJoint {
  readonly edge: string;
  readonly core: string;
}

/**
 * 길이 타원에 닿는 이음목 (T0.8 시안 C). 길 끝(`start`, 방향 `startOut`)에서 길 가장자리가 휘어
 * 타원 테두리에 닿는다. 길보다 조금 넓게 벌어지고, 길이 타원보다 넓으면 타원에 맞게 좁아진다.
 * `at`은 가운데 줄이 타원에 닿는 점, `out`은 그 점에서 길이 뻗는 방향이다. 방향은 모두 단위 벡터다.
 * 안쪽 끝은 타원 안의 현으로 닫는다. 타원(흰색)이 그 위를 덮는다.
 */
export function ringJoint(
  center: Point,
  at: Point,
  out: Point,
  start: Point,
  startOut: Point,
  edgeHalf: number,
  coreHalf: number,
): RingJoint {
  const n = { x: -out.y, y: out.x };
  const ringPoint = (theta: number): Point => ({
    x: center.x + RING_RX * Math.cos(theta),
    y: center.y + RING_RY * Math.sin(theta),
  });
  /** 타원 위 theta의 점이 길 쪽을 보는지 (바깥 법선이 out과 같은 쪽) */
  const facesRoad = (theta: number) =>
    (Math.cos(theta) / RING_RX) * out.x + (Math.sin(theta) / RING_RY) * out.y > 0;
  const lateralOf = (point: Point) => (point.x - at.x) * n.x + (point.y - at.y) * n.y;

  const near: number[] = [];
  for (let i = 0; i < 720; i += 1) {
    const theta = (i * Math.PI) / 360;
    if (facesRoad(theta)) near.push(theta);
  }

  /**
   * 길 한쪽 가장자리(가운데 줄에서 side 쪽으로 half)가 타원에 닿는 곳에서 테두리를 따라 바깥으로
   * JOINT_GROW만큼 간 점. 가장자리가 타원에 닿지 않을 만큼 길이 넓으면 타원의 그쪽 끝 조금 안쪽이다
   */
  const landing = (side: 1 | -1, half: number): Point => {
    let hit = near[0]!;
    let reach = -Infinity;
    for (const theta of near) {
      const lateral = lateralOf(ringPoint(theta)) * side;
      if (lateral > reach) reach = lateral;
      if (Math.abs(lateral - half) < Math.abs(lateralOf(ringPoint(hit)) * side - half)) hit = theta;
    }
    if (reach < half + 1) {
      // 길이 타원보다 넓다: 그쪽 끝에서 조금 안쪽
      const target = reach * JOINT_NARROW;
      let best = near[0]!;
      for (const theta of near) {
        if (Math.abs(lateralOf(ringPoint(theta)) * side - target) < Math.abs(lateralOf(ringPoint(best)) * side - target)) {
          best = theta;
        }
      }
      return ringPoint(best);
    }
    // 바깥(side 쪽)으로 테두리를 따라 걷는다
    const step = Math.PI / 720;
    const direction = lateralOf(ringPoint(hit + step)) * side > lateralOf(ringPoint(hit)) * side ? 1 : -1;
    let theta = hit;
    let walked = 0;
    while (walked < JOINT_GROW) {
      const next = theta + direction * step;
      if (!facesRoad(next) || lateralOf(ringPoint(next)) * side <= lateralOf(ringPoint(theta)) * side) break;
      const a = ringPoint(theta);
      const b = ringPoint(next);
      walked += Math.hypot(b.x - a.x, b.y - a.y);
      theta = next;
    }
    return ringPoint(theta);
  };

  const back = { x: -startOut.x, y: -startOut.y };
  const startNormal = { x: -startOut.y, y: startOut.x };
  const xy = (point: Point) => `${point.x} ${point.y}`;

  const shape = (half: number) => {
    const sides = ([1, -1] as const).map((side) => {
      const from = { x: start.x + startNormal.x * half * side, y: start.y + startNormal.y * half * side };
      const to = landing(side, half);
      // 길 가장자리를 따라 to 옆까지 간 점을 조절점으로 쓴다. to가 길 끝보다 앞이면 길 끝에서 바로 휜다
      const along = Math.max(0, (to.x - from.x) * back.x + (to.y - from.y) * back.y);
      const control = { x: from.x + back.x * along, y: from.y + back.y * along };
      return { from, to, control };
    });
    const [left, right] = sides as [typeof sides[number], typeof sides[number]];
    return `M${xy(left.from)}Q${xy(left.control)} ${xy(left.to)}L${xy(right.to)}Q${xy(right.control)} ${xy(right.from)}Z`;
  };

  return { edge: shape(edgeHalf), core: shape(coreHalf) };
}

/**
 * 두 장비 사이 선의 끝. 양쪽에서 타원 경계까지를 잘라 낸다.
 * 두 장비가 너무 가까워 잘라 내면 선이 남지 않을 때는 자르지 않는다. 연결이 안 보이는 것보다 낫다.
 */
export function linkEnds(fromDevice: Position, toDevice: Position): LineEnds {
  const from = ringCenter(fromDevice);
  const to = ringCenter(toDevice);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const full = { x1: from.x, y1: from.y, x2: to.x, y2: to.y };
  if (dx === 0 && dy === 0) return full;

  const cut = exitFraction(dx, dy);
  if (cut * 2 >= 1) return full;

  return {
    x1: from.x + dx * cut,
    y1: from.y + dy * cut,
    x2: to.x - dx * cut,
    y2: to.y - dy * cut,
  };
}
