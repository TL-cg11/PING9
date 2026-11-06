import { DEVICE_KINDS, LIMITS } from "@ping9/shared";
import type { DeviceKind, Position } from "@ping9/shared";

export const DEVICE_DRAG_TYPE = "application/x-ping9-device";

export function readDraggedDevice(value: string): DeviceKind | null {
  return (DEVICE_KINDS as readonly string[]).includes(value) ? value as DeviceKind : null;
}

export interface ScreenMatrix {
  readonly a: number; readonly b: number; readonly c: number;
  readonly d: number; readonly e: number; readonly f: number;
}

export interface CanvasViewBox {
  readonly x: number; readonly y: number;
  readonly width: number; readonly height: number;
}

export const MIN_CANVAS_ZOOM = 0.25;
export const MAX_CANVAS_ZOOM = 3;

/** xMidYMin SVG의 실제 보이는 영역 중심을 유지하며 확대한다. */
export function zoomViewBox(box: CanvasViewBox, size: { readonly width: number; readonly height: number }, factor: number): CanvasViewBox {
  if (size.width <= 0 || size.height <= 0 || factor <= 0 || !Number.isFinite(factor)) return box;
  const scale = Math.min(size.width / box.width, size.height / box.height);
  const visibleWidth = size.width / scale;
  const visibleHeight = size.height / scale;
  const width = visibleWidth / factor;
  const height = visibleHeight / factor;
  return {
    x: box.x + box.width / 2 - width / 2,
    y: box.y + visibleHeight / 2 - height / 2,
    width, height,
  };
}

/** SVG 화면 변환의 역변환. CSS 크기, 배율과 viewBox 여백을 함께 반영한다. */
export function screenToWorld(matrix: ScreenMatrix, point: Position): Position | null {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (!Number.isFinite(determinant) || determinant === 0) return null;
  const x = point.x - matrix.e;
  const y = point.y - matrix.f;
  const result = { x: (matrix.d * x - matrix.c * y) / determinant, y: (matrix.a * y - matrix.b * x) / determinant };
  return Number.isFinite(result.x) && Number.isFinite(result.y) ? result : null;
}

/** 장비의 클릭 영역/이름이 캔버스 밖으로 완전히 나가지 않게 한다. */
export function clampCanvasPosition(position: Position, topLeft: Position, bottomRight: Position): Position {
  const clamp = (value: number, low: number, high: number) => low > high ? (low + high) / 2 : Math.max(low, Math.min(high, value));
  return {
    x: clamp(position.x, Math.max(-LIMITS.maxPosition, topLeft.x + 40), Math.min(LIMITS.maxPosition, bottomRight.x - 40)),
    y: clamp(position.y, Math.max(-LIMITS.maxPosition, topLeft.y + 36), Math.min(LIMITS.maxPosition, bottomRight.y - 64)),
  };
}
