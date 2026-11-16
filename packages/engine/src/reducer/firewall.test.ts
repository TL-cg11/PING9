// Firewall의 Command (T14.2.1). 공개 dispatch로 확인한다. 경계 밖의 값에도 예외 없이 오류 결과를 돌려준다 (AD-16).
import { LIMITS, validateDocument } from "@ping9/shared";
import type { Command, FirewallDevice, FirewallRule } from "@ping9/shared";
import { describe, expect, test } from "vitest";

import { needsRouteExchange } from "../routing-inputs";
import { createSimulator } from "../simulator";

const FW = "33333333-3333-4333-8333-333333333333";
const R1 = "66666666-6666-4666-8666-666666666666";
const SW = "77777777-7777-4777-8777-777777777777";

function open() {
  const sim = createSimulator();
  expect(sim.dispatch({ type: "device/add", id: FW, kind: "firewall", position: { x: 0, y: 0 } }).ok).toBe(true);
  expect(sim.dispatch({ type: "device/add", id: R1, kind: "router", position: { x: 200, y: 0 } }).ok).toBe(true);
  expect(sim.dispatch({ type: "device/add", id: SW, kind: "switch", position: { x: 400, y: 0 } }).ok).toBe(true);
  const config = () => (sim.getSnapshot().document.devices[0] as FirewallDevice).config;
  /** 타입 밖의 값도 넣어 본다 */
  const send = (command: unknown) => sim.dispatch(command as Command);
  const codeOf = (command: unknown) => {
    const result = send(command);
    return result.ok ? "ok" : result.error.code;
  };
  return { sim, config, send, codeOf };
}

const addRule = (rule: unknown, extra: Record<string, unknown> = {}) =>
  ({ type: "firewall/add-rule", deviceId: FW, chain: "FORWARD", rule, ...extra });

