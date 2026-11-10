// ping 한 회차의 결과 종류와 통계 줄 (T1.8.3). engine과 web이 같은 규칙을 쓴다.
// engine은 콘솔 출력을 만들 때, web은 회차를 하나씩 보여 주다가 Ctrl+C로 멈춘 뒤 그때까지의 통계를 만들 때 쓴다.

import type { ConsoleLine } from "./console";
import type { OsKind } from "./document";
import { isIcmpError } from "./trace";
import type { Trace } from "./trace";

/**
 * - `icmp-error`: 라우터의 ICMP 도달 불가·TTL 만료 오류를 받음
 * - `reply`: 응답을 받음
 * - `unreachable`: 출발 PC의 ARP 요청에 응답이 없음 (`ARP_TIMEOUT`)
 * - `timeout`: 보냈는데 응답이 오지 않음
 * - `unsent`: 출발 PC가 보내지 못함 (`NO_IP`, `NO_GATEWAY`)
 */
export type PingRoundKind = "reply" | "unreachable" | "timeout" | "unsent" | "icmp-error";

/**
 * 회차의 추적에서 결과 종류를 읽는다. `sourceId`는 ping을 친 PC 또는 Router, `sequence`는 회차 번호(1부터)다.
 * `ARP_TIMEOUT`은 첫 폐기가 아니어도 본다: 링크가 없으면 첫 폐기는 ARP 요청의 `NO_LINK`이고 `ARP_TIMEOUT`은 뒤에 온다
 */
export function pingRoundKind(trace: Trace, sourceId: string, sequence: number): PingRoundKind {
  const atSource = trace.events.filter((event) => event.deviceId === sourceId);
  if (
    atSource.some(
      (event) => event.reason.code === "ICMP_ECHO_REPLY_RECEIVED" && event.frame.icmp?.sequence === sequence,
    )
  ) {
    return "reply";
  }
  if (atSource.some(event => event.reason.code === "ICMP_ERROR_RECEIVED" &&
    isIcmpError(event.frame.icmp) && event.frame.icmp.original.sequence === sequence)) return "icmp-error";
  const drops = atSource.filter((event) => event.action === "drop");
  if (drops.some((event) => event.reason.code === "NO_IP" || event.reason.code === "NO_GATEWAY")) return "unsent";
  if (drops.some((event) => (event.reason.code === "ARP_TIMEOUT" || event.reason.code === "NO_ROUTE"))) return "unreachable";
  return "timeout";
}

const text = (value: string): ConsoleLine => ({ kind: "text", text: value });

/** C의 `%g`처럼 유효 숫자 여섯 자리. 33.3333, 25, 0 */
function percentG(value: number): string {
  return String(Number(value.toPrecision(6)));
}

/**
 * 통계 줄. 앞에 빈 줄이 하나 있다. 보낸 수는 `rounds`의 길이다.
 * Windows는 ARP 실패(`Destination host unreachable.`)도 "받음"으로 세고 손실률을 정수로 버린다.
 * Linux는 ARP 실패를 `+N errors`로 세고 손실률을 `%g`로 쓴다.
 * 실제 OS의 왕복 시간 요약 줄은 넣지 않는다 (설계 10절 4)
 */
export function pingStatisticsLines(os: OsKind, targetIp: string, rounds: readonly PingRoundKind[]): ConsoleLine[] {
  const sent = rounds.length;
  const count = (kind: PingRoundKind) => rounds.filter((round) => round === kind).length;

  if (os === "linux") {
    const received = count("reply");
    const errors = count("unreachable") + count("icmp-error");
    const loss = sent === 0 ? "0" : percentG(((sent - received) * 100) / sent);
    return [
      text(""),
      text(`--- ${targetIp} ping statistics ---`),
      text(`${sent} packets transmitted, ${received} received, ${errors > 0 ? `+${errors} errors, ` : ""}${loss}% packet loss`),
    ];
  }

  const received = count("reply") + count("unreachable") + count("icmp-error");
  const lost = sent - received;
  const loss = sent === 0 ? 0 : Math.floor((lost * 100) / sent);
  return [
    text(""),
    text(`Ping statistics for ${targetIp}:`),
    text(`    Packets: Sent = ${sent}, Received = ${received}, Lost = ${lost} (${loss}% loss)`),
  ];
}
