// 편집기 화면. 배치는 화면 시안을 따른다: 상단 막대, 왼쪽 장비 목록, 가운데 캔버스, 오른쪽 속성 패널.
// 화면이 가진 상태는 선택, 열린 터미널, 터미널의 화면 기록뿐이다. 나머지는 engine의 스냅샷에서 읽는다 (AD-4).

import { shortPortName } from "@ping9/shared";
import type { DeviceKind, ErrorInfo, PortRef, Position } from "@ping9/shared";
import { useEffect, useReducer, useRef, useState } from "react";

import { Canvas } from "./components/canvas";
import { Inspector } from "./components/inspector";
import { LinkInspector } from "./components/link-inspector";
import { Palette } from "./components/palette";
import { TerminalWindow } from "./components/terminal-window";
import { TopBar } from "./components/top-bar";
import { CABLE_OFF, CABLE_READY, syncCableState } from "./cable-state";
import type { CableState } from "./cable-state";
import { availablePorts } from "./format/available-ports";
import { formatError } from "./messages/errors";
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
  const [actionError, setActionError] = useState<ErrorInfo | null>(null);
  const [cable, setCable] = useState<CableState>(CABLE_OFF);
  const [dragKind, setDragKind] = useState<DeviceKind | null>(null);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const selectedLink = document.links.find(link => link.id === selectedLinkId);

  const addDevice = (kind: DeviceKind, position: Position) => {
    setDragKind(null);
    const id = crypto.randomUUID();
    const result = simulator.dispatch({ type: "device/add", id, kind, position });
    setActionError(result.ok ? null : result.error);
    if (result.ok) {
      setSelectedLinkId(null);
      dispatch({ type: "select", deviceId: id });
    }
  };

  const pickPort = (end: PortRef) => {
    const current = simulator.getSnapshot().document;
    if (!availablePorts(current, end.deviceId).includes(end.port)) {
      setActionError({ code: "PORT_IN_USE", params: end });
      return;
    }
    const synced = syncCableState(cable, current);
    if (synced.first !== cable.first) {
      setCable(synced);
      if (cable.first !== null) setActionError({ code: "PORT_IN_USE", params: cable.first });
      return;
    }
    if (cable.first === null) {
      setCable({ active: true, first: end, pickerDeviceId: null });
      setActionError(null);
      setConnectionMessage(null);
      return;
    }
    if (cable.first.deviceId === end.deviceId) return;
    const id = crypto.randomUUID();
    const result = simulator.dispatch({ type: "link/add", id, ends: [cable.first, end] });
    if (result.ok) {
      setCable(CABLE_READY);
      setSelectedLinkId(id);
      setActionError(null);
      setConnectionMessage("케이블을 연결했어요. 다음 장비를 선택하거나 Esc로 도구를 해제하세요");
      dispatch({ type: "select", deviceId: null });
    } else setActionError(result.error);
  };

  const selectDevice = (deviceId: string) => {
    setSelectedLinkId(null);
    setActionError(null);
    setConnectionMessage(null);
    dispatch({ type: "select", deviceId });
    if (cable.active) setCable(current => ({ ...current, pickerDeviceId: deviceId }));
  };

  const moveDevice = (deviceId: string, position: Position) => {
    const result = simulator.dispatch({ type: "device/move", deviceId, position });
    setActionError(result.ok ? null : result.error);
    if (result.ok) {
      setSelectedLinkId(null);
      dispatch({ type: "select", deviceId });
    }
  };

  const removeSelectedLink = () => {
    if (selectedLink === undefined) return;
    const result = simulator.dispatch({ type: "link/remove", linkId: selectedLink.id });
    setActionError(result.ok ? null : result.error);
    if (result.ok) setSelectedLinkId(null);
  };

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
    setSelectedLinkId(current => document.links.some(link => link.id === current) ? current : null);
    setCable(current => syncCableState(current, document));
  }, [document]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setCable(CABLE_OFF); setDragKind(null); setConnectionMessage(null);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);

  const openTerminal = (deviceId: string) => {
    setCable(CABLE_OFF);
    setSelectedLinkId(null);
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
        <Palette deviceCount={document.devices.length} linkCount={document.links.length} cableActive={cable.active}
          onConnect={() => { setCable(cable.active ? CABLE_OFF : CABLE_READY); setConnectionMessage(null); setActionError(null); }}
          onDeviceDragStart={kind => { setDragKind(kind); setCable(CABLE_OFF); setConnectionMessage(null); }} />
        <section className="canvas">
          {actionError !== null && <div className="canvas-error" role="alert">{formatError(actionError)}</div>}
          {(dragKind !== null || cable.active) && <div className="edit-banner" role="status">
            <span>{dragKind !== null ? `${KIND_LABEL[dragKind]}를 원하는 위치에 놓으세요` :
              connectionMessage ?? (cable.first === null ? "케이블 선택됨 · 첫 번째 장비를 클릭해 포트를 고르세요" :
                `${document.devices.find(device => device.id === cable.first?.deviceId)?.name ?? "장비"} ${shortPortName(cable.first.port)} 선택됨 · 두 번째 장비를 클릭하세요`)}</span>
            {cable.active && <button type="button" onClick={() => setCable(CABLE_OFF)}>연결 도구 해제</button>}
          </div>}
          <Canvas
            document={document}
            selectedDeviceId={ui.selectedDeviceId}
            onSelect={selectDevice}
            onOpenTerminal={openTerminal}
            selectedLinkId={selectedLinkId}
            onSelectLink={linkId => {
              setSelectedLinkId(linkId); setCable(current => ({ ...current, pickerDeviceId: null }));
              dispatch({ type: "select", deviceId: null });
            }}
            onDropDevice={addDevice} onMoveDevice={moveDevice}
            paletteDragKind={dragKind} onPaletteDragEnd={() => setDragKind(null)}
            onDeviceDrag={() => setCable(current => ({ ...current, pickerDeviceId: null }))}
            cableActive={cable.active} firstPort={cable.first} pickerDeviceId={cable.pickerDeviceId}
            onPickPort={pickPort} onClosePortPicker={() => setCable(current => ({ ...current, pickerDeviceId: null }))}
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
        {selectedLink !== undefined ? <LinkInspector document={document} link={selectedLink} onRemove={removeSelectedLink} /> : <Inspector
          snapshot={snapshot}
          deviceId={ui.selectedDeviceId}
          onOpenTerminal={openTerminal}
          onDispatch={simulator.dispatch}
        />}
      </main>
    </div>
  );
}
