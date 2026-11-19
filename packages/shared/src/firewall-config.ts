// 서버로 쓰는 PC의 패킷 필터 규칙 (T14.2.1에서 만들고 T0.21에서 Firewall 장비 대신 서버로 옮겼다).
// 문서 불러오기(validateDocument)와 reducer, CLI가 같은 함수를 쓴다.
// 필터는 iptables의 filter 테이블을 본뜬 무상태 패킷 필터다 (02 문서 F1).
// 서버는 포트가 하나인 호스트라 INPUT(서버로 온 것)과 OUTPUT(서버가 보내는 것)만 패킷을 본다.
// FORWARD 체인은 실제 Linux처럼 있고 규칙도 넣을 수 있지만, 서버가 패킷을 전달하지 않아 맞는 패킷이 없다.

import { errorInfo } from "./codes";
import type { ErrorInfo } from "./codes";
import { FIREWALL_CHAINS, PORT_NAMES, isPortName } from "./document";
import type { FirewallChain, FirewallChainConfig, FirewallRule, PcConfig, PcFilter } from "./document";
import { LIMITS } from "./limits";
import { formatIpv4, parseIpv4 } from "./values";

/** 처음 상태의 필터: 세 체인 모두 정책 ACCEPT, 규칙 없음 (실제 iptables의 처음 상태) */
export const EMPTY_FIREWALL_FILTER: PcFilter = {
  INPUT: { policy: "ACCEPT", rules: [] },
  FORWARD: { policy: "ACCEPT", rules: [] },
  OUTPUT: { policy: "ACCEPT", rules: [] },
};

/**
 * 지금 적용되는 필터. 서버가 아니면 규칙이 문서에 남아 있어도 적용하지 않는다 (서비스와 같은 규칙).
 * 서버인데 `filter` 칸이 없으면 처음 상태다
 */
export function filterOf(config: PcConfig): PcFilter {
  return config.os === "server" ? (config.filter ?? EMPTY_FIREWALL_FILTER) : EMPTY_FIREWALL_FILTER;
}

/** 패킷을 막을 수 있는 필터인지: INPUT이나 OUTPUT에 규칙이 있거나 기본 정책이 ACCEPT가 아니다. 화면이 방패를 보일지 정한다 */
export function hasActiveFilter(config: PcConfig): boolean {
  const filter = filterOf(config);
  return (["INPUT", "OUTPUT"] as const).some((chain) => filter[chain].rules.length > 0 || filter[chain].policy !== "ACCEPT");
}

const PREFIX_LENGTH = /^(0|[1-9][0-9]?)$/;

/** `-s`·`-d`의 값을 `네트워크/길이`로 맞춘다 (`10.0.0.7/24` → `10.0.0.0/24`, `10.0.0.7` → `10.0.0.7/32`). 틀리면 null */
export function normalizeCidr(value: string): string | null {
  const slash = value.indexOf("/");
  const address = parseIpv4(slash < 0 ? value : value.slice(0, slash));
  const lengthText = slash < 0 ? "32" : value.slice(slash + 1);
  if (address === null || !PREFIX_LENGTH.test(lengthText)) return null;
  const length = Number(lengthText);
  if (length > 32) return null;
  const size = 2 ** (32 - length);
  return `${formatIpv4(Math.floor(address / size) * size)}/${length}`;
}

/** 주소가 `네트워크/길이` 안에 있는지. 형식이 틀리면 false */
export function cidrContains(cidr: string, ip: string): boolean {
  const [network = "", lengthText = ""] = cidr.split("/");
  const base = parseIpv4(network);
  const address = parseIpv4(ip);
  if (base === null || address === null || !PREFIX_LENGTH.test(lengthText)) return false;
  const length = Number(lengthText);
  if (length > 32) return false;
  const size = 2 ** (32 - length);
  return Math.floor(address / size) === Math.floor(base / size);
}

/** `80`이나 `1000:2000`을 [처음, 끝]으로. 틀리면 null */
export function parsePortRange(value: string): readonly [number, number] | null {
  const match = /^(0|[1-9][0-9]{0,4})(?::(0|[1-9][0-9]{0,4}))?$/.exec(value);
  if (match === null) return null;
  const first = Number(match[1]);
  const last = match[2] === undefined ? first : Number(match[2]);
  return first > 65535 || last > 65535 || first > last ? null : [first, last];
}

/** 규칙 하나가 그 체인에 넣을 수 있는 모양인지. `deviceId`는 오류에 담는다 */
export function checkFirewallRule(deviceId: string, chain: FirewallChain, rule: FirewallRule): ErrorInfo | null {
  for (const cidr of [rule.source, rule.destination]) {
    if (cidr !== undefined && normalizeCidr(cidr) !== cidr) return errorInfo("INVALID_IPV4", { value: cidr });
  }
  for (const port of [rule.inInterface, rule.outInterface]) {
    if (port !== undefined && !isPortName("pc", port)) {
      return errorInfo("UNKNOWN_PORT", { deviceId, kind: "pc", port });
    }
  }
  if (rule.inInterface !== undefined && chain === "OUTPUT") return errorInfo("FIREWALL_RULE_INVALID", { reason: "in-interface" });
  if (rule.outInterface !== undefined && chain === "INPUT") return errorInfo("FIREWALL_RULE_INVALID", { reason: "out-interface" });
  if (rule.icmpType !== undefined && rule.protocol !== "icmp") return errorInfo("FIREWALL_RULE_INVALID", { reason: "icmp-type" });
  for (const port of [rule.sourcePort, rule.destinationPort]) {
    if (port === undefined) continue;
    if (rule.protocol !== "tcp" && rule.protocol !== "udp") return errorInfo("FIREWALL_RULE_INVALID", { reason: "port" });
    if (parsePortRange(port) === null) return errorInfo("FIREWALL_PORT_INVALID", { value: port });
  }
  return null;
}

