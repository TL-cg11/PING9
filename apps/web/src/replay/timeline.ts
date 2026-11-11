// 재생 단계를 화면 시간(ms)에 놓는다 (T6.1.2). 가상 시간을 그대로 늘리지 않는다:
// 펭귄은 케이블 길이와 상관없이 같은 빠르기(WALK_SPEED)로 걷고, ARP 재시도처럼 아무 일 없이 기다린 시간은 PAUSE_MS로 줄인다.

import type { Trace } from "@ping9/shared";

import { firstAttempt, LINK_TIME, replaySteps } from "./steps";
import type { Fall, Hop, Step } from "./steps";

/** 펭귄이 걷는 빠르기 (캔버스 좌표 / ms). 예시의 케이블(약 220)을 1.1초에 건넌다 */
export const WALK_SPEED = 0.2;
/** 아주 짧은 케이블도 이만큼은 걷는다 */
export const MIN_WALK_MS = 400;
/** 케이블 길이를 모를 때 걷는 시간 */
export const WALK_MS = 1100;
/** 아무 일 없이 기다린 가상 시간(ARP 재시도 등)을 이 길이로 줄인다 */
export const PAUSE_MS = 600;
/** 원인 폐기의 놓침 그림을 보여 주는 시간. 다음 펭귄은 그 뒤에 출발한다 */
export const FALL_MS = 1000;
/** 정상 폐기(NOT_FOR_ME 등)의 펭귄이 흐려지며 사라지는 시간 */
export const FADE_MS = 600;
/** 놓침 그림이 다음 펭귄 출발 전에 흐려지는 시간 */
export const VANISH_MS = 200;
/** 걷기 A·B 그림을 바꾸는 간격 */
export const STRIDE_MS = 220;

export interface Walk {
  readonly hop: Hop;
  readonly start: number;
  /** 이 케이블을 걷는 시간 */
  readonly duration: number;
}

/** 길이가 `length`인 케이블을 걷는 시간 */
export function walkMs(length: number | undefined): number {
  return length === undefined ? WALK_MS : Math.max(MIN_WALK_MS, length / WALK_SPEED);
}
export interface Drop {
  readonly fall: Fall;
  readonly start: number;
  /** 놓침 그림이 사라지는 시각: 그 뒤 처음 출발하는 펭귄의 출발 시각. 없으면 남는다 */
  readonly end?: number;
}

export interface Timeline {
  readonly walks: readonly Walk[];
  readonly drops: readonly Drop[];
  /** 마지막 펭귄이 도착하거나 넘어짐이 끝날 때까지. 콘솔의 회차 줄은 이때 뜬다 */
  readonly durationMs: number;
  /** 같은 프레임의 반복 순환에서 화면 재생만 생략한 이동 수 */
  readonly omittedHops?: number;
  /** 긴 재생을 제한한 경우 시간 축 배율 */
  readonly timeScale?: number;
}

/** `lengthOf`: 링크의 케이블 길이 (캔버스 좌표). 같은 빠르기로 걷도록 걷는 시간을 정한다 */
export function timelineOf(steps: readonly Step[], lengthOf: (linkId: string) => number | undefined = () => undefined): Timeline {
  const walks: Walk[] = [];
  const drops: Drop[] = [];
  let cursor = 0;
  let end = 0;
  steps.forEach((step, index) => {
    const previous = steps[index - 1];
    if (previous !== undefined && step.time - previous.time > LINK_TIME) cursor += PAUSE_MS;
    // 여러 케이블로 동시에 나가면(flooding) 가장 긴 케이블의 펭귄이 도착할 때 다음 단계
    const walking = step.hops.map((hop) => walkMs(lengthOf(hop.linkId)));
    const dropped = step.falls.some((fall) => fall.primary);
    // 같은 단계에서 놓치고 돌려보내면(TTL 만료 → time-exceeded) 놓침을 다 보인 뒤에 돌아가는 펭귄이 출발한다
    const delay = dropped && step.hops.length > 0 ? FALL_MS : 0;
    step.hops.forEach((hop, index) => walks.push({ hop, start: cursor + delay, duration: walking[index]! }));
    for (const fall of step.falls) drops.push({ fall, start: cursor });
    const walked = Math.max(0, ...walking);
    const length = Math.max(delay + walked, ...step.falls.map((fall) => (fall.primary ? FALL_MS : FADE_MS)));
    end = Math.max(end, cursor + length);
    // 놓침을 다 보인 뒤에 다음 펭귄이 출발한다
    cursor += dropped ? length : walked;
  });
  // 놓침 그림은 다음 펭귄이 출발할 때 사라져 겹치지 않는다
  const dropsWithEnd = drops.map((drop) => {
    const next = walks.find((walk) => walk.start > drop.start);
    return next === undefined ? drop : { ...drop, end: next.start };
  });
  return { walks, drops: dropsWithEnd, durationMs: end };
}

