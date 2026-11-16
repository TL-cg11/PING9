// Firewall 구성의 규칙 (T14.2.1). 문서 불러오기와 reducer가 함께 쓰는 함수들이다.
import { describe, expect, test } from "vitest";

import type { FirewallConfig, FirewallDevice, TopologyDocument } from "./document";
import {
  EMPTY_FIREWALL_FILTER,
  checkFirewallRule,
  cidrContains,
  cidrToNetworkAndMask,
  firewallInterfaceName,
  firewallPortOf,
  firewallRuleSpec,
  normalizeCidr,
  normalizeFirewallConfig,
  parsePortRange,
} from "./firewall-config";
import { LIMITS } from "./limits";
import { validateDocument } from "./validate";

const ID = "33333333-3333-4333-8333-333333333333";

function documentWith(config: FirewallConfig): TopologyDocument {
  const device: FirewallDevice = { id: ID, name: "FW1", kind: "firewall", position: { x: 0, y: 0 }, config };
  return { schemaVersion: 1, devices: [device], links: [] };
}

const base: FirewallConfig = { interfaces: {}, staticRoutes: [], filter: EMPTY_FIREWALL_FILTER };
const codeOf = (config: FirewallConfig) => {
  const result = validateDocument(documentWith(config));
  return result.ok ? "ok" : result.error.code;
};

describe("주소와 포트 값", () => {
  test.each([
    ["10.0.0.7/24", "10.0.0.0/24"],
    ["10.0.0.7", "10.0.0.7/32"],
    ["0.0.0.0/0", "0.0.0.0/0"],
    ["192.168.1.130/25", "192.168.1.128/25"],
    ["10.0.0.0/33", null],
    ["10.0.0.0/08", null],
    ["10.0.0/24", null],
    ["10.0.0.0/", null],
    ["", null],
  ])("normalizeCidr(%s) → %s", (value, expected) => {
    expect(normalizeCidr(value)).toBe(expected);
  });

  test("cidrContains는 네트워크 안의 주소만 맞다", () => {
    expect(cidrContains("10.0.1.0/24", "10.0.1.255")).toBe(true);
    expect(cidrContains("10.0.1.0/24", "10.0.2.1")).toBe(false);
    expect(cidrContains("10.0.1.10/32", "10.0.1.10")).toBe(true);
    expect(cidrContains("0.0.0.0/0", "203.0.113.9")).toBe(true);
    expect(cidrContains("192.0.0.0/2", "255.255.255.255")).toBe(true);
    expect(cidrContains("10.0.1.0/24", "not-an-ip")).toBe(false);
    expect(cidrContains("10.0.1.0", "10.0.1.0")).toBe(false);
  });

  test("cidrToNetworkAndMask는 길이를 마스크로 바꾼다", () => {
    expect(cidrToNetworkAndMask("10.0.0.0/24")).toEqual({ network: "10.0.0.0", mask: "255.255.255.0" });
    expect(cidrToNetworkAndMask("0.0.0.0/0")).toEqual({ network: "0.0.0.0", mask: "0.0.0.0" });
    expect(cidrToNetworkAndMask("10.0.0.0")).toBeNull();
  });

  test.each([
    ["80", [80, 80]],
    ["0", [0, 0]],
    ["1000:2000", [1000, 2000]],
    ["65535", [65535, 65535]],
    ["65536", null],
    ["90:80", null],
    ["080", null],
    ["80:", null],
    ["http", null],
  ])("parsePortRange(%s) → %j", (value, expected) => {
    expect(parsePortRange(value)).toEqual(expected);
  });

  test("인터페이스 이름은 콘솔의 ethN과 포트의 전체 이름을 오간다", () => {
    expect(firewallInterfaceName("Ethernet2")).toBe("eth2");
    expect(firewallPortOf("eth3")).toBe("Ethernet3");
    expect(firewallPortOf("eth4")).toBeUndefined();
    expect(firewallPortOf("Ethernet0")).toBeUndefined();
  });
});

