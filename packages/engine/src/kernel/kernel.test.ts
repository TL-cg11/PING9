import { LIMITS, LINK_DELAY_MICROSECONDS, validateTrace } from "@ping9/shared";
import type { DeviceRef, FrameSnapshot, PortRef } from "@ping9/shared";
import { TWO_PC, twoPcPingTrace } from "@ping9/shared/examples";
import fc from "fast-check";
import { describe, expect, test } from "vitest";

import { createKernel } from "./kernel";
import type { Frame, Kernel, KernelRun, SimContext, TimerRef } from "./types";

const ref: DeviceRef = { deviceId: TWO_PC.pc1.id, deviceName: TWO_PC.pc1.name };
const target: PortRef = { deviceId: TWO_PC.pc2.id, port: TWO_PC.port };
const snapshot = (): FrameSnapshot => JSON.parse(JSON.stringify(twoPcPingTrace.events[0]!.frame)) as FrameSnapshot;

function record(ctx: SimContext, frame: Frame): number {
  return ctx.record({
    frame, deviceId: ref.deviceId, layer: "L2", action: "receive",
    reason: { code: "FRAME_RECEIVED", params: { device: ref, port: TWO_PC.port } },
  });
}

function run(kernel: Kernel, input: Partial<KernelRun> = {}) {
  return kernel.run({ docVersion: 7, start: () => {}, onFrame: () => {}, onTimer: () => {}, ...input });
}

describe("kernel 사건 큐와 가상 시계", () => {
  test("프레임과 타이머를 시각, 예약 순번 순으로 함께 처리한다", () => {
    const calls: string[] = [];
    const kernel = createKernel();
    run(kernel, {
      start(ctx) {
        const frame = ctx.createFrame(snapshot());
        ctx.sendFrame(target, frame, 20);
        ctx.setTimer(ref.deviceId, "early", 10);
        ctx.setTimer(ref.deviceId, "same", 20);
        ctx.setTimer(ref.deviceId, "zero", 0);
      },
      onFrame(ctx) {
        calls.push(`frame:${ctx.now()}`);
        ctx.setTimer(ref.deviceId, "nested", 0);
      },
      onTimer(ctx, timer) { calls.push(`${timer.key}:${ctx.now()}`); },
    });
    expect(calls).toEqual(["zero:0", "early:10", "frame:20", "same:20", "nested:20"]);
    expect(kernel.now()).toBe(20);
  });

  test("취소된 타이머는 실행되지 않고 시계도 진행시키지 않는다", () => {
    const calls: string[] = [];
    const kernel = createKernel();
    run(kernel, {
      start(ctx) {
        const timer = ctx.setTimer(ref.deviceId, "arp-timeout", 2_000_000);
        ctx.setTimer(ref.deviceId, "reply", 1_000);
        ctx.cancelTimer(timer);
        ctx.cancelTimer(timer);
      },
      onTimer(ctx, timer) { calls.push(`${timer.key}:${ctx.now()}`); },
    });
    expect(calls).toEqual(["reply:1000"]);
    expect(kernel.now()).toBe(1_000);
  });

  test("타이머 도착 뒤 다른 타이머를 취소할 수 있다", () => {
    let timeout: TimerRef;
    const calls: string[] = [];
    run(createKernel(), {
      start(ctx) {
        timeout = ctx.setTimer(ref.deviceId, "timeout", 2_000_000);
        ctx.setTimer(ref.deviceId, "reply", 1000);
      },
      onTimer(ctx, timer) {
        calls.push(timer.key);
        ctx.cancelTimer(timeout);
      },
    });
    expect(calls).toEqual(["reply"]);
  });

  test("시계는 Trace 사이에 이어지고 Trace 시간과 frameId는 0, 1부터 시작한다", () => {
    const kernel = createKernel();
    const execute = () => run(kernel, {
      start(ctx) {
        const frame = ctx.createFrame(snapshot());
        record(ctx, frame);
        ctx.sendFrame(target, frame, LINK_DELAY_MICROSECONDS);
      },
      onFrame(ctx, _target, frame) { record(ctx, frame); },
    });
    const first = execute();
    const second = execute();
    expect(kernel.now()).toBe(2_000);
    expect(first.id).toBe(1);
    expect(second.id).toBe(2);
    expect(second.events.map(event => [event.seq, event.time, event.frameId])).toEqual([[0, 0, 1], [1, 1000, 1]]);
    kernel.reset();
    expect(kernel.now()).toBe(0);
    expect(execute()).toEqual(first);
  });

  test("임의의 예약 순서에서도 안정 정렬과 결정성이 유지된다", () => {
    fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 100 }), { maxLength: 100 }), (delays) => {
      const execute = () => {
        const observed: number[] = [];
        let frame: Frame;
        const trace = run(createKernel(), {
          start(ctx) {
            frame = ctx.createFrame(snapshot());
            delays.forEach((delay, index) => ctx.setTimer(ref.deviceId, String(index), delay));
          },
          onTimer(ctx, timer) {
            observed.push(Number(timer.key));
            record(ctx, frame);
          },
        });
        expect(validateTrace(trace).ok).toBe(true);
        return { observed, trace };
      };
      const first = execute();
      expect(execute()).toEqual(first);
      expect(first.observed).toEqual(delays.map((delay, index) => ({ delay, index }))
        .sort((a, b) => a.delay - b.delay || a.index - b.index).map(item => item.index));
    }), { numRuns: 100, seed: 20261106 });
  });
});

