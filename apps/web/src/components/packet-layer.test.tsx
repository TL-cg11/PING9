// T6.1.2: 캔버스의 펭귄 층
import { createSimulator } from "@ping9/engine";
import { TWO_PC_SWITCH, twoPcSwitchDocument } from "@ping9/shared/examples";
import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";

import { replaySteps } from "../replay/steps";
import { WALK_MS, timelineOf } from "../replay/timeline";
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
