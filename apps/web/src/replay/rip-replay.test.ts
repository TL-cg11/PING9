// T11.5.1: RIP 경로 교환과 ICMP 오류의 재생. 실제 engine의 추적으로 확인한다
import { createSimulator } from "@ping9/engine";
import type { Trace } from "@ping9/shared";
import { RIP_SQUARE, ROUTER_LAB, fourRouterRipDocument, switchedStaticRoutingLabDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { replaySteps } from "./steps";
import { exchangeTimeline, FALL_MS, MAX_REPLAY_MS, PAUSE_MS, previewTimeline, spritesAt } from "./timeline";

function exchangeTrace(cut = false): Trace {
  const simulator = createSimulator();
  simulator.load(fourRouterRipDocument);
  if (cut) simulator.dispatch({ type: "link/remove", linkId: RIP_SQUARE.links.r1R2 });
  const summary = simulator.getSnapshot().traces.find((candidate) => candidate.kind === "rip")!;
  return simulator.getTrace(summary.id)!;
}

describe("물고기 종류", () => {
  test("경로 교환: 처음 단계는 Router마다 RIP 요청, 그 뒤는 RIP 응답", () => {
    const steps = replaySteps(exchangeTrace());

    expect(new Set(steps[0]!.hops.map((hop) => hop.kind))).toEqual(new Set(["rip-request"]));
    expect(new Set(steps.slice(1).flatMap((step) => step.hops.map((hop) => hop.kind)))).toEqual(new Set(["rip-response"]));
  });

  test("traceroute 첫 hop: 나가는 탐색은 ICMP 요청, R1이 돌려보내는 time-exceeded는 ICMP 오류", async () => {
    const simulator = createSimulator();
    simulator.load(switchedStaticRoutingLabDocument);
    await simulator.console(ROUTER_LAB.pc1).exec("tracert -h 1 192.168.2.10");
    const trace = simulator.getTrace(simulator.getSnapshot().traces[0]!.id)!;
    const kinds = replaySteps(trace).flatMap((step) => step.hops.map((hop) => hop.kind));

    expect(kinds).toContain("icmp-request");
    expect(kinds.at(-1)).toBe("icmp-error");
    expect(kinds).not.toContain("icmp-reply");
  });

  test("traceroute 첫 hop: 놓침 그림이 사라진 뒤에 빨간 물고기가 출발한다", async () => {
    const simulator = createSimulator();
    simulator.load(switchedStaticRoutingLabDocument);
    await simulator.console(ROUTER_LAB.pc1).exec("tracert -h 1 192.168.2.10");
    const timeline = previewTimeline(simulator.getTrace(simulator.getSnapshot().traces[0]!.id)!);
    const drop = timeline.drops.find((candidate) => candidate.fall.primary)!;
    const error = timeline.walks.find((walk) => walk.hop.kind === "icmp-error")!;

    expect(error.start).toBe(drop.start + FALL_MS);
    expect(drop.end).toBe(error.start);
    expect(spritesAt(timeline, error.start + 1).some((sprite) => sprite.type === "drop")).toBe(false);
    // 빨간 물고기는 R1 → Switch → PC1. 마지막 펭귄이 도착할 때 끝난다
    const last = timeline.walks.at(-1)!;
    expect(last.hop.kind).toBe("icmp-error");
    expect(timeline.durationMs).toBe(last.start + last.duration);
  });
});

describe("exchangeTimeline", () => {
  test("정기 갱신(긴 틈 뒤)도 재생한다. ping 재생은 첫 시도만이라 거기서 끊는다", () => {
    const trace = exchangeTrace();
    const exchange = exchangeTimeline(trace);
    const ping = previewTimeline(trace);

    expect(exchange.walks.length).toBe(replaySteps(trace).flatMap((step) => step.hops).length);
    expect(exchange.walks.length).toBeGreaterThan(ping.walks.length);
    // 가상 시간 30ms의 기다림은 PAUSE_MS로 줄인다
    const starts = [...new Set(exchange.walks.map((walk) => walk.start))];
    expect(starts.some((start, index) => index > 0 && start - starts[index - 1]! > PAUSE_MS)).toBe(true);
  });

  test("사각형 예시는 15초 안이라 시간 축을 줄이지 않는다", () => {
    const timeline = exchangeTimeline(exchangeTrace(true));
    expect(timeline.durationMs).toBeLessThan(MAX_REPLAY_MS);
    expect(timeline.timeScale).toBeUndefined();
  });

  test("같은 교환은 언제나 같은 재생 (AD-6)", () => {
    expect(exchangeTimeline(exchangeTrace(true))).toEqual(exchangeTimeline(exchangeTrace(true)));
  });
});