describe("규칙 하나의 검사", () => {
  test("체인에 맞지 않는 인터페이스 조건을 거부한다", () => {
    expect(checkFirewallRule(ID, "OUTPUT", { inInterface: "Ethernet0", target: "DROP" })?.params).toEqual({ reason: "in-interface" });
    expect(checkFirewallRule(ID, "INPUT", { outInterface: "Ethernet0", target: "DROP" })?.params).toEqual({ reason: "out-interface" });
    expect(checkFirewallRule(ID, "FORWARD", { inInterface: "Ethernet0", outInterface: "Ethernet1", target: "DROP" })).toBeNull();
  });

  test("프로토콜 없이 쓸 수 없는 조건을 거부한다", () => {
    expect(checkFirewallRule(ID, "INPUT", { icmpType: "echo-request", target: "DROP" })?.params).toEqual({ reason: "icmp-type" });
    expect(checkFirewallRule(ID, "INPUT", { protocol: "icmp", destinationPort: "80", target: "DROP" })?.params).toEqual({ reason: "port" });
    expect(checkFirewallRule(ID, "INPUT", { protocol: "udp", sourcePort: "53", target: "ACCEPT" })).toBeNull();
  });

  test("맞춰지지 않은 주소, 없는 포트, 틀린 포트 번호를 거부한다", () => {
    expect(checkFirewallRule(ID, "INPUT", { source: "10.0.0.7/24", target: "DROP" })?.code).toBe("INVALID_IPV4");
    expect(checkFirewallRule(ID, "INPUT", { inInterface: "GigabitEthernet0/0", target: "DROP" })?.code).toBe("UNKNOWN_PORT");
    expect(checkFirewallRule(ID, "INPUT", { protocol: "tcp", destinationPort: "99999", target: "DROP" })?.code).toBe("FIREWALL_PORT_INVALID");
  });

  test("firewallRuleSpec은 iptables -S의 순서로 쓴다", () => {
    expect(firewallRuleSpec({ target: "ACCEPT" })).toBe("-j ACCEPT");
    expect(firewallRuleSpec({
      protocol: "icmp", source: "10.0.0.0/24", destination: "10.0.1.5/32", inInterface: "Ethernet0", outInterface: "Ethernet1",
      icmpType: "echo-request", target: "DROP",
    })).toBe("-s 10.0.0.0/24 -d 10.0.1.5/32 -i eth0 -o eth1 -p icmp -m icmp --icmp-type 8 -j DROP");
    expect(firewallRuleSpec({ protocol: "tcp", destinationPort: "22", target: "REJECT" })).toBe("-p tcp -m tcp --dport 22 -j REJECT");
  });
});

