// T1.7.1: 장비 종류를 모르는 이산 사건 커널 (AD-5, AD-6).
// Document/CLI/DOM을 다루지 않는다. 링크 전달과 DeviceModel 연결은 T1.7.2에서 한다.
import { LIMITS } from "@ping9/shared";
import type { DeviceRef, PortRef, Trace, TraceEvent, TraceResult } from "@ping9/shared";

import { deepFreeze } from "../freeze";
import { EventQueue } from "./event-queue";
import type { Frame, Kernel, KernelRun, SimContext, TimerRef } from "./types";

type ScheduledEvent = {
  readonly time: number;
  readonly order: number;
  readonly parentSeq?: number;
} & (
  | { readonly kind: "frame"; readonly target: PortRef; readonly frame: Frame }
  | { readonly kind: "timer"; readonly timer: TimerRef }
);

/** 경계를 오가는 단순 JSON 자료를 복사한다. 호출자의 객체를 얼리거나 함께 보관하지 않는다. */
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function nonnegativeInteger(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("Kernel time and version must be nonnegative safe integers");
  }
}

export function createKernel(): Kernel {
  let now = 0;
  let nextTraceId = 1;
  let nextTimerId = 1;
  let running = false;

  return {
    now: () => now,

    reset() {
      if (running) throw new Error("Cannot reset a running kernel");
      now = 0;
      nextTraceId = 1;
      nextTimerId = 1;
    },

    run(input: KernelRun): Trace {
      if (running) throw new Error("Kernel.run cannot be nested");
      nonnegativeInteger(input.docVersion);

      const startTime = now;
      const id = nextTraceId++;
      const queue = new EventQueue<ScheduledEvent>();
      const events: TraceEvent[] = [];
      const frames = new Set<Frame>();
      const timers = new Set<TimerRef>();
      const devices = new Map<string, DeviceRef>();
      const stopped = Symbol("kernel event limit");
      let nextFrameId = 1;
      let nextOrder = 0;
      let processed = 0;
      let guarded = false;
      let primaryDropSeq: number | undefined;
      let active = true;
      let contextVersion = 0;
      running = true;

      const checkFrame = (frame: Frame): void => {
        if (!frames.has(frame)) throw new Error("Frame belongs to another trace");
      };

      const guard = (): never => {
        if (guarded) throw stopped;
        guarded = true;
        // 마지막 기록을 원인으로 별도 폐기 이벤트를 남긴다. 기록용 한 칸을 항상 남겨 둔다.
        const last = events.at(-1);
        if (last !== undefined) {
          const seq = events.length;
          events.push(deepFreeze({
            seq,
            time: now - startTime,
            frameId: last.frameId,
            parentSeq: last.seq,
            deviceId: last.deviceId,
            layer: last.layer,
            action: "drop",
            reason: { code: "LOOP_GUARD", params: { devices: [...devices.values()] } },
            frame: last.frame,
            dropReason: "LOOP_GUARD",
          }));
          primaryDropSeq = seq;
        }
        throw stopped;
      };

      const scheduledTime = (delayUs: number): number => {
        nonnegativeInteger(delayUs);
        const time = now + delayUs;
        nonnegativeInteger(time);
        return time;
      };

      const checkParent = (parentSeq: number | undefined): void => {
        if (parentSeq !== undefined && (!Number.isInteger(parentSeq) || events[parentSeq] === undefined)) {
          throw new RangeError("parentSeq must refer to an event already recorded in this trace");
        }
      };

      const enqueue = (event: ScheduledEvent): void => {
        if (queue.size >= LIMITS.maxTraceEvents) guard();
        queue.push(event);
      };

      const context = (cause?: number): SimContext => {
        const version = ++contextVersion;
        const checkActive = (): void => {
          if (!active || version !== contextVersion) throw new Error("SimContext is only valid during its callback");
          if (guarded) throw stopped;
        };
        // 예약에는 이 처리에서 마지막으로 기록한 이벤트를 기본 원인으로 붙인다.
        let latest = cause;
        return {
          now() {
            checkActive();
            return now;
          },
          createFrame(snapshot) {
            checkActive();
            const frame = deepFreeze({ id: nextFrameId++, snapshot: copy(snapshot) });
            frames.add(frame);
            return frame;
          },
          updateFrame(frame, snapshot) {
            checkActive();
            checkFrame(frame);
            const updated = deepFreeze({ id: frame.id, snapshot: copy(snapshot) });
            frames.add(updated);
            return updated;
          },
          sendFrame(target, frame, delayUs, parentSeq = latest) {
            checkActive();
            checkFrame(frame);
            checkParent(parentSeq);
            enqueue({
              kind: "frame", time: scheduledTime(delayUs), order: nextOrder++,
              target: deepFreeze({ ...target }), frame,
              ...(parentSeq === undefined ? {} : { parentSeq }),
            });
          },
          setTimer(deviceId, key, delayUs, parentSeq = latest) {
            checkActive();
            checkParent(parentSeq);
            const time = scheduledTime(delayUs);
            const timer = deepFreeze({ id: nextTimerId++, deviceId, key });
            enqueue({
              kind: "timer", time, order: nextOrder++, timer,
              ...(parentSeq === undefined ? {} : { parentSeq }),
            });
            timers.add(timer);
            return timer;
          },
          cancelTimer(timer) {
            checkActive();
            timers.delete(timer);
          },
          record(event) {
            checkActive();
            checkFrame(event.frame);
            const parentSeq = event.parentSeq ?? cause;
            checkParent(parentSeq);
            if (events.length >= LIMITS.maxTraceEvents - 1) guard();
            const { frame, ...fields } = event;
            const seq = events.length;
            events.push(deepFreeze({
              ...copy(fields), seq, time: now - startTime, frameId: frame.id, frame: frame.snapshot,
              ...(parentSeq === undefined ? {} : { parentSeq }),
              ...(event.action === "drop" ? { dropReason: event.reason.code } : {}),
            }));
            if ("device" in event.reason.params) {
              const ref = event.reason.params.device;
              devices.set(ref.deviceId, copy(ref));
            }
            if (event.action === "drop" && event.reason.code !== "NOT_FOR_ME") primaryDropSeq ??= seq;
            latest = seq;
            return seq;
          },
        };
      };

      // 콜백이 끝난 뒤 보관한 context를 다른 콜백에서 쓰는 것도 막는다.
      const invoke = (callback: (ctx: SimContext) => void, cause?: number): void => {
        active = true;
        try {
          callback(context(cause));
        } finally {
          active = false;
        }
      };

      try {
        try {
          invoke(input.start);
          while (queue.size > 0) {
            const event = queue.pop()!;
            if (event.kind === "timer" && !timers.delete(event.timer)) continue;
            if (processed >= LIMITS.maxTraceEvents) guard();
            processed += 1;
            now = event.time;
            invoke((ctx) => {
              if (event.kind === "frame") input.onFrame(ctx, event.target, event.frame);
              else input.onTimer(ctx, event.timer);
            }, event.parentSeq);
          }
        } catch (error) {
          if (error !== stopped) throw error;
        }

        const status = guarded ? "loop-guard" : (input.outcome?.() ?? "failed");
        const result: TraceResult = status === "success" || primaryDropSeq === undefined
          ? { status }
          : { status, primaryDropSeq };
        return deepFreeze({ id, docVersion: input.docVersion, events, result });
      } finally {
        active = false;
        running = false;
        queue.clear();
        timers.clear();
      }
    },
  };
}
