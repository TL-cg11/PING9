// T6.1.2: 단계를 화면 시간에 놓기
import { describe, expect, test } from "vitest";

import type { Step } from "./steps";
import { FADE_MS, FALL_MS, MIN_WALK_MS, PAUSE_MS, STRIDE_MS, WALK_MS, WALK_SPEED, spritesAt, timelineOf } from "./timeline";

const hop = (seq: number, linkId = "l1") => ({ seq, linkId, fromDeviceId: "a", kind: "icmp-request" as const });
const fall = (seq: number, primary: boolean) => ({ seq, deviceId: "b", linkId: "l1", kind: "arp-request" as const, primary });

describe("timelineOf", () => {
  test("케이블 길이를 모르면 링크마다 WALK_MS", () => {
    const steps: Step[] = [0, 1000, 2000, 3000].map((time, index) => ({ time, hops: [hop(index)], falls: [] }));
    const timeline = timelineOf(steps);
    expect(timeline.walks.map((walk) => walk.start)).toEqual([0, WALK_MS, 2 * WALK_MS, 3 * WALK_MS]);
    expect(timeline.durationMs).toBe(4 * WALK_MS);
  });

  test("케이블 길이와 상관없이 같은 빠르기: 두 배 긴 케이블은 두 배 오래 걷는다. 짧아도 MIN_WALK_MS", () => {
    const lengths: Record<string, number> = { short: 220, long: 440, tiny: 10 };
    const timeline = timelineOf(
      [{ time: 0, hops: [hop(0, "short")], falls: [] }, { time: 1000, hops: [hop(1, "long")], falls: [] }, { time: 2000, hops: [hop(2, "tiny")], falls: [] }],
      (linkId) => lengths[linkId],
    );
    expect(timeline.walks.map((walk) => walk.duration)).toEqual([220 / WALK_SPEED, 440 / WALK_SPEED, MIN_WALK_MS]);
    expect(timeline.walks[1]!.start).toBe(220 / WALK_SPEED);
  });

  test("flooding으로 길이가 다른 케이블에 동시에 나가면, 가장 긴 쪽이 도착한 뒤 다음 단계", () => {
    const timeline = timelineOf(
      [{ time: 0, hops: [hop(0, "a"), hop(1, "b")], falls: [] }, { time: 1000, hops: [hop(2, "a")], falls: [] }],
      (linkId) => (linkId === "a" ? 200 : 400),
    );
    expect(timeline.walks[2]!.start).toBe(400 / WALK_SPEED);
  });

  test("ARP 재시도처럼 긴 기다림은 PAUSE_MS로 줄인다", () => {
    const steps: Step[] = [
      { time: 0, hops: [hop(0)], falls: [] },
      { time: 1000, hops: [], falls: [fall(1, false)] },
      { time: 1_000_000, hops: [hop(2)], falls: [] },
    ];
    const timeline = timelineOf(steps);
    expect(timeline.drops[0]!.start).toBe(WALK_MS);
    expect(timeline.walks[1]!.start).toBe(WALK_MS + PAUSE_MS);
  });

  test("놓침을 다 보인 뒤에 다음 펭귄이 출발하고, 놓침 그림은 그때 사라진다", () => {
    const timeline = timelineOf([
      { time: 0, hops: [hop(0)], falls: [] },
      { time: 1000, hops: [], falls: [fall(1, true)] },
      { time: 1_000_000, hops: [hop(2)], falls: [] },
    ]);
    const next = WALK_MS + FALL_MS + PAUSE_MS;
    expect(timeline.walks[1]!.start).toBe(next);
    expect(timeline.drops[0]!.end).toBe(next);
    expect(spritesAt(timeline, next - 1).map((sprite) => sprite.type)).toEqual(["drop"]);
    expect(spritesAt(timeline, next).map((sprite) => sprite.type)).toEqual(["walk"]);
  });

  test("원인 폐기로 끝나면 넘어짐을 보이는 시간까지가 재생 길이", () => {
    const timeline = timelineOf([
      { time: 0, hops: [hop(0)], falls: [] },
      { time: 1000, hops: [], falls: [fall(1, true)] },
    ]);
    expect(timeline.durationMs).toBe(WALK_MS + FALL_MS);
  });
});

describe("spritesAt", () => {
  const timeline = timelineOf([
    { time: 0, hops: [hop(0)], falls: [] },
    { time: 1000, hops: [], falls: [fall(1, true), fall(2, false)] },
  ]);

  test("걷는 중: 진행률과 걸음(A·B 번갈아)", () => {
    expect(spritesAt(timeline, 0)).toEqual([{ type: "walk", hop: hop(0), progress: 0, stride: "a" }]);
    const mid = spritesAt(timeline, STRIDE_MS + 1)[0]!;
    expect(mid).toMatchObject({ type: "walk", stride: "b" });
  });

  test("도착 뒤: 원인 폐기는 계속 남고, 정상 폐기는 흐려지다 사라진다", () => {
    const arrived = spritesAt(timeline, WALK_MS + FADE_MS / 2);
    expect(arrived.map((sprite) => sprite.type)).toEqual(["drop", "fade"]);
    expect(arrived[1]).toMatchObject({ opacity: 0.5 });
    expect(spritesAt(timeline, 60_000).map((sprite) => sprite.type)).toEqual(["drop"]);
  });

  test("움직임 줄이기: 걷지 않고 도착 자리에 서 있다", () => {
    expect(spritesAt(timeline, 10, true)[0]).toMatchObject({ progress: 1, stride: "a" });
  });
});
