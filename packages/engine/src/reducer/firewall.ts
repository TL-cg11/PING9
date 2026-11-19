// reducer: 서버로 쓰는 PC의 필터 규칙 (T14.2.1, T0.21). `firewall/add-rule`, `remove-rule`, `flush-rules`, `set-policy`.
// 서버 콘솔의 `iptables`가 이 Command를 낸다 (AD-3). 종류가 Server인 PC에만 쓴다.
// 처음에는 Firewall 장비의 처리기였다. T0.21에서 그 장비를 없애고 규칙을 PC 구성의 `filter` 칸으로 옮겼다.
// 다른 종류로 바꿔도 규칙은 문서에 남아, 다시 Server로 고르면 그대로다 (서비스와 같다).

import {
  EMPTY_FIREWALL_FILTER,
  FIREWALL_CHAINS,
  FIREWALL_ICMP_TYPES,
  FIREWALL_POLICIES,
  FIREWALL_PROTOCOLS,
  FIREWALL_TARGETS,
  LIMITS,
  checkFirewallRule,
  errorInfo,
  isServer,
  normalizeCidr,
  normalizeFilter,
  normalizeFirewallRule,
  validateDocument,
} from "@ping9/shared";
import type { ErrorInfo, FirewallChain, FirewallRule, PcDevice, PcFilter, TopologyDocument } from "@ping9/shared";

import { describeValue } from "../describe";
import type { CommandHandler, ReduceResult } from "../reducer";

const fail = (error: ErrorInfo): ReduceResult => ({ ok: false, error });
const shape = (path: string): ReduceResult => fail(errorInfo("DOCUMENT_INVALID_SHAPE", { path }));

function findServer(document: TopologyDocument, deviceId: unknown):
  | { readonly ok: true; readonly device: PcDevice; readonly filter: PcFilter }
  | { readonly ok: false; readonly error: ErrorInfo } {
  const device = document.devices.find((candidate) => candidate.id === deviceId);
  if (device === undefined) return { ok: false, error: errorInfo("DEVICE_NOT_FOUND", { deviceId: describeValue(deviceId) }) };
  if (device.kind !== "pc") {
    return { ok: false, error: errorInfo("DEVICE_KIND_MISMATCH", { deviceId: device.id, expected: "pc", actual: device.kind }) };
  }
  if (!isServer(device.config)) return { ok: false, error: errorInfo("PC_NOT_SERVER", { deviceId: device.id }) };
  return { ok: true, device, filter: device.config.filter ?? EMPTY_FIREWALL_FILTER };
}

/** 바꾼 필터를 정규화해 넣고 공통 문서 검증기로 전체 제약을 확인한다 */
function withFilter(document: TopologyDocument, device: PcDevice, filter: PcFilter): ReduceResult {
  const checked = validateDocument({
    ...document,
    devices: document.devices.map((candidate) => candidate.id === device.id
      ? { ...device, config: { ...device.config, filter: normalizeFilter(filter) } } : candidate),
  });
  return checked.ok ? { ok: true, document: checked.document, notices: [] } : checked;
}

function isChain(value: unknown): value is FirewallChain {
  return typeof value === "string" && (FIREWALL_CHAINS as readonly string[]).includes(value);
}

/** 그 체인의 규칙 목록만 바꾼 필터 */
function withRules(filter: PcFilter, chain: FirewallChain, rules: readonly FirewallRule[]): PcFilter {
  return { ...filter, [chain]: { ...filter[chain], rules } };
}

/** 규칙의 글자 칸. 문서 안의 다른 문자열과 같은 길이 한도다 (SEC-7) */
const TEXT_FIELDS = ["inInterface", "outInterface", "sourcePort", "destinationPort"] as const;
/** 정해진 값 가운데 하나여야 하는 칸 */
const ENUM_FIELDS = { protocol: FIREWALL_PROTOCOLS, icmpType: FIREWALL_ICMP_TYPES, target: FIREWALL_TARGETS } as const;

/**
 * 경계 밖에서 온 규칙을 읽는다 (AD-16). 아는 칸만 옮기고, 칸마다 형태를 먼저 본다:
 * 형태가 틀린 값(객체, 긴 글)은 뒤의 검사 함수에 넘기지 않아 오류 params에 실리지 않는다.
 * `-s`·`-d`는 `네트워크/길이`로 맞춘다
 */
