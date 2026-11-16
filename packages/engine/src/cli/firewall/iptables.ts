// `iptables` 한 줄의 해석 (T14.2.1). 옵션의 순서가 자유로워 명령 정의(cli/ios)의 자리 맞추기로는 읽을 수 없다.
// 그래서 단어 목록을 직접 읽는다. filter 테이블과 기본 체인 셋(INPUT, FORWARD, OUTPUT)만 다룬다.
// 다루지 않는 것(다른 테이블, `-m state`, 사용자 체인, `!` 부정)은 `IPTABLES_UNSUPPORTED`로 알린다.

import {
  FIREWALL_CHAINS,
  FIREWALL_ICMP_TYPE_NUMBERS,
  errorInfo,
  firewallPortOf,
  normalizeCidr,
  parsePortRange,
} from "@ping9/shared";
import type { ErrorInfo, FirewallChain, FirewallPolicy, FirewallRule, FirewallTarget } from "@ping9/shared";

import type { Word } from "../ios/parse";

/** 조건만 있고 대상이 아직 없는 규칙 */
type RuleDraft = { -readonly [K in keyof FirewallRule]?: FirewallRule[K] };

export interface ListOptions {
  /** `-n`. 주소를 수로만 보인다 (`anywhere` 대신 `0.0.0.0/0`) */
  readonly numeric: boolean;
  /** `-v`. 인터페이스 칸을 보인다 */
  readonly verbose: boolean;
  readonly lineNumbers: boolean;
}

export type IptablesCommand =
  | { readonly kind: "append"; readonly chain: FirewallChain; readonly rule: FirewallRule }
  | { readonly kind: "insert"; readonly chain: FirewallChain; readonly index: number; readonly rule: FirewallRule }
  | { readonly kind: "delete"; readonly chain: FirewallChain; readonly index: number }
  /** 번호 대신 규칙을 그대로 써서 지운다 (`-D INPUT -p icmp -j DROP`) */
  | { readonly kind: "delete-rule"; readonly chain: FirewallChain; readonly rule: FirewallRule }
  | ({ readonly kind: "list"; readonly chain?: FirewallChain } & ListOptions)
  | { readonly kind: "list-rules"; readonly chain?: FirewallChain }
  | { readonly kind: "flush"; readonly chain?: FirewallChain }
  | { readonly kind: "policy"; readonly chain: FirewallChain; readonly policy: FirewallPolicy }
  | { readonly kind: "help" };

export type IptablesParse =
  | { readonly ok: true; readonly command: IptablesCommand }
  | { readonly ok: false; readonly error: ErrorInfo; readonly position?: number };

const clip = (text: string): string => (text.length > 64 ? text.slice(0, 64) : text);

/** 긴 이름을 짧은 옵션으로 */
const LONG_OPTIONS: Readonly<Record<string, string>> = {
  "--append": "-A", "--insert": "-I", "--delete": "-D", "--list": "-L", "--list-rules": "-S", "--flush": "-F",
  "--policy": "-P", "--help": "-h", "--table": "-t", "--protocol": "-p", "--source": "-s", "--src": "-s",
  "--destination": "-d", "--dst": "-d", "--in-interface": "-i", "--out-interface": "-o", "--jump": "-j",
  "--match": "-m", "--numeric": "-n", "--verbose": "-v", "--destination-port": "--dport", "--source-port": "--sport",
};

/** iptables에는 있지만 PING9이 다루지 않는 명령 */
const UNSUPPORTED_COMMANDS = new Set(["-N", "-X", "-E", "-R", "-C", "-Z", "-g", "-f", "-w", "-c",
  "--new-chain", "--delete-chain", "--rename-chain", "--replace", "--check", "--zero", "--goto", "--fragment"]);

const ICMP_TYPES: Readonly<Record<string, NonNullable<FirewallRule["icmpType"]>>> = {
  ...Object.fromEntries(Object.entries(FIREWALL_ICMP_TYPE_NUMBERS).map(([name, number]) => [String(number), name])),
  ...Object.fromEntries(Object.keys(FIREWALL_ICMP_TYPE_NUMBERS).map((name) => [name, name])),
  ping: "echo-request",
  pong: "echo-reply",
} as Readonly<Record<string, NonNullable<FirewallRule["icmpType"]>>>;

const PROTOCOLS: Readonly<Record<string, FirewallRule["protocol"] | "all">> = {
  icmp: "icmp", tcp: "tcp", udp: "udp", all: "all", "0": "all", "1": "icmp", "6": "tcp", "17": "udp",
};

