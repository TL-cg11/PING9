// 시뮬레이션 시계 (T0.15). 시뮬레이션 모드의 펭귄과 콘솔 줄 간격은 실제 시각 대신 이 시계를 따른다.
// 멈추면 시계가 서서 펭귄과 콘솔 줄이 그 자리에 서고, 다시 실행하면 이어서 간다. 속도를 바꾸면 둘 다 같이 빨라진다.
// 실제 시각과 타이머를 밖에서 받아 DOM과 실제 시간 없이 테스트한다.

/** 고를 수 있는 속도 (설계 시안 A안) */
export const SPEEDS = [0.5, 1, 2] as const;
export type Speed = (typeof SPEEDS)[number];

export interface ClockState {
  readonly paused: boolean;
  readonly speed: Speed;
}

/** 처음 상태: 실행 중, 1× */
export const INITIAL_CLOCK_STATE: ClockState = { paused: false, speed: 1 };

/** 실제 시각과 타이머 */
export interface TimeSource {
  now(): number;
  setTimeout(run: () => void, ms: number): unknown;
  clearTimeout(timer: unknown): void;
}

export interface SimClock {
  /** 시뮬레이션 시각(ms). 멈춘 동안은 그대로이고, 2×면 실제의 두 배로 간다 */
  now(): number;
  state(): ClockState;
  pause(): void;
  resume(): void;
  setSpeed(speed: Speed): void;
  /**
   * 시뮬레이션 시각으로 `ms`만큼 기다린다. 다 기다리면 true, `signal`로 그만두면(Ctrl+C) false.
   * 멈춘 동안은 기다리기도 선다
   */
  wait(ms: number, signal?: AbortSignal): Promise<boolean>;
  /** 멈춤·속도가 바뀔 때. `useSyncExternalStore`에 넘긴다 */
  subscribe(listener: () => void): () => void;
}

interface Waiter {
  readonly at: number;
  readonly resolve: (done: boolean) => void;
  timer: unknown;
}

export function createSimClock(source: TimeSource): SimClock {
  let state = INITIAL_CLOCK_STATE;
  // 마지막으로 상태가 바뀐 때의 시뮬레이션 시각과 실제 시각
  let base = 0;
  let anchor = source.now();
  const waiters = new Set<Waiter>();
  const listeners = new Set<() => void>();

  const now = () => (state.paused ? base : base + (source.now() - anchor) * state.speed);

  const schedule = (waiter: Waiter) => {
    if (state.paused) return;
    const left = Math.max(0, (waiter.at - now()) / state.speed);
    waiter.timer = source.setTimeout(() => {
      waiter.timer = undefined;
      // 실제 타이머가 조금 일찍 불릴 수 있다. 덜 갔으면 남은 만큼 다시
      if (now() + 0.5 >= waiter.at) {
        waiters.delete(waiter);
        waiter.resolve(true);
      } else schedule(waiter);
    }, left);
  };

  const unschedule = (waiter: Waiter) => {
    if (waiter.timer === undefined) return;
    source.clearTimeout(waiter.timer);
    waiter.timer = undefined;
  };

  const change = (next: ClockState) => {
    if (next.paused === state.paused && next.speed === state.speed) return;
    base = now();
    anchor = source.now();
    state = next;
    for (const waiter of waiters) {
      unschedule(waiter);
      schedule(waiter);
    }
    for (const listener of listeners) listener();
  };

  return {
    now,
    state: () => state,
    pause: () => change({ ...state, paused: true }),
    resume: () => change({ ...state, paused: false }),
    setSpeed: (speed) => change({ ...state, speed }),
    wait: (ms, signal) =>
      new Promise((resolve) => {
        if (signal?.aborted === true) return resolve(false);
        const waiter: Waiter = { at: now() + ms, resolve, timer: undefined };
        waiters.add(waiter);
        signal?.addEventListener("abort", () => {
          if (!waiters.delete(waiter)) return;
          unschedule(waiter);
          resolve(false);
        });
        schedule(waiter);
      }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** 브라우저의 시각과 타이머 */
export const BROWSER_TIME: TimeSource = {
  now: () => (typeof performance === "undefined" ? Date.now() : performance.now()),
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
};
