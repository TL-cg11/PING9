// T0.15: 시뮬레이션 시계. 가짜 시각과 타이머로 멈춤·속도·기다리기를 본다
import { describe, expect, test } from "vitest";

import { createSimClock } from "./sim-clock";
import type { TimeSource } from "./sim-clock";

/** 손으로 돌리는 시각. `advance`가 그 사이에 끝나는 타이머를 차례로 부른다 */
function fakeTime() {
  let time = 1000;
  let nextId = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  const source: TimeSource = {
    now: () => time,
    setTimeout: (run, ms) => {
      nextId += 1;
      timers.set(nextId, { at: time + ms, run });
      return nextId;
    },
    clearTimeout: (timer) => { timers.delete(timer as number); },
  };
  const advance = async (ms: number) => {
    const end = time + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (due === undefined) break;
      timers.delete(due[0]);
      time = due[1].at;
      due[1].run();
      await Promise.resolve();
    }
    time = end;
    await Promise.resolve();
  };
  return { source, advance, pending: () => timers.size };
}

/** 기다리기가 끝났는지 보려고 결과를 담아 둔다 */
function track(promise: Promise<boolean>) {
  const box: { done?: boolean } = {};
  void promise.then((done) => { box.done = done; });
  return box;
}

describe("시각", () => {
  test("처음은 0, 실행 중, 1×", () => {
    const clock = createSimClock(fakeTime().source);
    expect(clock.now()).toBe(0);
    expect(clock.state()).toEqual({ paused: false, speed: 1 });
  });

  test("1×는 실제와 같이, 2×는 두 배로, 0.5×는 절반으로 간다", async () => {
    const time = fakeTime();
    const clock = createSimClock(time.source);
    await time.advance(100);
    expect(clock.now()).toBe(100);
    clock.setSpeed(2);
    await time.advance(100);
    expect(clock.now()).toBe(300);
    clock.setSpeed(0.5);
    await time.advance(100);
    expect(clock.now()).toBe(350);
  });

  test("멈춘 동안은 서 있고, 다시 실행하면 그 자리에서 이어 간다", async () => {
    const time = fakeTime();
    const clock = createSimClock(time.source);
    await time.advance(200);
    clock.pause();
    await time.advance(5000);
    expect(clock.now()).toBe(200);
    clock.resume();
    await time.advance(50);
    expect(clock.now()).toBe(250);
  });

  test("멈춘 동안 속도를 바꿔도 서 있다", async () => {
    const time = fakeTime();
    const clock = createSimClock(time.source);
    clock.pause();
    clock.setSpeed(2);
    await time.advance(100);
    expect(clock.now()).toBe(0);
    expect(clock.state()).toEqual({ paused: true, speed: 2 });
  });
});

describe("기다리기", () => {
  test("1×면 실제와 같은 시간을 기다린다", async () => {
    const time = fakeTime();
    const clock = createSimClock(time.source);
    const waited = track(clock.wait(1000));
    await time.advance(999);
    expect(waited.done).toBeUndefined();
    await time.advance(1);
    expect(waited.done).toBe(true);
  });

  test("2×면 절반만, 0.5×면 두 배 기다린다", async () => {
    const time = fakeTime();
    const clock = createSimClock(time.source);
    clock.setSpeed(2);
    const fast = track(clock.wait(1000));
    await time.advance(500);
    expect(fast.done).toBe(true);
    clock.setSpeed(0.5);
    const slow = track(clock.wait(1000));
    await time.advance(1999);
    expect(slow.done).toBeUndefined();
    await time.advance(1);
    expect(slow.done).toBe(true);
  });

  test("기다리는 도중 속도를 바꾸면 남은 만큼을 새 속도로", async () => {
    const time = fakeTime();
    const clock = createSimClock(time.source);
    const waited = track(clock.wait(1000));
    await time.advance(400); // 600 남음
    clock.setSpeed(2); // 실제 300
    await time.advance(299);
    expect(waited.done).toBeUndefined();
    await time.advance(1);
    expect(waited.done).toBe(true);
  });

  test("멈춘 동안은 끝나지 않고, 다시 실행하면 남은 만큼 기다린다", async () => {
    const time = fakeTime();
    const clock = createSimClock(time.source);
    const waited = track(clock.wait(1000));
    await time.advance(300);
    clock.pause();
    expect(time.pending()).toBe(0);
    await time.advance(10_000);
    expect(waited.done).toBeUndefined();
    clock.resume();
    await time.advance(699);
    expect(waited.done).toBeUndefined();
    await time.advance(1);
    expect(waited.done).toBe(true);
  });

  test("Ctrl+C(abort)면 멈춘 동안에도 바로 false", async () => {
    const time = fakeTime();
    const clock = createSimClock(time.source);
    const controller = new AbortController();
    const waited = track(clock.wait(1000, controller.signal));
    clock.pause();
    controller.abort();
    await time.advance(0);
    expect(waited.done).toBe(false);
    clock.resume();
    expect(time.pending()).toBe(0);
  });

  test("이미 그만둔 신호면 기다리지 않는다", async () => {
    const time = fakeTime();
    const clock = createSimClock(time.source);
    const controller = new AbortController();
    controller.abort();
    const waited = track(clock.wait(1000, controller.signal));
    await time.advance(0);
    expect(waited.done).toBe(false);
    expect(time.pending()).toBe(0);
  });
});

test("멈춤·속도가 바뀔 때만 알린다", () => {
  const clock = createSimClock(fakeTime().source);
  let calls = 0;
  const unsubscribe = clock.subscribe(() => { calls += 1; });
  clock.pause();
  clock.pause();
  clock.setSpeed(2);
  clock.setSpeed(2);
  clock.resume();
  expect(calls).toBe(3);
  unsubscribe();
  clock.pause();
  expect(calls).toBe(3);
});
