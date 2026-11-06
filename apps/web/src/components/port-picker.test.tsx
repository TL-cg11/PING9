import { createSimulator } from "@ping9/engine";
import { LIMITS, PORT_NAMES } from "@ping9/shared";
import type { PortRef } from "@ping9/shared";
import { TWO_SWITCH_VLAN, twoSwitchVlanDocument } from "@ping9/shared/examples";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { availablePorts } from "../format/available-ports";
import { Canvas } from "./canvas";
import { LinkInspector } from "./link-inspector";
import { Palette } from "./palette";
import { PortPicker } from "./port-picker";

const ROUTER = "00000000-0000-4000-8000-000000000100";
const LINK = "00000000-0000-4000-8000-000000000200";
const { sw1, pc1 } = TWO_SWITCH_VLAN;
const noop = () => {};

function open() {
  const simulator = createSimulator();
  simulator.load(twoSwitchVlanDocument);
  simulator.dispatch({ type: "device/add", id: ROUTER, kind: "router", position: { x: 400, y: 100 } });
  return simulator;
}

function picker(deviceId: string, first: PortRef | null = null) {
  const document = open().getSnapshot().document;
  return renderToString(<PortPicker document={document} device={document.devices.find(device => device.id === deviceId)!}
    first={first} onPick={noop} onClose={noop} />);
}

describe("사용 가능한 포트", () => {
  test("연결된 포트는 방향과 관계없이 제외하고 포트 순서를 유지한다", () => {
    expect(availablePorts(twoSwitchVlanDocument, sw1.id)).toEqual([
      "FastEthernet0/3", "FastEthernet0/4", "FastEthernet0/5", "FastEthernet0/6", "FastEthernet0/7",
    ]);
    expect(availablePorts(twoSwitchVlanDocument, pc1.id)).toEqual([]);
  });
  test("꺼진 Router 포트도 연결할 수 있다", () => {
    expect(availablePorts(open().getSnapshot().document, ROUTER)).toEqual(PORT_NAMES.router);
  });
  test("연결·해제 후 빈 포트 목록을 즉시 갱신한다", () => {
    const simulator = open();
    simulator.dispatch({ type: "link/add", id: LINK, ends: [
      { deviceId: ROUTER, port: PORT_NAMES.router[0] }, { deviceId: sw1.id, port: "FastEthernet0/3" },
    ] });
    expect(availablePorts(simulator.getSnapshot().document, ROUTER)).toEqual(PORT_NAMES.router.slice(1));
    simulator.dispatch({ type: "link/remove", linkId: LINK });
    expect(availablePorts(simulator.getSnapshot().document, ROUTER)).toEqual(PORT_NAMES.router);
  });
  test("삭제된 장비에는 빈 목록을 반환한다", () => {
    expect(availablePorts(twoSwitchVlanDocument, "missing")).toEqual([]);
  });
});

describe("장비 옆 포트 목록", () => {
  test("첫 번째 장비에서는 빈 포트만 버튼으로 선택할 수 있다", () => {
    const html = picker(sw1.id);
    expect(html).toContain('role="dialog"');
    expect(html).toContain("SW1의 빈 포트");
    expect(html).toContain("첫 번째 포트를 선택하세요");
    expect(html).toContain("FastEthernet0/3");
    expect(html).not.toContain("FastEthernet0/1");
    expect(html).not.toContain("FastEthernet0/2");
    expect(html).not.toContain("FastEthernet0/8");
  });
  test("두 번째 장비에는 포트를 고르면 연결된다는 안내가 있다", () => {
    const html = picker(sw1.id, { deviceId: ROUTER, port: PORT_NAMES.router[0] });
    expect(html).toContain("두 번째 포트를 선택하면 연결돼요");
    expect(html).toContain("FastEthernet0/3");
  });
  test("같은 장비의 다른 포트로는 연결할 수 없다", () => {
    const html = picker(ROUTER, { deviceId: ROUTER, port: PORT_NAMES.router[0] });
    expect(html).toContain("다른 장비를 선택해");
    expect(html).not.toContain("GigabitEthernet0/1");
  });
  test("빈 포트가 없으면 안내를 표시한다", () => {
    expect(picker(pc1.id)).toContain("사용할 수 있는 포트가 없어요");
  });
});

describe("케이블 도구와 선택", () => {
  test("케이블 선택 상태를 버튼과 글자로 표시한다", () => {
    const html = renderToString(<Palette deviceCount={2} cableActive onConnect={noop} />);
    expect(html).toContain('class="tool cable-tool active"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("선택됨");
  });
  test("장비 한도에서는 드래그를 비활성화한다", () => {
    const html = renderToString(<Palette deviceCount={LIMITS.maxDevices} onConnect={noop} />);
    expect(html.match(/draggable="false"/g)).toHaveLength(3);
  });
  test.each([[1, 0], [2, LIMITS.maxLinks]])("장비 %i대/링크 %i개에서는 케이블 도구를 새로 고를 수 없다", (deviceCount, linkCount) => {
    const html = renderToString(<Palette deviceCount={deviceCount} linkCount={linkCount} onConnect={noop} />);
    expect(html).toMatch(/<button[^>]*aria-label="케이블 연결"[^>]*disabled=""/);
  });
  test("한도에 도달해도 선택된 연결 도구를 해제할 수 있다", () => {
    const html = renderToString(<Palette deviceCount={2} linkCount={LIMITS.maxLinks} cableActive onConnect={noop} />);
    expect(html).not.toMatch(/aria-label="케이블 연결"[^>]*disabled/);
  });
  test("선택한 케이블의 양 끝 전체 포트 이름과 삭제 버튼을 보여준다", () => {
    const html = renderToString(<LinkInspector document={twoSwitchVlanDocument}
      link={twoSwitchVlanDocument.links[0]!} onRemove={noop} />);
    for (const text of ["PC1", "SW1", "Ethernet0", "FastEthernet0/1", "케이블 삭제"]) expect(html).toContain(text);
  });
  test("캔버스에서 링크 선택과 장비 옆 포트 목록을 함께 표시할 수 있다", () => {
    const document = open().getSnapshot().document;
    const html = renderToString(<Canvas document={document} selectedDeviceId={ROUTER} onSelect={noop}
      onOpenTerminal={noop} selectedLinkId={document.links[0]!.id} onSelectLink={noop}
      cableActive pickerDeviceId={ROUTER} onPickPort={noop} />);
    expect(html).toContain('class="link selected"');
    expect(html.match(/class="wire-port"/g)).toHaveLength(document.links.length * 2);
    expect(html).toContain("R1의 빈 포트");
    expect(html).toContain('aria-label="장비 R1"');
  });
});
