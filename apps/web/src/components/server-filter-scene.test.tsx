// T0.21: 펭귄이 필터 규칙(iptables)을 건 서버에 닿는 장면. T14.2.3의 Firewall 장면을 서버로 옮겼다.
// 허용은 초록 방패, DROP은 눈가루와 빨려 드는 물고기, REJECT는 돌아서는 펭귄
import { createSimulator } from "@ping9/engine";
import type { Command, TopologyDocument, Trace } from "@ping9/shared";
import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";

import { replaySteps } from "../replay/steps";
import type { Hop } from "../replay/steps";
import { FALL_MS, timelineOf } from "../replay/timeline";
import type { Timeline } from "../replay/timeline";
import { Canvas } from "./canvas";

const PC1 = "11111111-1111-4111-8111-111111111111";
const SRV = "22222222-2222-4222-8222-222222222222";

/** PC1 — SRV1 (같은 네트워크). `rules`를 SRV1의 콘솔에 넣고 PC1에서 SRV1로 ping을 한 번 보낸다 */
async function lab(...rules: string[]): Promise<{ document: TopologyDocument; timeline: Timeline }> {
  const simulator = createSimulator();
  const commands: unknown[] = [
    { type: "device/add", id: PC1, kind: "pc", position: { x: 100, y: 200 }, os: "windows" },
    { type: "device/add", id: SRV, kind: "pc", position: { x: 500, y: 200 }, os: "server" },
    { type: "device/rename", deviceId: SRV, name: "SRV1" },
    { type: "link/add", id: "55555555-5555-4555-8555-555555555555", ends: [{ deviceId: PC1, port: "Ethernet0" }, { deviceId: SRV, port: "Ethernet0" }] },
    { type: "pc/set-ip", deviceId: PC1, ip: "10.0.1.10", mask: "255.255.255.0" },
    { type: "pc/set-ip", deviceId: SRV, ip: "10.0.1.20", mask: "255.255.255.0" },
  ];
  for (const command of commands) expect(simulator.dispatch(command as Command)).toMatchObject({ ok: true });
  for (const rule of rules) {
    const result = await simulator.console(SRV).exec(rule);
    expect(result.lines.filter((line) => line.kind === "error")).toEqual([]);
  }
  await simulator.console(PC1).exec("ping -n 1 10.0.1.20");
  const trace = simulator.getTrace(simulator.getSnapshot().traces[0]!.id)!;
  return { document: simulator.getSnapshot().document, timeline: timelineOf(replaySteps(trace)) };
}

/** 재생을 시작한 지 `elapsed` ms 뒤의 캔버스 */
const canvasAt = (document: TopologyDocument, timeline: Timeline, elapsed: number, pick = false) =>
  renderToString(
    <Canvas document={document} selectedDeviceId={null} onSelect={() => {}} onOpenTerminal={() => {}}
      replays={[{ key: "fw", timeline, startedAt: performance.now() - elapsed }]}
      {...(pick ? { onPickPenguin: () => {} } : {})} />,
  ).replaceAll("<!-- -->", "");

const walkWhere = (timeline: Timeline, match: (hop: Hop) => boolean) => timeline.walks.find((walk) => match(walk.hop))!;

test("규칙이 없는 서버에는 방패가 없다: 배지도, 허용 장면도 그리지 않는다", async () => {
  const { document, timeline } = await lab();
  const toward = walkWhere(timeline, (hop) => hop.kind === "icmp-request");
  expect(toward.hop.acceptedBy).toEqual([SRV]);
  const html = canvasAt(document, timeline, toward.start + toward.duration * 0.8);
  expect(html).not.toContain("filter-badge");
  expect(html).not.toContain("fw-shield");
});

test("허용: 규칙을 건 서버는 평소 방패 배지를 달고, 받아들이는 패킷이 다가오면 초록 체크와 '허용'", async () => {
  // 맞지 않는 규칙 하나: 필터는 켜졌지만 ping은 지나간다
  const { document, timeline } = await lab("iptables -A INPUT -p tcp --dport 80 -j DROP");
  expect(canvasAt(document, timeline, 0)).toContain("shield-idle");

  const toward = walkWhere(timeline, (hop) => hop.kind === "icmp-request");
  const approaching = canvasAt(document, timeline, toward.start + toward.duration * 0.8);
  expect(approaching).toContain("fw-shield allow");
  expect(approaching).toContain("shield-allow");
  expect(approaching).toContain(">허용</text>");
  expect(approaching).not.toContain("차단");

  // 걷는 가운데(출발도 도착도 아닌 때)에는 방패 장면이 없다
  expect(canvasAt(document, timeline, toward.start + toward.duration * 0.45)).not.toContain("fw-shield");

  // 응답을 내보낼 때(OUTPUT)도 허용이다
  const reply = walkWhere(timeline, (hop) => hop.kind === "icmp-reply" && hop.fromDeviceId === SRV);
  expect(canvasAt(document, timeline, reply.start + reply.duration * 0.1)).toContain("fw-shield allow");
});

