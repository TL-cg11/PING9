import { describe, expect, test } from "vitest";

import { CLIP_HALF_HEIGHT, CLIP_HALF_WIDTH, linkEnds } from "./link-ends";

describe("linkEnds", () => {
  test("가로 선은 양 끝에서 반 너비만큼 잘린다", () => {
    expect(linkEnds({ x: 0, y: 0 }, { x: 200, y: 0 })).toEqual({
      x1: CLIP_HALF_WIDTH,
      y1: 0,
      x2: 200 - CLIP_HALF_WIDTH,
      y2: 0,
    });
  });

  test("세로 선은 양 끝에서 반 높이만큼 잘린다", () => {
    expect(linkEnds({ x: 0, y: 200 }, { x: 0, y: 0 })).toEqual({
      x1: 0,
      y1: 200 - CLIP_HALF_HEIGHT,
      x2: 0,
      y2: CLIP_HALF_HEIGHT,
    });
  });

  test("대각선은 먼저 닿는 상자 경계에서 잘린다", () => {
    // 가로 300, 세로 100: 세로 경계(40)보다 가로 경계(30)에 먼저 닿는다 (30/300 < 40/100)
    const ends = linkEnds({ x: 0, y: 0 }, { x: 300, y: 100 });

    expect(ends.x1).toBeCloseTo(30);
    expect(ends.y1).toBeCloseTo(10);
    expect(ends.x2).toBeCloseTo(270);
    expect(ends.y2).toBeCloseTo(90);
  });

  test("잘린 끝은 양쪽 상자의 경계 위에 있다", () => {
    const from = { x: 110, y: 128 };
    const to = { x: 300, y: 250 };
    const { x1, y1, x2, y2 } = linkEnds(from, to);

    const onBox = (x: number, y: number, center: { x: number; y: number }) =>
      Math.abs(Math.abs(x - center.x) - CLIP_HALF_WIDTH) < 1e-9 ||
      Math.abs(Math.abs(y - center.y) - CLIP_HALF_HEIGHT) < 1e-9;
    expect(onBox(x1, y1, from)).toBe(true);
    expect(onBox(x2, y2, to)).toBe(true);
  });

  test("너무 가까워 선이 남지 않으면 자르지 않는다", () => {
    expect(linkEnds({ x: 0, y: 0 }, { x: 50, y: 0 })).toEqual({ x1: 0, y1: 0, x2: 50, y2: 0 });
    expect(linkEnds({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ x1: 5, y1: 5, x2: 5, y2: 5 });
  });
});
