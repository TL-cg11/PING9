// T1.9.2: 이벤트 목록이 펭귄 재생에 맞춰 보일 시각
import { createSimulator } from "@ping9/engine";
import type { Trace } from "@ping9/shared";
import { TWO_SWITCH_VLAN as LAB, twoSwitchVlanDocument } from "@ping9/shared/examples";
import { expect, test } from "vitest";

import { revealTimes } from "./reveal";
import { previewTimeline } from "./timeline";

async function pingTrace(sourceId: string, targetIp: string): Promise<Trace> {
  const sim = createSimulator();
  expect(sim.load(twoSwitchVlanDocument).ok).toBe(true);
  await sim.console(sourceId).exec(`ping -n 1 ${targetIp}`);
  return sim.getTrace(sim.getSnapshot().traces[0]!.id)!;
}

test("이벤트마다 한 시각. 앞 이벤트보다 이르지 않고 재생 길이를 넘지 않는다", async () => {
  for (const trace of [await pingTrace(LAB.pc2.id, LAB.pc4.ip), await pingTrace(LAB.pc1.id, LAB.pc3.ip)]) {
    const timeline = previewTimeline(trace);
    const times = revealTimes(trace, timeline);

    expect(times).toHaveLength(trace.events.length);
    expect(times[0]).toBe(0);
    times.forEach((time, index) => {
      expect(time).toBeLessThanOrEqual(timeline.durationMs);
      if (index > 0) expect(time).toBeGreaterThanOrEqual(times[index - 1]!);
    });
  }
});

test("펭귄을 내보낸 이벤트는 그 펭귄이 출발할 때, 원인 폐기는 놓침 그림이 시작할 때 보인다", async () => {
  const trace = await pingTrace(LAB.pc1.id, LAB.pc3.ip);
  const timeline = previewTimeline(trace);
  const times = revealTimes(trace, timeline);

  for (const walk of timeline.walks) expect(times[walk.hop.seq]).toBe(walk.start);
  const primary = trace.result.primaryDropSeq!;
  expect(trace.events[primary]!.reason.code).toBe("TRUNK_NOT_ALLOWED");
  expect(times[primary]).toBe(timeline.drops.find((drop) => drop.fall.seq === primary)!.start);
});

test("첫 시도 뒤의 이벤트(ARP 재시도)는 재생이 끝날 때 보인다", async () => {
  const trace = await pingTrace(LAB.pc1.id, LAB.pc3.ip);
  const timeline = previewTimeline(trace);
  const times = revealTimes(trace, timeline);
  const retry = trace.events.filter((event) => event.time - trace.events[0]!.time > 1_000_000);

  expect(retry.length).toBeGreaterThan(0);
  for (const event of retry) expect(times[event.seq]).toBe(timeline.durationMs);
});
