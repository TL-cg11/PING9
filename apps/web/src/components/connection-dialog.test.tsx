import { createSimulator } from "@ping9/engine";
import { LIMITS, PORT_NAMES } from "@ping9/shared";
import { TWO_SWITCH_VLAN, twoSwitchVlanDocument } from "@ping9/shared/examples";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { availablePorts } from "../format/available-ports";
import { Canvas } from "./canvas";
import { ConnectionDialog } from "./connection-dialog";
import { LinkInspector } from "./link-inspector";
import { Palette } from "./palette";

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

function renderDialog(initialDeviceId: string | null = ROUTER) {
  return renderToString(<ConnectionDialog document={open().getSnapshot().document} initialDeviceId={initialDeviceId}
    onConnect={() => ({ ok: true, notices: [] })} onClose={noop} />).replaceAll("<!-- -->", "");
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

describe("케이블 연결 창", () => {
  test("선택한 장비에서 시작하고 양쪽 장비와 빈 포트 선택칸을 제공한다", () => {
    const html = renderDialog();
    expect(html).toContain('<dialog class="connection-dialog"');
    expect(html).toContain('aria-labelledby="connection-title"');
    expect(html).toContain("케이블 연결");
    for (const field of ["first-device", "second-device", "first-port", "second-port"]) {
      expect(html).toContain(`for="connection-${field}"`);
      expect(html).toContain(`id="connection-${field}"`);
    }
    expect(html).toContain(`value="${ROUTER}" selected=""`);
    expect(html).toContain("GigabitEthernet0/0");
    expect(html).toContain('<button type="submit" class="primary">연결</button>');
  });

  test("두 번째 장비 선택 목록에서 첫 번째 장비를 제외한다", () => {
    const html = renderDialog();
    const secondOptions = html.match(/<select id="connection-second-device"[^>]*>(.*?)<\/select>/)?.[1];
    expect(secondOptions).toBeDefined();
    expect(secondOptions).not.toContain(ROUTER);
    expect(secondOptions).toContain(sw1.id);
  });

  test("빈 포트 없는 PC를 고르면 연결을 막고 안내한다", () => {
    const html = renderDialog(pc1.id);
    expect(html).toContain("빈 포트 없음");
    expect(html).toMatch(/<select id="connection-first-port"[^>]*disabled=""/);
    expect(html).toContain('<button type="submit" class="primary" disabled="">연결</button>');
    expect(html).toContain("기존 케이블을 삭제해 주세요");
  });

  test("문서에서 사라진 선택 장비가 있어도 다른 장비로 표시할 수 있다", () => {
    expect(renderDialog("missing")).toContain("케이블 연결");
  });
});

describe("케이블 선택과 삭제 표시", () => {
  test("캔버스에 포트 이름과 선택/키보드 조작 가능한 링크를 표시한다", () => {
    const document = twoSwitchVlanDocument;
    const html = renderToString(<Canvas document={document} selectedDeviceId={null} onSelect={noop}
      onOpenTerminal={noop} selectedLinkId={document.links[0]!.id} onSelectLink={noop} />);
    expect(html).toContain('class="link selected"');
    expect(html.match(/class="wire-port"/g)).toHaveLength(document.links.length * 2);
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-label="케이블 PC1 Eth0 ↔ SW1 Fa0/1"');
  });

  test("선택한 케이블의 양 끝 전체 포트 이름과 삭제 버튼을 보여준다", () => {
    const html = renderToString(<LinkInspector document={twoSwitchVlanDocument}
      link={twoSwitchVlanDocument.links[0]!} onRemove={noop} />);
    expect(html).toContain("PC1");
    expect(html).toContain("SW1");
    expect(html).toContain("Ethernet0");
    expect(html).toContain("FastEthernet0/1");
    expect(html).toContain("케이블 삭제");
  });

  test.each([
    [1, 0], [2, LIMITS.maxLinks],
  ])("장비 %i대, 링크 %i개이면 연결 버튼을 비활성화한다", (deviceCount, linkCount) => {
    const html = renderToString(<Palette deviceCount={deviceCount} linkCount={linkCount} onAdd={noop} onConnect={noop} />);
    expect(html).toMatch(/<button[^>]*aria-label="케이블 연결"[^>]*disabled=""/);
  });
});
