// 서버의 필터 규칙(iptables) 화면 표시 (T0.21): 장비 목록, 캔버스의 방패 배지, 속성 패널의 필터 규칙, 문구.
// T14.2.1의 Firewall 장비는 없앴다. 규칙은 종류가 Server인 PC에 건다.
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

function open(os: "server" | "linux" | "windows" = "server") {
  const simulator = createSimulator();
  expect(simulator.dispatch({ type: "device/add", id: ID, kind: "pc", position: { x: 320, y: 200 }, os }).ok).toBe(true);
  return simulator;
}

// 서버 렌더링은 글자 사이에 주석 표시를 넣으므로 빼고 비교한다
const inspector = (simulator: ReturnType<typeof open>) =>
  renderToString(<Inspector snapshot={simulator.getSnapshot()} deviceId={ID} onOpenTerminal={noop}
    onDispatch={() => ({ ok: true, notices: [] })} />).replaceAll("<!-- -->", "");
const canvas = (simulator: ReturnType<typeof open>) =>
  renderToString(<Canvas document={simulator.getSnapshot().document} selectedDeviceId={null} onSelect={noop} onOpenTerminal={noop} />);

describe("장비 목록과 캔버스", () => {
  test("장비 목록에 Firewall이 없다. PC, Switch, Router뿐이다", () => {
    const html = renderToString(<Palette deviceCount={0} onConnect={noop} />);
    expect(html).not.toContain("Firewall");
    expect(html).not.toContain("icon-firewall");
    expect(html.match(/class="tool device-tool"/g)).toHaveLength(3);
  });

  test("서버에 규칙을 걸면 아이콘에 방패 배지가 붙고, 다 지우면 사라진다", async () => {
    const simulator = open();
    const port = simulator.console(ID);
    expect(canvas(simulator)).not.toContain("filter-badge");
    await port.exec("iptables -A INPUT -p icmp -j DROP");
    expect(canvas(simulator)).toContain('class="filter-badge"');
    expect(canvas(simulator)).toContain("shield-idle");
    await port.exec("iptables -F");
    expect(canvas(simulator)).not.toContain("filter-badge");
    // 규칙 없이 기본 정책만 바꿔도 필터는 걸려 있다
    await port.exec("iptables -P OUTPUT DROP");
    expect(canvas(simulator)).toContain('class="filter-badge"');
    // FORWARD는 서버에서 패킷을 보지 않는다: 그것만으로는 배지가 없다
    await port.exec("iptables -P OUTPUT ACCEPT");
    await port.exec("iptables -A FORWARD -j DROP");
    expect(canvas(simulator)).not.toContain("filter-badge");
  });

  test("종류를 Server에서 바꾸면 규칙이 적용되지 않아 배지도 없다", async () => {
    const simulator = open();
    await simulator.console(ID).exec("iptables -A INPUT -p icmp -j DROP");
    expect(simulator.dispatch({ type: "pc/set-os", deviceId: ID, os: "linux" }).ok).toBe(true);
    expect(canvas(simulator)).not.toContain("filter-badge");
  });
});

