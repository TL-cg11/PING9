// `iptables` 한 줄의 실행과 출력 (T14.2.1, T0.21부터 서버로 쓰는 PC의 명령). 규칙을 바꾸는 명령은 `firewall/*` Command를 낸다 (AD-3).
// 보는 명령(`-L`, `-S`)은 Document의 필터를 실제 iptables의 모양으로 쓴다.
// 실제와 다른 점: 규칙이 토폴로지에 저장된다 (실제는 재부팅하면 사라진다). 패킷·바이트 수는 세지 않아 `-v`에 그 칸이 없다.

import {
  FIREWALL_CHAINS, FIREWALL_ICMP_TYPE_NUMBERS, filterOf, firewallInterfaceName, firewallRuleSpec, normalizeFirewallRule,
} from "@ping9/shared";
import type { Command, ConsoleLine, DispatchResult, FirewallChain, FirewallRule, PcDevice, PcFilter } from "@ping9/shared";

import { linesFromDispatch } from "../ios";
import type { Word } from "../ios/parse";
import { parseIptables } from "./iptables";
import type { ListOptions } from "./iptables";

const text = (value: string): ConsoleLine => ({ kind: "text", text: value });

export const IPTABLES_USAGE: readonly string[] = [
  "Usage: iptables -[AD] chain rule-specification",
  "       iptables -I chain [rulenum] rule-specification",
  "       iptables -D chain rulenum",
  "       iptables -[LS] [chain] [-n] [-v] [--line-numbers]",
  "       iptables -F [chain]",
  "       iptables -P chain ACCEPT|DROP",
  "",
  "Chains: INPUT (to this server), OUTPUT (from this server), FORWARD (unused: a server does not forward)",
  "Rule:   [-p icmp|tcp|udp|all] [-s address[/len]] [-d address[/len]]",
  "        [-i eth0] [-o eth0]",
  "        [--icmp-type echo-request|echo-reply|destination-unreachable|time-exceeded]",
  "        [--sport port[:port]] [--dport port[:port]]",
  "        -j ACCEPT|DROP|REJECT",
];

/** `-L`의 주소 칸. `/32`는 주소만, 조건이 없으면 `anywhere`(`-n`이면 `0.0.0.0/0`) */
function addressText(cidr: string | undefined, numeric: boolean): string {
  if (cidr === undefined) return numeric ? "0.0.0.0/0" : "anywhere";
  return cidr.endsWith("/32") ? cidr.slice(0, -3) : cidr;
}

/** `80` → `dpt:80`, `1000:2000` → `dpts:1000:2000` */
function portText(prefix: "spt" | "dpt", range: string): string {
  return `${prefix}${range.includes(":") ? "s" : ""}:${range}`;
}

/** `-L`의 줄 끝에 붙는 조건 */
function extraText(rule: FirewallRule, numeric: boolean): string {
  const parts: string[] = [];
  if (rule.icmpType !== undefined) {
    parts.push(numeric ? `icmptype ${FIREWALL_ICMP_TYPE_NUMBERS[rule.icmpType]}` : `icmp ${rule.icmpType}`);
  }
  if (rule.sourcePort !== undefined || rule.destinationPort !== undefined) {
    parts.push(rule.protocol ?? "tcp");
    if (rule.sourcePort !== undefined) parts.push(portText("spt", rule.sourcePort));
    if (rule.destinationPort !== undefined) parts.push(portText("dpt", rule.destinationPort));
  }
  if (rule.target === "REJECT") parts.push("reject-with icmp-port-unreachable");
  return parts.join(" ");
}

