// T14.2.3: 펭귄이 Firewall을 지나는 장면. 허용은 초록 방패, DROP은 눈가루와 빨려 드는 물고기, REJECT는 돌아서는 펭귄
import { createSimulator } from "@ping9/engine";
import type { Command, TopologyDocument } from "@ping9/shared";
import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";

import { replaySteps } from "../replay/steps";
import type { Hop } from "../replay/steps";
import { FALL_MS, timelineOf } from "../replay/timeline";
import type { Timeline } from "../replay/timeline";
import { Canvas } from "./canvas";

const PC1 = "11111111-1111-4111-8111-111111111111";
const PC2 = "22222222-2222-4222-8222-222222222222";
const FW = "33333333-3333-4333-8333-333333333333";

/** PC1 — eth0 [FW1] eth1 — PC2. `rule`이 있으면 FORWARD 체인에 넣고 PC1에서 PC2로 ping을 한 번 보낸다 */
async function lab(rule?: string): Promise<{ document: TopologyDocument; timeline: Timeline }> {
  const simulator = createSimulator();
  const commands: unknown[] = [
    { type: "device/add", id: PC1, kind: "pc", position: { x: 100, y: 200 }, os: "windows" },
    { type: "device/add", id: FW, kind: "firewall", position: { x: 400, y: 200 } },
    { type: "device/add", id: PC2, kind: "pc", position: { x: 700, y: 200 }, os: "windows" },
    { type: "device/rename", deviceId: FW, name: "FW1" },
    { type: "link/add", id: "55555555-5555-4555-8555-555555555555", ends: [{ deviceId: PC1, port: "Ethernet0" }, { deviceId: FW, port: "Ethernet0" }] },
    { type: "link/add", id: "66666666-6666-4666-8666-666666666666", ends: [{ deviceId: PC2, port: "Ethernet0" }, { deviceId: FW, port: "Ethernet1" }] },
    { type: "pc/set-ip", deviceId: PC1, ip: "10.0.1.10", mask: "255.255.255.0", gateway: "10.0.1.1" },
    { type: "pc/set-ip", deviceId: PC2, ip: "10.0.2.10", mask: "255.255.255.0", gateway: "10.0.2.1" },
    ...([["Ethernet0", "10.0.1.1"], ["Ethernet1", "10.0.2.1"]] as const).flatMap(([port, ip]) => [
      { type: "interface/set-ip", deviceId: FW, port, ip, mask: "255.255.255.0" },
      { type: "interface/set-admin", deviceId: FW, port, adminUp: true },
    ]),
  ];
  for (const command of commands) expect(simulator.dispatch(command as Command)).toMatchObject({ ok: true });
  if (rule !== undefined) {
    const result = await simulator.console(FW).exec(rule);
    expect(result.lines.filter((line) => line.kind === "error")).toEqual([]);
  }
  await simulator.console(PC1).exec("ping -n 1 10.0.2.10");
  const trace = simulator.getTrace(simulator.getSnapshot().traces[0]!.id)!;
  return { document: simulator.getSnapshot().document, timeline: timelineOf(replaySteps(trace)) };
}

/** 재생을 시작한 지 `elapsed` ms 뒤의 캔버스 */
const canvasAt = (document: TopologyDocument, timeline: Timeline, elapsed: number) =>
  renderToString(
    <Canvas document={document} selectedDeviceId={null} onSelect={() => {}} onOpenTerminal={() => {}}
      replays={[{ key: "fw", timeline, startedAt: performance.now() - elapsed }]} />,
  ).replaceAll("<!-- -->", "");

const walkWhere = (timeline: Timeline, match: (hop: Hop) => boolean) => timeline.walks.find((walk) => match(walk.hop))!;

test("허용: Firewall에 다가가면 방패가 초록 체크와 '허용'. 지나간 뒤에는 방패 장면이 없다", async () => {
  const { document, timeline } = await lab();
  const toward = walkWhere(timeline, (hop) => hop.passesAt === FW && hop.kind === "icmp-request");
  const approaching = canvasAt(document, timeline, toward.start + toward.duration * 0.8);
  expect(approaching).toContain("fw-shield allow");
  expect(approaching).toContain("shield-allow");
  expect(approaching).toContain(">허용</text>");
  expect(approaching).not.toContain("차단");

  const leaving = walkWhere(timeline, (hop) => hop.forwarded === true && hop.fromDeviceId === FW && hop.kind === "icmp-request");
  const after = canvasAt(document, timeline, leaving.start + leaving.duration * 0.8);
  expect(after).not.toContain("fw-shield");
});

test("DROP: 방패가 빨간 X와 '규칙 1 차단', 펭귄은 눈가루로 흩어지고 물고기는 따로 방패로 날아간다", async () => {
  const { document, timeline } = await lab("iptables -A FORWARD -p icmp -j DROP");
  const drop = timeline.drops.find((candidate) => candidate.fall.blocked !== undefined)!;
  expect(drop.fall.blocked).toEqual({ target: "DROP", rule: 1 });
  expect(timeline.walks.some((walk) => walk.hop.rejected !== undefined)).toBe(false);

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
  const { document, timeline } = await lab("iptables -A FORWARD -p icmp -j REJECT");
  const back = walkWhere(timeline, (hop) => hop.rejected !== undefined);
  expect(back.hop).toMatchObject({ fromDeviceId: FW, kind: "icmp-error", rejected: { target: "REJECT", rule: 1 } });

  const html = canvasAt(document, timeline, back.start + back.duration * 0.1);
  expect(html).toContain("fw-shield deny");
  expect(html).toContain(">규칙 1 차단</text>");
  expect(html).toContain("scale(-1 1)");
  expect(html).not.toContain("snow-dust");
});

test("규칙 없이 기본 정책으로 막으면 '기본 정책 차단'", async () => {
  const { document, timeline } = await lab("iptables -P FORWARD DROP");
  const drop = timeline.drops.find((candidate) => candidate.fall.blocked !== undefined)!;
  expect(drop.fall.blocked).toEqual({ target: "DROP" });
  expect(canvasAt(document, timeline, drop.start + FALL_MS * 0.3)).toContain(">기본 정책 차단</text>");
});
