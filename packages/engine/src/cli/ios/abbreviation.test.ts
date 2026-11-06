// 줄임 입력 (T3.2.1, FR-21): 단어마다 접두사가 그 자리에서 유일하면 그 키워드로 읽는다.

import fc from "fast-check";
import { describe, expect, test } from "vitest";

import { SWITCH_COMMANDS } from "../switch";

import { defineCommand, param } from "./define";
import type { CliMode, CommandDefinition } from "./define";
import { parseLine } from "./parse";

const run = () => ({});

const VLAN_ID = param("id", "vlan-id", "VLAN ID");

const DEFS = [
  defineCommand({ modes: ["user"], tokens: ["enable"], help: "h", run }),
  defineCommand({ modes: ["privileged"], tokens: ["disable"], help: "h", run }),
  defineCommand({ modes: ["privileged"], tokens: ["configure", "terminal"], help: "h", run }),
  defineCommand({ modes: ["privileged"], tokens: ["show", "vlan", "brief"], help: "h", run }),
  defineCommand({ modes: ["privileged"], tokens: ["show", "vlan"], help: "h", run }),
  defineCommand({ modes: ["privileged"], tokens: ["show", "version"], help: "h", run }),
  defineCommand({ modes: ["config"], tokens: ["vlan", VLAN_ID], help: "h", run }),
  defineCommand({ modes: ["config"], tokens: ["no", "vlan", VLAN_ID], help: "h", run }),
  defineCommand({ modes: ["config"], tokens: ["hostname", param("name", "word", "Name")], help: "h", run }),
  defineCommand({ modes: ["config"], devices: ["router"], tokens: ["router-only"], help: "h", run }),
  defineCommand({ modes: ["config-vlan"], tokens: ["name", param("name", "word", "VLAN name")], help: "h", run }),
  defineCommand({
    modes: ["user", "privileged", "config", "config-if", "config-vlan"],
    tokens: ["exit"],
    help: "h",
    run,
  }),
  defineCommand({ modes: ["privileged", "config", "config-if", "config-vlan"], tokens: ["end"], help: "h", run }),
];

const parse = (line: string, mode: CliMode, definitions: readonly CommandDefinition[] = DEFS) =>
  parseLine(line, mode, "switch", definitions);

/** 정의의 모양을 글로. 키워드는 그대로, 매개변수는 `<이름>` */
const shapeOf = (definition: CommandDefinition): string =>
  definition.tokens.map((token) => (typeof token === "string" ? token : `<${token.param}>`)).join(" ");

describe("줄임 입력: 일치", () => {
  test.each([
    ["en", "user", "enable", {}],
    ["ex", "user", "exit", {}],
    ["conf t", "privileged", "configure terminal", {}],
    ["CONF T", "privileged", "configure terminal", {}],
    ["sh vl br", "privileged", "show vlan brief", {}],
    ["sh vl", "privileged", "show vlan", {}],
    ["sh ver", "privileged", "show version", {}],
    ["d", "privileged", "disable", {}],
    ["v 10", "config", "vlan <id>", { id: 10 }],
    ["n v 10", "config", "no vlan <id>", { id: 10 }],
    ["h SW9", "config", "hostname <name>", { name: "SW9" }],
    ["na LAB", "config-vlan", "name <name>", { name: "LAB" }],
    // 하위 설정 모드에서도 config 모드의 명령을 줄여 쓸 수 있다
    ["v 20", "config-vlan", "vlan <id>", { id: 20 }],
    ["no vl 20", "config-vlan", "no vlan <id>", { id: 20 }],
    ["en", "config-vlan", "end", {}],
  ])("%j (%s) → %s", (line, mode, shape, args) => {
    const result = parse(line, mode as CliMode);

    expect(result.ok && shapeOf(result.definition)).toBe(shape);
    expect(result.ok && result.args).toEqual(args);
  });

  test("매개변수 자리의 글은 줄임으로 읽지 않고 그대로 넘긴다", () => {
    const named = parse("na e", "config-vlan");
    const hostname = parse("hostname end", "config");

    expect(named.ok && named.args).toEqual({ name: "e" });
    expect(hostname.ok && hostname.args).toEqual({ name: "end" });
  });

  test("단어가 키워드와 똑같으면 그 키워드다. 더 긴 키워드의 줄임으로 보지 않는다", () => {
    const definitions = [
      defineCommand({ modes: ["user"], tokens: ["do"], help: "h", run }),
      defineCommand({ modes: ["user"], tokens: ["download"], help: "h", run }),
    ];

    const exact = parse("do", "user", definitions);
    const longer = parse("dow", "user", definitions);

    expect(exact.ok && shapeOf(exact.definition)).toBe("do");
    expect(longer.ok && shapeOf(longer.definition)).toBe("download");
    expect(parse("d", "user", definitions)).toMatchObject({ ok: false, error: { code: "CLI_AMBIGUOUS_COMMAND" } });
  });
});

