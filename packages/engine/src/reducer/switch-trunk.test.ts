// `switchport/set-allowed-vlans`와 trunk 명령어 (T5.3.1, FR-33).

import { LIMITS, validateDocument } from "@ping9/shared";
import type { Command, SwitchDevice, VlanRange } from "@ping9/shared";
import { TWO_PC_SWITCH, twoPcSwitchDocument } from "@ping9/shared/examples";
import fc from "fast-check";
import { describe, expect, test } from "vitest";

import { formatVlanList, parseVlanList } from "../cli/switch/vlan-list";
import { createSimulator } from "../index";
import type { Simulator } from "../index";
import { normalizeSwitchConfig } from "./switch-common";

const { sw1, pc1 } = TWO_PC_SWITCH;
const FA8 = "FastEthernet0/8";

function open(): Simulator {
  const simulator = createSimulator();
  simulator.load(twoPcSwitchDocument);
  return simulator;
}

const configOf = (simulator: Simulator) =>
  (simulator.getSnapshot().document.devices.find((device) => device.id === sw1.id) as SwitchDevice).config;

const allow = (simulator: Simulator, allowedVlans: unknown, fields: Record<string, unknown> = {}) =>
  simulator.dispatch({
    type: "switchport/set-allowed-vlans",
    deviceId: sw1.id,
    port: FA8,
    allowedVlans,
    ...fields,
  } as unknown as Command);

describe("switchport/set-allowed-vlans", () => {
  test("허용 목록을 저장한다", () => {
    const simulator = open();

    expect(allow(simulator, [[10, 10], [20, 30]])).toEqual({ ok: true, notices: [] });

    expect(configOf(simulator).ports[FA8]).toEqual({ adminUp: true, mode: "access", allowedVlans: [[10, 10], [20, 30]] });
    expect(validateDocument(simulator.getSnapshot().document).ok).toBe(true);
  });

  test("정렬하고, 겹치거나 이어진 범위를 합친다", () => {
    const simulator = open();

    allow(simulator, [[20, 30], [10, 10], [25, 40], [11, 12], [41, 41]]);

    expect(configOf(simulator).ports[FA8]?.allowedVlans).toEqual([[10, 12], [20, 41]]);
  });

  test("전부 허용은 기본값이라 저장하지 않는다", () => {
    const simulator = open();
    allow(simulator, [[10, 20]]);

    allow(simulator, [[1, 2000], [2001, 4094]]);

    expect(configOf(simulator).ports).toEqual({});
  });

  test("빈 목록은 아무 VLAN도 허용하지 않는다는 뜻이고 그대로 저장한다", () => {
    const simulator = open();

    allow(simulator, []);

    expect(configOf(simulator).ports[FA8]).toEqual({ adminUp: true, mode: "access", allowedVlans: [] });
  });

  test.each([
    ["범위를 벗어난 시작", [[0, 5]], "INVALID_VLAN_ID"],
    ["범위를 벗어난 끝", [[5, 4095]], "INVALID_VLAN_ID"],
    ["정수가 아닌 수", [[1.5, 2]], "INVALID_VLAN_ID"],
    ["시작이 끝보다 큼", [[10, 5]], "DOCUMENT_INVALID_SHAPE"],
    ["짝이 아닌 항목", [[1]], "DOCUMENT_INVALID_SHAPE"],
    ["수의 나열", [1, 2], "DOCUMENT_INVALID_SHAPE"],
    ["배열이 아닌 값", "10,20", "DOCUMENT_INVALID_SHAPE"],
    ["없는 값", undefined, "DOCUMENT_INVALID_SHAPE"],
    ["null", null, "DOCUMENT_INVALID_SHAPE"],
  ])("%s: 거부하고 문서를 바꾸지 않는다", (_name, allowedVlans, code) => {
    const simulator = open();
    const before = simulator.getSnapshot();

    expect(allow(simulator, allowedVlans)).toMatchObject({ ok: false, error: { code } });
    expect(simulator.getSnapshot()).toBe(before);
  });

  test.each([
    ["없는 포트", { port: "FastEthernet0/9" }, "UNKNOWN_PORT"],
    ["없는 장비", { deviceId: "00000000-0000-4000-8000-00000000ffff" }, "DEVICE_NOT_FOUND"],
    ["Switch가 아닌 장비", { deviceId: pc1.id }, "DEVICE_KIND_MISMATCH"],
  ])("%s: 거부한다", (_name, fields, code) => {
    expect(allow(open(), [[10, 10]], fields)).toMatchObject({ ok: false, error: { code } });
  });

  test("합친 뒤의 범위가 한도를 넘으면 거부한다", () => {
    const max = LIMITS.maxAllowedVlanRanges;
    // 2, 4, 6, ... 서로 떨어진 범위
    const apart = (count: number): VlanRange[] => Array.from({ length: count }, (_unused, index) => [index * 2 + 2, index * 2 + 2]);
    const simulator = open();

    expect(allow(simulator, apart(max + 1))).toEqual({
      ok: false,
      error: { code: "LIMIT_EXCEEDED", params: { limit: "allowedVlanRanges", max } },
    });
    expect(allow(simulator, apart(max)).ok).toBe(true);
    // 수는 많아도 합치면 하나인 목록은 받는다
    expect(allow(simulator, Array.from({ length: 200 }, (_unused, index) => [index + 1, index + 1])).ok).toBe(true);
    expect(configOf(simulator).ports[FA8]?.allowedVlans).toEqual([[1, 200]]);
  });
});

