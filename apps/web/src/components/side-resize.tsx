// 오른쪽 패널 폭 조절 (T0.18). 캔버스와 패널 사이의 손잡이를 끌면 폭이 바뀌고, 두 번 누르면 처음 폭으로 돌아간다.
// 정한 폭은 브라우저에 기억해 새로고침해도 그대로다. 화면만의 상태라 Document에는 넣지 않는다.

import { useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

import { browserStorage } from "../mode";

export const SIDE_DEFAULT = 270;
export const SIDE_MIN = 270;
export const SIDE_MAX = 560;
export const SIDE_STORAGE_KEY = "ping9.sideWidth";

type WidthStorage = Pick<Storage, "getItem" | "setItem">;

/** 정할 수 있는 폭 안으로 맞추고 정수로 반올림한다 */
export function clampSideWidth(width: number): number {
  return Math.round(Math.min(SIDE_MAX, Math.max(SIDE_MIN, width)));
}

/** 기억한 폭. 값이 없거나 숫자가 아니거나 읽지 못하면 처음 폭 */
export function readSideWidth(storage: WidthStorage | undefined): number {
  try {
    const saved = storage?.getItem(SIDE_STORAGE_KEY);
    const width = saved === null || saved === undefined ? Number.NaN : Number(saved);
    return Number.isFinite(width) ? clampSideWidth(width) : SIDE_DEFAULT;
  } catch {
    return SIDE_DEFAULT;
  }
}

/** 정한 폭을 기억한다. 저장하지 못해도(사생활 보호 모드, 용량) 폭은 그대로 바뀐다 */
export function writeSideWidth(storage: WidthStorage | undefined, width: number): void {
  try {
    storage?.setItem(SIDE_STORAGE_KEY, String(width));
  } catch {
    // 기억하지 못할 뿐이다
  }
}

/** 키 하나로 바뀌는 폭. 그 키가 폭 조절 키가 아니면 undefined */
export function keyedSideWidth(width: number, key: string, shift: boolean): number | undefined {
  const step = shift ? 40 : 10;
  switch (key) {
    case "ArrowLeft": return clampSideWidth(width + step);
    case "ArrowRight": return clampSideWidth(width - step);
    case "Home": return SIDE_MAX;
    case "End": return SIDE_MIN;
    default: return undefined;
  }
}

/** 패널 폭과 그 폭을 바꾸는 손잡이 */
export function useSideWidth() {
  const [width, setWidth] = useState(() => readSideWidth(browserStorage()));
  const [dragging, setDragging] = useState(false);

  const commit = (next: number) => {
    const value = clampSideWidth(next);
    setWidth(value);
    writeSideWidth(browserStorage(), value);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = width;
    setDragging(true);
    // 패널은 오른쪽에 있어 왼쪽으로 끌수록 넓어진다
    const move = (moveEvent: globalThis.PointerEvent) => setWidth(clampSideWidth(startWidth + startX - moveEvent.clientX));
    const up = (upEvent: globalThis.PointerEvent) => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      setDragging(false);
      commit(startWidth + startX - upEvent.clientX);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = keyedSideWidth(width, event.key, event.shiftKey);
    if (next === undefined) return;
    event.preventDefault();
    commit(next);
  };

  const handle = (
    <div className={`side-resize${dragging ? " dragging" : ""}`} role="separator" aria-orientation="vertical"
      aria-label="오른쪽 패널 폭 (두 번 누르면 처음 폭)" aria-valuemin={SIDE_MIN} aria-valuemax={SIDE_MAX} aria-valuenow={width}
      tabIndex={0} title="끌어서 폭 조절 · 두 번 누르면 처음 폭"
      style={{ right: `${14 + width}px` }}
      onPointerDown={onPointerDown} onDoubleClick={() => commit(SIDE_DEFAULT)} onKeyDown={onKeyDown} />
  );

  return { width, dragging, handle };
}
