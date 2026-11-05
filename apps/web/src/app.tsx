import { ENGINE_PACKAGE_NAME } from "@ping9/engine";
import { SHARED_PACKAGE_NAME } from "@ping9/shared";

// 자리표시 화면. T1.1.4에서 편집기 화면 틀로 교체한다.
export function App() {
  return (
    <main className="placeholder">
      <h1>PING9</h1>
      <p>웹 기반 네트워크 시뮬레이터 · 준비 중</p>
      <p className="packages">
        {ENGINE_PACKAGE_NAME} · {SHARED_PACKAGE_NAME}
      </p>
    </main>
  );
}
