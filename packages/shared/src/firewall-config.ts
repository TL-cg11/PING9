// Firewall의 구성 규칙 (T14.2.1). 문서 불러오기(validateDocument)와 reducer, CLI가 같은 함수를 쓴다.
// 필터는 iptables의 filter 테이블을 본뜬 무상태 패킷 필터다 (02 문서 F1).

import { errorInfo } from "./codes";
import type { ErrorInfo } from "./codes";
import { FIREWALL_CHAINS, PORT_NAMES, isPortName } from "./document";
import type { FirewallChain, FirewallChainConfig, FirewallConfig, FirewallRule, RouterInterfaceConfig } from "./document";
import { LIMITS } from "./limits";
import { checkStaticRoute } from "./router-config";
import { checkInterfaceAddress, formatIpv4, networksOverlap, parseIpv4, prefixLengthToMask } from "./values";

/** 새 Firewall의 필터: 세 체인 모두 정책 ACCEPT, 규칙 없음 (실제 iptables의 처음 상태) */
export const EMPTY_FIREWALL_FILTER: FirewallConfig["filter"] = {
  INPUT: { policy: "ACCEPT", rules: [] },
  FORWARD: { policy: "ACCEPT", rules: [] },
  OUTPUT: { policy: "ACCEPT", rules: [] },
};

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

/** `네트워크/길이`를 네트워크와 마스크로. `ip route add 10.0.0.0/24 via ...`가 쓴다. 틀리면 null */
export function cidrToNetworkAndMask(cidr: string): { readonly network: string; readonly mask: string } | null {
  const [network = "", lengthText = ""] = cidr.split("/");
  const mask = PREFIX_LENGTH.test(lengthText) ? prefixLengthToMask(Number(lengthText)) : null;
  return parseIpv4(network) === null || mask === null ? null : { network, mask };
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
    if (port !== undefined && !isPortName("firewall", port)) {
      return errorInfo("UNKNOWN_PORT", { deviceId, kind: "firewall", port });
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

/** 꺼진 인터페이스도 겹침 검사 대상이다 (Router와 같은 규칙, FR-27) */
export function checkFirewallInterfaceOverlap(
  deviceId: string,
  port: string,
  ip: string,
  mask: string,
  interfaces: Readonly<Record<string, RouterInterfaceConfig>>,
): ErrorInfo<"INTERFACE_NETWORK_OVERLAP"> | null {
  for (const otherPort of PORT_NAMES.firewall) {
    const other = interfaces[otherPort];
    if (otherPort === port || other?.ip === undefined || other.mask === undefined) continue;
    if (networksOverlap(ip, mask, other.ip, other.mask)) {
      return errorInfo("INTERFACE_NETWORK_OVERLAP", { deviceId, port, otherPort, ip, mask });
    }
  }
  return null;
}

/** 문서 불러오기와 reducer가 같은 규칙을 쓴다. `path`는 형태 오류의 위치에 쓴다 */
export function checkFirewallConfig(deviceId: string, config: FirewallConfig, path: string): ErrorInfo | null {
  const shape = (where: string) => errorInfo("DOCUMENT_INVALID_SHAPE", { path: `${path}.${where}`.slice(0, 200) });

  for (const [port, iface] of Object.entries(config.interfaces)) {
    if (!isPortName("firewall", port)) return errorInfo("UNKNOWN_PORT", { deviceId, kind: "firewall", port });
    if ((iface.ip === undefined) !== (iface.mask === undefined)) return shape(`interfaces.${port}`);
    if (iface.ip !== undefined && iface.mask !== undefined) {
      const error = checkInterfaceAddress(iface.ip, iface.mask) ??
        checkFirewallInterfaceOverlap(deviceId, port, iface.ip, iface.mask, config.interfaces);
      if (error !== null) return error;
    }
  }

  if (config.staticRoutes.length > LIMITS.maxStaticRoutesPerRouter) {
    return errorInfo("LIMIT_EXCEEDED", { limit: "staticRoutes", max: LIMITS.maxStaticRoutesPerRouter });
  }
  for (const route of config.staticRoutes) {
    // Firewall의 경로에는 AD가 없다
    if (route.distance !== undefined) return shape("staticRoutes");
    const error = checkStaticRoute(deviceId, route, config.interfaces);
    if (error !== null) return error;
  }

  for (const chain of FIREWALL_CHAINS) {
    const { rules } = config.filter[chain];
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

/** 인터페이스를 포트 순서대로 채우고 규칙의 칸 순서를 맞춘다. 같은 구성은 늘 같은 JSON이 된다 */
export function normalizeFirewallConfig(config: FirewallConfig): FirewallConfig {
  return {
    interfaces: Object.fromEntries(PORT_NAMES.firewall.map((port) => {
      const iface = config.interfaces[port];
      return [port, {
        adminUp: iface?.adminUp ?? true,
        ...(iface?.ip !== undefined && iface.mask !== undefined ? { ip: iface.ip, mask: iface.mask } : {}),
      }];
    })),
    staticRoutes: config.staticRoutes.map(({ network, mask, nextHop }) => ({ network, mask, nextHop })),
    filter: {
      INPUT: normalizeChain(config.filter.INPUT),
      FORWARD: normalizeChain(config.filter.FORWARD),
      OUTPUT: normalizeChain(config.filter.OUTPUT),
    },
  };
}

/** 콘솔에 보이는 인터페이스 이름. `Ethernet2` → `eth2`. Firewall 포트가 아니면 받은 글 그대로 */
export function firewallInterfaceName(port: string): string {
  const index = (PORT_NAMES.firewall as readonly string[]).indexOf(port);
  return index < 0 ? port : `eth${index}`;
}

/** `eth2` → `Ethernet2`. 없는 이름이면 undefined */
export function firewallPortOf(name: string): string | undefined {
  const match = /^eth([0-9])$/.exec(name);
  return match === null ? undefined : PORT_NAMES.firewall[Number(match[1])];
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
