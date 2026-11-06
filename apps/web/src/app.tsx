// 편집기 화면. 배치는 화면 시안을 따른다: 상단 막대, 왼쪽 장비 목록, 가운데 캔버스, 오른쪽 속성 패널.
// 화면이 가진 상태는 선택, 열린 터미널, 터미널의 화면 기록뿐이다. 나머지는 engine의 스냅샷에서 읽는다 (AD-4).

import type { DeviceKind } from "@ping9/shared";
import { useEffect, useReducer, useRef, useState } from "react";

import { Canvas } from "./components/canvas";
import { Inspector } from "./components/inspector";
import { Palette } from "./components/palette";
import { TerminalWindow } from "./components/terminal-window";
import { TopBar } from "./components/top-bar";
import { TOPOLOGY_NAME, simulator, useSnapshot } from "./simulator";
import { createCommandQueue } from "./terminal/command-queue";
import { completed, historyStep, initialTerminal, runLine, showHelp } from "./terminal/terminal-state";
import type { TerminalState } from "./terminal/terminal-state";
import { INITIAL_UI_STATE, uiReducer } from "./ui-state";

type Terminals = Readonly<Record<string, TerminalState>>;

const KIND_LABEL: Readonly<Record<DeviceKind, "PC" | "Switch" | "Router">> = {
  pc: "PC",
  switch: "Switch",
  router: "Router",
};

/** 시안에서 터미널 창이 쌓이기 시작하는 z-index */
const TERMINAL_Z = 20;

export function App() {
  const snapshot = useSnapshot();
  const { document } = snapshot;
  const [ui, dispatch] = useReducer(uiReducer, INITIAL_UI_STATE);

  // 장비별 터미널의 화면 기록. 창을 닫았다 열어도 남는다 (FR-19).
  // 실행이 비동기라 가장 최근 값을 ref에 두고, 바꿀 때는 항상 updateTerminals를 거친다
  const [terminals, setTerminals] = useState<Terminals>({});
  const latest = useRef<Terminals>({});
  const updateTerminals = (change: (current: Terminals) => Terminals) => {
    latest.current = change(latest.current);
    setTerminals(latest.current);
  };

  // 장비마다 앞 명령의 실행이 끝난 뒤에 다음 명령을 실행한다. 줄의 순서가 입력 순서와 같게 된다.
  // 실행이 실패해도 그 터미널이 멈추지 않게, 실패는 그 터미널에 오류 줄로 남긴다
  const [queue] = useState(() =>
    createCommandQueue((deviceId) => {
      updateTerminals((current) => {
        const state = current[deviceId];
        if (state === undefined) return current;
        const failed: TerminalState = {
          ...state,
          lines: [...state.lines, { kind: "error", text: "명령을 실행하지 못했어요. 다시 입력해 주세요" }],
        };
        return { ...current, [deviceId]: failed };
      });
    }),
  );

  // 문서에서 사라진 장비를 가리키는 선택과 터미널을 비운다
  useEffect(() => {
    dispatch({ type: "sync", deviceIds: document.devices.map((device) => device.id) });
  }, [document]);

  const openTerminal = (deviceId: string) => {
    updateTerminals((current) =>
      current[deviceId] === undefined
        ? { ...current, [deviceId]: initialTerminal(simulator.console(deviceId).prompt()) }
        : current,
    );
    dispatch({ type: "select", deviceId });
    dispatch({ type: "open-terminal", deviceId });
  };

  const submit = (deviceId: string, input: string) => {
    void queue.enqueue(deviceId, async () => {
      const state = latest.current[deviceId];
      if (state === undefined) return;
      const next = await runLine(simulator.console(deviceId), state, input);
      updateTerminals((current) => ({ ...current, [deviceId]: next }));
    });
  };

  const stepHistory = (deviceId: string, direction: "up" | "down"): string => {
    const state = latest.current[deviceId];
    if (state === undefined) return "";
    const step = historyStep(state, direction);
    updateTerminals((current) => ({ ...current, [deviceId]: step.state }));
    return step.input;
  };

  // Tab: 지금 모드에서 완성한 줄을 바로 돌려준다. 화면 기록은 바뀌지 않는다
  const complete = (deviceId: string, input: string): string => completed(simulator.console(deviceId), input);

  // `?`: 실행과 같은 대기열에 넣는다. 앞 명령의 결과보다 먼저 끼어들거나 그 결과에 덮이지 않는다
  const help = (deviceId: string, input: string) => {
    void queue.enqueue(deviceId, async () => {
      const state = latest.current[deviceId];
      if (state === undefined) return;
      const next = showHelp(simulator.console(deviceId), state, input);
      updateTerminals((current) => ({ ...current, [deviceId]: next }));
    });
  };

  return (
    <div className="app">
      <TopBar name={TOPOLOGY_NAME} />
      <main className="work">
        <Palette deviceCount={document.devices.length} />
        <section className="canvas">
          <Canvas
            document={document}
            selectedDeviceId={ui.selectedDeviceId}
            onSelect={(deviceId) => dispatch({ type: "select", deviceId })}
            onOpenTerminal={openTerminal}
          />
          {ui.terminals.map((placement, index) => {
            const device = document.devices.find((candidate) => candidate.id === placement.deviceId);
            const state = terminals[placement.deviceId];
            if (device === undefined || state === undefined) return null;
            return (
              <TerminalWindow
                key={placement.deviceId}
                deviceName={device.name}
                kindLabel={KIND_LABEL[device.kind]}
                state={state}
                placement={placement}
                zIndex={TERMINAL_Z + index}
                onSubmit={(input) => submit(placement.deviceId, input)}
                onHistory={(direction) => stepHistory(placement.deviceId, direction)}
                onComplete={(input) => complete(placement.deviceId, input)}
                onHelp={(input) => help(placement.deviceId, input)}
                onClose={() => dispatch({ type: "close-terminal", deviceId: placement.deviceId })}
                onFocus={() => dispatch({ type: "focus-terminal", deviceId: placement.deviceId })}
                onMove={(x, y) => dispatch({ type: "move-terminal", deviceId: placement.deviceId, x, y })}
              />
            );
          })}
        </section>
        <Inspector snapshot={snapshot} deviceId={ui.selectedDeviceId} onOpenTerminal={openTerminal} />
      </main>
    </div>
  );
}
