// Firewall의 화면 표시 (T14.2.1): 장비 목록, 캔버스 아이콘, 속성 패널의 필터 규칙, 문구.
import { createSimulator } from "@ping9/engine";
import type { Reason } from "@ping9/shared";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { formatError } from "../messages/errors";
import { causeOf, eventText } from "../messages/events";
import { Canvas } from "./canvas";
import { Inspector } from "./inspector";
import { Palette } from "./palette";

const ID = "00000000-0000-4000-8000-000000000200";
const noop = () => {};

function open() {
  const simulator = createSimulator();
  expect(simulator.dispatch({ type: "device/add", id: ID, kind: "firewall", position: { x: 320, y: 200 } }).ok).toBe(true);
  return simulator;
}

// 서버 렌더링은 글자 사이에 주석 표시를 넣으므로 빼고 비교한다
const inspector = (simulator: ReturnType<typeof open>) =>
  renderToString(<Inspector snapshot={simulator.getSnapshot()} deviceId={ID} onOpenTerminal={noop}
    onDispatch={() => ({ ok: true, notices: [] })} />).replaceAll("<!-- -->", "");

describe("Firewall 배치와 표시", () => {
  test("장비 목록에 Firewall이 있다", () => {
    const html = renderToString(<Palette deviceCount={0} onConnect={noop} />);
    expect(html).toContain('aria-label="Firewall 추가"');
    expect(html).toContain('class="icon icon-firewall"');
  });

  test("캔버스에서 만든 FW1을 Firewall 아이콘으로 그린다", () => {
    const simulator = open();
    const html = renderToString(<Canvas document={simulator.getSnapshot().document} selectedDeviceId={null} onSelect={noop} onOpenTerminal={noop} />);
    expect(html).toContain("FW1");
    expect(html).toContain('class="icon icon-firewall"');
  });

  test("속성 패널: 종류, 인터페이스 넷과 상태, 라우팅 테이블, 체인 셋의 기본 정책", () => {
    const html = inspector(open());
    expect(html).toContain('<span class="chip">Firewall</span>');
    expect(html).toContain("포트 4개 · 0개 연결");
    expect(html.match(/class="port-state">no-link/g)).toHaveLength(4);
    expect(html).toContain("<h4>라우팅 테이블</h4>");
    expect(html).toContain("<h4>필터 규칙 (iptables)</h4>");
    for (const chain of ["INPUT", "FORWARD", "OUTPUT"]) {
      expect(html).toContain(`<div class="if-row">${chain}<span class="ip">기본 정책 ACCEPT</span></div>`);
    }
    expect(html).not.toContain("fw-rule");
  });

  test("속성 패널의 규칙은 콘솔에서 넣은 순서와 `iptables -S`의 글이다", async () => {
    const simulator = open();
    const port = simulator.console(ID);
    await port.exec("iptables -P FORWARD DROP");
    await port.exec("iptables -A FORWARD -i eth0 -o eth1 -p icmp --icmp-type echo-request -j ACCEPT");
    await port.exec("iptables -I FORWARD -s 10.0.9.0/24 -j REJECT");
    const html = inspector(simulator);
    expect(html).toContain("기본 정책 DROP");
    expect(html).toContain('<span class="code">1</span><span>-s 10.0.9.0/24 -j REJECT</span>');
    expect(html).toContain('<span class="code">2</span><span>-i eth0 -o eth1 -p icmp -m icmp --icmp-type 8 -j ACCEPT</span>');
  });
});

describe("Firewall의 문구", () => {
  const device = { deviceId: ID, deviceName: "FW1" };
  const blocked = (params: Record<string, unknown>) => ({ code: "FIREWALL_BLOCKED", params: { device, ...params } }) as unknown as Reason;

  test("막은 규칙의 번호를 알려 준다 (Story 14.3). 번호가 없으면 기본 정책이다", () => {
    const byRule = blocked({ chain: "FORWARD", target: "DROP", rule: 2 });
    expect(eventText(byRule)).toBe("FORWARD 체인의 2번 규칙(DROP)이 막아 버림");
    expect(causeOf(byRule)).toEqual({
      text: "FW1의 FORWARD 체인 2번 규칙(DROP)이 이 패킷을 막았어요",
      fix: "FW1에서 규칙을 확인하세요:",
      command: "iptables -L FORWARD -n --line-numbers",
    });
    const byPolicy = blocked({ chain: "INPUT", target: "DROP" });
    expect(eventText(byPolicy)).toBe("INPUT 체인의 기본 정책(DROP)이 막아 버림");
    expect(causeOf(byPolicy)?.text).toBe("FW1의 INPUT 체인에 맞는 규칙이 없어 기본 정책 DROP이 막았어요");
  });

  test("iptables의 오류는 한국어로 풀어 준다", () => {
    expect(formatError({ code: "IPTABLES_UNSUPPORTED", params: { token: "-m state" } })).toContain("-m state");
    expect(formatError({ code: "FIREWALL_RULE_INVALID", params: { reason: "in-interface" } })).toBe("OUTPUT 체인에는 들어오는 인터페이스(-i)를 쓸 수 없어요");
    expect(formatError({ code: "FIREWALL_RULE_NOT_FOUND", params: { deviceId: ID, chain: "INPUT", index: 3 } })).toContain("INPUT 체인에 3번 규칙이 없어요");
    expect(formatError({ code: "LIMIT_EXCEEDED", params: { limit: "firewallRules", max: 64 } })).toBe("필터 규칙은 체인 하나에 64개까지 넣을 수 있어요");
    expect(formatError({ code: "UNKNOWN_PORT", params: { deviceId: ID, kind: "firewall", port: "Ethernet9" } })).toBe("Firewall에 없는 포트예요: Ethernet9");
  });
});