function readRule(input: unknown): { readonly ok: true; readonly rule: FirewallRule } | { readonly ok: false; readonly error: ErrorInfo } {
  const invalid = (path: string) => ({ ok: false as const, error: errorInfo("DOCUMENT_INVALID_SHAPE", { path }) });
  if (typeof input !== "object" || input === null || Array.isArray(input)) return invalid("rule");
  // 자기 칸만 읽는다. 프로토타입에서 물려받은 값은 규칙이 아니다
  const own = (key: string): unknown => (Object.hasOwn(input, key) ? (input as Record<string, unknown>)[key] : undefined);
  const draft: Record<string, string> = {};

  for (const key of ["source", "destination"] as const) {
    const value = own(key);
    if (value === undefined) continue;
    const normalized = typeof value === "string" && value.length <= 64 ? normalizeCidr(value) : null;
    if (normalized === null) return { ok: false, error: errorInfo("INVALID_IPV4", { value: describeValue(value) }) };
    draft[key] = normalized;
  }
  for (const key of TEXT_FIELDS) {
    const value = own(key);
    if (value === undefined) continue;
    if (typeof value !== "string" || value.length > 64) return invalid(`rule.${key}`);
    draft[key] = value;
  }
  for (const [key, allowed] of Object.entries(ENUM_FIELDS)) {
    const value = own(key);
    if (value === undefined && key !== "target") continue;
    if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) return invalid(`rule.${key}`);
    draft[key] = value;
  }
  return { ok: true, rule: normalizeFirewallRule(draft as unknown as FirewallRule) };
}

/** 규칙 번호가 아니면 오류에 0을 담는다 */
const indexParam = (index: unknown): number => (typeof index === "number" && Number.isFinite(index) ? index : 0);

export const addFirewallRule: CommandHandler<"firewall/add-rule"> = (document, command) => {
  const found = findServer(document, command.deviceId);
  if (!found.ok) return found;
  const { device, filter } = found;
  if (!isChain(command.chain)) return shape("chain");
  const read = readRule(command.rule);
  if (!read.ok) return read;
  const { rules } = filter[command.chain];

  // `-I`의 자리는 1부터 (규칙 수 + 1)까지다. 끝에 붙이는 것은 자리가 없는 것과 같다
  const index = command.index ?? rules.length + 1;
  if (!Number.isInteger(index) || index < 1 || index > rules.length + 1) {
    return fail(errorInfo("FIREWALL_RULE_NOT_FOUND", { deviceId: device.id, chain: command.chain, index: indexParam(index) }));
  }
  if (rules.length >= LIMITS.maxFirewallRulesPerChain) {
    return fail(errorInfo("LIMIT_EXCEEDED", { limit: "firewallRules", max: LIMITS.maxFirewallRulesPerChain }));
  }
  // 조건의 조합은 문서 검증보다 먼저 봐서 구별되는 오류를 낸다
  const checked = checkFirewallRule(device.id, command.chain, read.rule);
  if (checked !== null) return fail(checked);
  return withFilter(document, device, withRules(filter, command.chain, [
    ...rules.slice(0, index - 1), read.rule, ...rules.slice(index - 1),
  ]));
};

export const removeFirewallRule: CommandHandler<"firewall/remove-rule"> = (document, command) => {
  const found = findServer(document, command.deviceId);
  if (!found.ok) return found;
  const { device, filter } = found;
  if (!isChain(command.chain)) return shape("chain");
  const { rules } = filter[command.chain];
  const { index } = command;
  if (!Number.isInteger(index) || index < 1 || index > rules.length) {
    return fail(errorInfo("FIREWALL_RULE_NOT_FOUND", { deviceId: device.id, chain: command.chain, index: indexParam(index) }));
  }
  return withFilter(document, device, withRules(filter, command.chain, rules.filter((_rule, at) => at !== index - 1)));
};

export const flushFirewallRules: CommandHandler<"firewall/flush-rules"> = (document, command) => {
  const found = findServer(document, command.deviceId);
  if (!found.ok) return found;
  const { device, filter } = found;
  if (command.chain !== undefined && !isChain(command.chain)) return shape("chain");
  const chains: readonly FirewallChain[] = command.chain === undefined ? FIREWALL_CHAINS : [command.chain];
  // 지울 것이 없으면 문서를 바꾸지 않는다
  if (chains.every((chain) => filter[chain].rules.length === 0)) return { ok: true, document, notices: [] };
  return withFilter(document, device, chains.reduce<PcFilter>((current, chain) => withRules(current, chain, []), filter));
};

export const setFirewallPolicy: CommandHandler<"firewall/set-policy"> = (document, command) => {
  const found = findServer(document, command.deviceId);
  if (!found.ok) return found;
  const { device, filter } = found;
  if (!isChain(command.chain)) return shape("chain");
  if (!(FIREWALL_POLICIES as readonly unknown[]).includes(command.policy)) return shape("policy");
  if (filter[command.chain].policy === command.policy) return { ok: true, document, notices: [] };
  return withFilter(document, device, { ...filter, [command.chain]: { ...filter[command.chain], policy: command.policy } });
};
