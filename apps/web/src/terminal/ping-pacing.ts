// ping 결과를 실제처럼 회차마다 하나씩 보이기 (T1.8.3). engine은 모든 회차를 한 번에 계산해 돌려주고,
// 화면만 회차 사이에 시간을 둔다. 결과와 보관된 추적은 바뀌지 않는다 (AD-5).
// 순수 함수라 DOM과 시계 없이 테스트한다. 기다리기와 Ctrl+C는 app.tsx가 한다.

import { pingStatisticsLines } from "@ping9/shared";
import type { ConsoleLine, ConsoleResult, OsKind, PingRoundKind } from "@ping9/shared";

/** 다음 회차까지의 간격. 실제 OS도 1초마다 보낸다 */
export const ROUND_INTERVAL_MS = 1000;
/** 응답이 오지 않은 회차는 이만큼 기다린 뒤에 보인다. 실제 Windows의 기본 대기 시간이다 */
export const TIMEOUT_WAIT_MS = 4000;

export interface PacedRound {
  /** 회차 줄과 그 추적 줄 */
  readonly lines: readonly ConsoleLine[];
  readonly kind: PingRoundKind;
  /** 이 회차를 보이기 전에 기다리는 시간 */
  readonly waitMs: number;
}

export interface PacedResult {
  /** 바로 보이는 줄 (Windows `Pinging …`, Linux `PING …`). 회차가 없는 결과는 모든 줄이 여기 있다 */
  readonly head: readonly ConsoleLine[];
  readonly rounds: readonly PacedRound[];
  /** 마지막 회차 뒤의 줄 (통계) */
  readonly tail: readonly ConsoleLine[];
}

/** 회차가 시작될 때 이미 1초가 지났는가: 첫 회차는 바로, 그 뒤는 1초 뒤. 타임아웃은 4초 기다린 뒤에 보인다 */
export function waitBefore(index: number, kind: PingRoundKind): number {
  if (kind === "timeout") return TIMEOUT_WAIT_MS;
  return index === 0 ? 0 : ROUND_INTERVAL_MS;
}

/**
 * 결과를 회차로 나눈다. 추적 줄(`trace`) 하나가 회차 하나의 끝이고, 그 바로 앞 줄이 회차 줄이다.
 * `kindOf`는 회차의 결과 종류다 (`sequence`는 1부터). 추적 줄이 없는 결과는 회차가 없다
 */
export function pacePing(
  result: ConsoleResult,
  kindOf: (traceId: number, sequence: number) => PingRoundKind,
): PacedResult {
  const head: ConsoleLine[] = [];
  const rounds: PacedRound[] = [];
  let pending: ConsoleLine[] = [];

  for (const line of result.lines) {
    if (line.kind !== "trace") {
      pending.push(line);
      continue;
    }
    const roundLine = pending.pop();
    if (rounds.length === 0) head.push(...pending);
    const kind = kindOf(line.traceId, rounds.length + 1);
    rounds.push({
      lines: roundLine === undefined ? [line] : [roundLine, line],
      kind,
      waitMs: waitBefore(rounds.length, kind),
    });
    pending = [];
  }

  if (rounds.length === 0) return { head: pending, rounds: [], tail: [] };
  return { head, rounds, tail: pending };
}

const text = (value: string): ConsoleLine => ({ kind: "text", text: value });

/**
 * Ctrl+C로 멈췄을 때의 줄. `shown`은 보인 회차의 결과, `waiting`은 기다리던 회차다.
 * 응답을 기다리던 중(타임아웃 회차)이면 그 회차는 이미 보낸 것이라 보낸 수에 넣는다.
 * Windows는 통계 뒤에 `Control-C`와 `^C`, Linux는 `^C` 뒤에 통계를 찍는다
 */
export function interruptedLines(
  os: OsKind,
  targetIp: string,
  shown: readonly PingRoundKind[],
  waiting: PingRoundKind | undefined,
): ConsoleLine[] {
  const sent = waiting === "timeout" ? [...shown, waiting] : [...shown];
  if (sent.length === 0) return [text("^C")];
  const statistics = pingStatisticsLines(os, targetIp, sent);
  return os === "linux" ? [text("^C"), ...statistics] : [...statistics, text("Control-C"), text("^C")];
}
