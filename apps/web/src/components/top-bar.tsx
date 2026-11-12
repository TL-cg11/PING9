// 상단 막대. 시안의 <header class="topbar">와 같은 마크업이다.
// 모드 전환(T0.13), 내보내기(T7.1.1), 가져오기(T7.1.2), 시뮬레이션의 멈춤·속도(T0.15)가 동작한다.
// 내보내기·가져오기는 왼쪽, 토폴로지 이름 옆에 둔다. 모드 탭은 맨 오른쪽에 고정하고,
// 시뮬레이션일 때만 그 왼쪽에 멈춤·속도가 붙는다 (T0.15 시안 A안).

import { useRef } from "react";

import type { Mode } from "../mode";
import { SPEEDS } from "../sim-clock";
import type { ClockState, Speed } from "../sim-clock";
import { TopologyName } from "./topology-name";

const MODES: readonly { readonly mode: Mode; readonly label: string }[] = [
  { mode: "realtime", label: "⏱ 실시간" },
  { mode: "simulation", label: "⏯ 시뮬레이션" },
];

/** 가져오기의 파일 고르기 창에서 보이는 파일. 내보낸 파일은 `.ping9.json`이다 */
const IMPORT_ACCEPT = ".json,application/json";

/** 시뮬레이션의 멈춤·속도 (T0.15) */
export interface SimControls {
  readonly clock: ClockState;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onSpeed: (speed: Speed) => void;
}

export function TopBar({ name, onRename, onExport, onImport, mode, onModeChange, sim }: {
  readonly name: string;
  /** 이름을 고친다 (T0.16). 없으면 이름을 글자로만 보인다 */
  readonly onRename?: ((name: string) => void) | undefined;
  /** 지금 토폴로지를 파일로 받는다 (T7.1.1) */
  readonly onExport: () => void;
  /** 고른 파일을 가져온다 (T7.1.2) */
  readonly onImport: (file: File) => void;
  readonly mode: Mode;
  readonly onModeChange: (mode: Mode) => void;
  /** 시뮬레이션 모드에서만 준다. 없으면 멈춤·속도를 그리지 않는다 */
  readonly sim?: SimControls | undefined;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
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
        {onRename === undefined ? <span className="name">{name}</span> : <TopologyName name={name} onRename={onRename} />}
      </div>
      <div className="file-actions">
        <button type="button" className="ghost" onClick={onExport}>
          ⤓ 내보내기
        </button>
        <button type="button" className="ghost" onClick={() => fileInput.current?.click()}>
          ⤒ 가져오기
        </button>
        <input ref={fileInput} type="file" accept={IMPORT_ACCEPT} hidden aria-label="가져올 파일"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            // 같은 파일을 다시 골라도 change가 오게 비운다
            event.currentTarget.value = "";
            if (file !== undefined) onImport(file);
          }} />
      </div>
      <div className="spacer" />
      {mode === "simulation" && sim !== undefined && (
        <div className="sim-controls">
          {sim.clock.paused ? (
            <button type="button" className="sim-run paused" onClick={sim.onResume}>▶ 다시 실행</button>
          ) : (
            <button type="button" className="sim-run" onClick={sim.onPause}>⏸ 멈춤</button>
          )}
          <div className="speed" role="group" aria-label="재생 속도">
            <span aria-hidden="true">속도</span>
            {SPEEDS.map((speed) => (
              <button key={speed} type="button" aria-pressed={speed === sim.clock.speed} aria-label={`${speed}배속`}
                className={speed === sim.clock.speed ? "on" : undefined} onClick={() => sim.onSpeed(speed)}>
                {speed}×
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mode" role="tablist" aria-label="모드">
        {MODES.map((item) => (
          <button key={item.mode} type="button" role="tab" aria-selected={item.mode === mode}
            className={item.mode === mode ? "on" : undefined} onClick={() => onModeChange(item.mode)}>
            {item.label}
          </button>
        ))}
      </div>
    </header>
  );
}