const TARGETS: readonly FirewallTarget[] = ["ACCEPT", "DROP", "REJECT"];

/**
 * 표에서 자기 키만 찾는다. `table[word]`는 `constructor`, `toString` 같은 단어에 Object.prototype의 것을 돌려줘
 * 뒤에서 예외가 난다 (AD-16)
 */
function lookup<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

/** `-nvL`처럼 붙여 쓴 짧은 옵션을 하나씩 나눈다. 값이 따라오는 옵션(`-L`, `-S`, `-F`)은 맨 뒤로 보낸다 */
function expand(words: readonly Word[]): Word[] {
  return words.flatMap((word): Word[] => {
    if (!/^-[nvLSF]{2,}$/.test(word.text)) return [word];
    const letters = [...word.text.slice(1)];
    const flags = letters.filter((letter) => letter === "n" || letter === "v");
    const commands = letters.filter((letter) => letter !== "n" && letter !== "v");
    return [...flags, ...commands].map((letter) => ({ text: `-${letter}`, position: word.position }));
  });
}

/**
 * `iptables` 뒤의 단어들을 읽는다. `words`는 `iptables`를 뺀 나머지다.
 * 형식이 틀린 단어는 그 위치와 함께 돌려줘 콘솔이 `^`로 가리킨다
 */
