// T1.8.3: ping과 ARP 명령어의 OS별 출력. 입력만으로 줄이 정해지는 순수 함수다.
// Windows 형식은 예시 `twoPcPingConsoleResult`와 글자 하나까지 같다.
// 실제 OS의 왕복 시간 요약 줄(Windows `Approximate round trip times…`, Linux `rtt min/avg/max/mdev`,
// 통계 끝의 `, time 3004ms`)은 넣지 않는다 (설계 10절 4).

import type { ArpEntryView, ConsoleLine, OsKind } from "@ping9/shared";

import type { PingRound } from "../../runtime";
import { LINUX_INTERFACE } from "./linux-commands";

const text = (value: string): ConsoleLine => ({ kind: "text", text: value });
const traceLine = (traceId: number): ConsoleLine => ({ kind: "trace", traceId });

/** 자기 주소로 ping할 때 쓰는 고정 시간. 실제로 링크를 지나지 않는다 (설계 10절 2) */
const LOOPBACK_TIME_US = 30;

/** Windows의 시간. 1ms보다 짧으면 `<1ms` */
function windowsTime(timeUs: number): string {
  return timeUs < 1000 ? "time<1ms" : `time=${Math.round(timeUs / 1000)}ms`;
}

/** Linux(iputils)의 시간. 유효 숫자 세 자리를 버림으로 쓴다: 0.030, 4.00, 12.3, 123 */
export function linuxTime(timeUs: number): string {
  const ms = Math.floor(timeUs / 1000);
  const rest = timeUs % 1000;
  if (timeUs >= 100_000) return `${ms}`;
  if (timeUs >= 10_000) return `${ms}.${Math.floor(rest / 100)}`;
  if (timeUs >= 1000) return `${ms}.${String(Math.floor(rest / 10)).padStart(2, "0")}`;
  return `0.${String(timeUs).padStart(3, "0")}`;
}

/** C의 `%g`처럼 유효 숫자 여섯 자리. 33.3333, 25, 0 */
function percentG(value: number): string {
  return String(Number(value.toPrecision(6)));
}

function windowsStatistics(targetIp: string, sent: number, received: number): ConsoleLine[] {
  const lost = sent - received;
  // Windows는 정수 나눗셈으로 버린다
  const loss = Math.floor((lost * 100) / sent);
  return [
    text(""),
    text(`Ping statistics for ${targetIp}:`),
    text(`    Packets: Sent = ${sent}, Received = ${received}, Lost = ${lost} (${loss}% loss)`),
  ];
}

function linuxStatistics(targetIp: string, sent: number, received: number, errors: number): ConsoleLine[] {
  const loss = percentG(((sent - received) * 100) / sent);
  const errorPart = errors > 0 ? `+${errors} errors, ` : "";
  return [
    text(""),
    text(`--- ${targetIp} ping statistics ---`),
    text(`${sent} packets transmitted, ${received} received, ${errorPart}${loss}% packet loss`),
  ];
}

/**
 * Windows `ping`. `ownIp`는 출발 PC의 주소다 (ARP 실패 줄).
 * ARP 실패(`Destination host unreachable.`)는 실제 Windows처럼 "받음"으로 센다 (설계 10절 5)
 */
export function windowsPingLines(targetIp: string, ownIp: string | undefined, rounds: readonly PingRound[]): ConsoleLine[] {
  const lines: ConsoleLine[] = [text(`Pinging ${targetIp} with 32 bytes of data:`)];
  let received = 0;
  for (const round of rounds) {
    switch (round.kind) {
      case "reply":
        received += 1;
        lines.push(text(`Reply from ${targetIp}: bytes=32 ${windowsTime(round.timeUs)} TTL=${round.ttl}`));
        break;
      case "unreachable":
        received += 1;
        lines.push(text(`Reply from ${ownIp ?? targetIp}: Destination host unreachable.`));
        break;
      case "timeout":
        lines.push(text("Request timed out."));
        break;
      case "unsent":
        lines.push(text("PING: transmit failed. General failure."));
        break;
    }
    lines.push(traceLine(round.traceId));
  }
  return [...lines, ...windowsStatistics(targetIp, rounds.length, received)];
}

