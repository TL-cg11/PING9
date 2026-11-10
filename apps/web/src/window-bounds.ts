/** CSS 화면 좌표로 계산한다. 지도의 확대·이동 좌표와 독립적이다. */
export interface WindowRect {
  readonly x: number; readonly y: number; readonly width: number; readonly height: number;
}
export function fitWindow(rect: WindowRect, area: { readonly width: number; readonly height: number }): WindowRect {
  const width = Math.min(Math.max(300, rect.width), Math.max(0, area.width));
  const height = Math.min(Math.max(160, rect.height), Math.max(0, area.height));
  return {
    x: Math.max(0, Math.min(area.width - width, rect.x)),
    y: Math.max(0, Math.min(area.height - height, rect.y)),
    width, height,
  };
}

export const RESIZE_HANDLES = {
  n: "위", s: "아래", w: "왼쪽", e: "오른쪽",
  nw: "왼쪽 위", ne: "오른쪽 위", sw: "왼쪽 아래", se: "오른쪽 아래",
} as const;
export type ResizeHandle = keyof typeof RESIZE_HANDLES;

/** 움직이지 않는 반대편 변을 고정하고, 최소 크기와 배치 영역을 함께 지킨다. */
export function resizeWindow(rect: WindowRect, handle: ResizeHandle, dx: number, dy: number,
  area: { readonly width: number; readonly height: number }): WindowRect {
  const start = fitWindow(rect, area);
  const minWidth = Math.min(300, area.width);
  const minHeight = Math.min(160, area.height);
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;
  if (handle.includes("w")) left = clamp(left + dx, 0, right - minWidth);
  if (handle.includes("e")) right = clamp(right + dx, left + minWidth, area.width);
  if (handle.includes("n")) top = clamp(top + dy, 0, bottom - minHeight);
  if (handle.includes("s")) bottom = clamp(bottom + dy, top + minHeight, area.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}
