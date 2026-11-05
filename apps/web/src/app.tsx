import { createSimulator } from "@ping9/engine";
import { twoPcDocument } from "@ping9/shared/examples";

// 자리표시 화면. engine의 Simulator에 예시 Document를 불러와 요약만 보여 준다.
// T1.1.4에서 편집기 화면 틀로, T1.3.2에서 캔버스로 교체한다.
const simulator = createSimulator();
simulator.load(twoPcDocument);

export function App() {
  const { document } = simulator.getSnapshot();
  const names = document.devices.map((device) => device.name).join(", ");

  return (
    <main className="placeholder">
      <h1>PING9</h1>
      <p>웹 기반 네트워크 시뮬레이터 · 준비 중</p>
      <p className="packages">
        예시 토폴로지: 장비 {document.devices.length}대 ({names}), 링크 {document.links.length}개
      </p>
    </main>
  );
}
