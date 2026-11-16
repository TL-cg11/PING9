// reducer: Firewall의 Command (T14.2.1).
// 인터페이스와 Static route는 Router와 같은 Command(`interface/*`, `route/*`)를 쓰고, 장비가 Firewall이면 여기로 온다.
// 필터 규칙은 `firewall/*` Command다. 콘솔의 `ip`, `iptables` 명령이 이 Command를 낸다 (AD-3).

import {
  FIREWALL_CHAINS,
  FIREWALL_ICMP_TYPES,
  FIREWALL_POLICIES,
  FIREWALL_PROTOCOLS,
  FIREWALL_TARGETS,
  LIMITS,
  checkFirewallInterfaceOverlap,
  checkFirewallRule,
  checkInterfaceAddress,
  checkStaticRoute,
  errorInfo,
  isPortName,
  normalizeCidr,
  normalizeFirewallConfig,
  normalizeFirewallRule,
  validateDocument,
} from "@ping9/shared";
import type {
  CommandOf,
  CommandType,
  ErrorInfo,
  FirewallChain,
  FirewallConfig,
  FirewallDevice,
  FirewallRule,
  Notice,
  TopologyDocument,
} from "@ping9/shared";

import { describeValue } from "../describe";
import type { CommandHandler, ReduceResult } from "../reducer";

const fail = (error: ErrorInfo): ReduceResult => ({ ok: false, error });
const shape = (path: string): ReduceResult => fail(errorInfo("DOCUMENT_INVALID_SHAPE", { path }));

function findFirewall(document: TopologyDocument, deviceId: unknown):
  | { readonly ok: true; readonly device: FirewallDevice }
  | { readonly ok: false; readonly error: ErrorInfo } {
  const device = document.devices.find((candidate) => candidate.id === deviceId);
  if (device === undefined) return { ok: false, error: errorInfo("DEVICE_NOT_FOUND", { deviceId: describeValue(deviceId) }) };
  if (device.kind !== "firewall") {
    return { ok: false, error: errorInfo("DEVICE_KIND_MISMATCH", { deviceId: device.id, expected: "firewall", actual: device.kind }) };
  }
  return { ok: true, device };
}

/** 바꾼 구성을 정규화하고 공통 문서 검증기로 전체 제약을 확인한다 */
function withConfig(
  document: TopologyDocument, device: FirewallDevice, config: FirewallConfig, notices: readonly Notice[] = [],
): ReduceResult {
  const checked = validateDocument({
    ...document,
    devices: document.devices.map((candidate) => candidate.id === device.id
      ? { ...device, config: normalizeFirewallConfig(config) } : candidate),
  });
  return checked.ok ? { ok: true, document: checked.document, notices } : checked;
}

type DeviceCommandType = Extract<CommandType, "interface/set-admin" | "interface/set-ip" | "interface/clear-ip" | "route/add" | "route/remove">;

/** 장비가 Firewall이면 `firewall` 처리기로, 아니면 원래 처리기로 보낸다. 원래 처리기는 고치지 않는다 */
export function orFirewall<T extends DeviceCommandType>(firewall: CommandHandler<T>, other: CommandHandler<T>): CommandHandler<T> {
  return (document, command) =>
    document.devices.some((device) => device.id === (command as { readonly deviceId?: unknown }).deviceId && device.kind === "firewall")
      ? firewall(document, command)
      : other(document, command);
}

function portError(device: FirewallDevice, port: unknown): ErrorInfo | null {
  return typeof port === "string" && isPortName("firewall", port)
    ? null
    : errorInfo("UNKNOWN_PORT", { deviceId: device.id, kind: "firewall", port: describeValue(port) });
}

export const setFirewallInterfaceAdmin: CommandHandler<"interface/set-admin"> = (document, command) => {
  const found = findFirewall(document, command.deviceId);
  if (!found.ok) return found;
  const { device } = found;
  const error = portError(device, command.port);
  if (error !== null) return fail(error);
  if (typeof command.adminUp !== "boolean") return shape("adminUp");
  return withConfig(document, device, {
    ...device.config,
    interfaces: { ...device.config.interfaces, [command.port]: { ...device.config.interfaces[command.port], adminUp: command.adminUp } },
  });
};

