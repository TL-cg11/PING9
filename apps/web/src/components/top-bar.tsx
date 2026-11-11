// 상단 막대. 시안의 <header class="topbar">와 같은 마크업이다.
// 모드 전환과 시뮬레이션 모드의 ping 실행(T0.13)이 동작한다. 내보내기, 가져오기는 아직 동작하지 않아 꺼 두었다.

import type { Mode } from "../mode";

const MODES: readonly { readonly mode: Mode; readonly label: string }[] = [
  { mode: "realtime", label: "⏱ 실시간" },
  { mode: "simulation", label: "⏯ 시뮬레이션" },
];

/** 실시간 모드에서 꺼진 `▶ ping 실행`의 안내 (T0.13) */
export const PING_IN_SIMULATION = "시뮬레이션 모드에서 쓸 수 있어요";

export function TopBar({ name, mode, onModeChange, onPing, pingActive = false }: {
  readonly name: string;
  readonly mode: Mode;
  readonly onModeChange: (mode: Mode) => void;
  /** 출발·목적지를 고르는 도구를 켜고 끈다. 없으면(실시간 모드) 버튼이 꺼진다 */
  readonly onPing?: (() => void) | undefined;
  readonly pingActive?: boolean;
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="tile">
          <img src="/logo.png" alt="" />
        </div>
        <div className="wordmark">
          PING<span>9</span>
        </div>
      </div>
      <div className="crumb">
        <span className="sep">/</span>
        <span className="name">{name}</span>
      </div>
      <div className="spacer" />
      <button className="ghost" disabled>
        ⤓ 내보내기
      </button>
      <button className="ghost" disabled>
        ⤒ 가져오기
      </button>
      <div className="mode" role="tablist" aria-label="모드">
        {MODES.map((item) => (
          <button key={item.mode} type="button" role="tab" aria-selected={item.mode === mode}
            className={item.mode === mode ? "on" : undefined} onClick={() => onModeChange(item.mode)}>
            {item.label}
          </button>
        ))}
      </div>
      {onPing !== undefined ? (
        <button type="button" className={pingActive ? "ping-btn on" : "ping-btn"} aria-pressed={pingActive} onClick={onPing}>
          ▶ ping 실행
        </button>
      ) : (
        // 실시간 모드: 꺼 두고 안내한다. disabled 대신 aria-disabled라 안내(title)가 뜬다
        <button type="button" className="ping-btn off" aria-disabled="true" title={PING_IN_SIMULATION}>
          ▶ ping 실행
        </button>
      )}
    </header>
  );
}
