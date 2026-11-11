// T6.1.2: 캔버스의 펭귄 층
import { createSimulator } from "@ping9/engine";
import { ROUTER_LAB, TWO_PC_SWITCH, fourRouterRipDocument, switchedStaticRoutingLabDocument, twoPcSwitchDocument } from "@ping9/shared/examples";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { replaySteps } from "../replay/steps";
import { WALK_MS, exchangeTimeline, previewTimeline, timelineOf } from "../replay/timeline";
import { Canvas } from "./canvas";

async function firstTimeline() {
  const simulator = createSimulator();
  simulator.load(twoPcSwitchDocument);
  await simulator.console(TWO_PC_SWITCH.pc1.id).exec("ping -n 1 192.168.1.2");
  const id = simulator.getSnapshot().traces[0]!.id;
  return timelineOf(replaySteps(simulator.getTrace(id)!));
}

test("재생이 없으면 펭귄 층을 그리지 않는다", () => {
  const html = renderToString(<Canvas document={twoPcSwitchDocument} selectedDeviceId={null} onSelect={() => {}} onOpenTerminal={() => {}} />);
  expect(html).not.toContain("packet-layer");
});

test("ARP 요청 펭귄: 초록 물고기와 머리 위 ?, 케이블 위의 점에 선다. 장비보다 먼저(아래에) 그린다", async () => {
  const timeline = await firstTimeline();
  // 시작 시각이 지금보다 WALK_MS/2 전이면 첫 링크의 가운데쯤
  const startedAt = performance.now() - WALK_MS / 2;
  const html = renderToString(
    <Canvas document={twoPcSwitchDocument} selectedDeviceId={null} onSelect={() => {}} onOpenTerminal={() => {}}
      replays={[{ key: "r1", timeline, startedAt }]} />,
  );
  expect(html).toContain('class="packet-layer"');
  expect(html).toMatch(/walk-[ab]-green[^"]*\.png/);
  expect(html).toContain(">?</text>");
  expect(html).toContain('aria-label="ARP 요청"');
  expect(html.indexOf("packet-layer")).toBeLessThan(html.indexOf('class="node'));
  expect(html.indexOf("packet-layer")).toBeGreaterThan(html.indexOf('class="cable"'));
});

// T11.5.1: RIP는 보라 물고기에 R?·R!, ICMP 오류는 빨간 물고기 (글자 없음)
describe("RIP와 ICMP 오류", () => {
  test("경로 교환의 첫 걸음: 보라 물고기와 머리 위 R?", () => {
    const simulator = createSimulator();
    simulator.load(fourRouterRipDocument);
    const summary = simulator.getSnapshot().traces.find((candidate) => candidate.kind === "rip")!;
    const timeline = exchangeTimeline(simulator.getTrace(summary.id)!);
    const html = renderToString(
      <Canvas document={fourRouterRipDocument} selectedDeviceId={null} onSelect={() => {}} onOpenTerminal={() => {}}
        replays={[{ key: "rip", timeline, startedAt: performance.now() - timeline.walks[0]!.duration / 2 }]} />,
    );
    expect(html).toMatch(/walk-[ab]-purple[^"]*\.png/);
    expect(html).toContain(">R?</text>");
    expect(html).toContain('aria-label="RIP 요청"');
  });

  test("traceroute에서 돌아오는 time-exceeded: 빨간 물고기, 머리 위 글자 없음", async () => {
    const simulator = createSimulator();
    simulator.load(switchedStaticRoutingLabDocument);
    await simulator.console(ROUTER_LAB.pc1).exec("tracert -h 1 192.168.2.10");
    const timeline = previewTimeline(simulator.getTrace(simulator.getSnapshot().traces[0]!.id)!);
    const last = timeline.walks.at(-1)!;
    const html = renderToString(
      <Canvas document={switchedStaticRoutingLabDocument} selectedDeviceId={null} onSelect={() => {}} onOpenTerminal={() => {}}
        replays={[{ key: "r1", timeline, startedAt: performance.now() - (last.start + last.duration / 2) }]} />,
    );
    expect(html).toMatch(/walk-[ab]-red[^"]*\.png/);
    expect(html).toContain('aria-label="ICMP 오류 알림"');
    expect(html).not.toContain("penguin-mark");
  });
});

// T0.15: 시뮬레이션 시계를 따른다. 실제 시각과 상관없이 넘긴 시각으로 펭귄 자리를 정한다
test("재생 시각(replayTime)을 따른다: 걷는 중이면 걷는 펭귄이 있고, 끝난 뒤면 없다", async () => {
  const timeline = await firstTimeline();
  const render = (time: number) => renderToString(
    <Canvas document={twoPcSwitchDocument} selectedDeviceId={null} onSelect={() => {}} onOpenTerminal={() => {}}
      replays={[{ key: "r1", timeline, startedAt: 10_000 }]} replayTime={() => time} replayPaused />,
  );
  expect(render(10_000 + WALK_MS / 2)).toMatch(/walk-[ab]-green[^"]*\.png/);
  expect(render(10_000 + timeline.durationMs + 5_000)).not.toMatch(/walk-[ab]-/);
});
