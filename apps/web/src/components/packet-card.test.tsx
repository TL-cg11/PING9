// T6.3.1: 펭귄을 누르면 뜨는 패킷 카드. 엔진이 만든 실제 추적의 이벤트로 그린다
import { createSimulator } from "@ping9/engine";
import type { Command, TopologyDocument, Trace, TraceEvent } from "@ping9/shared";
import {
  ROUTER_LAB, TWO_PC_SWITCH, TWO_SWITCH_VLAN, VPN_LAB, fourRouterRipDocument, greLabDocument, ipsecLabDocument, oneRouterLabDocument, switchedStaticRoutingLabDocument,
  twoPcSwitchDocument, twoSwitchVlanDocument,
} from "@ping9/shared/examples";
import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";

import { timelineOf } from "../replay/timeline";
import { replaySteps } from "../replay/steps";
import { Canvas } from "./canvas";
import { PacketCard } from "./packet-card";

async function traceOf(document: TopologyDocument, deviceId: string, command: string): Promise<Trace> {
  const simulator = createSimulator();
  simulator.load(document);
  await simulator.console(deviceId).exec(command);
  return simulator.getTrace(simulator.getSnapshot().traces[0]!.id)!;
}

const card = (document: TopologyDocument, event: TraceEvent) =>
  renderToString(<PacketCard event={event} document={document} linkId={event.linkId} onClose={() => {}} />)
    .replaceAll("<!-- -->", "");

/** 케이블로 나간(펭귄이 걷는) 이벤트 가운데 조건에 맞는 첫 이벤트 */
const sent = (trace: Trace, match: (event: TraceEvent) => boolean) =>
  trace.events.find((event) => event.linkId !== undefined && event.action !== "drop" && match(event))!;

test("ARP 요청: Ethernet 안에 ARP. 브로드캐스트는 '모두', 모르는 MAC은 '모름'. IP 상자는 없다", async () => {
  const trace = await traceOf(twoPcSwitchDocument, TWO_PC_SWITCH.pc1.id, "ping -n 1 192.168.1.2");
  const html = card(twoPcSwitchDocument, sent(trace, (event) => event.frame.arp?.operation === "request"));

  expect(html).toContain("ARP 요청");
  expect(html).toContain("프레임 #1 · 이벤트 #0");
  expect(html).toMatch(/ff:ff:ff:ff:ff:ff<small>모두<\/small>/);
  expect(html).toMatch(/00:00:00:00:00:00<small>모름<\/small>/);
  expect(html).toMatch(/192\.168\.1\.2<small>PC2<\/small>/);
  expect(html).toContain("없음 (access 포트)");
  expect(html).not.toContain("IPv4");
  // 바깥(L2) 상자 안에 ARP 상자
  expect(html.indexOf("pkt-l2")).toBeLessThan(html.indexOf("pkt-arp"));
});

test("Router를 지나면 MAC은 Router 포트로 바뀌고 TTL이 1 준다. Router 쪽 케이블의 VLAN 태그는 그냥 '없음'", async () => {
  const trace = await traceOf(oneRouterLabDocument, ROUTER_LAB.pc1, "ping -n 1 192.168.2.10");
  const isEcho = (event: TraceEvent) => event.frame.icmp?.type === "echo-request";
  const before = card(oneRouterLabDocument, sent(trace, (event) => isEcho(event) && event.linkId === ROUTER_LAB.leftLink));
  const after = card(oneRouterLabDocument, sent(trace, (event) => isEcho(event) && event.linkId === ROUTER_LAB.rightLink));

  for (const html of [before, after]) {
    expect(html).toContain("ping 요청");
    expect(html.indexOf("pkt-l2")).toBeLessThan(html.indexOf("pkt-l3"));
    expect(html.indexOf("pkt-l3")).toBeLessThan(html.indexOf("pkt-icmp"));
    expect(html).toMatch(/192\.168\.1\.10<small>PC1<\/small>/);
    expect(html).toMatch(/192\.168\.2\.10<small>PC2<\/small>/);
    expect(html).toMatch(/<dt>VLAN 태그<\/dt><dd><small class="pkt-none">없음<\/small>/);
  }
  expect(before).toMatch(/<small>PC1<\/small>.*<small>R1 Gi0\/0<\/small>/s);
  expect(before).toContain("<dt>TTL</dt><dd>128</dd>");
  expect(after).toMatch(/<small>R1 Gi0\/1<\/small>.*<small>PC2<\/small>/s);
  expect(after).toContain("<dt>TTL</dt><dd>127</dd>");
});