describe("문서 검증", () => {
  test("처음 상태와 규칙이 있는 Firewall을 받는다", () => {
    expect(codeOf(base)).toBe("ok");
    expect(codeOf({
      interfaces: { Ethernet0: { adminUp: true, ip: "10.0.1.1", mask: "255.255.255.0" }, Ethernet1: { adminUp: false } },
      staticRoutes: [{ network: "0.0.0.0", mask: "0.0.0.0", nextHop: "10.0.1.254" }],
      filter: { ...EMPTY_FIREWALL_FILTER, FORWARD: { policy: "DROP", rules: [{ protocol: "icmp", source: "10.0.1.0/24", target: "ACCEPT" }] } },
    })).toBe("ok");
  });

  test.each<[string, FirewallConfig, string]>([
    ["Firewall에 없는 포트", { ...base, interfaces: { "GigabitEthernet0/0": { adminUp: true } } }, "UNKNOWN_PORT"],
    ["마스크 없는 주소", { ...base, interfaces: { Ethernet0: { adminUp: true, ip: "10.0.0.1" } } }, "DOCUMENT_INVALID_SHAPE"],
    ["네트워크 주소", { ...base, interfaces: { Ethernet0: { adminUp: true, ip: "10.0.0.0", mask: "255.255.255.0" } } }, "IP_IS_NETWORK_ADDRESS"],
    ["겹치는 인터페이스", { ...base, interfaces: {
      Ethernet0: { adminUp: true, ip: "10.0.0.1", mask: "255.255.255.0" }, Ethernet1: { adminUp: true, ip: "10.0.0.2", mask: "255.255.255.0" },
    } }, "INTERFACE_NETWORK_OVERLAP"],
    ["AD가 있는 경로", { ...base, staticRoutes: [{ network: "10.0.0.0", mask: "255.0.0.0", nextHop: "10.1.1.1", distance: 5 }] }, "DOCUMENT_INVALID_SHAPE"],
    ["맞지 않는 경로", { ...base, staticRoutes: [{ network: "10.0.0.1", mask: "255.0.0.0", nextHop: "10.1.1.1" }] }, "ROUTE_NETWORK_NOT_ALIGNED"],
    ["체인과 맞지 않는 규칙", { ...base, filter: {
      ...EMPTY_FIREWALL_FILTER, OUTPUT: { policy: "ACCEPT", rules: [{ inInterface: "Ethernet0", target: "DROP" }] },
    } }, "FIREWALL_RULE_INVALID"],
    ["한도를 넘는 규칙 수", { ...base, filter: {
      ...EMPTY_FIREWALL_FILTER,
      INPUT: { policy: "ACCEPT", rules: Array.from({ length: LIMITS.maxFirewallRulesPerChain + 1 }, () => ({ target: "DROP" as const })) },
    } }, "LIMIT_EXCEEDED"],
  ])("%s을(를) 거부한다", (_name, config, code) => {
    expect(codeOf(config)).toBe(code);
  });

  test.each([
    ["없는 정책", (filter: Record<string, unknown>) => { filter.INPUT = { policy: "REJECT", rules: [] }; }],
    ["없는 대상", (filter: Record<string, unknown>) => { filter.INPUT = { policy: "ACCEPT", rules: [{ target: "LOG" }] }; }],
    ["빠진 체인", (filter: Record<string, unknown>) => { delete filter.OUTPUT; }],
    ["없는 프로토콜", (filter: Record<string, unknown>) => { filter.INPUT = { policy: "ACCEPT", rules: [{ protocol: "gre", target: "DROP" }] }; }],
  ])("형태가 틀린 필터(%s)는 형태 오류다", (_name, change) => {
    const filter: Record<string, unknown> = { ...EMPTY_FIREWALL_FILTER };
    change(filter);
    expect(codeOf({ ...base, filter } as unknown as FirewallConfig)).toBe("DOCUMENT_INVALID_SHAPE");
  });

  test("정의되지 않은 칸은 검증된 값에서 빠진다", () => {
    const result = validateDocument(documentWith({
      ...base,
      filter: { ...EMPTY_FIREWALL_FILTER, INPUT: { policy: "ACCEPT", rules: [{ target: "DROP", comment: "x" } as never] } },
    }));
    expect(result.ok && (result.document.devices[0] as FirewallDevice).config.filter.INPUT.rules).toEqual([{ target: "DROP" }]);
  });
});

describe("정규화", () => {
  test("인터페이스 넷을 포트 순서대로 채우고 규칙의 칸 순서를 맞춘다", () => {
    const normalized = normalizeFirewallConfig({
      interfaces: { Ethernet2: { adminUp: false }, Ethernet0: { adminUp: true, ip: "10.0.0.1", mask: "255.255.255.0" } },
      staticRoutes: [],
      filter: { ...EMPTY_FIREWALL_FILTER, INPUT: { policy: "DROP", rules: [{ target: "ACCEPT", source: "10.0.0.0/24", protocol: "icmp" }] } },
    });
    expect(Object.keys(normalized.interfaces)).toEqual(["Ethernet0", "Ethernet1", "Ethernet2", "Ethernet3"]);
    expect(normalized.interfaces["Ethernet1"]).toEqual({ adminUp: true });
    expect(normalized.interfaces["Ethernet2"]).toEqual({ adminUp: false });
    expect(JSON.stringify(normalized.filter.INPUT.rules[0])).toBe('{"protocol":"icmp","source":"10.0.0.0/24","target":"ACCEPT"}');
  });
});
