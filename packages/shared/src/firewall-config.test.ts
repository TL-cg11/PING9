// 서버로 쓰는 PC의 필터 규칙 (T14.2.1, T0.21). 문서 불러오기와 reducer가 함께 쓰는 함수들이다.
import { describe, expect, test } from "vitest";

import type { PcConfig, PcDevice, PcFilter, RouterDevice, TopologyDocument } from "./document";
import {
  EMPTY_FIREWALL_FILTER,
  checkFirewallRule,
  cidrContains,
  filterOf,
  firewallInterfaceName,
  firewallPortOf,
  firewallRuleSpec,
  hasActiveFilter,
  normalizeCidr,
  normalizeFilter,
  parsePortRange,
} from "./firewall-config";
import { LIMITS } from "./limits";
import { migrateDocument, parseDocumentJson, validateDocument } from "./validate";

const ID = "33333333-3333-4333-8333-333333333333";

function documentWith(config: PcConfig): TopologyDocument {
  const device: PcDevice = { id: ID, name: "SRV1", kind: "pc", position: { x: 0, y: 0 }, config };
  return { schemaVersion: 1, devices: [device], links: [] };
}

const withInput = (rules: PcFilter["INPUT"]["rules"], policy: "ACCEPT" | "DROP" = "ACCEPT"): PcFilter =>
  ({ ...EMPTY_FIREWALL_FILTER, INPUT: { policy, rules } });
const codeOf = (config: unknown) => {
  const result = validateDocument(documentWith(config as PcConfig));
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

  test("서버의 인터페이스는 eth0 하나다", () => {
    expect(firewallInterfaceName("Ethernet0")).toBe("eth0");
    expect(firewallPortOf("eth0")).toBe("Ethernet0");
    expect(firewallPortOf("eth1")).toBeUndefined();
    expect(firewallPortOf("Ethernet0")).toBeUndefined();
  });
});

describe("규칙 하나의 검사", () => {
  test("체인에 맞지 않는 인터페이스 조건을 거부한다", () => {
    expect(checkFirewallRule(ID, "OUTPUT", { inInterface: "Ethernet0", target: "DROP" })?.params).toEqual({ reason: "in-interface" });
    expect(checkFirewallRule(ID, "INPUT", { outInterface: "Ethernet0", target: "DROP" })?.params).toEqual({ reason: "out-interface" });
    expect(checkFirewallRule(ID, "INPUT", { inInterface: "Ethernet0", target: "DROP" })).toBeNull();
  });

  test("프로토콜 없이 쓸 수 없는 조건을 거부한다", () => {
    expect(checkFirewallRule(ID, "INPUT", { icmpType: "echo-request", target: "DROP" })?.params).toEqual({ reason: "icmp-type" });
    expect(checkFirewallRule(ID, "INPUT", { protocol: "icmp", destinationPort: "80", target: "DROP" })?.params).toEqual({ reason: "port" });
    expect(checkFirewallRule(ID, "INPUT", { protocol: "udp", sourcePort: "53", target: "ACCEPT" })).toBeNull();
  });

  test("맞춰지지 않은 주소, 서버에 없는 포트, 틀린 포트 번호를 거부한다", () => {
    expect(checkFirewallRule(ID, "INPUT", { source: "10.0.0.7/24", target: "DROP" })?.code).toBe("INVALID_IPV4");
    expect(checkFirewallRule(ID, "INPUT", { inInterface: "Ethernet1", target: "DROP" })).toEqual({
      code: "UNKNOWN_PORT", params: { deviceId: ID, kind: "pc", port: "Ethernet1" },
    });
    expect(checkFirewallRule(ID, "INPUT", { protocol: "tcp", destinationPort: "99999", target: "DROP" })?.code).toBe("FIREWALL_PORT_INVALID");
  });

  test("firewallRuleSpec은 iptables -S의 순서로 쓴다", () => {
    expect(firewallRuleSpec({ target: "ACCEPT" })).toBe("-j ACCEPT");
    expect(firewallRuleSpec({
      protocol: "icmp", source: "10.0.0.0/24", destination: "10.0.1.5/32", inInterface: "Ethernet0",
      icmpType: "echo-request", target: "DROP",
    })).toBe("-s 10.0.0.0/24 -d 10.0.1.5/32 -i eth0 -p icmp -m icmp --icmp-type 8 -j DROP");
    expect(firewallRuleSpec({ protocol: "tcp", destinationPort: "22", target: "REJECT" })).toBe("-p tcp -m tcp --dport 22 -j REJECT");
  });
});