test("trunk를 지나는 VLAN 20 프레임은 VLAN 태그 값이 보인다", async () => {
  const trace = await traceOf(twoSwitchVlanDocument, TWO_SWITCH_VLAN.pc2.id, `ping -n 1 ${TWO_SWITCH_VLAN.pc4.ip}`);
  const html = card(twoSwitchVlanDocument, sent(trace, (event) => event.frame.ethernet.vlanTag !== undefined));

  expect(html).toContain("<dt>VLAN 태그</dt><dd>20</dd>");
});

test("RIP 응답: Ethernet 안에 IPv4, 그 안에 UDP 520, 그 안에 경로 표. 멀티캐스트 주소는 'RIP 라우터 모두'", () => {
  const simulator = createSimulator();
  simulator.load(fourRouterRipDocument);
  const summary = simulator.getSnapshot().traces.find((candidate) => candidate.kind === "rip")!;
  const trace = simulator.getTrace(summary.id)!;
  // 정기 갱신(멀티캐스트)의 응답. 요청에 답하는 응답은 요청한 라우터에게만 간다
  const response = sent(trace, (event) => event.frame.rip?.command === "response" && event.frame.ipv4?.destinationIp === "224.0.0.9");
  const html = card(fourRouterRipDocument, response);

  expect(html).toContain("RIP 응답");
  expect(html).toMatch(/01:00:5e:00:00:09<small>RIP 라우터 모두<\/small>/);
  expect(html).toMatch(/224\.0\.0\.9<small>RIP 라우터 모두<\/small>/);
  expect(html).toContain("<dt>출발 포트</dt><dd>520</dd>");
  expect(html.indexOf("pkt-l3")).toBeLessThan(html.indexOf("pkt-l4"));
  expect(html.indexOf("pkt-l4")).toBeLessThan(html.indexOf("pkt-rip"));
  expect(html.match(/<tr><td>/g)).toHaveLength(response.frame.rip!.entries.length);
});

test("ICMP 오류는 원래 패킷 상자를 안에 둔다", async () => {
  const trace = await traceOf(switchedStaticRoutingLabDocument, ROUTER_LAB.pc1, "tracert -h 1 192.168.2.10");
  const html = card(switchedStaticRoutingLabDocument, sent(trace, (event) => event.frame.icmp?.type === "time-exceeded"));

  expect(html).toContain("ICMP 오류");
  expect(html).toContain("pkt-icmp-error");
  expect(html).toContain("원래 패킷");
  expect(html.indexOf("pkt-icmp-error")).toBeLessThan(html.indexOf("pkt-original"));
});

test("카드 읽는 법은 ?를 가리키기 전에는 없다", async () => {
  const trace = await traceOf(twoPcSwitchDocument, TWO_PC_SWITCH.pc1.id, "ping -n 1 192.168.1.2");
  const html = card(twoPcSwitchDocument, trace.events[0]!);

  expect(html).toContain('aria-label="카드 읽는 법"');
  expect(html).not.toContain('role="tooltip"');
});

test("펭귄은 onPick이 있을 때만 누를 수 있다", async () => {
  const trace = await traceOf(twoPcSwitchDocument, TWO_PC_SWITCH.pc1.id, "ping -n 1 192.168.1.2");
  const timeline = timelineOf(replaySteps(trace));
  const draw = (pick: boolean) => renderToString(
    <Canvas document={twoPcSwitchDocument} selectedDeviceId={null} onSelect={() => {}} onOpenTerminal={() => {}}
      replays={[{ key: "r1", timeline, startedAt: performance.now() - 100, traceId: trace.id }]}
      {...(pick ? { onPickPenguin: () => {} } : {})} />,
  );

  expect(draw(true)).toMatch(/<g class="penguin pickable"[^>]*role="button"/);
  expect(draw(false)).toMatch(/<g class="penguin"[^>]*role="img"/);
});