export function parseIptables(input: readonly Word[]): IptablesParse {
  const words = expand(input).map((word) => ({ ...word, text: lookup(LONG_OPTIONS, word.text) ?? word.text }));
  const invalid = (word: Word): IptablesParse =>
    ({ ok: false, error: errorInfo("CLI_INVALID_VALUE", { token: clip(word.text) }), position: word.position });
  const unsupported = (word: Word, token = word.text): IptablesParse =>
    ({ ok: false, error: errorInfo("IPTABLES_UNSUPPORTED", { token: clip(token) }), position: word.position });
  const incomplete: IptablesParse = { ok: false, error: errorInfo("CLI_INCOMPLETE_COMMAND", {}) };

  let action: { readonly option: string; readonly word: Word; chain?: FirewallChain; index?: number; policy?: FirewallPolicy } | undefined;
  const rule: RuleDraft = {};
  let firstRuleOption: Word | undefined;
  const list = { numeric: false, verbose: false, lineNumbers: false };

  let at = 0;
  /** 옵션의 값. 없거나 다음 옵션이면 undefined */
  const value = (): Word | undefined => {
    const next = words[at];
    if (next === undefined) return undefined;
    at += 1;
    return next;
  };
  /** 체인 이름. 사용자 체인은 다루지 않는다 */
  const readChain = (word: Word): FirewallChain | undefined =>
    (FIREWALL_CHAINS as readonly string[]).includes(word.text) ? (word.text as FirewallChain) : undefined;

  while (at < words.length) {
    const word = words[at]!;
    at += 1;
    const option = word.text;

    if (option === "-h") return { ok: true, command: { kind: "help" } };
    if (option === "!") return unsupported(word);
    if (UNSUPPORTED_COMMANDS.has(option)) return unsupported(word);

    if (option === "-t") {
      const table = value();
      if (table === undefined) return incomplete;
      if (table.text !== "filter") return unsupported(table, `-t ${table.text}`);
      continue;
    }

    if (["-A", "-I", "-D", "-L", "-S", "-F", "-P"].includes(option)) {
      // 명령은 하나만
      if (action !== undefined) return { ok: false, error: errorInfo("IPTABLES_NO_COMMAND", {}), position: word.position };
      action = { option, word };
      const next = words[at];
      const optional = option === "-L" || option === "-S" || option === "-F";
      if (next === undefined || next.text.startsWith("-")) {
        if (optional) continue;
        return incomplete;
      }
      at += 1;
      const chain = readChain(next);
      if (chain === undefined) return /^[A-Za-z][A-Za-z0-9_-]*$/.test(next.text) ? unsupported(next) : invalid(next);
      action.chain = chain;

      if (option === "-I" || option === "-D") {
        const number = words[at];
        if (number !== undefined && /^[0-9]+$/.test(number.text)) {
          at += 1;
          if (!/^[1-9][0-9]{0,3}$/.test(number.text)) return invalid(number);
          action.index = Number(number.text);
        }
      }
      if (option === "-P") {
        const policy = value();
        if (policy === undefined) return incomplete;
        if (policy.text !== "ACCEPT" && policy.text !== "DROP") return invalid(policy);
        action.policy = policy.text;
      }
      continue;
    }

    if (option === "-n") { list.numeric = true; continue; }
    if (option === "-v") { list.verbose = true; continue; }
    if (option === "--line-numbers") { list.lineNumbers = true; continue; }

    // 여기부터는 규칙의 조건과 대상이다
    firstRuleOption ??= word;
    const next = value();
    switch (option) {
      case "-p": {
        if (next === undefined) return incomplete;
        const protocol = lookup(PROTOCOLS, next.text.toLowerCase());
        if (protocol === undefined) return invalid(next);
        if (protocol === "all") delete rule.protocol;
        else rule.protocol = protocol;
        break;
      }
      case "-s":
      case "-d": {
        if (next === undefined) return incomplete;
        const cidr = normalizeCidr(next.text);
        if (cidr === null) {
          return { ok: false, error: errorInfo("INVALID_IPV4", { value: clip(next.text) }), position: next.position };
        }
        const key = option === "-s" ? "source" : "destination";
        // `0.0.0.0/0`은 조건이 없는 것과 같다
        if (cidr === "0.0.0.0/0") delete rule[key];
        else rule[key] = cidr;
        break;
      }
      case "-i":
      case "-o": {
        if (next === undefined) return incomplete;
        const port = firewallPortOf(next.text);
        if (port === undefined) return next.text === "lo" ? unsupported(next) : invalid(next);
        rule[option === "-i" ? "inInterface" : "outInterface"] = port;
        break;
      }
      case "-j": {
        if (next === undefined) return incomplete;
        if (!(TARGETS as readonly string[]).includes(next.text)) {
          return /^[A-Z]+$/.test(next.text) ? unsupported(next) : invalid(next);
        }
        rule.target = next.text as FirewallTarget;
        break;
      }
      case "-m": {
        if (next === undefined) return incomplete;
        // `-m icmp`, `-m tcp`, `-m udp`는 `-p`와 같은 뜻이라 받고 넘긴다. 연결 상태 같은 다른 모듈은 없다
        if (!["icmp", "tcp", "udp"].includes(next.text)) return unsupported(next, `-m ${next.text}`);
        break;
      }
      case "--icmp-type": {
        if (next === undefined) return incomplete;
        if (next.text === "any") { delete rule.icmpType; break; }
        const type = lookup(ICMP_TYPES, next.text);
        if (type === undefined) return invalid(next);
        rule.icmpType = type;
        break;
      }
      case "--dport":
      case "--sport": {
        if (next === undefined) return incomplete;
        if (parsePortRange(next.text) === null) {
          return { ok: false, error: errorInfo("FIREWALL_PORT_INVALID", { value: clip(next.text) }), position: next.position };
        }
        rule[option === "--dport" ? "destinationPort" : "sourcePort"] = next.text;
        break;
      }
      case "--reject-with":
        // ICMP 오류의 종류는 하나뿐이라 값은 읽고 버린다
        if (next === undefined) return incomplete;
        break;
      default:
        return invalid(word);
    }
  }

  if (action === undefined) return { ok: false, error: errorInfo("IPTABLES_NO_COMMAND", {}) };
  const { option, chain } = action;
  const takesRule = option === "-A" || option === "-I" || (option === "-D" && action.index === undefined);
  if (!takesRule && firstRuleOption !== undefined) return invalid(firstRuleOption);

  switch (option) {
    case "-L":
      return { ok: true, command: { kind: "list", ...(chain === undefined ? {} : { chain }), ...list } };
    case "-S":
      return { ok: true, command: { kind: "list-rules", ...(chain === undefined ? {} : { chain }) } };
    case "-F":
      return { ok: true, command: { kind: "flush", ...(chain === undefined ? {} : { chain }) } };
    case "-P":
      return { ok: true, command: { kind: "policy", chain: chain!, policy: action.policy! } };
    case "-D":
      if (action.index !== undefined) return { ok: true, command: { kind: "delete", chain: chain!, index: action.index } };
      break;
    default:
      break;
  }

  // 규칙을 받는 명령은 대상(`-j`)이 있어야 한다
  if (rule.target === undefined) return incomplete;
  const complete = rule as FirewallRule;
  if (option === "-D") return { ok: true, command: { kind: "delete-rule", chain: chain!, rule: complete } };
  if (option === "-I") return { ok: true, command: { kind: "insert", chain: chain!, index: action.index ?? 1, rule: complete } };
  return { ok: true, command: { kind: "append", chain: chain!, rule: complete } };
}
