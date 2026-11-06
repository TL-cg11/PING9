import { createSimulator } from "@ping9/engine";
import { TWO_SWITCH_VLAN, twoSwitchVlanDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { cleanInput, historyStep, initialTerminal, received, runLine, submitted } from "./terminal-state";

function switchPort() {
  const simulator = createSimulator();
  simulator.load(twoSwitchVlanDocument);
  return simulator.console(TWO_SWITCH_VLAN.sw1.id);
}

describe("runLine", () => {
  test("명령을 실행하면 입력 줄, 출력 줄, 새 프롬프트가 남는다", async () => {
    const port = switchPort();
    let state = initialTerminal(port.prompt());

    state = await runLine(port, state, "enable");
    state = await runLine(port, state, "show vlan brief");

    expect(state.prompt).toBe("SW1#");
    expect(state.lines.slice(0, 3)).toEqual([
      { kind: "input", prompt: "SW1>", text: "enable" },
      { kind: "input", prompt: "SW1#", text: "show vlan brief" },
      { kind: "text", text: "VLAN  Name     Status  Ports" },
    ]);
    expect(state.history).toEqual(["enable", "show vlan brief"]);
  });

  test("오류는 한국어 한 줄이 된다", async () => {
    const port = switchPort();

    const state = await runLine(port, initialTerminal(port.prompt()), "vlan 10");

    expect(state.lines.at(-1)).toEqual({ kind: "error", text: "이 모드에서는 쓸 수 없는 명령어예요: vlan" });
    expect(state.prompt).toBe("SW1>");
  });

  test("HTML처럼 생긴 입력도 글자 그대로 기록한다", async () => {
    const port = switchPort();

    const state = await runLine(port, initialTerminal(port.prompt()), "<img src=x onerror=alert(1)>");

    expect(state.lines[0]).toEqual({ kind: "input", prompt: "SW1>", text: "<img src=x onerror=alert(1)>" });
  });

  test("연달아 실행해도 줄의 순서가 입력 순서와 같다", async () => {
    const port = switchPort();
    let state = initialTerminal(port.prompt());
    let chain = Promise.resolve();

    for (const line of ["enable", "configure terminal", "vlan 30", "end"]) {
      chain = chain.then(async () => {
        state = await runLine(port, state, line);
      });
    }
    await chain;

    expect(state.lines.filter((line) => line.kind === "input").map((line) => line.text)).toEqual([
      "enable",
      "configure terminal",
      "vlan 30",
      "end",
    ]);
    expect(state.prompt).toBe("SW1#");
  });
});

describe("cleanInput", () => {
  test("제어 문자를 지운다", () => {
    expect(cleanInput("en\u0007ab\u001b[31mle\u0000")).toBe("enab[31mle");
    expect(cleanInput("a\u007fb\u009fc")).toBe("abc");
  });

  test("탭은 지우지 않고 공백으로 바꾼다 (붙여 넣은 줄의 단어가 붙지 않게)", () => {
    expect(cleanInput("show\tvlan\tbrief")).toBe("show vlan brief");
  });

  test("탭으로 띄운 명령어도 실행된다", async () => {
    const port = switchPort();
    let state = await runLine(port, initialTerminal(port.prompt()), "enable");

    state = await runLine(port, state, "show\tvlan\tbrief");

    expect(state.lines.at(-1)).toMatchObject({ kind: "text" });
    expect(state.lines.some((line) => line.kind === "error")).toBe(false);
  });

  test("512자로 자른다", () => {
    expect(cleanInput("x".repeat(600))).toHaveLength(512);
  });

  test("보통 글자와 한글은 그대로 둔다", () => {
    expect(cleanInput("vlan 10 이름")).toBe("vlan 10 이름");
  });
});

describe("이전 명령어", () => {
  test("빈 줄과 바로 앞과 같은 줄은 이력에 넣지 않는다", () => {
    let state = initialTerminal("SW1>");

    for (const line of ["enable", "enable", "", "exit"]) state = submitted(state, line);

    expect(state.history).toEqual(["enable", "exit"]);
    expect(state.lines).toHaveLength(4);
  });

  test("위·아래로 이전 명령어를 오간다", () => {
    let state = initialTerminal("SW1>");
    for (const line of ["a", "b"]) state = submitted(state, line);

    const steps: string[] = [];
    for (const direction of ["up", "up", "up", "down", "down"] as const) {
      const next = historyStep(state, direction);
      state = next.state;
      steps.push(next.input);
    }

    expect(steps).toEqual(["b", "a", "a", "b", ""]);
    expect(state.historyIndex).toBeNull();
  });

  test("이력이 없으면 아무 일도 없다", () => {
    const state = initialTerminal("SW1>");

    expect(historyStep(state, "up")).toEqual({ state, input: "" });
    expect(historyStep(state, "down")).toEqual({ state, input: "" });
  });

  test("명령을 실행하면 이력의 위치가 처음으로 돌아간다", () => {
    let state = initialTerminal("SW1>");
    for (const line of ["a", "b"]) state = submitted(state, line);
    state = historyStep(state, "up").state;

    state = submitted(state, "c");

    expect(state.historyIndex).toBeNull();
    expect(historyStep(state, "up").input).toBe("c");
  });
});

describe("화면 기록", () => {
  test("5,000줄을 넘지 않는다", () => {
    let state = initialTerminal("SW1>");

    for (let index = 0; index < 5100; index += 1) state = submitted(state, `line ${index}`);

    expect(state.lines).toHaveLength(5000);
    expect(state.lines.at(-1)).toEqual({ kind: "input", prompt: "SW1>", text: "line 5099" });
  });

  test("추적 줄은 아직 그리지 않는다", () => {
    const state = received(initialTerminal("PC1>"), {
      lines: [
        { kind: "text", text: "Reply from 10.0.10.3" },
        { kind: "trace", traceId: 1 },
      ],
      prompt: "PC1>",
    });

    expect(state.lines).toEqual([{ kind: "text", text: "Reply from 10.0.10.3" }]);
  });

  test("알림은 한국어 한 줄이 된다", () => {
    const state = received(initialTerminal("SW1(config-if)#"), {
      lines: [
        {
          kind: "notice",
          code: "VLAN_AUTO_CREATED",
          params: { device: { deviceId: "d", deviceName: "SW1" }, vlanId: 10 },
        },
      ],
      prompt: "SW1(config-if)#",
    });

    expect(state.lines).toEqual([{ kind: "notice", text: "VLAN 10이 없어서 새로 만들었어요" }]);
  });
});
