import fc from "fast-check";
import { expect, test } from "vitest";
import { fitWindow } from "./window-bounds";

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