describe("줄임 입력: 오류", () => {
  test.each([
    // 후보가 둘 이상이면 모호하다
    ["e", "user", { code: "CLI_AMBIGUOUS_COMMAND", params: { token: "e" } }, 0],
    ["  e", "user", { code: "CLI_AMBIGUOUS_COMMAND", params: { token: "e" } }, 2],
    ["e", "privileged", { code: "CLI_AMBIGUOUS_COMMAND", params: { token: "e" } }, 0],
    ["show v", "privileged", { code: "CLI_AMBIGUOUS_COMMAND", params: { token: "v" } }, 5],
    ["sh v br", "privileged", { code: "CLI_AMBIGUOUS_COMMAND", params: { token: "v" } }, 3],
    // config-vlan에서 n은 name과 (config 모드의) no 둘로 읽힌다
    ["n LAB", "config-vlan", { code: "CLI_AMBIGUOUS_COMMAND", params: { token: "n" } }, 0],
    // 줄여 쓴 뒤의 틀린 단어
    ["conf x", "privileged", { code: "CLI_UNKNOWN_COMMAND", params: { token: "x" } }, 5],
    ["sh vl br x", "privileged", { code: "CLI_UNKNOWN_COMMAND", params: { token: "x" } }, 9],
    ["v 0", "config", { code: "INVALID_VLAN_ID", params: { value: 0 } }, 2],
    // 줄여 써도 모드가 틀린 것은 모드가 틀렸다고 알린다
    ["conf t", "user", { code: "CLI_WRONG_MODE", params: { token: "conf" } }, 0],
    ["v 10", "privileged", { code: "CLI_WRONG_MODE", params: { token: "v" } }, 0],
    // 다른 장비의 명령어는 줄여도 없는 명령어다
    ["r", "config", { code: "CLI_UNKNOWN_COMMAND", params: { token: "r" } }, 0],
    // 키워드보다 긴 글은 그 키워드가 아니다
    ["enablex", "user", { code: "CLI_UNKNOWN_COMMAND", params: { token: "enablex" } }, 0],
  ])("%j (%s): 오류와 위치", (line, mode, error, position) => {
    expect(parse(line, mode as CliMode)).toEqual({ ok: false, error, position });
  });

  test.each([
    ["conf", "privileged"],
    ["sh", "privileged"],
    ["v", "config"],
    ["n v", "config"],
  ])("%j (%s): 줄여 쓴 명령어가 끝나지 않았다", (line, mode) => {
    expect(parse(line, mode as CliMode)).toEqual({
      ok: false,
      error: { code: "CLI_INCOMPLETE_COMMAND", params: {} },
    });
  });
});

describe("줄임 입력: Switch의 실제 명령 정의", () => {
  const SAMPLE: Readonly<Record<string, string>> = { "vlan-id": "30", word: "LAB" };
  // 글을 직접 읽는 매개변수는 종류가 아니라 이름으로 예시 값을 고른다
  const SAMPLE_BY_NAME: Readonly<Record<string, string>> = { port: "fa0/1", type: "fastethernet", number: "0/1" };
  const sampleOf = (token: { readonly param: string; readonly type: string }): string =>
    SAMPLE_BY_NAME[token.param] ?? SAMPLE[token.type] ?? "x";

  /** 정의마다 (모드, 정의, 키워드별 접두사 길이의 씨앗)을 뽑는다 */
  const cases = SWITCH_COMMANDS.flatMap((definition) => definition.modes.map((mode) => ({ definition, mode })));

  test("키워드를 어떻게 줄여도 원래 명령어로 읽히거나 모호하다고 알린다", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...cases),
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 8, maxLength: 8 }),
        ({ definition, mode }, seeds) => {
          const line = definition.tokens
            .map((token, index) => {
              if (typeof token !== "string") return sampleOf(token);
              // 1글자부터 전체까지
              const length = 1 + Math.floor((seeds[index] ?? 0) * token.length);
              return token.slice(0, Math.min(length, token.length));
            })
            .join(" ");

          const result = parseLine(line, mode, "switch", SWITCH_COMMANDS);

          if (result.ok) {
            expect(shapeOf(result.definition)).toBe(shapeOf(definition));
          } else {
            expect(result.error.code).toBe("CLI_AMBIGUOUS_COMMAND");
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  test.each(cases)("$mode: 줄이지 않은 명령어는 그대로 읽힌다 ($definition.help)", ({ definition, mode }) => {
    const line = definition.tokens
      .map((token) => (typeof token === "string" ? token : (sampleOf(token))))
      .join(" ");

    const result = parseLine(line, mode, "switch", SWITCH_COMMANDS);

    expect(result.ok && shapeOf(result.definition)).toBe(shapeOf(definition));
  });
});
