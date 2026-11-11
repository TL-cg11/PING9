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

/** 끌던 것을 놓으면 취소되는 영역(왼쪽 장비 목록)에 대한 상태. armed는 끄는 중, over는 그 영역 위 (T0.12) */
export type DragCancelState = "idle" | "armed" | "over";

/** 화면 좌표의 점이 사각형 안(테두리 포함)에 있는가. 사각형이 없거나 넓이가 없으면 false */
export function containsPoint(
  rect: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number } | null | undefined,
  point: Position,
): boolean {
  if (rect === null || rect === undefined || rect.right <= rect.left || rect.bottom <= rect.top) return false;
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
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

/** 휠·트랙패드의 단위를 픽셀로 맞추고 한 이벤트의 변화량을 제한한다. */
export function wheelZoom(zoom: number, deltaY: number, deltaMode: number, height: number): number {
  if (!Number.isFinite(deltaY)) return zoom;
  const pixels = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? height : 1);
  const factor = Math.exp(-Math.max(-100, Math.min(100, pixels)) * 0.002);
  return Math.max(MIN_CANVAS_ZOOM, Math.min(MAX_CANVAS_ZOOM, zoom * factor));
}

/** 포인터가 가리키던 지도 지점을 화면의 같은 위치에 유지한다. */
export function zoomAtPoint(box: CanvasViewBox, size: { readonly width: number; readonly height: number },
  factor: number, world: Position, fraction: Position): CanvasViewBox {
  const next = zoomViewBox(box, size, factor);
  return { ...next, x: world.x - fraction.x * next.width, y: world.y - fraction.y * next.height };
}
