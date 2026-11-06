import fc from "fast-check";
import { describe, expect, test } from "vitest";

import { clampCanvasPosition, readDraggedDevice, screenToWorld, zoomViewBox } from "./canvas-interaction";

describe("드래그 장비와 좌표", () => {
  test.each(["pc", "switch", "router"])("장비 %s는 읽을 수 있다", kind => {
    expect(readDraggedDevice(kind)).toBe(kind);
  });
  test.each(["", "Router", "firewall", "text/plain", "__proto__"])("장비가 아닌 %s는 거부한다", kind => {
    expect(readDraggedDevice(kind)).toBeNull();
  });
  test("SVG 배율과 화면 여백을 적용해 놓은 지점을 계산한다", () => {
    expect(screenToWorld({ a: 2, b: 0, c: 0, d: 2, e: 150, f: 80 }, { x: 350, y: 480 }))
      .toEqual({ x: 100, y: 200 });
    expect(screenToWorld({ a: 1, b: 0, c: 0, d: 1, e: 112, f: 64 }, { x: 412, y: 264 }))
      .toEqual({ x: 300, y: 200 });
  });
  test("역변환할 수 없는 행렬은 거부한다", () => {
    expect(screenToWorld({ a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 }, { x: 1, y: 1 })).toBeNull();
  });
  test("임의의 배율/기울기/이동에도 원래 좌표를 복원한다", () => {
    fc.assert(fc.property(fc.record({
      a: fc.integer({ min: 1, max: 10 }), b: fc.integer({ min: -5, max: 5 }),
      c: fc.integer({ min: -5, max: 5 }), d: fc.integer({ min: 1, max: 10 }),
      e: fc.integer({ min: -1000, max: 1000 }), f: fc.integer({ min: -1000, max: 1000 }),
    }).filter(m => m.a * m.d !== m.b * m.c), fc.record({
      x: fc.integer({ min: -10000, max: 10000 }), y: fc.integer({ min: -10000, max: 10000 }),
    }), (m, p) => {
      const restored = screenToWorld(m, { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f });
      expect(restored!.x).toBeCloseTo(p.x, 6);
      expect(restored!.y).toBeCloseTo(p.y, 6);
    }), { numRuns: 300, seed: 20261106 });
  });
  test("드래그한 장비가 보이는 캔버스 안에 머물도록 제한한다", () => {
    expect(clampCanvasPosition({ x: -100, y: 999 }, { x: 0, y: 0 }, { x: 860, y: 500 }))
      .toEqual({ x: 40, y: 436 });
    expect(clampCanvasPosition({ x: 300, y: 200 }, { x: 0, y: 0 }, { x: 860, y: 500 }))
      .toEqual({ x: 300, y: 200 });
  });
});

describe("실습 확대·축소", () => {
  test("세로 여백이 있는 화면도 실제 보이는 중심을 유지한다", () => {
    expect(zoomViewBox({ x: 0, y: 0, width: 860, height: 330 }, { width: 860, height: 600 }, 2))
      .toEqual({ x: 215, y: 150, width: 430, height: 300 });
  });
  test("가로 여백과 음수 시작 좌표도 화면 중심을 유지한다", () => {
    expect(zoomViewBox({ x: -100, y: -50, width: 400, height: 400 }, { width: 800, height: 400 }, 2))
      .toEqual({ x: -100, y: 50, width: 400, height: 200 });
  });
  test("확대 후 역배율로 축소하면 같은 화면 영역으로 돌아온다", () => {
    const size = { width: 1200, height: 700 };
    const original = zoomViewBox({ x: -80, y: 25, width: 860, height: 330 }, size, 1);
    const restored = zoomViewBox(zoomViewBox(original, size, 1.25), size, 1 / 1.25);
    expect(restored.x).toBeCloseTo(original.x);
    expect(restored.y).toBeCloseTo(original.y);
    expect(restored.width).toBeCloseTo(original.width);
    expect(restored.height).toBeCloseTo(original.height);
  });
  test("아직 크기가 없는 캔버스와 잘못된 배율은 무시한다", () => {
    const box = { x: 0, y: 0, width: 860, height: 330 };
    expect(zoomViewBox(box, { width: 0, height: 500 }, 2)).toBe(box);
    expect(zoomViewBox(box, { width: 800, height: 500 }, NaN)).toBe(box);
    expect(zoomViewBox(box, { width: 800, height: 500 }, 0)).toBe(box);
  });
});
