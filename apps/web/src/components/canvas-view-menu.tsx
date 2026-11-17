// 캔버스 오른쪽 위의 "보기" 메뉴 (T6.4.2). 케이블과 장비 둘레의 글자를 종류별로 켜고 끈다.
// 고른 값은 브라우저에 기억한다. 끈 글자는 그리지 않고 CSS로 숨긴다 (자리 계산은 그대로).

import { useEffect, useRef, useState } from "react";

import { browserStorage } from "../mode";

export const CANVAS_VIEW_ITEMS = [
  { key: "band", label: "대역" },
  { key: "address", label: "포트 주소" },
  { key: "port", label: "포트 이름" },
  { key: "vlan", label: "VLAN 표시" },
  { key: "device-ip", label: "장비 이름 아래 IP" },
] as const;

export type CanvasViewKey = (typeof CANVAS_VIEW_ITEMS)[number]["key"];
/** 끈 항목 */
export type CanvasHidden = ReadonlySet<CanvasViewKey>;

const STORAGE_KEY = "ping9.canvasView";

function readHidden(): Set<CanvasViewKey> {
  try {
    const saved = JSON.parse(browserStorage()?.getItem(STORAGE_KEY) ?? "[]") as unknown;
    const keys = CANVAS_VIEW_ITEMS.map(item => item.key) as readonly string[];
    return new Set(Array.isArray(saved) ? saved.filter((key): key is CanvasViewKey => keys.includes(key as string)) : []);
  } catch {
    return new Set();
  }
}

/**
 * 하나를 눌렀을 때 끈 항목. "all"은 하나라도 꺼져 있으면 모두 켜고, 모두 켜져 있으면 모두 끈다
 */
export function nextHidden(previous: CanvasHidden, key: CanvasViewKey | "all"): Set<CanvasViewKey> {
  if (key === "all") return new Set(previous.size > 0 ? [] : CANVAS_VIEW_ITEMS.map(item => item.key));
  const next = new Set(previous);
  if (next.has(key)) next.delete(key); else next.add(key);
  return next;
}

/** 끈 항목과 그것을 바꾸는 함수. 바꾸면 기억한다 */
export function useCanvasHidden(): [CanvasHidden, (key: CanvasViewKey | "all") => void] {
  const [hidden, setHidden] = useState(readHidden);
  const toggle = (key: CanvasViewKey | "all") => setHidden(previous => {
    const next = nextHidden(previous, key);
    try { browserStorage()?.setItem(STORAGE_KEY, JSON.stringify([...next])); } catch { /* 저장 못 해도 화면은 바뀐다 */ }
    return next;
  });
  return [hidden, toggle];
}

/** svg에 붙일 클래스: `hide-band hide-port` … */
export const hiddenClasses = (hidden: CanvasHidden) => [...hidden].map(key => ` hide-${key}`).join("");

export function CanvasViewMenu({ hidden, onToggle }: { readonly hidden: CanvasHidden; readonly onToggle: (key: CanvasViewKey | "all") => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", escape); };
  }, [open]);
  return (
    <div className="canvas-view" ref={root} onPointerDown={event => event.stopPropagation()}>
      <button type="button" className={`canvas-view-button${open ? " open" : ""}${hidden.size > 0 ? " some-off" : ""}`}
        aria-haspopup="true" aria-expanded={open} title="캔버스에 보일 글자 고르기" onClick={() => setOpen(value => !value)}>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M1.8 10S5 4.5 10 4.5 18.2 10 18.2 10 15 15.5 10 15.5 1.8 10 1.8 10Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <circle cx="10" cy="10" r="2.6" fill="currentColor" />
        </svg>
        보기
        <span className="caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="canvas-view-menu" role="group" aria-label="캔버스에 보일 글자">
          {/* 전체: 모두 켜짐이면 체크, 일부만 꺼짐이면 가로줄 */}
          <label className="all">
            <input type="checkbox" checked={hidden.size === 0} ref={input => { if (input) input.indeterminate = hidden.size > 0 && hidden.size < CANVAS_VIEW_ITEMS.length; }}
              onChange={() => onToggle("all")} />
            <span className="box" aria-hidden="true" />
            전체
          </label>
          {CANVAS_VIEW_ITEMS.map(item => (
            <label key={item.key}>
              <input type="checkbox" checked={!hidden.has(item.key)} onChange={() => onToggle(item.key)} />
              <span className="box" aria-hidden="true" />
              {item.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
