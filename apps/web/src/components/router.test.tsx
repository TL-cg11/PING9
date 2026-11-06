import { createSimulator } from "@ping9/engine";
import { LIMITS } from "@ping9/shared";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { Canvas } from "./canvas";
import { Inspector } from "./inspector";
import { Palette } from "./palette";

const ID = "00000000-0000-4000-8000-000000000100";
const noop = () => {};

function open() {
  const simulator = createSimulator();
  expect(simulator.dispatch({ type: "device/add", id: ID, kind: "router", position: { x: 320, y: 200 } }).ok).toBe(true);
  return simulator;
}

describe("Router 배치와 표시", () => {
  test("캔버스에서 생성된 R1을 Router 아이콘으로 표시한다", () => {
    const simulator = open();
    const html = renderToString(<Canvas document={simulator.getSnapshot().document} selectedDeviceId={ID}
      onSelect={noop} onOpenTerminal={noop} />);
    expect(html).toContain(">R1<");
    // 장비 아이콘은 T0.6에서 바뀌었다 (전의 badge-r 대신 icon-router)
    expect(html).toContain('class="icon icon-router"');
    expect(html).toContain('class="node sel"');
  });

  test("속성 패널에 인터페이스 4개와 admin-down을 표시한다", () => {
    const simulator = open();
    const html = renderToString(<Inspector snapshot={simulator.getSnapshot()} deviceId={ID}
      onOpenTerminal={noop} onDispatch={simulator.dispatch} />).replaceAll("<!-- -->", "");
    expect(html).toContain("포트 4개 · 0개 연결");
    expect(html.match(/class="port-state">admin-down/g)).toHaveLength(4);
    expect(html.match(/class="dot off"/g)).toHaveLength(4);
    for (let i = 0; i < 4; i += 1) expect(html).toContain(`Gi0/${i}`);
    expect(html).toContain("터미널 열기");
    expect(html).not.toContain("VLAN");
  });

  test("CLI로 켠 인터페이스의 no-link 상태가 패널에도 반영된다", async () => {
    const simulator = open();
    const port = simulator.console(ID);
    for (const command of ["enable", "configure terminal", "interface gi0/0", "no shutdown"]) {
      expect((await port.exec(command)).lines).toEqual([]);
    }
    const html = renderToString(<Inspector snapshot={simulator.getSnapshot()} deviceId={ID}
      onOpenTerminal={noop} onDispatch={simulator.dispatch} />);
    expect(html.match(/class="port-state">no-link/g)).toHaveLength(1);
    expect(html.match(/class="port-state">admin-down/g)).toHaveLength(3);
  });

  test("장비 목록은 장비 추가 버튼과 케이블 연결 버튼을 제공한다", () => {
    const html = renderToString(<Palette deviceCount={2} onAdd={noop} onConnect={noop} />);
    for (const label of ["PC 추가", "Switch 추가", "Router 추가"]) expect(html).toContain(`aria-label="${label}"`);
    expect(html.match(/<button/g)).toHaveLength(4);
    expect(html).not.toContain("disabled");
  });

  test("한도에 도달하면 장비 추가 버튼을 비활성화한다", () => {
    const html = renderToString(<Palette deviceCount={LIMITS.maxDevices} onAdd={noop} onConnect={noop} />);
    expect(html.match(/disabled=""/g)).toHaveLength(3);
    expect(html.replaceAll("<!-- -->", "")).toContain("장비 50 / 50");
  });
});
