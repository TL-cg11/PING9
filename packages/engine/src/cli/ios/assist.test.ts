// Tab 완성과 `?` 도움말 (T3.2.2). 해석기와 같은 일치 결과에서 나온다 (AD-8).

import { describe, expect, test } from "vitest";

import { SWITCH_COMMANDS } from "../switch";

import { completeLine, helpFor } from "./assist";
import { defineCommand, param } from "./define";
import type { CliMode, CommandDefinition } from "./define";
import { parseLine } from "./parse";

const run = () => ({});

const VLAN_ID = param("id", "vlan-id", "VLAN ID");

const DEFS = [
  defineCommand({ modes: ["user"], tokens: ["enable"], help: "Enter privileged mode", run }),
  defineCommand({ modes: ["privileged"], tokens: ["configure", "terminal"], help: "Enter configuration mode", run }),
  defineCommand({ modes: ["privileged"], tokens: ["show", "vlan", "brief"], help: "Show VLANs briefly", run }),
  defineCommand({ modes: ["privileged"], tokens: ["show", "vlan"], help: "Show VLANs", run }),
  defineCommand({ modes: ["privileged"], tokens: ["show", "version"], help: "Show the version", run }),
  defineCommand({ modes: ["config"], tokens: ["vlan", VLAN_ID], help: "Create a VLAN", run }),
  defineCommand({ modes: ["config"], tokens: ["no", "vlan", VLAN_ID], help: "Delete a VLAN", run }),
  defineCommand({ modes: ["config"], devices: ["router"], tokens: ["router-only"], help: "Router", run }),
  defineCommand({
    modes: ["config-vlan"],
    tokens: ["name", param("name", "word", "VLAN name")],
    help: "Set the name",
    run,
  }),
  defineCommand({
    modes: ["user", "privileged", "config", "config-if", "config-vlan"],
    tokens: ["exit"],
    help: "Leave the current mode",
    run,
  }),
];

const help = (line: string, mode: CliMode) => helpFor(line, mode, "switch", DEFS);
const complete = (line: string, mode: CliMode) => completeLine(line, mode, "switch", DEFS);
const tokens = (line: string, mode: CliMode) => help(line, mode).map((entry) => entry.token);

describe("helpFor", () => {
  test("빈 줄: 이 모드에서 칠 수 있는 첫 단어를 가나다순으로", () => {
    expect(help("", "user")).toEqual([
      { token: "enable", description: "Enter privileged mode" },
      { token: "exit", description: "Leave the current mode" },
    ]);
  });

  test("빈칸으로 끝나는 줄: 다음에 올 수 있는 단어", () => {
    expect(tokens("show ", "privileged")).toEqual(["version", "vlan"]);
    expect(tokens("configure ", "privileged")).toEqual(["terminal"]);
  });

  test("줄이 여기서 끝나도 되면 <cr>이 나온다", () => {
    expect(help("show vlan ", "privileged")).toEqual([
      { token: "brief", description: "Show VLANs briefly" },
      { token: "<cr>", description: "Show VLANs" },
    ]);
    expect(help("show vlan brief ", "privileged")).toEqual([{ token: "<cr>", description: "Show VLANs briefly" }]);
  });

  test("매개변수 자리는 <이름>과 그 설명", () => {
    expect(help("vlan ", "config")).toEqual([{ token: "<id>", description: "VLAN ID" }]);
    expect(help("no vlan ", "config")).toEqual([{ token: "<id>", description: "VLAN ID" }]);
    expect(help("vlan 10 ", "config")).toEqual([{ token: "<cr>", description: "Create a VLAN" }]);
  });

  test("치다 만 단어: 그 글로 시작하는 단어만", () => {
    expect(tokens("e", "user")).toEqual(["enable", "exit"]);
    expect(tokens("en", "user")).toEqual(["enable"]);
    expect(tokens("show v", "privileged")).toEqual(["version", "vlan"]);
    expect(tokens("SHOW VL", "privileged")).toEqual(["vlan"]);
    expect(tokens("x", "user")).toEqual([]);
  });

  test("앞의 단어를 줄여 써도 된다", () => {
    expect(tokens("sh vl ", "privileged")).toEqual(["brief", "<cr>"]);
  });

  test("여러 정의가 이어지는 단어의 설명", () => {
    expect(help("", "privileged")).toEqual([
      { token: "configure", description: "Enter configuration mode" },
      { token: "exit", description: "Leave the current mode" },
      { token: "show", description: "Show running system information" },
    ]);
    expect(help("", "config")).toEqual([
      { token: "exit", description: "Leave the current mode" },
      { token: "no", description: "Negate a command or set its defaults" },
      { token: "vlan", description: "Create a VLAN" },
    ]);
  });

  test("하위 설정 모드에서는 config 모드의 명령도 나온다", () => {
    expect(tokens("", "config-vlan")).toEqual(["exit", "name", "no", "vlan"]);
  });

  test("다른 장비의 명령어는 나오지 않는다", () => {
    expect(tokens("r", "config")).toEqual([]);
  });

  test("앞의 단어가 틀렸거나 모호하면 아무것도 없다", () => {
    expect(help("foo ", "user")).toEqual([]);
    expect(help("e ", "user")).toEqual([]);
    expect(help("show vlan brief extra ", "privileged")).toEqual([]);
    expect(help("vlan 0 ", "config")).toEqual([]);
  });
});

