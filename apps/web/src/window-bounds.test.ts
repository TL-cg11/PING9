import type { ResizeHandle } from "./window-bounds";
import fc from "fast-check";
import { expect, test } from "vitest";
import { fitWindow, RESIZE_HANDLES, resizeWindow } from "./window-bounds";

test("창 전체가 오른쪽·아래 경계를 넘지 않게 이동하고 작은 화면에는 크기도 맞춘다", () => {
  expect(fitWindow({ x: 900, y: 900, width: 400, height: 230 }, { width: 800, height: 600 }))
    .toEqual({ x: 400, y: 370, width: 400, height: 230 });
  expect(fitWindow({ x: 100, y: -50, width: 400, height: 230 }, { width: 200, height: 100 }))
    .toEqual({ x: 0, y: 0, width: 200, height: 100 });
});

test("이동·크기 변경·화면 축소 후에도 창 사각형 전체가 영역 안이다", () => {
  fc.assert(fc.property(
    fc.record({ x: fc.integer({ min: -1000, max: 3000 }), y: fc.integer({ min: -1000, max: 3000 }),
      width: fc.integer({ min: 1, max: 2000 }), height: fc.integer({ min: 1, max: 2000 }) }),
    fc.record({ width: fc.integer({ min: 1, max: 2000 }), height: fc.integer({ min: 1, max: 2000 }) }),
    (rect, area) => {
      const fit = fitWindow(rect, area);
      expect(fit.x).toBeGreaterThanOrEqual(0);
      expect(fit.y).toBeGreaterThanOrEqual(0);
      expect(fit.x + fit.width).toBeLessThanOrEqual(area.width);
      expect(fit.y + fit.height).toBeLessThanOrEqual(area.height);
      expect(fitWindow(fit, area)).toEqual(fit);
    },
  ), { numRuns: 200 });
});

test.each([
  ["n", 100, -100, { x: 200, y: 0, width: 400, height: 400 }],
  ["s", 100, 100, { x: 200, y: 100, width: 400, height: 400 }],
  ["w", -100, 100, { x: 100, y: 100, width: 500, height: 300 }],
  ["e", 100, 100, { x: 200, y: 100, width: 500, height: 300 }],
  ["nw", -100, -100, { x: 100, y: 0, width: 500, height: 400 }],
  ["ne", 100, -100, { x: 200, y: 0, width: 500, height: 400 }],
  ["sw", -100, 100, { x: 100, y: 100, width: 500, height: 400 }],
  ["se", 100, 100, { x: 200, y: 100, width: 500, height: 400 }],
] as const)("%s에서 조절하면 반대편 변은 고정된다", (handle, dx, dy, expected) => {
  expect(resizeWindow({ x: 200, y: 100, width: 400, height: 300 }, handle, dx, dy, { width: 1000, height: 700 }))
    .toEqual(expected);
});

test("모든 방향에서 최소 크기와 캔버스 경계를 지키고 반대편 변을 유지한다", () => {
  fc.assert(fc.property(
    fc.constantFrom(...Object.keys(RESIZE_HANDLES) as ResizeHandle[]),
    fc.integer({ min: -2000, max: 2000 }), fc.integer({ min: -2000, max: 2000 }),
    (handle, dx, dy) => {
      const next = resizeWindow({ x: 200, y: 100, width: 400, height: 300 }, handle, dx, dy, { width: 1000, height: 700 });
      expect(next.x).toBeGreaterThanOrEqual(0);
      expect(next.y).toBeGreaterThanOrEqual(0);
      expect(next.width).toBeGreaterThanOrEqual(300);
      expect(next.height).toBeGreaterThanOrEqual(160);
      expect(next.x + next.width).toBeLessThanOrEqual(1000);
      expect(next.y + next.height).toBeLessThanOrEqual(700);
      if (handle.includes("w")) expect(next.x + next.width).toBe(600);
      else expect(next.x).toBe(200);
      if (handle.includes("n")) expect(next.y + next.height).toBe(400);
      else expect(next.y).toBe(100);
    },
  ));
});