test("ARP는 iptables가 거르지 않는다: 모든 것을 막아도 ARP에는 방패가 반응하지 않는다", async () => {
  const { document, timeline } = await lab("iptables -P INPUT DROP");
  const arp = walkWhere(timeline, (hop) => hop.kind === "arp-request");
  expect(canvasAt(document, timeline, arp.start + arp.duration * 0.8)).not.toContain("fw-shield");
  const reply = walkWhere(timeline, (hop) => hop.kind === "arp-reply");
  expect(canvasAt(document, timeline, reply.start + reply.duration * 0.1)).not.toContain("fw-shield");
});

test("DROP: 방패가 빨간 X와 '규칙 1 차단', 펭귄은 눈가루로 흩어지고 물고기는 따로 방패로 날아간다", async () => {
  const { document, timeline } = await lab("iptables -A INPUT -p icmp -j DROP");
  const drop = timeline.drops.find((candidate) => candidate.fall.blocked !== undefined)!;
  expect(drop.fall).toMatchObject({ deviceId: SRV, blocked: { target: "DROP", rule: 1 } });
  expect(timeline.walks.some((walk) => walk.hop.rejected !== undefined)).toBe(false);
  // 막힌 요청은 받아들인 것이 아니다: 다가갈 때 허용을 보이지 않는다
  const toward = walkWhere(timeline, (hop) => hop.kind === "icmp-request");
  expect(toward.hop.acceptedBy).toBeUndefined();
  expect(canvasAt(document, timeline, toward.start + toward.duration * 0.8)).not.toContain("fw-shield");

  const html = canvasAt(document, timeline, drop.start + FALL_MS * 0.3);
  expect(html).toContain("fw-shield deny");
  expect(html).toContain("shield-deny");
  expect(html).toContain(">규칙 1 차단</text>");
  expect(html).toContain('class="snow-dust"');
  // 펭귄과 물고기를 놓침 그림에서 따로 잘라 그린다
  expect(html.match(/<clipPath id="vanish-[^"]*-p">/g)).toHaveLength(1);
  expect(html.match(/<clipPath id="vanish-[^"]*-f">/g)).toHaveLength(1);
});

test("REJECT: 방패가 빨개지고, 돌아오는 펭귄은 좌우가 뒤집혀 왔던 길로 걷는다", async () => {
  const { document, timeline } = await lab("iptables -A INPUT -p icmp -j REJECT");
  const back = walkWhere(timeline, (hop) => hop.rejected !== undefined);
  expect(back.hop).toMatchObject({ fromDeviceId: SRV, kind: "icmp-error", rejected: { target: "REJECT", rule: 1 } });

  const html = canvasAt(document, timeline, back.start + back.duration * 0.1);
  expect(html).toContain("fw-shield deny");
  expect(html).toContain(">규칙 1 차단</text>");
  expect(html).toContain("scale(-1 1)");
  expect(html).not.toContain("snow-dust");
});

test("규칙 없이 기본 정책으로 막으면 '기본 정책 차단'", async () => {
  const { document, timeline } = await lab("iptables -P INPUT DROP");
  const drop = timeline.drops.find((candidate) => candidate.fall.blocked !== undefined)!;
  expect(drop.fall.blocked).toEqual({ target: "DROP" });
  expect(canvasAt(document, timeline, drop.start + FALL_MS * 0.3)).toContain(">기본 정책 차단</text>");
});

test("OUTPUT이 응답을 막으면 서버 쪽 케이블 끝에서 흩어진다", async () => {
  const { document, timeline } = await lab("iptables -A OUTPUT -p icmp --icmp-type echo-reply -j DROP");
  const drop = timeline.drops.find((candidate) => candidate.fall.blocked !== undefined)!;
  expect(drop.fall).toMatchObject({ deviceId: SRV, kind: "icmp-reply", blocked: { target: "DROP", rule: 1 } });
  const html = canvasAt(document, timeline, drop.start + FALL_MS * 0.3);
  expect(html).toContain("fw-shield deny");
  expect(html).toContain("ping 응답을 iptables 규칙이 막음 (DROP)");
});

test("막힌 뒤에 규칙을 지워도, 그 추적의 재생은 막힌 장면 그대로다", async () => {
  const { document, timeline } = await lab("iptables -A INPUT -p icmp -j DROP");
  const cleared: TopologyDocument = {
    ...document,
    devices: document.devices.map((device) => {
      if (device.kind !== "pc") return device;
      const config: { filter?: unknown } & typeof device.config = { ...device.config };
      delete config.filter;
      return { ...device, config };
    }),
  };
  const drop = timeline.drops.find((candidate) => candidate.fall.blocked !== undefined)!;
  const html = canvasAt(cleared, timeline, drop.start + FALL_MS * 0.3);
  expect(html).not.toContain("shield-idle");
  expect(html).toContain("fw-shield deny");
});

test("DROP으로 다 흩어져 보이지 않는 펭귄은 누를 수 없다 (T6.3.1 수정)", async () => {
  const { document, timeline } = await lab("iptables -A INPUT -p icmp -j DROP");
  const drop = timeline.drops.find((candidate) => candidate.fall.blocked !== undefined)!;

  // 흩어지는 동안에는 누를 수 있다
  const during = canvasAt(document, timeline, drop.start + FALL_MS * 0.3, true);
  expect(during).toMatch(/<g class="penguin pickable"[^>]*role="button"[^>]*aria-label="[^"]*iptables 규칙이 막음 \(DROP\)"/);

  // 다 흩어진 뒤에도 원인 폐기라 남아 있지만(방패는 계속 빨갛다) 보이지 않으므로 누르는 자리와 Tab 자리가 없다
  const after = canvasAt(document, timeline, drop.start + FALL_MS + 300, true);
  expect(after).toContain("fw-shield deny");
  const sprite = /<g class="penguin[^"]*"[^>]*aria-label="[^"]*iptables 규칙이 막음 \(DROP\)"[^>]*>/.exec(after)![0];
  expect(sprite).toContain('role="img"');
  expect(sprite).not.toContain("pickable");
  expect(sprite).not.toContain("tabindex");
  expect(after).not.toContain("penguin-hit");
});

// 검토에서 나온 두 장면. 가운데에 Switch나 Router가 있는 토폴로지다
const MID = "33333333-3333-4333-8333-333333333333";

function wired(middle: "switch" | "router") {
  const simulator = createSimulator();
  const ports = middle === "switch" ? ["FastEthernet0/1", "FastEthernet0/2"] : ["GigabitEthernet0/0", "GigabitEthernet0/1"];
  const serverIp = middle === "switch" ? "10.0.1.20" : "10.0.2.20";
  const commands: unknown[] = [
    { type: "device/add", id: PC1, kind: "pc", position: { x: 100, y: 200 }, os: "linux" },
    { type: "device/add", id: MID, kind: middle, position: { x: 300, y: 200 } },
    { type: "device/add", id: SRV, kind: "pc", position: { x: 500, y: 200 }, os: "server" },
    { type: "link/add", id: "55555555-5555-4555-8555-555555555555", ends: [{ deviceId: PC1, port: "Ethernet0" }, { deviceId: MID, port: ports[0] }] },
    { type: "link/add", id: "66666666-6666-4666-8666-666666666666", ends: [{ deviceId: SRV, port: "Ethernet0" }, { deviceId: MID, port: ports[1] }] },
    { type: "pc/set-ip", deviceId: PC1, ip: "10.0.1.10", mask: "255.255.255.0", ...(middle === "router" ? { gateway: "10.0.1.1" } : {}) },
    { type: "pc/set-ip", deviceId: SRV, ip: serverIp, mask: "255.255.255.0", ...(middle === "router" ? { gateway: "10.0.2.1" } : {}) },
    ...(middle === "switch" ? [] : ([[ports[0], "10.0.1.1"], [ports[1], "10.0.2.1"]] as const).flatMap(([port, ip]) => [
      { type: "interface/set-ip", deviceId: MID, port, ip, mask: "255.255.255.0" },
      { type: "interface/set-admin", deviceId: MID, port, adminUp: true },
    ])),
  ];
  for (const command of commands) expect(simulator.dispatch(command as Command)).toMatchObject({ ok: true });
  const lastTrace = (): Trace => simulator.getTrace(simulator.getSnapshot().traces[0]!.id)!;
  return { simulator, serverIp, lastTrace };
}

test("REJECT의 오류를 보내려고 ARP부터 해도, 돌아서는 것은 ICMP 오류 펭귄이다. ARP 펭귄은 아니다", async () => {
  const { simulator, serverIp, lastTrace } = wired("switch");
  await simulator.console(SRV).exec("iptables -A INPUT -p icmp -j REJECT");
  await simulator.console(PC1).exec(`ping -c 1 ${serverIp}`);
  // 서버의 포트를 껐다 켜면 서버의 ARP 표만 비워진다. PC1은 서버의 MAC을 안다
  for (const adminUp of [false, true]) {
    expect(simulator.dispatch({ type: "interface/set-admin", deviceId: SRV, port: "Ethernet0", adminUp }).ok).toBe(true);
  }
  await simulator.console(PC1).exec(`ping -c 1 ${serverIp}`);
  const trace = lastTrace();
  // 막은 이벤트와 오류 사이에 서버의 ARP 요청이 끼었다
  expect(trace.events.some((event) => event.deviceId === SRV && event.reason.code === "ARP_REQUEST_SENT")).toBe(true);

  const timeline = timelineOf(replaySteps(trace));
  const mirrored = timeline.walks.filter((walk) => walk.hop.rejected !== undefined);
  // 서버가 내보낸 구간만이다 (Switch가 넘긴 구간은 전과 같이 그대로 걷는다)
  expect(mirrored.map((walk) => walk.hop.kind)).toEqual(["icmp-error"]);
  expect(mirrored[0]!.hop).toMatchObject({ fromDeviceId: SRV, rejected: { target: "REJECT", rule: 1 } });

  const document = simulator.getSnapshot().document;
  // 오류 펭귄이 서버를 떠날 때: 방패는 빨갛다. 방금 거절한 서버가 "허용"을 보이지 않는다
  const leaving = canvasAt(document, timeline, mirrored[0]!.start + mirrored[0]!.duration * 0.1);
  expect(leaving).toContain("fw-shield deny");
  expect(leaving).not.toContain("fw-shield allow");
  // 서버의 ARP 요청 펭귄은 뒤집히지 않고, 방패도 반응하지 않는다
  const arp = walkWhere(timeline, (hop) => hop.kind === "arp-request" && hop.fromDeviceId === SRV);
  const asking = canvasAt(document, timeline, arp.start + arp.duration * 0.1);
  expect(asking).not.toContain("scale(-1 1)");
  expect(asking).not.toContain("fw-shield");
});

test("다른 곳에서 먼저 실패한 뒤 서버의 필터가 버린 것(원인 폐기가 아님)에도 방패가 빨개진다", async () => {
  const { simulator, lastTrace } = wired("router");
  await simulator.console(SRV).exec("iptables -P INPUT DROP");
  // 없는 네트워크로 ping: 원인은 Router의 경로 없음이고, 돌아온 ICMP 오류를 서버의 INPUT이 버린다
  await simulator.console(SRV).exec("ping -c 1 172.16.9.9");
  const trace = lastTrace();
  const cause = trace.events[trace.result.primaryDropSeq!]!;
  expect(cause).toMatchObject({ deviceId: MID, reason: { code: "NO_ROUTE" } });

  const timeline = timelineOf(replaySteps(trace));
  const drop = timeline.drops.find((candidate) => candidate.fall.blocked !== undefined)!;
  expect(drop.fall).toMatchObject({ deviceId: SRV, kind: "icmp-error", primary: false, blocked: { target: "DROP" } });
  const html = canvasAt(simulator.getSnapshot().document, timeline, drop.start + 60);
  expect(html).toContain("fw-shield deny");
  expect(html).toContain(">기본 정책 차단</text>");
  expect(html).toContain("ICMP 오류 알림을 iptables 규칙이 막음 (DROP)");
  // 원인 폐기가 아니므로 흩어지는 장면은 아니다
  expect(html).not.toContain("snow-dust");
});

test("Switch가 뿌린 프레임: 받은 서버에만 허용이 뜬다", async () => {
  const { simulator, serverIp, lastTrace } = wired("switch");
  await simulator.console(SRV).exec("iptables -A INPUT -p tcp --dport 22 -j DROP");
  await simulator.console(PC1).exec(`ping -c 1 ${serverIp}`);
  const timeline = timelineOf(replaySteps(lastTrace()));
  const document = simulator.getSnapshot().document;
  // PC1 → Switch 구간: 도착 장비가 Switch라 방패 장면이 없다
  const first = walkWhere(timeline, (hop) => hop.kind === "icmp-request" && hop.fromDeviceId === PC1);
  expect(canvasAt(document, timeline, first.start + first.duration * 0.8)).not.toContain("fw-shield");
  // Switch → 서버 구간: 다가가면 허용
  const second = walkWhere(timeline, (hop) => hop.kind === "icmp-request" && hop.fromDeviceId === MID);
  expect(second.hop.acceptedBy).toContain(SRV);
  expect(canvasAt(document, timeline, second.start + second.duration * 0.8)).toContain("fw-shield allow");
});