/** 회차마다 콘솔을 오래 잠그지 않도록 화면 재생만 제한한다. 원본 Trace는 변경하지 않는다. */
export const MAX_REPLAY_MS = 15_000;

export function previewTimeline(trace: Trace, lengthOf: (linkId: string) => number | undefined = () => undefined): Timeline {
  const steps = firstAttempt(replaySteps(trace));
  const hasLoop = trace.events.some(event => event.reason.code === "TTL_EXPIRED");
  let omittedHops = 0;
  let preview = steps;
  if (hasLoop) {
    // 같은 frameId가 같은 방향의 링크를 반복 통과한 경우만 축약한다.
    // 최초 두 번과 마지막 통과, 모든 폐기·오류 귀환 단계는 남긴다.
    const keyOf = (hop: Hop) => JSON.stringify([trace.events[hop.seq]!.frameId, hop.fromDeviceId, hop.linkId]);
    const counts = new Map<string, number>();
    for (const step of steps) for (const hop of step.hops) {
      const key = keyOf(hop);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const seen = new Map<string, number>();
    preview = steps.map(step => ({ ...step, hops: step.hops.filter(hop => {
      const key = keyOf(hop);
      const occurrence = (seen.get(key) ?? 0) + 1;
      seen.set(key, occurrence);
      const keep = occurrence <= 2 || occurrence === counts.get(key);
      if (!keep) omittedHops += 1;
      return keep;
    }) })).filter(step => step.hops.length > 0 || step.falls.length > 0);
  }
  return capped(timelineOf(preview, lengthOf), omittedHops);
}

/** 한 재생이 MAX_REPLAY_MS를 넘으면 시간 축을 줄여 맞춘다 */
function capped(timeline: Timeline, omittedHops = 0): Timeline {
  const scale = timeline.durationMs > MAX_REPLAY_MS ? MAX_REPLAY_MS / timeline.durationMs : 1;
  return {
    ...timeline,
    ...(omittedHops === 0 ? {} : { omittedHops }),
    ...(scale === 1 ? {} : {
      timeScale: scale,
      durationMs: MAX_REPLAY_MS,
      walks: timeline.walks.map(walk => ({ ...walk, start: walk.start * scale, duration: walk.duration * scale })),
      drops: timeline.drops.map(drop => ({ ...drop, start: drop.start * scale,
        ...(drop.end === undefined ? {} : { end: drop.end * scale }) })),
    }),
  };
}

/**
 * RIP 경로 교환의 재생 (T11.5.1). ping과 달리 첫 시도만 남기지 않는다: 긴 틈 뒤의 정기 갱신도 교환의 일부다.
 * 긴 틈은 PAUSE_MS로 줄이고, 15초를 넘으면 시간 축을 줄인다
 */
export function exchangeTimeline(trace: Trace, lengthOf: (linkId: string) => number | undefined = () => undefined): Timeline {
  return capped(timelineOf(replaySteps(trace), lengthOf));
}

/** 시각 `elapsed`(재생 시작부터 ms)에 그릴 것 */
export type Sprite =
  | { readonly type: "walk"; readonly hop: Hop; readonly progress: number; readonly stride: "a" | "b" }
  | { readonly type: "drop"; readonly fall: Fall; readonly opacity: number }
  | { readonly type: "fade"; readonly fall: Fall; readonly opacity: number };

/**
 * `reduced`(움직임 줄이기): 걷는 동안 도착 장비 앞에 서 있고 발을 바꾸지 않는다
 */
export function spritesAt(timeline: Timeline, elapsed: number, reduced = false): Sprite[] {
  const sprites: Sprite[] = [];
  const timeScale = timeline.timeScale ?? 1;
  for (const { hop, start, duration } of timeline.walks) {
    if (elapsed < start || elapsed >= start + duration) continue;
    const progress = reduced ? 1 : (elapsed - start) / duration;
    const stride = !reduced && Math.floor((elapsed - start) / (STRIDE_MS * timeScale)) % 2 === 1 ? "b" : "a";
    sprites.push({ type: "walk", hop, progress, stride });
  }
  for (const { fall, start, end } of timeline.drops) {
    if (elapsed < start) continue;
    if (fall.primary) {
      if (end !== undefined && elapsed >= end) continue;
      const opacity = end === undefined ? 1 : Math.min(1, (end - elapsed) / (VANISH_MS * timeScale));
      sprites.push({ type: "drop", fall, opacity });
    }
    else if (elapsed < start + FADE_MS * timeScale) sprites.push({ type: "fade", fall, opacity: 1 - (elapsed - start) / (FADE_MS * timeScale) });
  }
  return sprites;
}
