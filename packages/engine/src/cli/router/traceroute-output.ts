// T11.4.1: Router `traceroute`의 IOS 출력. 입력만으로 줄이 정해지는 순수 함수다.
// 실제 IOS 15의 `VRF info: (vrf in name/id, vrf out name/id)` 줄은 뺀다. PING9에는 VRF가 없다.

import type { ConsoleLine } from "@ping9/shared";

import type { PingRound } from "../../runtime";
import { LOOPBACK_HOP_TIME_US } from "../pc/traceroute-output";
import type { LoopbackHop } from "../pc/traceroute-output";

const text = (value: string): ConsoleLine => ({ kind: "text", text: value });

/** IOS의 시간 칸 하나: `4 msec`. 1ms보다 짧으면 `0 msec` */
const probe = (timeUs: number): string => `${Math.round(timeUs / 1000)} msec`;

function hopLine(round: PingRound, targetIp: string): string {
  const hop = String(round.sequence).padStart(3);
  switch (round.kind) {
    case "reply":
      return `${hop} ${targetIp} ${Array(3).fill(probe(round.timeUs)).join(" ")}`;
    case "icmp-error":
      return round.error === "time-exceeded"
        ? `${hop} ${round.sourceIp} ${Array(3).fill(probe(round.timeUs)).join(" ")}`
        : `${hop} ${round.sourceIp} !N  !N  !N`;
    // 출발 Router에 경로가 없거나 다음 홉의 ARP가 실패함. 실제 IOS는 30 hop까지 `*`를 찍지만 PING9는 여기서 멈춘다
    case "unreachable":
    case "timeout":
    case "unsent":
      return `${hop}  *  *  *`;
  }
}

export function iosTracerouteLines(targetIp: string, hops: readonly PingRound[] | LoopbackHop): ConsoleLine[] {
  const lines: ConsoleLine[] = [text("Type escape sequence to abort."), text(`Tracing the route to ${targetIp}`), text("")];
  if ("kind" in hops) {
    return [...lines, text(`  1 ${hops.targetIp} ${Array(3).fill(probe(LOOPBACK_HOP_TIME_US)).join(" ")}`)];
  }
  for (const round of hops) lines.push(text(hopLine(round, targetIp)), { kind: "trace", traceId: round.traceId });
  return lines;
}