describe("kernel Trace 기록", () => {
  test("프레임 전달, 응답, 타이머의 원인과 frameId를 기록한다", () => {
    const trace = run(createKernel(), {
      start(ctx) {
        const frame = ctx.createFrame(snapshot());
        expect(record(ctx, frame)).toBe(0);
        ctx.sendFrame(target, frame, 1000);
      },
      onFrame(ctx, receivedTarget, frame) {
        expect(receivedTarget).toEqual(target);
        expect(record(ctx, frame)).toBe(1);
        const reply = ctx.createFrame(snapshot());
        ctx.record({
          frame: reply, parentSeq: 1, deviceId: target.deviceId, layer: "ARP", action: "reply",
          reason: { code: "ARP_REPLY_SENT", params: { device: ref, ip: TWO_PC.pc1.ip, mac: TWO_PC.pc1.mac } },
        });
        ctx.setTimer(ref.deviceId, "after-reply", 1000);
      },
      onTimer(ctx) { record(ctx, ctx.createFrame(snapshot())); },
      outcome: () => "success",
    });
    expect(trace.docVersion).toBe(7);
    expect(trace.events.map(event => [event.seq, event.time, event.frameId, event.parentSeq])).toEqual([
      [0, 0, 1, undefined], [1, 1000, 1, 0], [2, 1000, 2, 1], [3, 2000, 3, 2],
    ]);
    expect(trace.result).toEqual({ status: "success" });
    expect(validateTrace(trace).ok).toBe(true);
  });

  test("분기한 전달은 명시한 동일 원인을 가리킨다", () => {
    const trace = run(createKernel(), {
      start(ctx) {
        const frame = ctx.createFrame(snapshot());
        const root = record(ctx, frame);
        for (let i = 0; i < 2; i += 1) {
          const seq = ctx.record({
            frame, parentSeq: root, deviceId: ref.deviceId, layer: "L2", action: "forward",
            reason: { code: "FRAME_FORWARDED", params: { device: ref, mac: TWO_PC.pc2.mac, port: String(i) } },
          });
          ctx.sendFrame(target, frame, 1000, seq);
        }
      },
      onFrame(ctx, _target, frame) { record(ctx, frame); },
    });
    expect(trace.events.map(event => event.parentSeq)).toEqual([undefined, 0, 0, 1, 2]);
  });

  test("정상 폐기는 실패 원인에서 제외하고 실패 폐기의 seq를 가리킨다", () => {
    const trace = run(createKernel(), {
      start(ctx) {
        const frame = ctx.createFrame(snapshot());
        ctx.record({ frame, deviceId: ref.deviceId, layer: "L2", action: "drop",
          reason: { code: "NOT_FOR_ME", params: { device: ref } } });
        ctx.record({ frame, deviceId: ref.deviceId, layer: "L2", action: "drop",
          reason: { code: "NO_LINK", params: { device: ref, port: TWO_PC.port } } });
      },
    });
    expect(trace.result).toEqual({ status: "failed", primaryDropSeq: 1 });
    expect(trace.events[1]!.dropReason).toBe("NO_LINK");
    expect(validateTrace(trace).ok).toBe(true);
  });

  test("실패 폐기 없이 큐가 비어도 성공이라고 가정하지 않는다", () => {
    expect(run(createKernel()).result).toEqual({ status: "failed" });
  });

  test("성공 여부는 프로토콜이 정하고 성공에는 primaryDropSeq를 넣지 않는다", () => {
    const trace = run(createKernel(), {
      start(ctx) {
        ctx.record({ frame: ctx.createFrame(snapshot()), deviceId: ref.deviceId, layer: "L2", action: "drop",
          reason: { code: "NO_LINK", params: { device: ref, port: TWO_PC.port } } });
      },
      outcome: () => "success",
    });
    expect(trace.result).toEqual({ status: "success" });
  });

  test("프레임 수정은 id를 유지하고 앞선 스냅샷과 호출자의 값을 바꾸지 않는다", () => {
    const original = { ...snapshot(), ethernet: { ...snapshot().ethernet } };
    const reason = { code: "FRAME_RECEIVED" as const, params: { device: { ...ref }, port: TWO_PC.port } };
    const trace = run(createKernel(), {
      start(ctx) {
        const frame = ctx.createFrame(original);
        ctx.record({ frame, deviceId: ref.deviceId, layer: "L2", action: "receive", reason });
        const updated = ctx.updateFrame(frame, { ...original, ethernet: { ...original.ethernet, vlanTag: 10 } });
        record(ctx, updated);
      },
    });
    original.ethernet = { ...original.ethernet, sourceMac: "changed" };
    reason.params.device.deviceName = "changed";
    expect(Object.isFrozen(original)).toBe(false);
    expect(trace.events[0]!.frame.ethernet.sourceMac).toBe(TWO_PC.pc1.mac);
    expect(trace.events[0]!.frame.ethernet.vlanTag).toBeUndefined();
    expect(trace.events[1]!.frame.ethernet.vlanTag).toBe(10);
    expect(trace.events.map(event => event.frameId)).toEqual([1, 1]);
    expect(trace.events[0]!.reason.params).toMatchObject({ device: ref });
    expect(Object.isFrozen(trace.events[0]!.frame.ethernet)).toBe(true);
    expect(Object.isFrozen(trace)).toBe(true);
  });
});

