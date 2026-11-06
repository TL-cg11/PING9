import { describe, expect, test } from "vitest";

import { defineCommand, param } from "./define";
import type { CliMode } from "./define";
import { parseLine } from "./parse";

const run = () => ({});

const DEFS = [
  defineCommand({ modes: ["user"], tokens: ["enable"], help: "h", run }),
  defineCommand({ modes: ["privileged"], tokens: ["configure", "terminal"], help: "h", run }),
  defineCommand({ modes: ["config"], tokens: ["vlan", param("id", "vlan-id", "VLAN ID")], help: "h", run }),
  defineCommand({ modes: ["config"], tokens: ["no", "vlan", param("id", "vlan-id", "VLAN ID")], help: "h", run }),
  defineCommand({ modes: ["config-vlan"], tokens: ["name", param("name", "word", "VLAN name")], help: "h", run }),
  defineCommand({ modes: ["config"], devices: ["router"], tokens: ["router-only"], help: "h", run }),
];

const parse = (line: string, mode: CliMode) => parseLine(line, mode, "switch", DEFS);

describe("parseLine: 일치", () => {
  test.each([
    ["enable", "user", ["enable"], {}],
    ["  ENABLE  ", "user", ["enable"], {}],
    ["configure\t terminal", "privileged", ["configure", "terminal"], {}],
    ["vlan 10", "config", ["vlan", "id"], { id: 10 }],
    ["no vlan 4094", "config", ["no", "vlan", "id"], { id: 4094 }],
    ["name SALES", "config-vlan", ["name", "name"], { name: "SALES" }],
    // 하위 설정 모드에서 config 모드의 명령을 치면 config 모드의 명령으로 해석한다
    ["vlan 20", "config-vlan", ["vlan", "id"], { id: 20 }],
  ])("%j (%s): 정의와 인자를 찾는다", (line, mode, shape, args) => {
    const result = parse(line, mode as CliMode);

    expect(
      result.ok && result.definition.tokens.map((token) => (typeof token === "string" ? token : token.param)),
    ).toEqual(shape);
    expect(result.ok && result.args).toEqual(args);
  });
});

describe("parseLine: 오류", () => {
  test.each([
    ["foo", "user", { code: "CLI_UNKNOWN_COMMAND", params: { token: "foo" } }, 0],
    ["  enable now", "user", { code: "CLI_UNKNOWN_COMMAND", params: { token: "now" } }, 9],
    ["configure", "privileged", { code: "CLI_INCOMPLETE_COMMAND", params: {} }, undefined],
    ["vlan", "config", { code: "CLI_INCOMPLETE_COMMAND", params: {} }, undefined],
    ["vlan 10", "privileged", { code: "CLI_WRONG_MODE", params: { token: "vlan" } }, 0],
    ["router-only", "config", { code: "CLI_UNKNOWN_COMMAND", params: { token: "router-only" } }, 0],
    ["vlan 0", "config", { code: "INVALID_VLAN_ID", params: { value: 0 } }, 5],
    ["vlan 4095", "config", { code: "INVALID_VLAN_ID", params: { value: 4095 } }, 5],
    ["vlan 1e1", "config", { code: "CLI_INVALID_VALUE", params: { token: "1e1" } }, 5],
    ["vlan 10.0", "config", { code: "CLI_INVALID_VALUE", params: { token: "10.0" } }, 5],
    ["vlan -1", "config", { code: "CLI_INVALID_VALUE", params: { token: "-1" } }, 5],
    ["vlan 0x10", "config", { code: "CLI_INVALID_VALUE", params: { token: "0x10" } }, 5],
    [
      "vlan 99999999999999999999",
      "config",
      { code: "CLI_INVALID_VALUE", params: { token: "99999999999999999999" } },
      5,
    ],
  ])("%j (%s): 오류와 위치", (line, mode, error, position) => {
    expect(parse(line, mode as CliMode)).toEqual(
      position === undefined ? { ok: false, error } : { ok: false, error, position },
    );
  });

  test("오류에 담는 단어는 64자로 자른다", () => {
    const result = parse("x".repeat(500), "user");

    expect(
      result.ok === false && result.error.code === "CLI_UNKNOWN_COMMAND" && result.error.params.token,
    ).toHaveLength(64);
  });

  test("빈 줄은 끝나지 않은 명령어다", () => {
    expect(parse("   ", "user")).toEqual({ ok: false, error: { code: "CLI_INCOMPLETE_COMMAND", params: {} } });
  });
});

describe("parseLine: ipv4와 mask 매개변수 (T1.6.1)", () => {
  const ADDRESS_DEFS = [
    defineCommand({
      modes: ["user"],
      tokens: ["addr", param("ip", "ipv4", "IPv4 address"), param("mask", "mask", "Subnet mask")],
      help: "h",
      run,
    }),
  ];
  const parseAddress = (line: string) => parseLine(line, "user", "pc", ADDRESS_DEFS);

  test.each([
    ["addr 10.0.0.1 255.255.255.0", { ip: "10.0.0.1", mask: "255.255.255.0" }],
    // 형식만 본다. 특수 주소와 네트워크 주소는 reducer가 거부한다
    ["addr 127.0.0.1 255.0.0.0", { ip: "127.0.0.1", mask: "255.0.0.0" }],
    ["addr 10.0.0.0 255.255.255.0", { ip: "10.0.0.0", mask: "255.255.255.0" }],
  ])("%j: 값을 글 그대로 넘긴다", (line, args) => {
    const result = parseAddress(line);

    expect(result.ok && result.args).toEqual(args);
  });

  test.each([
    ["addr 10.0.0 255.255.255.0", { code: "INVALID_IPV4", params: { value: "10.0.0" } }, 5],
    ["addr 10.0.0.256 255.255.255.0", { code: "INVALID_IPV4", params: { value: "10.0.0.256" } }, 5],
    ["addr 10.0.0.1 255.0.255.0", { code: "INVALID_MASK", params: { value: "255.0.255.0" } }, 14],
    ["addr 10.0.0.1 mask", { code: "INVALID_MASK", params: { value: "mask" } }, 14],
  ])("%j: 형식이 틀리면 shared의 오류 코드와 위치", (line, error, position) => {
    expect(parseAddress(line)).toEqual({ ok: false, error, position });
  });

  test("오류에 담는 값은 64자로 자른다", () => {
    const long = "1".repeat(300);
    const result = parseAddress(`addr ${long} 255.255.255.0`);

    expect(result).toEqual({ ok: false, error: { code: "INVALID_IPV4", params: { value: long.slice(0, 64) } }, position: 5 });
  });
});