describe("속성 패널의 필터 규칙", () => {
  test("서버: 체인 셋의 기본 정책을 보인다. 규칙이 없으면 규칙 줄이 없다", () => {
    const html = inspector(open());
    expect(html).toContain('<span class="chip">PC</span>');
    expect(html).toContain("<h4>필터 규칙 (iptables)</h4>");
    for (const chain of ["INPUT", "FORWARD", "OUTPUT"]) {
      expect(html).toContain(`<div class="if-row">${chain}<span class="ip">기본 정책 ACCEPT</span></div>`);
    }
    expect(html).not.toContain("fw-rule");
    expect(html).not.toContain("라우팅 테이블");
  });

  test.each(["linux", "windows"] as const)("%s PC에는 필터 규칙 구역이 없다", (os) => {
    expect(inspector(open(os))).not.toContain("필터 규칙");
  });

  test("규칙은 콘솔에서 넣은 순서와 `iptables -S`의 글이다", async () => {
    const simulator = open();
    const port = simulator.console(ID);
    await port.exec("iptables -P INPUT DROP");
    await port.exec("iptables -A INPUT -i eth0 -p tcp --dport 80 -j ACCEPT");
    await port.exec("iptables -I INPUT -s 10.0.9.0/24 -j REJECT");
    await port.exec("sudo iptables -A OUTPUT -p icmp --icmp-type echo-reply -j DROP");
    const html = inspector(simulator);
    expect(html).toContain('<div class="if-row">INPUT<span class="ip">기본 정책 DROP</span></div>');
    expect(html).toContain('<span class="code">1</span><span>-s 10.0.9.0/24 -j REJECT</span>');
    expect(html).toContain('<span class="code">2</span><span>-i eth0 -p tcp -m tcp --dport 80 -j ACCEPT</span>');
    expect(html).toContain('<span class="code">1</span><span>-p icmp -m icmp --icmp-type 0 -j DROP</span>');
  });

  test("종류를 바꾸면 규칙 구역이 사라지고, 다시 Server로 고르면 규칙이 그대로 보인다", async () => {
    const simulator = open();
    await simulator.console(ID).exec("iptables -A INPUT -p icmp -j DROP");
    expect(simulator.dispatch({ type: "pc/set-os", deviceId: ID, os: "windows" }).ok).toBe(true);
    expect(inspector(simulator)).not.toContain("필터 규칙");
    expect(simulator.dispatch({ type: "pc/set-os", deviceId: ID, os: "server" }).ok).toBe(true);
    expect(inspector(simulator)).toContain('<span class="code">1</span><span>-p icmp -j DROP</span>');
  });
});

describe("필터 규칙의 문구", () => {
  const device = { deviceId: ID, deviceName: "SRV1" };
  const blocked = (params: Record<string, unknown>) => ({ code: "FIREWALL_BLOCKED", params: { device, ...params } }) as unknown as Reason;

  test("막은 규칙의 번호를 알려 준다 (Story 14.3). 번호가 없으면 기본 정책이다", () => {
    const byRule = blocked({ chain: "INPUT", target: "DROP", rule: 2 });
    expect(eventText(byRule)).toBe("INPUT 체인의 2번 규칙(DROP)이 막아 버림");
    expect(causeOf(byRule)).toEqual({
      text: "SRV1의 INPUT 체인 2번 규칙(DROP)이 이 패킷을 막았어요",
      fix: "SRV1에서 규칙을 확인하세요:",
      command: "iptables -L INPUT -n --line-numbers",
    });
    const byPolicy = blocked({ chain: "OUTPUT", target: "DROP" });
    expect(eventText(byPolicy)).toBe("OUTPUT 체인의 기본 정책(DROP)이 막아 버림");
    expect(causeOf(byPolicy)?.text).toBe("SRV1의 OUTPUT 체인에 맞는 규칙이 없어 기본 정책 DROP이 막았어요");
  });

  test("iptables의 오류는 한국어로 풀어 준다", () => {
    expect(formatError({ code: "IPTABLES_UNSUPPORTED", params: { token: "-m state" } })).toContain("-m state");
    expect(formatError({ code: "FIREWALL_RULE_INVALID", params: { reason: "in-interface" } })).toBe("OUTPUT 체인에는 들어오는 인터페이스(-i)를 쓸 수 없어요");
    expect(formatError({ code: "FIREWALL_RULE_NOT_FOUND", params: { deviceId: ID, chain: "INPUT", index: 3 } })).toContain("INPUT 체인에 3번 규칙이 없어요");
    expect(formatError({ code: "LIMIT_EXCEEDED", params: { limit: "firewallRules", max: 64 } })).toBe("필터 규칙은 체인 하나에 64개까지 넣을 수 있어요");
    expect(formatError({ code: "UNKNOWN_PORT", params: { deviceId: ID, kind: "pc", port: "Ethernet1" } })).toBe("PC에 없는 포트예요: Ethernet1");
  });
});
