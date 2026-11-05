// 편집기 화면. 배치는 화면 시안을 따른다: 상단 막대, 왼쪽 장비 목록, 가운데 캔버스, 오른쪽 속성 패널.
// 화면이 가진 상태는 선택과 열린 터미널뿐이다. 나머지는 engine의 스냅샷에서 읽는다 (AD-4).

import { useEffect, useReducer } from "react";

import { Canvas } from "./components/canvas";
import { Palette } from "./components/palette";
import { TopBar } from "./components/top-bar";
import { TOPOLOGY_NAME, useSnapshot } from "./simulator";
import { INITIAL_UI_STATE, uiReducer } from "./ui-state";

export function App() {
  const snapshot = useSnapshot();
  const { document } = snapshot;
  const [ui, dispatch] = useReducer(uiReducer, INITIAL_UI_STATE);

  // 문서에서 사라진 장비를 가리키는 선택과 터미널을 비운다
  useEffect(() => {
    dispatch({ type: "sync", deviceIds: document.devices.map((device) => device.id) });
  }, [document]);

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
            onOpenTerminal={(deviceId) => dispatch({ type: "open-terminal", deviceId })}
          />
        </section>
        <aside className="inspector" />
      </main>
    </div>
  );
}