describe("필터 규칙 Command", () => {
  test("add-rule은 끝에 붙이거나 고른 자리에 끼우고, 주소를 네트워크로 맞춘다", () => {
    const { send, config } = open();
    expect(send(addRule({ target: "DROP", source: "10.0.0.9/24" })).ok).toBe(true);
    expect(send(addRule({ target: "ACCEPT", protocol: "icmp" }, { index: 1 })).ok).toBe(true);
    expect(send(addRule({ target: "REJECT" }, { index: 3 })).ok).toBe(true);
    expect(config().filter.FORWARD.rules).toEqual([
      { protocol: "icmp", target: "ACCEPT" }, { source: "10.0.0.0/24", target: "DROP" }, { target: "REJECT" },
    ]);
  });

  test("`0.0.0.0/0`인 주소 조건은 없는 것과 같아 저장하지 않는다. 콘솔에서 같은 규칙으로 지울 수 있다", async () => {
    const { sim, send, config } = open();
    expect(send(addRule({ target: "ACCEPT", source: "0.0.0.0/0", destination: "10.1.2.3/0" })).ok).toBe(true);
    expect(config().filter.FORWARD.rules).toEqual([{ target: "ACCEPT" }]);
    expect((await sim.console(FW).exec("iptables -D FORWARD -s 0.0.0.0/0 -j ACCEPT")).lines).toEqual([]);
    expect(config().filter.FORWARD.rules).toEqual([]);
  });

  test("remove-rule, flush-rules, set-policy", () => {
    const { send, config } = open();
    for (const target of ["ACCEPT", "DROP", "REJECT"]) send(addRule({ target }));
    send({ type: "firewall/add-rule", deviceId: FW, chain: "INPUT", rule: { target: "DROP" } });
    expect(send({ type: "firewall/remove-rule", deviceId: FW, chain: "FORWARD", index: 2 }).ok).toBe(true);
    expect(config().filter.FORWARD.rules.map((rule) => rule.target)).toEqual(["ACCEPT", "REJECT"]);
    expect(send({ type: "firewall/set-policy", deviceId: FW, chain: "FORWARD", policy: "DROP" }).ok).toBe(true);
    expect(send({ type: "firewall/flush-rules", deviceId: FW, chain: "FORWARD" }).ok).toBe(true);
    expect(config().filter.FORWARD).toEqual({ policy: "DROP", rules: [] });
    expect(config().filter.INPUT.rules).toHaveLength(1);
    expect(send({ type: "firewall/flush-rules", deviceId: FW }).ok).toBe(true);
    expect(config().filter.INPUT.rules).toEqual([]);
  });

  test("바뀌는 것이 없으면 문서를 그대로 둔다", () => {
    const { sim, send } = open();
    const before = sim.getSnapshot().document;
    expect(send({ type: "firewall/flush-rules", deviceId: FW }).ok).toBe(true);
    expect(send({ type: "firewall/set-policy", deviceId: FW, chain: "INPUT", policy: "ACCEPT" }).ok).toBe(true);
    expect(sim.getSnapshot().document).toEqual(before);
  });

  test("체인당 규칙 수 한도", () => {
    const { send, codeOf } = open();
    for (let count = 0; count < LIMITS.maxFirewallRulesPerChain; count += 1) expect(send(addRule({ target: "DROP" })).ok).toBe(true);
    expect(send(addRule({ target: "DROP" }))).toEqual({
      ok: false, error: { code: "LIMIT_EXCEEDED", params: { limit: "firewallRules", max: LIMITS.maxFirewallRulesPerChain } },
    });
    // 다른 체인은 따로 센다
    expect(codeOf({ type: "firewall/add-rule", deviceId: FW, chain: "INPUT", rule: { target: "DROP" } })).toBe("ok");
  });

  test.each<[string, unknown, string]>([
    ["없는 장비", { type: "firewall/add-rule", deviceId: "nope", chain: "INPUT", rule: { target: "DROP" } }, "DEVICE_NOT_FOUND"],
    ["Router에 규칙", { type: "firewall/add-rule", deviceId: R1, chain: "INPUT", rule: { target: "DROP" } }, "DEVICE_KIND_MISMATCH"],
    ["Switch의 정책", { type: "firewall/set-policy", deviceId: SW, chain: "INPUT", policy: "DROP" }, "DEVICE_KIND_MISMATCH"],
    ["없는 체인", { type: "firewall/add-rule", deviceId: FW, chain: "PREROUTING", rule: { target: "DROP" } }, "DOCUMENT_INVALID_SHAPE"],
    ["체인이 수", { type: "firewall/remove-rule", deviceId: FW, chain: 5, index: 1 }, "DOCUMENT_INVALID_SHAPE"],
    ["없는 정책", { type: "firewall/set-policy", deviceId: FW, chain: "INPUT", policy: "REJECT" }, "DOCUMENT_INVALID_SHAPE"],
    ["없는 규칙 번호", { type: "firewall/remove-rule", deviceId: FW, chain: "INPUT", index: 1 }, "FIREWALL_RULE_NOT_FOUND"],
    ["규칙 번호가 글", { type: "firewall/remove-rule", deviceId: FW, chain: "INPUT", index: "1" }, "FIREWALL_RULE_NOT_FOUND"],
    ["끼울 수 없는 자리", addRule({ target: "DROP" }, { index: 2 }), "FIREWALL_RULE_NOT_FOUND"],
    ["자리가 소수", addRule({ target: "DROP" }, { index: 1.5 }), "FIREWALL_RULE_NOT_FOUND"],
    ["자리가 NaN", addRule({ target: "DROP" }, { index: Number.NaN }), "FIREWALL_RULE_NOT_FOUND"],
    ["규칙이 null", addRule(null), "DOCUMENT_INVALID_SHAPE"],
    ["규칙이 배열", addRule([]), "DOCUMENT_INVALID_SHAPE"],
    ["대상이 없음", addRule({ protocol: "icmp" }), "DOCUMENT_INVALID_SHAPE"],
    ["없는 대상", addRule({ target: "LOG" }), "DOCUMENT_INVALID_SHAPE"],
    ["없는 프로토콜", addRule({ target: "DROP", protocol: "gre" }), "DOCUMENT_INVALID_SHAPE"],
    ["인터페이스가 객체", addRule({ target: "DROP", inInterface: { toString: 1 } }), "DOCUMENT_INVALID_SHAPE"],
    ["포트가 객체", addRule({ target: "DROP", protocol: "tcp", sourcePort: {} }), "DOCUMENT_INVALID_SHAPE"],
    ["주소가 수", addRule({ target: "DROP", source: 10 }), "INVALID_IPV4"],
    ["틀린 주소", addRule({ target: "DROP", destination: "10.0.0.0/40" }), "INVALID_IPV4"],
    ["없는 인터페이스", addRule({ target: "DROP", inInterface: "GigabitEthernet0/0" }), "UNKNOWN_PORT"],
    ["틀린 포트 번호", addRule({ target: "DROP", protocol: "udp", destinationPort: "70000" }), "FIREWALL_PORT_INVALID"],
    ["체인에 맞지 않는 조건", { type: "firewall/add-rule", deviceId: FW, chain: "OUTPUT", rule: { target: "DROP", inInterface: "Ethernet0" } }, "FIREWALL_RULE_INVALID"],
  ])("%s → %s", (_name, command, code) => {
    const { sim, codeOf } = open();
    const before = sim.getSnapshot().document;
    expect(codeOf(command)).toBe(code);
    expect(sim.getSnapshot().document).toBe(before);
  });

  test("긴 글은 오류에 그대로 실리지 않는다 (SEC-7)", () => {
    const { send } = open();
    const long = "A".repeat(5000);
    for (const rule of [
      { target: "DROP", inInterface: long }, { target: "DROP", outInterface: long },
      { target: "DROP", protocol: "tcp", sourcePort: long }, { target: "DROP", source: long }, { target: long },
    ]) {
      const result = send(addRule(rule));
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result).length).toBeLessThan(300);
    }
  });

  test("정의되지 않은 칸과 프로토타입에서 물려받은 칸은 저장하지 않는다", () => {
    const { send, config } = open();
    expect(send(addRule({ target: "DROP", comment: "x", __proto__: { protocol: "icmp" } })).ok).toBe(true);
    expect(config().filter.FORWARD.rules).toEqual([{ target: "DROP" } satisfies FirewallRule]);
  });
});

