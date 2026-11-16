// iptables의 filter 테이블 판정 (T14.2.1, 02 문서 F1). 무상태다: 패킷 하나와 규칙 목록만 본다.
// 규칙을 위에서부터 보고 처음 맞는 규칙의 대상을 따른다. 맞는 규칙이 없으면 체인의 기본 정책이다.

import { cidrContains, parsePortRange } from "@ping9/shared";
import type { FirewallChainConfig, FirewallRule, FirewallTarget, FrameSnapshot } from "@ping9/shared";

/** 필터가 보는 패킷의 값 */
export interface FilterPacket {
  readonly sourceIp: string;
  readonly destinationIp: string;
  /** PING9의 프레임에는 ICMP와 UDP(RIP)만 있다. TCP 규칙은 저장되지만 맞는 패킷이 없다 */
  readonly protocol?: "icmp" | "udp";
  readonly icmpType?: NonNullable<FirewallRule["icmpType"]>;
  readonly sourcePort?: number;
  readonly destinationPort?: number;
}

/** 패킷이 지나는 인터페이스. INPUT은 `inPort`만, OUTPUT은 `outPort`만, FORWARD는 둘 다 있다 */
export interface FilterPorts {
  readonly inPort?: string;
  readonly outPort?: string;
}

export interface FilterVerdict {
  readonly target: FirewallTarget;
  /** 맞은 규칙의 번호(1부터). 없으면 기본 정책으로 정해졌다 */
  readonly rule?: number;
}

/** 프레임에서 필터가 볼 값을 꺼낸다. IPv4가 아니면 undefined (ARP는 iptables가 보지 않는다) */
export function filterPacketOf(snapshot: Pick<FrameSnapshot, "ipv4" | "icmp" | "udp">): FilterPacket | undefined {
  const { ipv4, icmp, udp } = snapshot;
  if (ipv4 === undefined) return undefined;
  const base = { sourceIp: ipv4.sourceIp, destinationIp: ipv4.destinationIp };
  if (icmp !== undefined) return { ...base, protocol: "icmp", icmpType: icmp.type };
  if (udp !== undefined) return { ...base, protocol: "udp", sourcePort: udp.sourcePort, destinationPort: udp.destinationPort };
  return base;
}

function portMatches(range: string | undefined, port: number | undefined): boolean {
  if (range === undefined) return true;
  const parsed = parsePortRange(range);
  return parsed !== null && port !== undefined && port >= parsed[0] && port <= parsed[1];
}

export function ruleMatches(rule: FirewallRule, packet: FilterPacket, ports: FilterPorts): boolean {
  return (rule.protocol === undefined || rule.protocol === packet.protocol) &&
    (rule.source === undefined || cidrContains(rule.source, packet.sourceIp)) &&
    (rule.destination === undefined || cidrContains(rule.destination, packet.destinationIp)) &&
    (rule.inInterface === undefined || rule.inInterface === ports.inPort) &&
    (rule.outInterface === undefined || rule.outInterface === ports.outPort) &&
    (rule.icmpType === undefined || rule.icmpType === packet.icmpType) &&
    portMatches(rule.sourcePort, packet.sourcePort) &&
    portMatches(rule.destinationPort, packet.destinationPort);
}

export function evaluateChain(chain: FirewallChainConfig, packet: FilterPacket, ports: FilterPorts): FilterVerdict {
  const index = chain.rules.findIndex((rule) => ruleMatches(rule, packet, ports));
  return index < 0 ? { target: chain.policy } : { target: chain.rules[index]!.target, rule: index + 1 };
}