/** 그 주소를 쓰는 다른 장비 */
function othersUsing(document: TopologyDocument, deviceId: string, ip: string) {
  return document.devices.filter((other) => other.id !== deviceId && (
    other.kind === "pc" ? other.config.ip === ip
      : other.kind === "switch" ? false
      : Object.values(other.config.interfaces).some((iface) => iface.ip === ip)
  )).map((other) => ({ deviceId: other.id, deviceName: other.name }));
}

export const setFirewallInterfaceIp: CommandHandler<"interface/set-ip"> = (document, command) => {
  const found = findFirewall(document, command.deviceId);
  if (!found.ok) return found;
  const { device } = found;
  const error = portError(device, command.port);
  if (error !== null) return fail(error);
  if (typeof command.ip !== "string" || command.ip.length > 64) return fail(errorInfo("INVALID_IPV4", { value: describeValue(command.ip) }));
  if (typeof command.mask !== "string" || command.mask.length > 64) return fail(errorInfo("INVALID_MASK", { value: describeValue(command.mask) }));
  const addressError = checkInterfaceAddress(command.ip, command.mask) ??
    checkFirewallInterfaceOverlap(device.id, command.port, command.ip, command.mask, device.config.interfaces);
  if (addressError !== null) return fail(addressError);

  const others = othersUsing(document, device.id, command.ip);
  return withConfig(document, device, {
    ...device.config,
    interfaces: {
      ...device.config.interfaces,
      [command.port]: { adminUp: device.config.interfaces[command.port]?.adminUp ?? true, ip: command.ip, mask: command.mask },
    },
  }, others.length === 0 ? [] : [{ code: "DUPLICATE_IP", params: { ip: command.ip, others } }]);
};

export const clearFirewallInterfaceIp: CommandHandler<"interface/clear-ip"> = (document, command) => {
  const found = findFirewall(document, command.deviceId);
  if (!found.ok) return found;
  const { device } = found;
  const error = portError(device, command.port);
  if (error !== null) return fail(error);
  return withConfig(document, device, {
    ...device.config,
    interfaces: { ...device.config.interfaces, [command.port]: { adminUp: device.config.interfaces[command.port]?.adminUp ?? true } },
  });
};

/** 타입 경계 밖의 직접 dispatch도 형식 오류로 돌려준다. Firewall의 경로에는 AD가 없다 */
function routeError(device: FirewallDevice, command: CommandOf<"route/add" | "route/remove">): ErrorInfo | null {
  for (const key of ["network", "mask", "nextHop"] as const) {
    if (typeof command[key] !== "string" || command[key].length > 64) {
      return errorInfo(key === "mask" ? "INVALID_MASK" : "INVALID_IPV4", { value: describeValue(command[key]) });
    }
  }
  if (command.distance !== undefined) return errorInfo("ROUTE_DISTANCE_INVALID", { value: describeValue(command.distance) });
  return checkStaticRoute(device.id, command, device.config.interfaces);
}

export const addFirewallRoute: CommandHandler<"route/add"> = (document, command) => {
  const found = findFirewall(document, command.deviceId);
  if (!found.ok) return found;
  const { device } = found;
  const error = routeError(device, command);
  if (error !== null) return fail(error);
  const { network, mask, nextHop } = command;
  const routes = device.config.staticRoutes;
  if (routes.some((route) => route.network === network && route.mask === mask && route.nextHop === nextHop)) {
    return { ok: true, document, notices: [] };
  }
  if (routes.length >= LIMITS.maxStaticRoutesPerRouter) {
    return fail(errorInfo("LIMIT_EXCEEDED", { limit: "staticRoutes", max: LIMITS.maxStaticRoutesPerRouter }));
  }
  return withConfig(document, device, { ...device.config, staticRoutes: [...routes, { network, mask, nextHop }] });
};

export const removeFirewallRoute: CommandHandler<"route/remove"> = (document, command) => {
  const found = findFirewall(document, command.deviceId);
  if (!found.ok) return found;
  const { device } = found;
  const error = routeError(device, command);
  if (error !== null) return fail(error);
  const { network, mask, nextHop } = command;
  const target = device.config.staticRoutes.find((route) => route.network === network && route.mask === mask && route.nextHop === nextHop);
  if (target === undefined) return fail(errorInfo("ROUTE_NOT_FOUND", { deviceId: device.id, network, mask, nextHop }));
  return withConfig(document, device, { ...device.config, staticRoutes: device.config.staticRoutes.filter((route) => route !== target) });
};