describe("적용되는 필터", () => {
  const rules = withInput([{ protocol: "icmp", target: "DROP" }]);

  test("서버가 아니면 규칙이 남아 있어도 적용하지 않는다. 서버인데 칸이 없으면 처음 상태다", () => {
    expect(filterOf({ os: "server", filter: rules })).toBe(rules);
    expect(filterOf({ os: "linux", filter: rules })).toEqual(EMPTY_FIREWALL_FILTER);
    expect(filterOf({ os: "server" })).toEqual(EMPTY_FIREWALL_FILTER);
    expect(filterOf({})).toEqual(EMPTY_FIREWALL_FILTER);
  });

  test("막을 수 있는 필터인지: INPUT이나 OUTPUT에 규칙이 있거나 정책이 DROP이다", () => {
    expect(hasActiveFilter({ os: "server" })).toBe(false);
    expect(hasActiveFilter({ os: "server", filter: rules })).toBe(true);
    expect(hasActiveFilter({ os: "windows", filter: rules })).toBe(false);
    expect(hasActiveFilter({ os: "server", filter: { ...EMPTY_FIREWALL_FILTER, OUTPUT: { policy: "DROP", rules: [] } } })).toBe(true);
    // FORWARD는 서버가 전달하지 않아 맞는 패킷이 없다
    expect(hasActiveFilter({ os: "server", filter: { ...EMPTY_FIREWALL_FILTER, FORWARD: { policy: "DROP", rules: [{ target: "DROP" }] } } })).toBe(false);
  });

  test("정규화: 체인과 규칙의 칸 순서를 맞춘다", () => {
    const normalized = normalizeFilter({
      OUTPUT: { rules: [], policy: "DROP" },
      INPUT: { policy: "ACCEPT", rules: [{ target: "ACCEPT", source: "10.0.0.0/24", protocol: "icmp" }] },
      FORWARD: { policy: "ACCEPT", rules: [] },
    });
    expect(Object.keys(normalized)).toEqual(["INPUT", "FORWARD", "OUTPUT"]);
    expect(JSON.stringify(normalized.INPUT.rules[0])).toBe('{"protocol":"icmp","source":"10.0.0.0/24","target":"ACCEPT"}');
  });
});

describe("문서 검증", () => {
  test("필터가 있는 서버를 받는다. 필터가 없는 옛 문서도 그대로 읽힌다", () => {
    expect(codeOf({})).toBe("ok");
    expect(codeOf({ os: "server" })).toBe("ok");
    expect(codeOf({ os: "server", filter: withInput([{ protocol: "tcp", destinationPort: "80", inInterface: "Ethernet0", target: "DROP" }], "DROP") })).toBe("ok");
    // 서버가 아니어도 규칙은 남아 있을 수 있다 (종류를 바꿨다가 되돌릴 때)
    expect(codeOf({ os: "linux", filter: withInput([{ target: "DROP" }]) })).toBe("ok");
  });

  test.each<[string, unknown, string]>([
    ["체인과 맞지 않는 규칙", { os: "server", filter: { ...EMPTY_FIREWALL_FILTER, OUTPUT: { policy: "ACCEPT", rules: [{ inInterface: "Ethernet0", target: "DROP" }] } } }, "FIREWALL_RULE_INVALID"],
    ["서버에 없는 포트", { os: "server", filter: withInput([{ inInterface: "Ethernet1", target: "DROP" }]) }, "UNKNOWN_PORT"],
    ["맞춰지지 않은 주소", { os: "server", filter: withInput([{ source: "10.0.0.7/24", target: "DROP" }]) }, "INVALID_IPV4"],
    ["한도를 넘는 규칙 수", { os: "server", filter: withInput(Array.from({ length: LIMITS.maxFirewallRulesPerChain + 1 }, () => ({ target: "DROP" as const }))) }, "LIMIT_EXCEEDED"],
    ["없는 정책", { os: "server", filter: { ...EMPTY_FIREWALL_FILTER, INPUT: { policy: "REJECT", rules: [] } } }, "DOCUMENT_INVALID_SHAPE"],
    ["없는 대상", { os: "server", filter: withInput([{ target: "LOG" } as never]) }, "DOCUMENT_INVALID_SHAPE"],
    ["빠진 체인", { os: "server", filter: { INPUT: EMPTY_FIREWALL_FILTER.INPUT, FORWARD: EMPTY_FIREWALL_FILTER.FORWARD } }, "DOCUMENT_INVALID_SHAPE"],
    ["없는 프로토콜", { os: "server", filter: withInput([{ protocol: "gre", target: "DROP" } as never]) }, "DOCUMENT_INVALID_SHAPE"],
  ])("%s을(를) 거부한다", (_name, config, code) => {
    expect(codeOf(config)).toBe(code);
  });

  test("정의되지 않은 칸은 검증된 값에서 빠진다", () => {
    const result = validateDocument(documentWith({ os: "server", filter: withInput([{ target: "DROP", comment: "x" } as never]) }));
    expect(result.ok && (result.document.devices[0] as PcDevice).config.filter?.INPUT.rules).toEqual([{ target: "DROP" }]);
  });

  test("Firewall 장비는 이제 없는 종류다", () => {
    const document = { schemaVersion: 1, links: [], devices: [{ id: ID, name: "FW1", kind: "firewall", position: { x: 0, y: 0 },
      config: { interfaces: {}, staticRoutes: [], filter: EMPTY_FIREWALL_FILTER } }] };
    expect(validateDocument(document)).toMatchObject({ ok: false, error: { code: "DOCUMENT_INVALID_SHAPE" } });
  });
});

