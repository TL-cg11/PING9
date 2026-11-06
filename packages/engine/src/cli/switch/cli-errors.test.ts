// CLI 오류 다섯 가지와 틀린 위치 (T3.5.1, FR-46). Switch의 실제 명령어로 확인한다.

import { LIMITS } from "@ping9/shared";
import type { ConsoleLine } from "@ping9/shared";
import { TWO_PC_SWITCH, twoPcSwitchDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../../index";

const SETUP: Readonly<Record<string, readonly string[]>> = {
  user: [],
  privileged: ["enable"],
  config: ["enable", "configure terminal"],
  "config-if": ["enable", "configure terminal", "interface fa0/1"],
  "config-vlan": ["enable", "configure terminal", "vlan 10"],
};

async function errorOf(mode: string, line: string): Promise<ConsoleLine | undefined> {
  const simulator = createSimulator();
  simulator.load(twoPcSwitchDocument);
  const port = simulator.console(TWO_PC_SWITCH.sw1.id);
  for (const setup of SETUP[mode] ?? []) await port.exec(setup);
  return (await port.exec(line)).lines[0];
}

describe("알 수 없는 명령어", () => {
  test.each([
    ["user", "foo", "foo", 0],
    ["privileged", "show foo", "foo", 5],
    ["privileged", "show vlan brief now", "now", 16],
    ["config", "vlan 10 extra", "extra", 8],
    ["config", "   hostname  SW9  x", "x", 18],
    ["config-if", "switchport mode hybrid", "hybrid", 16],
  ])("%s %j: %s (위치 %i)", async (mode, line, token, position) => {
    expect(await errorOf(mode, line)).toEqual({ kind: "error", code: "CLI_UNKNOWN_COMMAND", params: { token }, position });
  });
});

describe("끝나지 않은 명령어", () => {
  test.each([
    ["privileged", "show"],
    ["privileged", "configure"],
    ["config", "vlan"],
    ["config", "interface"],
    ["config-if", "switchport access vlan"],
    ["config-if", "no switchport"],
  ])("%s %j", async (mode, line) => {
    expect(await errorOf(mode, line)).toEqual({ kind: "error", code: "CLI_INCOMPLETE_COMMAND", params: {} });
  });
});

describe("값이 틀림", () => {
  test.each([
    // 형식이 틀린 값은 CLI의 코드
    ["config", "vlan abc", { code: "CLI_INVALID_VALUE", params: { token: "abc" } }, 5],
    ["config", "interface fa0/9", { code: "CLI_INVALID_VALUE", params: { token: "fa0/9" } }, 10],
    ["config-if", "switchport trunk allowed vlan 10,,20", { code: "CLI_INVALID_VALUE", params: { token: "10,,20" } }, 30],
    // 범위를 벗어난 값은 shared 값 검증의 코드를 그대로
    ["config", "vlan 0", { code: "INVALID_VLAN_ID", params: { value: 0 } }, 5],
    ["config", "no vlan 4095", { code: "INVALID_VLAN_ID", params: { value: 4095 } }, 8],
    ["config-if", "switchport access vlan 5000", { code: "INVALID_VLAN_ID", params: { value: 5000 } }, 23],
  ])("%s %j", async (mode, line, error, position) => {
    expect(await errorOf(mode, line)).toEqual({ kind: "error", ...error, position });
  });
});

describe("이 모드에서는 쓸 수 없음", () => {
  test.each([
    ["user", "configure terminal", "configure"],
    ["user", "conf t", "conf"],
    ["user", "show vlan brief", "show"],
    ["privileged", "vlan 10", "vlan"],
    // 뒤의 값이 틀렸어도 모드가 틀린 것이 먼저다
    ["privileged", "vlan abc", "vlan"],
    ["privileged", "interface fa0/9", "interface"],
    ["config", "shutdown", "shutdown"],
    ["config", "name LAB", "name"],
    ["config", "show vlan brief", "show"],
    ["config-vlan", "switchport mode trunk", "switchport"],
    // 줄여 쓴 첫 단어가 다른 모드의 여러 명령어로 읽혀도 모드가 틀린 것이다
    ["user", "sh vl br", "sh"],
  ])("%s %j", async (mode, line, token) => {
    expect(await errorOf(mode, line)).toEqual({ kind: "error", code: "CLI_WRONG_MODE", params: { token }, position: 0 });
  });
});

describe("여러 명령어로 읽힘", () => {
  test.each([
    ["user", "e", "e", 0],
    ["privileged", "  e", "e", 2],
    ["config-if", "s", "s", 0],
    ["config-if", "no s", "s", 3],
    ["config-vlan", "n LAB", "n", 0],
  ])("%s %j: %s (위치 %i)", async (mode, line, token, position) => {
    expect(await errorOf(mode, line)).toEqual({ kind: "error", code: "CLI_AMBIGUOUS_COMMAND", params: { token }, position });
  });
});

describe("그 밖", () => {
  test("다섯 가지 오류는 서로 다른 코드다", async () => {
    const codes = await Promise.all([
      errorOf("user", "foo"),
      errorOf("privileged", "show"),
      errorOf("config", "vlan abc"),
      errorOf("privileged", "vlan 10"),
      errorOf("user", "e"),
    ]);

    expect(new Set(codes.map((line) => (line?.kind === "error" ? line.code : ""))).size).toBe(5);
  });

  test("너무 긴 줄은 해석하지 않고 거부한다", async () => {
    expect(await errorOf("user", "x".repeat(LIMITS.maxConsoleLineLength + 1))).toEqual({
      kind: "error",
      code: "CLI_LINE_TOO_LONG",
      params: { limit: LIMITS.maxConsoleLineLength },
    });
  });

  test("오류에 담는 단어는 64자로 자른다", async () => {
    const line = await errorOf("user", "y".repeat(300));

    expect(line?.kind === "error" && line.code === "CLI_UNKNOWN_COMMAND" && line.params.token).toHaveLength(64);
  });
});