function isChain(value: unknown): value is FirewallChain {
  return typeof value === "string" && (FIREWALL_CHAINS as readonly string[]).includes(value);
}

/** 그 체인의 규칙 목록만 바꾼 구성 */
function withRules(config: FirewallConfig, chain: FirewallChain, rules: readonly FirewallRule[]): FirewallConfig {
  return { ...config, filter: { ...config.filter, [chain]: { ...config.filter[chain], rules } } };
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

export const addFirewallRule: CommandHandler<"firewall/add-rule"> = (document, command) => {
  const found = findFirewall(document, command.deviceId);
  if (!found.ok) return found;
  const { device } = found;
  if (!isChain(command.chain)) return shape("chain");
  const read = readRule(command.rule);
  if (!read.ok) return read;
  const { rules } = device.config.filter[command.chain];

  // `-I`의 자리는 1부터 (규칙 수 + 1)까지다. 끝에 붙이는 것은 자리가 없는 것과 같다
  const index = command.index ?? rules.length + 1;
  if (!Number.isInteger(index) || index < 1 || index > rules.length + 1) {
    return fail(errorInfo("FIREWALL_RULE_NOT_FOUND", {
      deviceId: device.id, chain: command.chain, index: typeof index === "number" && Number.isFinite(index) ? index : 0,
    }));
  }
  if (rules.length >= LIMITS.maxFirewallRulesPerChain) {
    return fail(errorInfo("LIMIT_EXCEEDED", { limit: "firewallRules", max: LIMITS.maxFirewallRulesPerChain }));
  }
  // 조건의 조합은 문서 검증보다 먼저 봐서 구별되는 오류를 낸다
  const checked = checkFirewallRule(device.id, command.chain, read.rule);
  if (checked !== null) return fail(checked);
  return withConfig(document, device, withRules(device.config, command.chain, [
    ...rules.slice(0, index - 1), read.rule, ...rules.slice(index - 1),
  ]));
};

export const removeFirewallRule: CommandHandler<"firewall/remove-rule"> = (document, command) => {
  const found = findFirewall(document, command.deviceId);
  if (!found.ok) return found;
  const { device } = found;
  if (!isChain(command.chain)) return shape("chain");
  const { rules } = device.config.filter[command.chain];
  const { index } = command;
  if (!Number.isInteger(index) || index < 1 || index > rules.length) {
    return fail(errorInfo("FIREWALL_RULE_NOT_FOUND", {
      deviceId: device.id, chain: command.chain, index: typeof index === "number" && Number.isFinite(index) ? index : 0,
    }));
  }
  return withConfig(document, device, withRules(device.config, command.chain, rules.filter((_rule, at) => at !== index - 1)));
};

export const flushFirewallRules: CommandHandler<"firewall/flush-rules"> = (document, command) => {
  const found = findFirewall(document, command.deviceId);
  if (!found.ok) return found;
  const { device } = found;
  if (command.chain !== undefined && !isChain(command.chain)) return shape("chain");
  const chains: readonly FirewallChain[] = command.chain === undefined ? FIREWALL_CHAINS : [command.chain];
  // 지울 것이 없으면 문서를 바꾸지 않는다
  if (chains.every((chain) => device.config.filter[chain].rules.length === 0)) return { ok: true, document, notices: [] };
  return withConfig(document, device, chains.reduce<FirewallConfig>((config, chain) => withRules(config, chain, []), device.config));
};

export const setFirewallPolicy: CommandHandler<"firewall/set-policy"> = (document, command) => {
  const found = findFirewall(document, command.deviceId);
  if (!found.ok) return found;
  const { device } = found;
  if (!isChain(command.chain)) return shape("chain");
  if (!(FIREWALL_POLICIES as readonly unknown[]).includes(command.policy)) return shape("policy");
  if (device.config.filter[command.chain].policy === command.policy) return { ok: true, document, notices: [] };
  return withConfig(document, device, {
    ...device.config,
    filter: { ...device.config.filter, [command.chain]: { ...device.config.filter[command.chain], policy: command.policy } },
  });
};