/** PC 구성의 `filter` 칸. 문서 불러오기와 reducer가 같은 규칙을 쓴다. 칸의 형태는 스키마가 본다 */
export function checkPcFilter(deviceId: string, config: PcConfig): ErrorInfo | null {
  const { filter } = config;
  if (filter === undefined) return null;
  for (const chain of FIREWALL_CHAINS) {
    const { rules } = filter[chain];
    if (rules.length > LIMITS.maxFirewallRulesPerChain) {
      return errorInfo("LIMIT_EXCEEDED", { limit: "firewallRules", max: LIMITS.maxFirewallRulesPerChain });
    }
    for (const rule of rules) {
      const error = checkFirewallRule(deviceId, chain, rule);
      if (error !== null) return error;
    }
  }
  return null;
}

/** 모든 주소. 조건이 없는 것과 같다 */
const ANY_ADDRESS = "0.0.0.0/0";

/** 없는 칸은 빼고, 있는 칸은 정해진 순서로. `0.0.0.0/0`인 주소 조건은 없는 것과 같아 뺀다 */
export function normalizeFirewallRule(rule: FirewallRule): FirewallRule {
  return {
    ...(rule.protocol === undefined ? {} : { protocol: rule.protocol }),
    ...(rule.source === undefined || rule.source === ANY_ADDRESS ? {} : { source: rule.source }),
    ...(rule.destination === undefined || rule.destination === ANY_ADDRESS ? {} : { destination: rule.destination }),
    ...(rule.inInterface === undefined ? {} : { inInterface: rule.inInterface }),
    ...(rule.outInterface === undefined ? {} : { outInterface: rule.outInterface }),
    ...(rule.icmpType === undefined ? {} : { icmpType: rule.icmpType }),
    ...(rule.sourcePort === undefined ? {} : { sourcePort: rule.sourcePort }),
    ...(rule.destinationPort === undefined ? {} : { destinationPort: rule.destinationPort }),
    target: rule.target,
  };
}

function normalizeChain(chain: FirewallChainConfig): FirewallChainConfig {
  return { policy: chain.policy, rules: chain.rules.map(normalizeFirewallRule) };
}

/** 체인의 순서와 규칙의 칸 순서를 맞춘다. 같은 필터는 늘 같은 JSON이 된다 */
export function normalizeFilter(filter: PcFilter): PcFilter {
  return {
    INPUT: normalizeChain(filter.INPUT),
    FORWARD: normalizeChain(filter.FORWARD),
    OUTPUT: normalizeChain(filter.OUTPUT),
  };
}

/** 서버의 포트 하나 */
const SERVER_PORT = PORT_NAMES.pc[0];

/** 콘솔에 보이는 인터페이스 이름. `Ethernet0` → `eth0`. 서버의 포트가 아니면 받은 글 그대로 */
export function firewallInterfaceName(port: string): string {
  return port === SERVER_PORT ? "eth0" : port;
}

/** `eth0` → `Ethernet0`. 서버에는 인터페이스가 하나다. 없는 이름이면 undefined */
export function firewallPortOf(name: string): string | undefined {
  return name === "eth0" ? SERVER_PORT : undefined;
}

/** ICMP 종류의 번호. `iptables -S`가 번호로 보인다 */
export const FIREWALL_ICMP_TYPE_NUMBERS = {
  "echo-reply": 0,
  "destination-unreachable": 3,
  "echo-request": 8,
  "time-exceeded": 11,
} as const;

/**
 * 규칙의 조건과 대상을 `iptables -S`의 순서로 쓴 글 (`-s 10.0.0.0/24 -i eth0 -p icmp -m icmp --icmp-type 8 -j DROP`).
 * 앞에 `iptables -A <체인> `을 붙이면 그대로 다시 입력할 수 있다. 콘솔과 속성 패널이 같은 글을 쓴다
 */
export function firewallRuleSpec(rule: FirewallRule): string {
  const parts: string[] = [];
  if (rule.source !== undefined) parts.push("-s", rule.source);
  if (rule.destination !== undefined) parts.push("-d", rule.destination);
  if (rule.inInterface !== undefined) parts.push("-i", firewallInterfaceName(rule.inInterface));
  if (rule.outInterface !== undefined) parts.push("-o", firewallInterfaceName(rule.outInterface));
  if (rule.protocol !== undefined) parts.push("-p", rule.protocol);
  if (rule.icmpType !== undefined) parts.push("-m", "icmp", "--icmp-type", String(FIREWALL_ICMP_TYPE_NUMBERS[rule.icmpType]));
  if (rule.sourcePort !== undefined || rule.destinationPort !== undefined) {
    parts.push("-m", rule.protocol ?? "tcp");
    if (rule.sourcePort !== undefined) parts.push("--sport", rule.sourcePort);
    if (rule.destinationPort !== undefined) parts.push("--dport", rule.destinationPort);
  }
  parts.push("-j", rule.target);
  return parts.join(" ");
}