test("펭귄을 누르는 자리는 장비 카드와 겹친 곳을 뺀다: 겹친 곳을 누르면 장비가 받는다 (T6.3.1 수정)", async () => {
  const trace = await traceOf(twoPcSwitchDocument, TWO_PC_SWITCH.pc1.id, "ping -n 1 192.168.1.2");
  const timeline = timelineOf(replaySteps(trace));
  const draw = (pick: boolean) => renderToString(
    <Canvas document={twoPcSwitchDocument} selectedDeviceId={null} onSelect={() => {}} onOpenTerminal={() => {}}
      replays={[{ key: "r1", timeline, startedAt: performance.now() - 100, traceId: trace.id }]}
      {...(pick ? { onPickPenguin: () => {} } : {})} />,
  );

  // 누르는 자리는 그림이 아니라 따로 둔 투명한 네모이고, 장비 카드를 뺀 영역으로 자른다
  const html = draw(true);
  expect(html).toMatch(/<rect class="penguin-hit"[^>]*clip-path="url\(#penguin-pick-area\)"/);
  const area = /<clipPath id="penguin-pick-area">(.*?)<\/clipPath>/.exec(html)![1]!;
  expect(area).toContain('clip-rule="evenodd"');
  for (const device of twoPcSwitchDocument.devices) {
    expect(area).toContain(`M${device.position.x - 40} ${device.position.y - 36}h80v72h-80Z`);
  }

  // 누를 수 없을 때(실시간)는 누르는 자리도 없다
  expect(draw(false)).not.toContain("penguin-hit");
  expect(draw(false)).not.toContain("penguin-pick-area");
});

test.each([
  { name: "GRE", document: greLabDocument, tag: "GRE", title: "GRE로 감싼 ping 요청" },
  { name: "ESP", document: ipsecLabDocument, tag: "ESP", title: "IPsec ESP" },
])("$name: 바깥 IPv4 안에 터널 상자, 그 안에 안쪽 IPv4와 ICMP", async ({ document, tag, title }) => {
  const trace = await traceOf(document, VPN_LAB.pcA, "ping -n 1 192.168.2.10");
  const html = card(document, sent(trace, (event) => (event.frame.gre ?? event.frame.esp) !== undefined));

  expect(html).toContain(title);
  expect(html).toContain(`<span class="pkt-tag">${tag}</span>`);
  expect(html).toContain("안쪽 IPv4");
  expect(html).toMatch(/192\.168\.2\.10/);
  // L2 > 바깥 L3 > 터널 > 안쪽 L3 > ICMP
  const order = ["pkt-l2", "pkt-l3", "pkt-tunnel", "안쪽 IPv4", "pkt-icmp"].map((part) => html.indexOf(part));
  expect(order).toEqual([...order].sort((a, b) => a - b));
  expect(html.match(/pkt-box pkt-icmp/g)).toHaveLength(1);
});

test("TCP 서비스: IPv4 안에 TCP(포트·플래그), 응답에는 그 안에 L7 서비스 내용", async () => {
  const simulator = createSimulator();
  const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "44444444-4444-4444-8444-444444444444"] as const;
  const [pc, server, sw] = ids;
  const commands: unknown[] = [
    { type: "device/add", id: pc, kind: "pc", position: { x: 0, y: 0 }, os: "linux" },
    { type: "device/add", id: server, kind: "pc", position: { x: 400, y: 0 }, os: "server" },
    { type: "device/add", id: sw, kind: "switch", position: { x: 200, y: 0 } },
    { type: "link/add", id: "55555555-5555-4555-8555-555555555555", ends: [{ deviceId: pc, port: "Ethernet0" }, { deviceId: sw, port: "FastEthernet0/1" }] },
    { type: "link/add", id: "66666666-6666-4666-8666-666666666666", ends: [{ deviceId: server, port: "Ethernet0" }, { deviceId: sw, port: "FastEthernet0/2" }] },
    { type: "pc/set-ip", deviceId: pc, ip: "10.0.1.10", mask: "255.255.255.0", gateway: null },
    { type: "pc/set-ip", deviceId: server, ip: "10.0.1.20", mask: "255.255.255.0", gateway: null },
  ];
  for (const command of commands) expect(simulator.dispatch(command as Command)).toMatchObject({ ok: true });
  await simulator.console(pc).exec("curl http://10.0.1.20/");
  const trace = simulator.getTrace(simulator.getSnapshot().traces[0]!.id)!;
  const document = simulator.getSnapshot().document;

  const syn = card(document, sent(trace, (event) => event.frame.tcp?.flags === "SYN"));
  expect(syn).toContain("<dt>도착 포트</dt><dd>80</dd>");
  expect(syn).toContain("<dt>플래그</dt><dd>SYN</dd>");
  expect(syn).not.toContain("pkt-app");

  const answer = card(document, sent(trace, (event) => event.frame.application !== undefined && event.deviceId === server));
  expect(answer).toContain("TCP 응답");
  expect(answer).toContain('<span class="pkt-tag">L7</span>HTTP');
  expect(answer.indexOf("pkt-l4")).toBeLessThan(answer.indexOf("pkt-app"));
});