/**
 * Linux `ping -c`. 첫 회차를 보내지 못하면 실제처럼 `connect: Network is unreachable` 한 줄로 끝내고,
 * 그 회차의 추적만 붙인다 (설계 10절 6). 응답이 없는 회차는 `ping -O`의 문구로 한 줄을 남긴다
 */
export function linuxPingLines(targetIp: string, ownIp: string | undefined, rounds: readonly PingRound[]): ConsoleLine[] {
  const first = rounds[0];
  if (first?.kind === "unsent") {
    return [text("ping: connect: Network is unreachable"), traceLine(first.traceId)];
  }

  const lines: ConsoleLine[] = [text(`PING ${targetIp} (${targetIp}) 56(84) bytes of data.`)];
  let received = 0;
  let errors = 0;
  for (const round of rounds) {
    switch (round.kind) {
      case "reply":
        received += 1;
        lines.push(text(
          `64 bytes from ${targetIp}: icmp_seq=${round.sequence} ttl=${round.ttl} time=${linuxTime(round.timeUs)} ms`,
        ));
        break;
      case "unreachable":
        errors += 1;
        lines.push(text(`From ${ownIp ?? targetIp} icmp_seq=${round.sequence} Destination Host Unreachable`));
        break;
      case "timeout":
        lines.push(text(`no answer yet for icmp_seq=${round.sequence}`));
        break;
      case "unsent":
        lines.push(text("ping: sendmsg: Network is unreachable"));
        break;
    }
    lines.push(traceLine(round.traceId));
  }
  return [...lines, ...linuxStatistics(targetIp, rounds.length, received, errors)];
}

/** 자기 주소(또는 127.x)로 ping. 링크를 지나지 않아 추적이 없다 (설계 10절 2) */
export function loopbackPingLines(os: OsKind, targetIp: string, count: number, ttl: number): ConsoleLine[] {
  const rounds = Array.from({ length: count }, (_, index) => index + 1);
  if (os === "linux") {
    return [
      text(`PING ${targetIp} (${targetIp}) 56(84) bytes of data.`),
      ...rounds.map((sequence) =>
        text(`64 bytes from ${targetIp}: icmp_seq=${sequence} ttl=${ttl} time=${linuxTime(LOOPBACK_TIME_US)} ms`),
      ),
      ...linuxStatistics(targetIp, count, count, 0),
    ];
  }
  return [
    text(`Pinging ${targetIp} with 32 bytes of data:`),
    ...rounds.map(() => text(`Reply from ${targetIp}: bytes=32 ${windowsTime(LOOPBACK_TIME_US)} TTL=${ttl}`)),
    ...windowsStatistics(targetIp, count, count),
  ];
}

/** Windows `arp -a`. MAC은 `-`로 잇는다 */
export function windowsArpLines(ownIp: string | undefined, entries: readonly ArpEntryView[]): ConsoleLine[] {
  if (ownIp === undefined || entries.length === 0) return [text("No ARP Entries Found.")];
  return [
    text(`Interface: ${ownIp} --- 0x1`),
    text(`  ${"Internet Address".padEnd(22)}${"Physical Address".padEnd(22)}Type`),
    ...entries.map((entry) =>
      text(`  ${entry.ip.padEnd(22)}${entry.mac.replaceAll(":", "-").padEnd(22)}dynamic`),
    ),
  ];
}

/** Linux `ip neigh`. 비어 있으면 출력이 없다 */
export function linuxNeighLines(entries: readonly ArpEntryView[]): ConsoleLine[] {
  return entries.map((entry) => text(`${entry.ip} dev ${LINUX_INTERFACE} lladdr ${entry.mac} REACHABLE`));
}

/** Linux(net-tools) `arp -a`. 비어 있으면 출력이 없다 */
export function linuxArpLines(entries: readonly ArpEntryView[]): ConsoleLine[] {
  return entries.map((entry) => text(`? (${entry.ip}) at ${entry.mac} [ether] on ${LINUX_INTERFACE}`));
}
