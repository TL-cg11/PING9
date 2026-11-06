// 링크 선의 양 끝 (T0.6). 노드에 흰 카드가 없어 선이 아이콘과 이름 위를 지나가므로,
// 장비 둘레의 상자 밖에서 선을 끊는다. 장비의 위치는 상자의 가운데다.

import type { Position } from "@ping9/shared";

/** 끊는 상자의 반 너비. 아이콘(56)의 반에 조금 더한 값 */
export const CLIP_HALF_WIDTH = 30;
/** 끊는 상자의 반 높이. 위로는 아이콘 끝, 아래로는 이름과 PC의 IP 글자까지 */
export const CLIP_HALF_HEIGHT = 40;

export interface LineEnds {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/** 중심에서 상자 경계까지가 선 길이의 몇 분의 몇인지 */
function exitFraction(dx: number, dy: number): number {
  const byX = dx === 0 ? Infinity : CLIP_HALF_WIDTH / Math.abs(dx);
  const byY = dy === 0 ? Infinity : CLIP_HALF_HEIGHT / Math.abs(dy);
  return Math.min(byX, byY);
}

/**
 * 두 장비 사이 선의 끝. 양쪽에서 상자 경계까지를 잘라 낸다.
 * 두 장비가 너무 가까워 잘라 내면 선이 남지 않을 때는 자르지 않는다. 연결이 안 보이는 것보다 낫다.
 */
export function linkEnds(from: Position, to: Position): LineEnds {
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