describe("VLAN 목록 글", () => {
  test.each([
    ["10", [[10, 10]]],
    ["10,20", [[10, 10], [20, 20]]],
    ["10-20,30", [[10, 20], [30, 30]]],
    ["1-4094", [[1, 4094]]],
    ["all", [[1, 4094]]],
    ["ALL", [[1, 4094]]],
    ["none", []],
  ])("%j를 읽는다", (text, ranges) => {
    expect(parseVlanList(text)).toEqual({ ok: true, ranges });
  });

  test.each([
    ["", "CLI_INVALID_VALUE"],
    ["10,,20", "CLI_INVALID_VALUE"],
    ["10,", "CLI_INVALID_VALUE"],
    ["10-", "CLI_INVALID_VALUE"],
    ["-10", "CLI_INVALID_VALUE"],
    ["20-10", "CLI_INVALID_VALUE"],
    ["abc", "CLI_INVALID_VALUE"],
    ["10 20", "CLI_INVALID_VALUE"],
    ["1e1", "CLI_INVALID_VALUE"],
    ["0", "INVALID_VLAN_ID"],
    ["4095", "INVALID_VLAN_ID"],
    ["10-5000", "INVALID_VLAN_ID"],
    ["99999", "INVALID_VLAN_ID"],
  ])("%j는 거부한다 (%s)", (text, code) => {
    expect(parseVlanList(text)).toMatchObject({ ok: false, error: { code } });
  });

  test.each([
    [[[1, 4094]], "all"],
    [[], "none"],
    [[[10, 10]], "10"],
    [[[10, 10], [20, 30]], "10,20-30"],
  ] as const)("%j를 %j로 쓴다", (ranges, text) => {
    expect(formatVlanList(ranges)).toBe(text);
  });
});

