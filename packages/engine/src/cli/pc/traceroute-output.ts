// T11.4.1: traceroute의 OS별 출력. 입력만으로 줄이 정해지는 순수 함수다 (ping-output과 같은 모양).
// hop마다 탐색을 한 번 보내고, 시간 칸 세 개에 같은 값을 쓴다 (설계 결정 1). hop 줄 뒤에 그 hop의 추적 줄이 온다.

import type { ConsoleLine } from "@ping9/shared";

import type { PingRound } from "../../runtime";

const text = (value: string): ConsoleLine => ({ kind: "text", text: value });
const traceLine = (traceId: number): ConsoleLine => ({ kind: "trace", traceId });

/** 자기 주소(또는 127.x)로 traceroute할 때 쓰는 고정 시간. ping의 값과 같다 */
export const LOOPBACK_HOP_TIME_US = 30;

/** 링크를 지나지 않는 hop 하나 (자기 주소, 127.x). 추적이 없다 */
export interface LoopbackHop {
  readonly kind: "loopback";
  readonly targetIp: string;
}

/** Windows의 시간 칸 하나. 9자, 오른쪽 맞춤: `    <1 ms`, `     4 ms` */
function windowsProbe(timeUs: number): string {
  return timeUs < 1000 ? "    <1 ms" : `${String(Math.round(timeUs / 1000)).padStart(6)} ms`;
}

const windowsHop = (hop: number): string => String(hop).padStart(3);

/** Windows hop 줄. `ownIp`는 출발 PC의 주소다 (ARP 실패 줄) */
function windowsHopLine(round: PingRound, targetIp: string, ownIp: string | undefined): string {
  const hop = windowsHop(round.sequence);
  switch (round.kind) {
    case "reply":
      return `${hop}${windowsProbe(round.timeUs).repeat(3)}  ${targetIp}`;
    case "icmp-error":
      return round.error === "time-exceeded"
        ? `${hop}${windowsProbe(round.timeUs).repeat(3)}  ${round.sourceIp}`
        : `${hop}  ${round.sourceIp}  reports: Destination net unreachable.`;
    case "unreachable":
      return `${hop}  ${ownIp ?? targetIp}  reports: Destination host unreachable.`;
    case "timeout":
      return `${hop}${"     *   ".repeat(3)}  Request timed out.`;
    case "unsent":
      return `${hop}  Transmit error: code 1231.`;
  }
}

/** Windows `tracert`. 이름 풀이가 없어 머리 줄에 주소만 쓴다 (`-d`와 같은 모양) */
export function windowsTracertLines(
  targetIp: string, ownIp: string | undefined, maxHops: number, hops: readonly PingRound[] | LoopbackHop,
): ConsoleLine[] {
  const lines: ConsoleLine[] = [text(`Tracing route to ${targetIp} over a maximum of ${maxHops} hops`), text("")];
  if ("kind" in hops) {
    lines.push(text(`${windowsHop(1)}${windowsProbe(LOOPBACK_HOP_TIME_US).repeat(3)}  ${hops.targetIp}`));
  } else {
    for (const round of hops) lines.push(text(windowsHopLine(round, targetIp, ownIp)), traceLine(round.traceId));
  }
  return [...lines, text(""), text("Trace complete.")];
}

/** Linux traceroute의 시간: `%.3f ms` */
const linuxProbe = (timeUs: number): string => `${(timeUs / 1000).toFixed(3)} ms`;

/** Linux hop 줄. `numeric`이면(`-n`) 주소 뒤의 `(주소)`를 쓰지 않는다 */
function linuxHopLine(round: PingRound, targetIp: string, ownIp: string | undefined, numeric: boolean): string {
  const hop = `${String(round.sequence).padStart(2)} `;
  const host = (ip: string) => (numeric ? ` ${ip}` : ` ${ip} (${ip})`);
  const probes = (timeUs: number, mark = "") => `  ${linuxProbe(timeUs)}${mark}`.repeat(3);
  switch (round.kind) {
    case "reply":
      return `${hop}${host(targetIp)}${probes(round.timeUs)}`;
    case "icmp-error":
      return `${hop}${host(round.sourceIp)}${probes(round.timeUs, round.error === "time-exceeded" ? "" : " !N")}`;
    case "unreachable":
      return `${hop}${host(ownIp ?? targetIp)}${probes(round.timeUs, " !H")}`;
    case "timeout":
    case "unsent":
      return `${hop}${" *".repeat(3)}`;
  }
}

/**
 * Linux `traceroute`. 실제 기본값(UDP)의 머리 줄을 쓰지만 탐색은 ICMP다 (E11 결정 7).
 * 첫 탐색을 보내지 못하면 실제처럼 `connect: Network is unreachable`로 끝내고, 그 회차의 추적만 붙인다
 */
export function linuxTracerouteLines(
  targetIp: string, ownIp: string | undefined, maxHops: number, numeric: boolean, hops: readonly PingRound[] | LoopbackHop,
): ConsoleLine[] {
  const lines: ConsoleLine[] = [text(`traceroute to ${targetIp} (${targetIp}), ${maxHops} hops max, 60 byte packets`)];
  if ("kind" in hops) {
    const host = numeric ? hops.targetIp : `${hops.targetIp} (${hops.targetIp})`;
    return [...lines, text(` 1  ${host}${`  ${linuxProbe(LOOPBACK_HOP_TIME_US)}`.repeat(3)}`)];
  }
  const first = hops[0];
  if (first?.kind === "unsent") return [...lines, text("connect: Network is unreachable"), traceLine(first.traceId)];
  for (const round of hops) lines.push(text(linuxHopLine(round, targetIp, ownIp, numeric)), traceLine(round.traceId));
  return lines;
}