describe("인터페이스와 Static route의 Command는 Firewall에서도 동작한다", () => {
  test("주소, 켜고 끄기, 경로. 결과 문서는 늘 검증을 통과한다", () => {
    const { sim, send, config } = open();
    expect(send({ type: "interface/set-ip", deviceId: FW, port: "Ethernet0", ip: "10.0.1.1", mask: "255.255.255.0" }).ok).toBe(true);
    expect(send({ type: "interface/set-admin", deviceId: FW, port: "Ethernet0", adminUp: false }).ok).toBe(true);
    expect(config().interfaces["Ethernet0"]).toEqual({ adminUp: false, ip: "10.0.1.1", mask: "255.255.255.0" });
    expect(send({ type: "route/add", deviceId: FW, network: "192.168.0.0", mask: "255.255.0.0", nextHop: "10.0.1.254" }).ok).toBe(true);
    // 같은 경로를 다시 넣어도 하나다
    expect(send({ type: "route/add", deviceId: FW, network: "192.168.0.0", mask: "255.255.0.0", nextHop: "10.0.1.254" }).ok).toBe(true);
    expect(config().staticRoutes).toEqual([{ network: "192.168.0.0", mask: "255.255.0.0", nextHop: "10.0.1.254" }]);
    expect(send({ type: "interface/clear-ip", deviceId: FW, port: "Ethernet0" }).ok).toBe(true);
    expect(config().interfaces["Ethernet0"]).toEqual({ adminUp: false });
    expect(send({ type: "route/remove", deviceId: FW, network: "192.168.0.0", mask: "255.255.0.0", nextHop: "10.0.1.254" }).ok).toBe(true);
    expect(validateDocument(sim.getSnapshot().document).ok).toBe(true);
  });

  test.each<[string, Record<string, unknown>, string]>([
    ["Router의 포트 이름", { type: "interface/set-ip", port: "GigabitEthernet0/0", ip: "10.0.1.1", mask: "255.255.255.0" }, "UNKNOWN_PORT"],
    ["포트가 수", { type: "interface/set-admin", port: 3, adminUp: true }, "UNKNOWN_PORT"],
    ["켜짐이 글", { type: "interface/set-admin", port: "Ethernet0", adminUp: "yes" }, "DOCUMENT_INVALID_SHAPE"],
    ["주소가 null", { type: "interface/set-ip", port: "Ethernet0", ip: null, mask: "255.255.255.0" }, "INVALID_IPV4"],
    ["네트워크 주소", { type: "interface/set-ip", port: "Ethernet0", ip: "10.0.1.0", mask: "255.255.255.0" }, "IP_IS_NETWORK_ADDRESS"],
    ["AD가 있는 경로", { type: "route/add", network: "10.0.0.0", mask: "255.0.0.0", nextHop: "10.1.1.1", distance: 5 }, "ROUTE_DISTANCE_INVALID"],
    ["없는 경로 지우기", { type: "route/remove", network: "10.0.0.0", mask: "255.0.0.0", nextHop: "10.1.1.1" }, "ROUTE_NOT_FOUND"],
    ["맞지 않는 네트워크", { type: "route/add", network: "10.0.0.1", mask: "255.0.0.0", nextHop: "10.1.1.1" }, "ROUTE_NETWORK_NOT_ALIGNED"],
  ])("%s → %s", (_name, command, code) => {
    expect(open().codeOf({ deviceId: FW, ...command })).toBe(code);
  });

  test("다른 장비가 쓰는 주소면 알림을 낸다. PC가 Firewall의 주소를 써도 같다", () => {
    const { send } = open();
    const PC = "88888888-8888-4888-8888-888888888888";
    send({ type: "device/add", id: PC, kind: "pc", position: { x: 0, y: 200 } });
    send({ type: "pc/set-ip", deviceId: PC, ip: "10.0.1.1", mask: "255.255.255.0", gateway: null });
    expect(send({ type: "interface/set-ip", deviceId: FW, port: "Ethernet0", ip: "10.0.1.1", mask: "255.255.255.0" })).toMatchObject({
      ok: true, notices: [{ code: "DUPLICATE_IP", params: { ip: "10.0.1.1", others: [{ deviceId: PC, deviceName: "PC1" }] } }],
    });
    send({ type: "interface/set-ip", deviceId: FW, port: "Ethernet1", ip: "10.0.2.1", mask: "255.255.255.0" });
    expect(send({ type: "pc/set-ip", deviceId: PC, ip: "10.0.2.1", mask: "255.255.255.0", gateway: null })).toMatchObject({
      ok: true, notices: [{ code: "DUPLICATE_IP", params: { others: [{ deviceId: FW, deviceName: "FW1" }] } }],
    });
  });

  test("Router와 Switch의 같은 Command는 예전 그대로다", () => {
    const { sim, send, codeOf } = open();
    expect(send({ type: "interface/set-ip", deviceId: R1, port: "GigabitEthernet0/0", ip: "10.9.0.1", mask: "255.255.255.0" }).ok).toBe(true);
    expect(send({ type: "interface/set-admin", deviceId: SW, port: "FastEthernet0/1", adminUp: false }).ok).toBe(true);
    expect(codeOf({ type: "interface/set-ip", deviceId: SW, port: "FastEthernet0/1", ip: "10.9.0.2", mask: "255.255.255.0" })).toBe("DEVICE_KIND_MISMATCH");
    expect(codeOf({ type: "route/add", deviceId: "nope", network: "10.0.0.0", mask: "255.0.0.0", nextHop: "10.9.0.2" })).toBe("DEVICE_NOT_FOUND");
    expect(validateDocument(sim.getSnapshot().document).ok).toBe(true);
  });
});

describe("경로 교환을 다시 돌릴지", () => {
  test("필터 규칙과 주소는 RIP 결과를 바꾸지 않는다. 인터페이스를 끄고 켜는 것만 바꾼다", () => {
    const { sim, send } = open();
    expect(send({ type: "rip/enable", deviceId: R1 }).ok).toBe(true);
    const step = (command: unknown) => {
      const before = sim.getSnapshot().document;
      expect(send(command).ok).toBe(true);
      return needsRouteExchange(before, sim.getSnapshot().document);
    };
    expect(step(addRule({ target: "DROP" }))).toBe(false);
    expect(step({ type: "firewall/set-policy", deviceId: FW, chain: "INPUT", policy: "DROP" })).toBe(false);
    expect(step({ type: "interface/set-ip", deviceId: FW, port: "Ethernet0", ip: "10.0.1.1", mask: "255.255.255.0" })).toBe(false);
    expect(step({ type: "interface/set-admin", deviceId: FW, port: "Ethernet0", adminUp: false })).toBe(true);
  });
});
