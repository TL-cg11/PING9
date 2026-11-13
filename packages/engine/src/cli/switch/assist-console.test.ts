// Switch 콘솔의 Tab 완성과 `?` 도움말 (T3.2.2). 공개 인터페이스(createSimulator)로만 확인한다.
import { LIMITS } from "@ping9/shared";
import { TWO_PC_SWITCH, twoPcSwitchDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../../index";

function open() {
  const simulator = createSimulator();
  simulator.load(twoPcSwitchDocument);
  return { simulator, port: simulator.console(TWO_PC_SWITCH.sw1.id) };
}

const tokens = (entries: readonly { readonly token: string }[]) => entries.map((entry) => entry.token);

describe("complete", () => {
  test("지금 모드의 명령어로 완성한다", async () => {
    const { port } = open();

    expect(port.complete("en")).toBe("enable ");
    expect(port.complete("conf")).toBeNull();

    await port.exec("enable");

    expect(port.complete("conf")).toBe("configure ");
    expect(port.complete("sh vl")).toBe("sh vlan ");
  });

  test("완성은 세션과 문서를 바꾸지 않는다", () => {
    const { simulator, port } = open();
    const before = simulator.getSnapshot();

    port.complete("en");

    expect(port.prompt()).toBe("SW1>");
    expect(simulator.getSnapshot()).toBe(before);
  });
});

describe("candidates: Tab을 두 번 누르면 지금 칠 수 있는 명령어를 나열한다", () => {
  const keywords = (entries: readonly { readonly token: string }[]) => tokens(entries).filter((token) => !token.startsWith("<")).sort();

  test("치다 만 글자로 시작하는 명령어", async () => {
    const { port } = open();

    // 사용자 모드의 e는 enable과 exit 둘 다 된다
    expect(port.candidates("e")).toEqual(["enable", "exit"]);

    await port.exec("enable");

    expect(port.candidates("c")).toEqual(["configure"]);
    expect(port.candidates("sh")).toEqual(["show"]);
    expect(port.candidates("zz")).toEqual([]);
  });

  test("빈 자리에서는 그 자리의 명령어 전부. ?가 보이는 단어와 같다", async () => {
    const { port } = open();

    expect(port.candidates("")).toEqual(["enable", "exit"]);

    await port.exec("enable");

    expect(port.candidates("show ")).toEqual(keywords(port.help("show ")));
    expect(port.candidates("show ")).toContain("vlan");
    expect(port.candidates("")).toEqual(keywords(port.help("")));
  });

  test("값을 적는 자리에는 나열할 것이 없다", async () => {
    const { port } = open();
    await port.exec("enable");
    await port.exec("configure terminal");

    // vlan 뒤는 번호 자리다
    expect(tokens(port.help("vlan "))).toEqual(["<id>"]);
    expect(port.candidates("vlan ")).toEqual([]);
  });

  test("나열은 세션과 문서를 바꾸지 않는다", () => {
    const { simulator, port } = open();
    const before = simulator.getSnapshot();

    port.candidates("e");

    expect(port.prompt()).toBe("SW1>");
    expect(simulator.getSnapshot()).toBe(before);
  });

  test("Tab 한 번의 완성은 그대로다: 하나로 정해질 때만, 빈 자리에서는 채우지 않는다", async () => {
    const { port } = open();

    expect(port.complete("en")).toBe("enable ");
    expect(port.complete("e")).toBeNull();
    expect(port.complete("")).toBeNull();

    await port.exec("enable");

    // configure 뒤에 올 단어는 terminal 하나지만 빈 자리라 채우지 않는다
    expect(port.candidates("configure ")).toEqual(["terminal"]);
    expect(port.complete("configure ")).toBeNull();
    expect(port.complete("configure t")).toBe("configure terminal ");
  });
});

describe("help", () => {
  test("지금 모드에서 칠 수 있는 단어와 영어 설명", async () => {
    const { port } = open();

    expect(port.help("")).toEqual([
      { token: "enable", description: "Enter privileged mode" },
      { token: "exit", description: "Leave the current mode" },
    ]);

    await port.exec("enable");
    await port.exec("configure terminal");

    // 명령어가 늘어도 깨지지 않게 들어 있는지만 본다
    expect(tokens(port.help(""))).toEqual(expect.arrayContaining(["end", "exit", "hostname", "interface", "no", "vlan"]));
    expect(tokens(port.help(""))).not.toContain("name");
    expect(port.help("vlan ")).toEqual([{ token: "<id>", description: "VLAN ID (1-4094)" }]);
  });

  test("VLAN 설정 모드에서는 그 모드의 명령과 config 모드의 명령이 함께 나온다", async () => {
    const { port } = open();
    for (const line of ["enable", "configure terminal", "vlan 30"]) await port.exec(line);

    expect(tokens(port.help(""))).toEqual(expect.arrayContaining(["end", "exit", "hostname", "name", "no", "vlan"]));
    expect(tokens(port.help("n"))).toEqual(["name", "no"]);
  });

  test("도움말은 세션과 문서를 바꾸지 않는다", () => {
    const { simulator, port } = open();
    const before = simulator.getSnapshot();

    port.help("en");

    expect(port.prompt()).toBe("SW1>");
    expect(simulator.getSnapshot()).toBe(before);
  });
});

describe("경계 밖의 입력 (AD-16)", () => {
  test("없는 장비의 콘솔은 완성도 도움말도 없다", () => {
    const simulator = createSimulator();
    simulator.load(twoPcSwitchDocument);
    const port = simulator.console("00000000-0000-4000-8000-00000000ffff");

    expect(port.complete("en")).toBeNull();
    expect(port.help("")).toEqual([]);
  });

  test("글이 아닌 값과 너무 긴 줄에도 예외를 던지지 않는다", () => {
    const { port } = open();
    const long = `en${" ".repeat(LIMITS.maxConsoleLineLength)}`;

    for (const value of [undefined, null, 5, {}, { toString: 1 }] as unknown as string[]) {
      expect(port.complete(value)).toBeNull();
      expect(port.help(value)).toEqual([]);
    }
    expect(port.complete(long)).toBeNull();
    expect(port.help(long)).toEqual([]);
  });
});
