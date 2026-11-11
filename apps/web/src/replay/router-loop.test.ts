import { pingRoundKind } from "@ping9/shared";
import { initialTerminal, runLinePaced } from "../terminal/terminal-state";
import { createSimulator } from "@ping9/engine";
import { ROUTER_LAB as LAB, staticRoutingLabDocument } from "@ping9/shared/examples";
import { expect, test } from "vitest";
import { firstAttempt, replaySteps } from "./steps";
import { MAX_REPLAY_MS, previewTimeline, timelineOf } from "./timeline";

test.each([LAB.pc1, LAB.r1])("순환 ping %s: 실제 TTL 추적은 보존하고 회차 재생은 15초 이내", async sourceId => {
  const sim = createSimulator();
  expect(sim.load(staticRoutingLabDocument).ok).toBe(true);
  for (const [deviceId, nextHop] of [[LAB.r1, "10.0.12.2"], [LAB.r2, "10.0.12.1"]]) {
    expect(sim.dispatch({ type: "route/add", deviceId: deviceId!, network: "8.8.8.0",
      mask: "255.255.255.0", nextHop: nextHop! }).ok).toBe(true);
  }
  if (sourceId === LAB.r1) await sim.console(sourceId).exec("enable");
  await sim.console(sourceId).exec(sourceId === LAB.pc1 ? "ping -n 1 8.8.8.8" : "ping 8.8.8.8");
  const trace = sim.getTrace(sim.getSnapshot().traces[0]!.id)!;
  const original = JSON.stringify(trace);
  const full = timelineOf(firstAttempt(replaySteps(trace)));
  expect(full.durationMs).toBeGreaterThan(60_000);
  const timeline = previewTimeline(trace);
  expect(timeline.omittedHops).toBeGreaterThan(40);
  expect(timeline.walks.length).toBeLessThan(20);
  const expiration = trace.events.find(event => event.reason.code === "TTL_EXPIRED")!;
  expect(timeline.drops.some(drop => drop.fall.seq === expiration.seq && drop.fall.primary)).toBe(true);
  const errorHopSeqs = trace.events.filter(event => event.frame.icmp?.type === "time-exceeded" && event.linkId !== undefined).map(event => event.seq);
  expect(errorHopSeqs.every(seq => timeline.walks.some(walk => walk.hop.seq === seq))).toBe(true);
  expect(timeline.durationMs).toBeLessThanOrEqual(MAX_REPLAY_MS);

  expect(JSON.stringify(trace)).toBe(original);
  expect(trace.events.some(event => event.reason.code === "TTL_EXPIRED")).toBe(true);
});

test("R1의 실제 4회 ping 출력과 펭귄 재생을 함께 실행해도 총 대기는 63초 이내다", async () => {
  const sim = createSimulator();
  sim.load(staticRoutingLabDocument);
  for (const [deviceId, nextHop] of [[LAB.r1, "10.0.12.2"], [LAB.r2, "10.0.12.1"]]) {
    sim.dispatch({ type: "route/add", deviceId: deviceId!, network: "8.8.8.0", mask: "255.255.255.0", nextHop: nextHop! });
  }
  const port = sim.console(LAB.r1);
  await port.exec("enable");
  const waits: number[] = [];
  const state = await runLinePaced(port, initialTerminal("R1#"), "ping 8.8.8.8", {
    show: () => {},
    wait: async ms => { waits.push(ms); return true; },
    kindOf: (id, seq) => pingRoundKind(sim.getTrace(id)!, LAB.r1, seq),
    targetOf: () => "8.8.8.8", os: "windows",
    play: id => previewTimeline(sim.getTrace(id)!).durationMs,
  });
  expect(state.lines.filter(line => line.text.includes("TTL expired in transit."))).toHaveLength(4);
  expect(state.lines.at(-1)?.text).toBe("Success rate: 0/4");
  expect(waits.reduce((sum, ms) => sum + ms, 0)).toBeLessThanOrEqual(4 * MAX_REPLAY_MS + 3000);
  expect(state.lines.some(line => line.text === "^C")).toBe(false);
});

test("정상 ping의 걸음과 재생 시간은 유지하고, 아주 긴 케이블도 전체 이동을 남긴 채 시간만 제한한다", async () => {
  const sim = createSimulator();
  sim.load(staticRoutingLabDocument);
  await sim.console(LAB.pc1).exec("ping -n 1 192.168.2.10");
  const trace = sim.getTrace(sim.getSnapshot().traces[0]!.id)!;
  expect(previewTimeline(trace)).toEqual(timelineOf(firstAttempt(replaySteps(trace))));
  const long = previewTimeline(trace, () => 100_000);
  expect(long.durationMs).toBe(MAX_REPLAY_MS);
  expect(long.walks.map(walk => walk.hop)).toEqual(previewTimeline(trace).walks.map(walk => walk.hop));
  expect(long.omittedHops).toBeUndefined();
  expect(long.timeScale).toBeLessThan(1);
});
