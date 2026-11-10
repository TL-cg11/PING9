// ping 추적을 재생 단계로 나눈다 (T6.1.1). 같은 `time`의 이벤트가 한 단계다 (AD-6).
// 추적만 읽는 순수 함수라 같은 추적은 언제나 같은 단계가 된다. 엔진을 부르지 않는다.

import type { Trace, TraceEvent } from "@ping9/shared";

export type FrameKind = "arp-request" | "arp-reply" | "icmp-request" | "icmp-reply";

/** 케이블 위를 지나가는 프레임 하나 */
export interface Hop {
  /** 프레임을 내보낸 이벤트 (`linkId`가 있는 create, reply, forward) */
  readonly seq: number;
  readonly linkId: string;
  /** 내보낸 장비. 링크의 반대쪽 끝이 도착 장비다 */
  readonly fromDeviceId: string;
  readonly kind: FrameKind;
}

/** 프레임이 버려진 곳 */
export interface Fall {
  readonly seq: number;
  readonly deviceId: string;
  /** 버려진 프레임이 들어온 링크. 출발 장비의 타이머(`ARP_TIMEOUT`)처럼 링크가 없으면 undefined */
  readonly linkId?: string;
  readonly kind: FrameKind;
  /**
   * 실패의 원인 폐기 (`result.primaryDropSeq`), 또는 재시도한 프레임이 같은 장비에서 같은 이유로 버려진 것.
   * 정상 폐기(`NOT_FOR_ME`)는 false
   */
  readonly primary: boolean;
}

export interface Step {
  /** 가상 시간 (마이크로초) */
  readonly time: number;
  readonly hops: readonly Hop[];
  readonly falls: readonly Fall[];
}

export function frameKind(event: TraceEvent): FrameKind {
  const { arp, icmp } = event.frame;
  if (arp !== undefined) return arp.operation === "request" ? "arp-request" : "arp-reply";
  return icmp?.type === "echo-reply" ? "icmp-reply" : "icmp-request";
}

/** 폐기된 프레임이 들어온 링크: 부모를 거슬러 올라가 처음 만나는 `linkId` */
function incomingLink(trace: Trace, event: TraceEvent): string | undefined {
  let parent = event.parentSeq === undefined ? undefined : trace.events[event.parentSeq];
  while (parent !== undefined) {
    if (parent.linkId !== undefined) return parent.deviceId === event.deviceId ? undefined : parent.linkId;
    parent = parent.parentSeq === undefined ? undefined : trace.events[parent.parentSeq];
  }
  return undefined;
}

export function replaySteps(trace: Trace): Step[] {
  const cause = trace.result.primaryDropSeq === undefined ? undefined : trace.events[trace.result.primaryDropSeq];
  const isCause = (event: TraceEvent) =>
    cause !== undefined && event.deviceId === cause.deviceId && event.dropReason === cause.dropReason;
  const steps: { time: number; hops: Hop[]; falls: Fall[] }[] = [];
  for (const event of trace.events) {
    let step = steps.at(-1);
    if (step === undefined || step.time !== event.time) {
      step = { time: event.time, hops: [], falls: [] };
      steps.push(step);
    }
    if (event.linkId !== undefined && event.action !== "drop") {
      step.hops.push({ seq: event.seq, linkId: event.linkId, fromDeviceId: event.deviceId, kind: frameKind(event) });
    }
    if (event.action === "drop") {
      const linkId = incomingLink(trace, event);
      step.falls.push({
        seq: event.seq,
        deviceId: event.deviceId,
        ...(linkId === undefined ? {} : { linkId }),
        kind: frameKind(event),
        primary: isCause(event),
      });
    }
  }
  return steps.filter((step) => step.hops.length > 0 || step.falls.length > 0);
}

/**
 * 가상 시간에서 링크 하나를 지나는 시간 (마이크로초). engine의 LINK_DELAY_MICROSECONDS와 같다.
 * 이보다 긴 틈은 ARP 재시도의 기다림이다
 */
export const LINK_TIME = 1000;

/**
 * 첫 시도만 남긴다: ARP 재시도(긴 틈 뒤의 단계)부터 버린다. 회차 줄(`Destination host unreachable.`)은
 * 펭귄이 한 번 가서 막힌 뒤에 뜬다.
 * 첫 시도에 원인 폐기가 없으면(없는 주소: ARP 요청이 닿은 장비마다 "내 것 아님"으로 버림) 그 폐기들을
 * 놓침으로 그린다. 실제 원인은 출발 PC의 타이머(`ARP_TIMEOUT`)지만, 프레임이 마지막으로 닿은 곳에서
 * 놓치는 편이 화면에서 알아보기 쉽다 (2026-11-10 결정). 버려진 곳이 없으면 타이머 폐기를 바로 뒤에 붙인다
 */
export function firstAttempt(steps: readonly Step[]): Step[] {
  const gap = steps.findIndex((step, index) => index > 0 && step.time - steps[index - 1]!.time > LINK_TIME);
  if (gap === -1) return [...steps];
  const kept = steps.slice(0, gap);
  if (kept.some((step) => step.falls.some((fall) => fall.primary))) return kept;
  if (kept.some((step) => step.falls.length > 0)) {
    return kept.map((step) => ({ ...step, falls: step.falls.map((fall) => ({ ...fall, primary: true })) }));
  }
  const timer = steps.slice(gap).flatMap((step) => step.falls.filter((fall) => fall.primary && fall.linkId === undefined));
  const last = kept.at(-1)!;
  return timer.length === 0 ? kept : [...kept, { time: last.time + LINK_TIME, hops: [], falls: timer }];
}