describe("trunk 명령어", () => {
  async function run(...lines: string[]) {
    const simulator = open();
    const port = simulator.console(sw1.id);
    let last = await port.exec("enable");
    for (const line of ["configure terminal", "interface fa0/8", ...lines]) last = await port.exec(line);
    return { simulator, last };
  }

  test.each([
    ["switchport trunk allowed vlan 10,20", [[10, 10], [20, 20]]],
    ["switchport trunk allowed vlan 10-20,30", [[10, 20], [30, 30]]],
    ["switchport trunk allowed vlan 20,10,11", [[10, 11], [20, 20]]],
    ["switchport trunk allowed vlan none", []],
    ["sw tr al vl 10,20", [[10, 10], [20, 20]]],
  ])("%j", async (line, ranges) => {
    const { simulator, last } = await run("switchport mode trunk", line);

    expect(last.lines).toEqual([]);
    expect(configOf(simulator).ports[FA8]).toEqual({ adminUp: true, mode: "trunk", allowedVlans: ranges });
  });

  test.each([
    ["switchport trunk allowed vlan all"],
    ["no switchport trunk allowed vlan"],
    ["no sw tr al vl"],
  ])("%j: 전부 허용으로 되돌린다", async (line) => {
    const { simulator } = await run("switchport mode trunk", "switchport trunk allowed vlan 10", line);

    expect(configOf(simulator).ports[FA8]).toEqual({ adminUp: true, mode: "trunk" });
  });

  test.each([
    ["switchport trunk allowed vlan 10,,20", { code: "CLI_INVALID_VALUE", params: { token: "10,,20" } }],
    ["switchport trunk allowed vlan 20-10", { code: "CLI_INVALID_VALUE", params: { token: "20-10" } }],
    ["switchport trunk allowed vlan 4095", { code: "INVALID_VLAN_ID", params: { value: 4095 } }],
  ])("%j: 오류와 위치", async (line, error) => {
    const { last } = await run(line);

    expect(last.lines).toEqual([{ kind: "error", ...error, position: 30 }]);
  });

  test("switchport trunk allowed vlan add는 지금 목록에 더한다", async () => {
    const added = await run("switchport mode trunk", "switchport trunk allowed vlan 10", "switchport trunk allowed vlan add 20-21,11");
    expect(configOf(added.simulator).ports[FA8]?.allowedVlans).toEqual([[10, 11], [20, 21]]);

    const fromNone = await run("switchport trunk allowed vlan none", "sw tr al vl add 30");
    expect(configOf(fromNone.simulator).ports[FA8]?.allowedVlans).toEqual([[30, 30]]);

    // 전부 허용인 목록에 더해도 전부 허용이다
    const fromAll = await run("switchport trunk allowed vlan add 30");
    expect(configOf(fromAll.simulator).ports).toEqual({});
  });

  test("목록이 빠지면 끝나지 않은 명령어다", async () => {
    const { last } = await run("switchport trunk allowed vlan");

    expect(last.lines).toEqual([{ kind: "error", code: "CLI_INCOMPLETE_COMMAND", params: {} }]);
  });
});

describe("Switch의 모든 Command (속성 기반)", () => {
  const port = fc.constantFrom("FastEthernet0/1", "FastEthernet0/2", "FastEthernet0/8");
  const vlanId = fc.constantFrom(1, 2, 10, 20, 4094);
  const range = fc.tuple(fc.integer({ min: 1, max: 4094 }), fc.integer({ min: 1, max: 4094 })).map(
    ([a, b]): VlanRange => [Math.min(a, b), Math.max(a, b)],
  );
  const command = fc.oneof(
    fc.record({ type: fc.constant("vlan/create"), vlanId }),
    fc.record({ type: fc.constant("vlan/remove"), vlanId }),
    fc.record({ type: fc.constant("interface/set-admin"), port, adminUp: fc.boolean() }),
    fc.record({ type: fc.constant("switchport/set-mode"), port, mode: fc.constantFrom("access", "trunk") }),
    fc.record({ type: fc.constant("switchport/set-access-vlan"), port, vlanId }),
    fc.record({ type: fc.constant("switchport/set-allowed-vlans"), port, allowedVlans: fc.array(range, { maxLength: 6 }) }),
  );

  test("어떤 순서로 넣어도 문서는 유효하고 구성은 정규화된 형태다", () => {
    fc.assert(
      fc.property(fc.array(command, { maxLength: 25 }), (commands) => {
        const simulator = open();
        for (const fields of commands) {
          const before = simulator.getSnapshot();
          const result = simulator.dispatch({ deviceId: sw1.id, ...fields } as unknown as Command);
          if (!result.ok) expect(simulator.getSnapshot()).toBe(before);
        }

        const config = configOf(simulator);
        expect(validateDocument(simulator.getSnapshot().document).ok).toBe(true);
        expect(normalizeSwitchConfig(config)).toEqual(config);
      }),
      { numRuns: 300 },
    );
  });
});
