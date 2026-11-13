// 이벤트 목록을 펭귄 재생에 맞춰 보이기 (T1.9.2). 이벤트마다 "재생 시작부터 몇 ms에 보일지"를 정한다.
// - 프레임을 내보낸 이벤트: 그 펭귄이 출발할 때
// - 폐기: 놓침 그림이 시작할 때
// - 받기·배우기처럼 펭귄을 따라 일어난 이벤트: 부모 이벤트의 펭귄이 도착할 때
// - 첫 시도 뒤(ARP 재시도 등)라 재생에 나오지 않는 이벤트: 재생이 끝날 때
// 목록이 위에서부터 자라도록 앞 이벤트보다 이르지 않게 맞춘다.

import type { Trace } from "@ping9/shared";

import { LINK_TIME } from "./steps";
import type { Timeline } from "./timeline";

export function revealTimes(trace: Trace, timeline: Timeline): number[] {
  const walks = new Map(timeline.walks.map((walk) => [walk.hop.seq, walk]));
  const drops = new Map(timeline.drops.map((drop) => [drop.fall.seq, drop.start]));
  // 첫 시도가 끝나는 곳: 가상 시간이 링크 하나보다 길게 비는 첫 자리
  const times = [...new Set(trace.events.map((event) => event.time))];
  const gapAt = times.findIndex((time, index) => index > 0 && time - times[index - 1]! > LINK_TIME);
  const lastShown = gapAt === -1 ? Infinity : times[gapAt - 1]!;

  const result: number[] = [];
  let floor = 0;
  for (const event of trace.events) {
    const walk = walks.get(event.seq);
    const drop = drops.get(event.seq);
    let at: number;
    if (walk !== undefined) at = walk.start;
    else if (drop !== undefined) at = drop;
    else if (event.time > lastShown) at = timeline.durationMs;
    else if (event.parentSeq === undefined) at = 0;
    else {
      const parentWalk = walks.get(event.parentSeq);
      at = parentWalk !== undefined ? parentWalk.start + parentWalk.duration : result[event.parentSeq] ?? timeline.durationMs;
    }
    floor = Math.max(floor, Math.min(at, timeline.durationMs));
    result.push(floor);
  }
  return result;
}