describe("옛 문서의 Firewall 장비 (T0.21)", () => {
  const PC = "11111111-1111-4111-8111-111111111111";
  const LINK = "44444444-4444-4444-8444-444444444444";
  const old = {
    schemaVersion: 1,
    devices: [
      { id: PC, name: "PC1", kind: "pc", position: { x: 0, y: 0 }, config: { ip: "10.0.1.10", mask: "255.255.255.0", gateway: "10.0.1.1" } },
      { id: ID, name: "FW1", kind: "firewall", position: { x: 200, y: 0 }, config: {
        interfaces: {
          Ethernet0: { adminUp: true, ip: "10.0.1.1", mask: "255.255.255.0" }, Ethernet1: { adminUp: false },
          Ethernet2: { adminUp: true }, Ethernet3: { adminUp: true },
        },
        staticRoutes: [{ network: "0.0.0.0", mask: "0.0.0.0", nextHop: "10.0.1.254" }],
        filter: { ...EMPTY_FIREWALL_FILTER, FORWARD: { policy: "DROP", rules: [{ protocol: "icmp", target: "ACCEPT" }] } },
      } },
    ],
    links: [{ id: LINK, ends: [{ deviceId: PC, port: "Ethernet0" }, { deviceId: ID, port: "Ethernet0" }] }],
  };

  test("가져올 때 Router로 바뀐다: 주소·경로·링크는 남고 필터 규칙은 사라진다", () => {
    const result = parseDocumentJson(JSON.stringify(old));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const router = result.document.devices[1] as RouterDevice;
    expect(router).toMatchObject({ id: ID, name: "FW1", kind: "router" });
    expect(router.config).toEqual({
      interfaces: {
        "GigabitEthernet0/0": { adminUp: true, ip: "10.0.1.1", mask: "255.255.255.0" }, "GigabitEthernet0/1": { adminUp: false },
        "GigabitEthernet0/2": { adminUp: true }, "GigabitEthernet0/3": { adminUp: true },
      },
      staticRoutes: [{ network: "0.0.0.0", mask: "0.0.0.0", nextHop: "10.0.1.254" }],
    });
    // PC 쪽 끝의 포트 이름은 그대로다
    expect(result.document.links[0]!.ends).toEqual([{ deviceId: PC, port: "Ethernet0" }, { deviceId: ID, port: "GigabitEthernet0/0" }]);
  });

  test("구성에 없는 인터페이스는 켜진 것으로 채운다: Firewall은 켜짐이, Router는 꺼짐이 기본이다", () => {
    const sparse = { ...old, devices: [old.devices[0], { ...old.devices[1]!, config: {
      interfaces: { Ethernet0: { adminUp: true, ip: "10.0.1.1", mask: "255.255.255.0" } }, staticRoutes: [], filter: EMPTY_FIREWALL_FILTER,
    } }] };
    const result = parseDocumentJson(JSON.stringify(sparse));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.document.devices[1] as RouterDevice).config.interfaces).toEqual({
      "GigabitEthernet0/0": { adminUp: true, ip: "10.0.1.1", mask: "255.255.255.0" },
      "GigabitEthernet0/1": { adminUp: true }, "GigabitEthernet0/2": { adminUp: true }, "GigabitEthernet0/3": { adminUp: true },
    });
  });

  test.each([
    ["Firewall에 없는 포트", { Ethernet4: { adminUp: true } }],
    ["Router의 포트 이름이 섞임", { Ethernet0: { adminUp: true }, "GigabitEthernet0/0": { adminUp: false } }],
  ])("인터페이스 표가 Firewall의 것이 아니면 바꾸지 않고 거부한다: %s", (_name, interfaces) => {
    const odd = { ...old, devices: [old.devices[0], { ...old.devices[1]!, config: { interfaces, staticRoutes: [], filter: EMPTY_FIREWALL_FILTER } }], links: [] };
    expect(parseDocumentJson(JSON.stringify(odd))).toMatchObject({ ok: false, error: { code: "DOCUMENT_INVALID_SHAPE" } });
  });

  test("넣은 값은 고치지 않고, Firewall이 없는 문서는 같은 값을 돌려준다", () => {
    const before = JSON.stringify(old);
    migrateDocument(old);
    expect(JSON.stringify(old)).toBe(before);
    const plain = documentWith({ os: "server" });
    expect(migrateDocument(plain)).toBe(plain);
  });

  test.each([null, 5, "x", [], { devices: 5 }, { devices: [null, 5, { kind: "firewall" }, { kind: "firewall", config: 7 }], links: "x" },
    { devices: [{ kind: "firewall", id: ID, config: { interfaces: 3 } }], links: [null, { ends: 4 }, { ends: [null, { deviceId: ID, port: 9 }] }] },
  ])("형태가 다른 값 %j에도 예외를 던지지 않는다", (input) => {
    expect(() => migrateDocument(input)).not.toThrow();
    expect(validateDocument(migrateDocument(input)).ok).toBe(false);
  });
});
