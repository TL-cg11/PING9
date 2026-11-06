// 왼쪽 장비 목록. 시안의 <aside class="palette">와 같은 마크업과 아이콘이다.
// 장비 버튼을 누르면 공통 device/add 경로로 장비를 추가한다. 끌어 놓기는 T1.3.2에서 추가한다.

import { LIMITS } from "@ping9/shared";
import type { DeviceKind } from "@ping9/shared";

const STROKE = { fill: "none", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
export function Palette({ deviceCount, onAdd, linkCount = 0, onConnect }: {
  readonly deviceCount: number;
  readonly onAdd: (kind: DeviceKind) => void;
  readonly linkCount?: number;
  readonly onConnect: () => void;
}) {
  const used = Math.min(100, (deviceCount / LIMITS.maxDevices) * 100);
  const full = deviceCount >= LIMITS.maxDevices;

  return (
    <aside className="palette">
      <h4>장비</h4>
      <button type="button" className="tool" aria-label="PC 추가" disabled={full} onClick={() => onAdd("pc")}>
        <svg viewBox="0 0 32 32" stroke="#1565D8" {...STROKE}>
          <rect x="4" y="6" width="24" height="15" rx="3" />
          <path d="M12 26h8M16 21v5" />
        </svg>
        PC
      </button>
      <button type="button" className="tool" aria-label="Switch 추가" disabled={full} onClick={() => onAdd("switch")}>
        <svg viewBox="0 0 32 32" stroke="#5B4BD1" {...STROKE}>
          <rect x="3" y="10" width="26" height="12" rx="3" />
          <path d="M8 16h2M13 16h2M18 16h2M23 16h2" />
        </svg>
        Switch
      </button>
      <button type="button" className="tool" aria-label="Router 추가" disabled={full} onClick={() => onAdd("router")}>
        <svg viewBox="0 0 32 32" stroke="#1E7A6E" {...STROKE}>
          <circle cx="16" cy="16" r="11" />
          <path d="M11 11l10 10M21 11L11 21" />
        </svg>
        Router
      </button>
      <h4>연결</h4>
      <button type="button" className="tool" aria-label="케이블 연결" onClick={onConnect}
        disabled={deviceCount < 2 || linkCount >= LIMITS.maxLinks}>
        <svg viewBox="0 0 32 32" fill="none" stroke="#1565D8" strokeWidth="2" strokeLinecap="round">
          <path d="M6 24c6 0 6-16 20-16" />
          <circle cx="6" cy="24" r="2.5" fill="#1565D8" />
          <circle cx="26" cy="8" r="2.5" fill="#1565D8" />
        </svg>
        케이블
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