describe("completeLine", () => {
  test.each([
    ["en", "user", "enable "],
    ["  en", "user", "  enable "],
    ["conf", "privileged", "configure "],
    ["CONF", "privileged", "configure "],
    ["conf t", "privileged", "conf terminal "],
    ["show vl", "privileged", "show vlan "],
    ["sh ver", "privileged", "sh version "],
    ["show vlan b", "privileged", "show vlan brief "],
    ["no v", "config", "no vlan "],
    ["na", "config-vlan", "name "],
    // 이미 다 친 단어는 뒤에 빈칸만 붙는다
    ["show", "privileged", "show "],
  ])("%j (%s) → %j", (line, mode, expected) => {
    expect(complete(line, mode as CliMode)).toBe(expected);
  });

  test.each([
    ["", "user"],
    ["   ", "user"],
    ["show ", "privileged"],
    // 후보가 둘 이상
    ["e", "user"],
    ["show v", "privileged"],
    ["n", "config-vlan"],
    // 후보가 없음
    ["x", "user"],
    ["foo ba", "user"],
    // 매개변수 자리
    ["vlan 1", "config"],
    ["name LA", "config-vlan"],
    // 다른 장비의 명령어
    ["r", "config"],
  ])("%j (%s): 완성할 것이 없다", (line, mode) => {
    expect(complete(line, mode as CliMode)).toBeNull();
  });
});

describe("도움말·완성과 해석기의 일치 (AD-8): Switch의 실제 명령 정의", () => {
  const SAMPLE: Readonly<Record<string, string>> = { "vlan-id": "30", word: "LAB" };
  // 글을 직접 읽는 매개변수는 종류가 아니라 이름으로 예시 값을 고른다
  const SAMPLE_BY_NAME: Readonly<Record<string, string>> = {
    port: "fa0/1",
    type: "fastethernet",
    number: "0/1",
    list: "10,20-30",
  };
  const sampleOf = (token: { readonly param: string; readonly type: string }): string =>
    SAMPLE_BY_NAME[token.param] ?? SAMPLE[token.type] ?? "x";
  const MODES: readonly CliMode[] = ["user", "privileged", "config", "config-vlan"];

  const sampleWords = (definition: CommandDefinition): string[] =>
    definition.tokens.map((token) => (typeof token === "string" ? token : (sampleOf(token))));

  const parse = (line: string, mode: CliMode) => parseLine(line, mode, "switch", SWITCH_COMMANDS);
  const helpTokens = (line: string, mode: CliMode) =>
    helpFor(line, mode, "switch", SWITCH_COMMANDS).map((entry) => entry.token);

  /** (모드, 그 모드에서 칠 수 있는 정의, 앞에서부터 몇 단어) */
  const prefixes = MODES.flatMap((mode) =>
    SWITCH_COMMANDS.filter((definition) => parse(sampleWords(definition).join(" "), mode).ok).flatMap(
      (definition) =>
        definition.tokens.map((_token, index) => ({
          mode,
          definition,
          index,
          typed: sampleWords(definition)
            .slice(0, index)
            .map((word) => `${word} `)
            .join(""),
        })),
    ),
  );

  test("확인할 자리가 충분히 있다", () => {
    expect(prefixes.length).toBeGreaterThan(20);
  });

  test.each(prefixes)("$mode $typed: 칠 수 있는 단어는 도움말에 나온다", ({ mode, definition, index, typed }) => {
    const token = definition.tokens[index];
    const expected = typeof token === "string" ? token : `<${token?.param}>`;

    expect(helpTokens(typed, mode)).toContain(expected);
  });

  test.each(prefixes)("$mode $typed: 도움말에 나온 단어는 칠 수 있다", ({ mode, typed }) => {
    for (const token of helpTokens(typed, mode)) {
      if (token.startsWith("<")) continue;

      const result = parse(typed + token, mode);
      // 줄이 덜 끝났을 수는 있어도, 그 단어가 틀렸다고 나오면 안 된다
      const code = result.ok ? "ok" : result.error.code;
      expect(["ok", "CLI_INCOMPLETE_COMMAND"]).toContain(code);
    }
  });

  test.each(prefixes)("$mode $typed: <cr>은 줄이 여기서 끝나도 될 때만 나온다", ({ mode, typed }) => {
    const finished = typed.trim() !== "" && parse(typed, mode).ok;

    expect(helpTokens(typed, mode).includes("<cr>")).toBe(finished);
  });

  test.each(prefixes)("$mode $typed: Tab은 도움말의 단어 하나로만 완성한다", ({ mode, typed }) => {
    const keywords = helpTokens(typed, mode).filter((token) => !token.startsWith("<"));

    for (const keyword of keywords) {
      for (let length = 1; length <= keyword.length; length += 1) {
        const partial = keyword.slice(0, length);
        const matching = keywords.filter((candidate) => candidate.startsWith(partial));
        const completed = completeLine(typed + partial, mode, "switch", SWITCH_COMMANDS);

        if (matching.length === 1 || matching.includes(partial)) {
          const target = matching.includes(partial) ? partial : matching[0];
          expect(completed).toBe(`${typed}${target} `);
          // 완성된 줄은 줄여 쓴 줄과 같은 명령어로 읽힌다
          expect(parse(`${typed}${target}`, mode)).toEqual(parse(typed + partial, mode));
        } else {
          expect(completed).toBeNull();
        }
      }
    }
  });
});
