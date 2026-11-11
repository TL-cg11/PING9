// 왼쪽 장비 목록. 시안의 <aside class="palette">와 같은 마크업이고, 아이콘은 T0.6의 장비 아이콘이다.
// 장비는 끌어 놓기로만 추가하고, 케이블 버튼은 연결 도구를 선택/해제한다.

import { LIMITS } from "@ping9/shared";
import type { DeviceKind } from "@ping9/shared";

import { DeviceIcon } from "./device-icons";

export function Palette({ deviceCount, linkCount = 0, onConnect, cableActive = false, onDeviceDragStart }: {
  readonly deviceCount: number;
  readonly linkCount?: number;
  readonly onConnect: () => void;
  readonly cableActive?: boolean;
  readonly onDeviceDragStart?: (kind: DeviceKind) => void;
}) {
  const used = Math.min(100, (deviceCount / LIMITS.maxDevices) * 100);
  const full = deviceCount >= LIMITS.maxDevices;

  return (
    <aside className="palette">
      <h4>장비</h4>
      {([ ["pc", "PC"], ["switch", "Switch"], ["router", "Router"] ] as const).map(([kind, label]) => (
        <button key={kind} type="button" className="tool device-tool" aria-label={`${label} 추가`}
          title={`${label}를 캔버스로 끌어서 놓으세요`} disabled={full} draggable={false}
          onPointerDown={event => {
            if (event.button !== 0 || full) return;
            event.preventDefault();
            onDeviceDragStart?.(kind);
          }}>
          <DeviceIcon kind={kind} />{label}
        </button>
      ))}
      <p className="palette-note">장비를 끌어서 배치</p>
      <h4>연결</h4>
      <button type="button" className={cableActive ? "tool cable-tool active" : "tool cable-tool"}
        aria-label="케이블 연결" aria-pressed={cableActive} onClick={onConnect}
        disabled={!cableActive && (deviceCount < 2 || linkCount >= LIMITS.maxLinks)}>
        <svg viewBox="0 0 32 32" fill="none" stroke="#DB5B91" strokeWidth="2" strokeLinecap="round">
          <path d="M6 24c6 0 6-16 20-16" />
          <circle cx="6" cy="24" r="2.5" fill="#DB5B91" />
          <circle cx="26" cy="8" r="2.5" fill="#DB5B91" />
        </svg>
        케이블{cableActive && <span className="tool-selected">선택됨</span>}
      </button>
      <div className="quota">
        장비 {deviceCount} / {LIMITS.maxDevices}
        <div className="bar">
          <i style={{ width: `${used}%` }} />
        </div>
      </div>
    </aside>
  );
}
