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