function chainLines(chain: FirewallChain, filter: PcFilter, options: ListOptions): string[] {
  const { policy, rules } = filter[chain];
  const interfaces = options.verbose ? `${"in".padEnd(6)} ${"out".padEnd(6)} ` : "";
  const header = `${options.lineNumbers ? "num  " : ""}${"target".padEnd(10)} ${"prot"} opt ${interfaces}${"source".padEnd(20)} destination`;
  return [
    `Chain ${chain} (policy ${policy})`,
    header,
    ...rules.map((rule, index) => {
      const ports = options.verbose
        ? `${(rule.inInterface === undefined ? "*" : firewallInterfaceName(rule.inInterface)).padEnd(6)} ` +
          `${(rule.outInterface === undefined ? "*" : firewallInterfaceName(rule.outInterface)).padEnd(6)} `
        : "";
      return (
        `${options.lineNumbers ? `${String(index + 1).padEnd(4)} ` : ""}${rule.target.padEnd(10)} ${(rule.protocol ?? "all").padEnd(4)} --  ` +
        `${ports}${addressText(rule.source, options.numeric).padEnd(20)} ${addressText(rule.destination, options.numeric).padEnd(20)} ` +
        extraText(rule, options.numeric)
      ).trimEnd();
    }),
  ];
}

/** `iptables -L`. 체인 사이에 빈 줄을 둔다 */
export function listLines(filter: PcFilter, chain: FirewallChain | undefined, options: ListOptions): string[] {
  const chains = chain === undefined ? FIREWALL_CHAINS : [chain];
  return chains.flatMap((name, index) => [...(index === 0 ? [] : [""]), ...chainLines(name, filter, options)]);
}

/** `iptables -S`. 정책 줄이 먼저, 그 뒤에 규칙 줄. 앞에 `iptables `를 붙이면 다시 입력할 수 있다 */
export function ruleSpecLines(filter: PcFilter, chain: FirewallChain | undefined): string[] {
  const chains = chain === undefined ? FIREWALL_CHAINS : [chain];
  return [
    ...chains.map((name) => `-P ${name} ${filter[name].policy}`),
    ...chains.flatMap((name) => filter[name].rules.map((rule) => `-A ${name} ${firewallRuleSpec(rule)}`)),
  ];
}

const sameRule = (a: FirewallRule, b: FirewallRule): boolean =>
  JSON.stringify(normalizeFirewallRule(a)) === JSON.stringify(normalizeFirewallRule(b));

/** `words`는 `iptables`를 뺀 나머지 단어다 */
export function runIptables(
  words: readonly Word[],
  device: PcDevice,
  dispatch: (command: Command) => DispatchResult,
): readonly ConsoleLine[] {
  const parsed = parseIptables(words);
  if (!parsed.ok) {
    return [parsed.position === undefined ? { kind: "error", ...parsed.error } : { kind: "error", ...parsed.error, position: parsed.position }];
  }
  const { command } = parsed;
  const filter = filterOf(device.config);
  const deviceId = device.id;

  switch (command.kind) {
    case "help":
      return IPTABLES_USAGE.map(text);
    case "list":
      return listLines(filter, command.chain, command).map(text);
    case "list-rules":
      return ruleSpecLines(filter, command.chain).map(text);
    case "flush":
      return linesFromDispatch(dispatch({ type: "firewall/flush-rules", deviceId, ...(command.chain === undefined ? {} : { chain: command.chain }) }));
    case "policy":
      return linesFromDispatch(dispatch({ type: "firewall/set-policy", deviceId, chain: command.chain, policy: command.policy }));
    case "append":
      return linesFromDispatch(dispatch({ type: "firewall/add-rule", deviceId, chain: command.chain, rule: command.rule }));
    case "insert":
      return linesFromDispatch(dispatch({ type: "firewall/add-rule", deviceId, chain: command.chain, rule: command.rule, index: command.index }));
    case "delete":
      return linesFromDispatch(dispatch({ type: "firewall/remove-rule", deviceId, chain: command.chain, index: command.index }));
    case "delete-rule": {
      const index = filter[command.chain].rules.findIndex((rule) => sameRule(rule, command.rule));
      // 실제 iptables의 문구
      if (index < 0) return [text("iptables: Bad rule (does a matching rule exist in that chain?).")];
      return linesFromDispatch(dispatch({ type: "firewall/remove-rule", deviceId, chain: command.chain, index: index + 1 }));
    }
  }
}
