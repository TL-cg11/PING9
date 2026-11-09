// T0.6, T0.8: 링크 선의 양 끝. 선은 장비 아래의 좁은 타원 받침 테두리에서 끝난다.
import { describe, expect, test } from "vitest";

import { JOINT_LENGTH, RING_DY, RING_RX, RING_RY, linkEnds, ringCenter, ringJoint } from "./link-ends";

/** 점이 장비 아래 타원의 테두리 위에 있는지 */
const onRing = (x: number, y: number, device: { x: number; y: number }) => {
  const center = ringCenter(device);
  return Math.abs(((x - center.x) / RING_RX) ** 2 + ((y - center.y) / RING_RY) ** 2 - 1) < 1e-9;
};

describe("linkEnds", () => {
  test("타원의 가운데는 장비 위치보다 RING_DY 아래다", () => {
    expect(ringCenter({ x: 10, y: 20 })).toEqual({ x: 10, y: 20 + RING_DY });
  });

  test("가로 선은 양 끝에서 가로 반지름만큼 잘린다", () => {
    expect(linkEnds({ x: 0, y: 0 }, { x: 200, y: 0 })).toEqual({
      x1: RING_RX,
      y1: RING_DY,
      x2: 200 - RING_RX,
      y2: RING_DY,
    });
  });

  test("세로 선은 양 끝에서 세로 반지름만큼 잘린다", () => {
    expect(linkEnds({ x: 0, y: 200 }, { x: 0, y: 0 })).toEqual({
      x1: 0,
      y1: 200 + RING_DY - RING_RY,
      x2: 0,
      y2: RING_DY + RING_RY,
    });
  });

  test("잘린 끝은 양쪽 타원의 테두리 위에 있다", () => {
    const from = { x: 110, y: 128 };
    const to = { x: 300, y: 250 };
    const { x1, y1, x2, y2 } = linkEnds(from, to);

    expect(onRing(x1, y1, from)).toBe(true);
    expect(onRing(x2, y2, to)).toBe(true);
  });

  test("너무 가까워 선이 남지 않으면 자르지 않는다", () => {
    expect(linkEnds({ x: 0, y: 0 }, { x: 50, y: 0 })).toEqual({ x1: 0, y1: RING_DY, x2: 50, y2: RING_DY });
    expect(linkEnds({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ x1: 5, y1: 5 + RING_DY, x2: 5, y2: 5 + RING_DY });
  });
});

describe("ringJoint", () => {
  // 가로 선의 왼쪽 끝: 타원 테두리 (36, 5)에서 오른쪽으로 뻗고, 길은 JOINT_LENGTH 앞에서 끝난다
  const center = ringCenter({ x: 0, y: 0 });
  const at = { x: RING_RX, y: RING_DY };
  const out = { x: 1, y: 0 };
  const start = { x: RING_RX + JOINT_LENGTH, y: RING_DY };

  const numbers = (path: string) => [...path.matchAll(/-?\d+(\.\d+)?(e-?\d+)?/g)].map((match) => Number(match[0]));

  test("테두리 색과 안쪽 색의 닫힌 모양 둘", () => {
    const joint = ringJoint(center, at, out, start, out, 6, 3.5);
    for (const path of [joint.edge, joint.core]) {
      expect(path).toMatch(/^M.*Z$/);
      expect(numbers(path).every(Number.isFinite)).toBe(true);
    }
  });

  test("길 끝에서는 길의 너비이고, 타원 쪽으로 갈수록 벌어진다", () => {
    const { edge } = ringJoint(center, at, out, start, out, 6, 3.5);
    const ys = numbers(edge).filter((_, index) => index % 2 === 1);
    // 시작점은 길 가장자리(5 ± 6)다
    expect(ys[0]).toBeCloseTo(RING_DY + 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(12);
  });

  test("길이 타원보다 넓어도 타원의 위아래 끝 안쪽에서 닿는다", () => {
    const { edge } = ringJoint(center, at, out, start, out, 20, 16);
    const ys = numbers(edge).filter((_, index) => index % 2 === 1);
    // 길 끝의 두 점(5 ± 20)을 빼면 모두 타원 높이 안이다
    const onRing = ys.filter((y) => Math.abs(y - RING_DY) < 19.9);
    for (const y of onRing) expect(Math.abs(y - RING_DY)).toBeLessThanOrEqual(RING_RY);
  });
});