describe("kernel 한도와 내부 계약", () => {
  test("프레임 기록 한도에서 LOOP_GUARD를 남기고 다음 실행이 가능하다", () => {
    const kernel = createKernel();
    const trace = run(kernel, {
      start(ctx) {
        const frame = ctx.createFrame(snapshot());
        for (let i = 0; i <= LIMITS.maxTraceEvents; i += 1) record(ctx, frame);
      },
      outcome: () => "success",
    });
    expect(trace.events).toHaveLength(LIMITS.maxTraceEvents);
    expect(trace.result).toEqual({ status: "loop-guard", primaryDropSeq: LIMITS.maxTraceEvents - 1 });
    expect(trace.events.at(-1)!.reason).toEqual({ code: "LOOP_GUARD", params: { devices: [ref] } });
    expect(validateTrace(trace).ok).toBe(true);
    expect(run(kernel).result.status).toBe("failed");
  });

  test("기록하지 않는 반복 타이머도 처리 횟수 한도에서 멈추고 큐를 비운다", () => {
    let calls = 0;
    const kernel = createKernel();
    const trace = run(kernel, {
      start(ctx) {
        record(ctx, ctx.createFrame(snapshot()));
        ctx.setTimer(ref.deviceId, "again", 0);
      },
      onTimer(ctx) { calls += 1; ctx.setTimer(ref.deviceId, "again", 0); },
    });
    expect(calls).toBe(LIMITS.maxTraceEvents);
    expect(trace.result.status).toBe("loop-guard");
    expect(validateTrace(trace).ok).toBe(true);
    run(kernel, { onTimer: () => { throw new Error("old timer survived"); } });
  });

  test("한 번에 예약하는 큐의 크기도 제한한다", () => {
    const trace = run(createKernel(), {
      start(ctx) {
        record(ctx, ctx.createFrame(snapshot()));
        for (let i = 0; i <= LIMITS.maxTraceEvents; i += 1) ctx.setTimer(ref.deviceId, "queued", 1);
      },
    });
    expect(trace.result.status).toBe("loop-guard");
  });

  test.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "잘못된 지연 %s를 내부 계약 위반으로 거부하고 복구된다", (delay) => {
      const kernel = createKernel();
      expect(() => run(kernel, { start: ctx => { ctx.setTimer(ref.deviceId, "bad", delay); } })).toThrow(RangeError);
      expect(run(kernel).result.status).toBe("failed");
    },
  );

  test("가상 시간 합이 안전한 정수 범위를 넘으면 거부한다", () => {
    const kernel = createKernel();
    run(kernel, { start: ctx => { ctx.setTimer(ref.deviceId, "last", Number.MAX_SAFE_INTEGER); } });
    expect(() => run(kernel, { start: ctx => { ctx.setTimer(ref.deviceId, "overflow", 1); } })).toThrow(RangeError);
  });

  test("다른 Trace의 프레임과 아직 없는 parentSeq를 거부한다", () => {
    const kernel = createKernel();
    let frame: Frame;
    run(kernel, { start: ctx => { frame = ctx.createFrame(snapshot()); } });
    expect(() => run(kernel, { start: ctx => { record(ctx, frame); } })).toThrow("another trace");
    expect(() => run(kernel, { start(ctx) {
      ctx.sendFrame(target, ctx.createFrame(snapshot()), 0, 0);
    } })).toThrow("parentSeq");
  });

  test("완료된 콜백의 context는 다음 콜백에서도 쓸 수 없다", () => {
    let old: SimContext;
    run(createKernel(), {
      start(ctx) { old = ctx; ctx.setTimer(ref.deviceId, "next", 0); },
      onTimer() { expect(() => old.now()).toThrow("only valid"); },
    });
    expect(() => old.now()).toThrow("only valid");
  });

  test("실행 중 중첩 실행과 reset은 거부한다", () => {
    const kernel = createKernel();
    run(kernel, { start() {
      expect(() => run(kernel)).toThrow("nested");
      expect(() => kernel.reset()).toThrow("running");
    } });
  });
});
