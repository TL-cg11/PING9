// Switch 콘솔의 기본 명령어. 공개 인터페이스(createSimulator)로만 확인한다.
import type { ConsoleLine, ConsoleResult } from "@ping9/shared";
import { TWO_PC_SWITCH, twoPcSwitchDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../../index";
import type { ConsolePort } from "../../index";

/** 줄을 차례로 실행하고 마지막 결과를 돌려준다 */
async function run(port: ConsolePort, ...lines: string[]): Promise<ConsoleResult> {
  let result: ConsoleResult = { lines: [] as readonly ConsoleLine[], prompt: port.prompt() };
  for (const line of lines) result = await port.exec(line);
  return result;
}

function open() {
  const simulator = createSimulator();
  simulator.load(twoPcSwitchDocument);
  return { simulator, port: simulator.console(TWO_PC_SWITCH.sw1.id) };
}

describe("모드 전환", () => {
  test.each([
    [["enable"], "SW1#"],
    [["enable", "disable"], "SW1>"],
    [["enable", "configure terminal"], "SW1(config)#"],
    [["enable", "configure terminal", "exit"], "SW1#"],
    [["enable", "configure terminal", "end"], "SW1#"],
    [["enable", "end"], "SW1#"],
    [["enable", "exit"], "SW1>"],
    [["exit"], "SW1>"],
    [["ENABLE", "Configure   Terminal"], "SW1(config)#"],
  ])("%j 뒤의 프롬프트는 %s", async (lines, prompt) => {
    const { port } = open();

    expect((await run(port, ...lines)).prompt).toBe(prompt);
    expect(port.prompt()).toBe(prompt);
  });

  test("모드를 바꾸는 명령은 출력이 없다", async () => {
    const { port } = open();

    expect(await run(port, "enable")).toEqual({ lines: [], prompt: "SW1#" });
  });

  test("모드에 맞지 않는 명령은 CLI_WRONG_MODE", async () => {
    const { port } = open();

    expect(await run(port, "configure terminal")).toEqual({
      lines: [{ kind: "error", code: "CLI_WRONG_MODE", params: { token: "configure" }, position: 0 }],
      prompt: "SW1>",
    });
  });

  test("user 모드에는 end가 없다", async () => {
    const { port } = open();

    expect(await run(port, "end")).toEqual({
      lines: [{ kind: "error", code: "CLI_WRONG_MODE", params: { token: "end" }, position: 0 }],
      prompt: "SW1>",
    });
  });
});

describe("hostname", () => {
  test("device/rename을 dispatch해 이름과 프롬프트를 바꾼다 (T1.3.3)", async () => {
    const { port } = open();

    expect(await run(port, "enable", "configure terminal", "hostname CORE")).toEqual({
      lines: [],
      prompt: "CORE(config)#",
    });
  });

  test("다른 장비가 쓰는 이름이면 reducer의 오류가 그대로 나오고 이름은 그대로다", async () => {
    const { port } = open();

    expect(await run(port, "enable", "configure terminal", "hostname PC1")).toEqual({
      lines: [{ kind: "error", code: "DUPLICATE_DEVICE_NAME", params: { name: "PC1" } }],
      prompt: "SW1(config)#",
    });
  });

  test("이름이 없으면 끝나지 않은 명령어다", async () => {
    const { port } = open();

    expect((await run(port, "enable", "configure terminal", "hostname")).lines).toEqual([
      { kind: "error", code: "CLI_INCOMPLETE_COMMAND", params: {} },
    ]);
  });
});

describe("세션", () => {
  test("터미널을 닫았다 열어도(같은 장비의 ConsolePort를 다시 받아도) 모드가 남는다", async () => {
    const { simulator, port } = open();

    await run(port, "enable", "configure terminal");

    expect(simulator.console(TWO_PC_SWITCH.sw1.id).prompt()).toBe("SW1(config)#");
  });

  test("문서를 다시 불러오면 user 모드로 돌아간다", async () => {
    const { simulator, port } = open();
    await run(port, "enable", "configure terminal");

    simulator.load(twoPcSwitchDocument);

    expect(port.prompt()).toBe("SW1>");
  });

  test("모드를 바꿔도 스냅샷은 그대로이고 구독자를 부르지 않는다", async () => {
    const { simulator, port } = open();
    const before = simulator.getSnapshot();
    let calls = 0;
    simulator.subscribe(() => {
      calls += 1;
    });

    await run(port, "enable", "configure terminal", "end");

    expect(simulator.getSnapshot()).toBe(before);
    expect(calls).toBe(0);
  });
});

describe("다른 장비", () => {
  test("PC의 콘솔은 그대로다", async () => {
    const { simulator } = open();

    expect(await simulator.console(TWO_PC_SWITCH.pc1.id).exec("enable")).toEqual({
      lines: [
        { kind: "text", text: "'enable' is not recognized as an internal or external command," },
        { kind: "text", text: "operable program or batch file." },
        { kind: "notice", code: "PC_UNKNOWN_COMMAND", params: { token: "enable" } },
      ],
      prompt: "PC1 User>",
    });
  });
});
