// 인터페이스 이름 해석과 `interface` 명령어 (T3.3.1).

import { TWO_PC_SWITCH, twoPcSwitchDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../../index";

import { INTERFACE_COMMANDS } from "./interface-commands";
import { parseLine } from "./parse";
import { resolvePortName } from "./port-name";
import { effectiveSession } from "./session";

describe("resolvePortName", () => {
  test.each([
    ["switch", "FastEthernet0/1", "FastEthernet0/1"],
    ["switch", "fastethernet0/1", "FastEthernet0/1"],
    ["switch", "FASTETHERNET0/8", "FastEthernet0/8"],
    ["switch", "fa0/1", "FastEthernet0/1"],
    ["switch", "Fa0/3", "FastEthernet0/3"],
    ["switch", "f0/2", "FastEthernet0/2"],
    ["switch", "fast0/2", "FastEthernet0/2"],
    ["switch", "fa 0/2", "FastEthernet0/2"],
    ["router", "g0/0", "GigabitEthernet0/0"],
    ["router", "gi0/3", "GigabitEthernet0/3"],
    ["pc", "e0", "Ethernet0"],
  ] as const)("%s %j → %s", (kind, text, expected) => {
    expect(resolvePortName(kind, text)).toBe(expected);
  });

  test.each([
    ["switch", "fa0/9"],
    ["switch", "fa0/0"],
    ["switch", "fa0"],
    ["switch", "fa1/1"],
    ["switch", "g0/1"],
    ["switch", "0/1"],
    ["switch", "fa"],
    ["switch", ""],
    ["switch", "fax0/1"],
    ["switch", "fa0/1x"],
    ["switch", "fa0/01"],
    ["router", "fa0/1"],
  ] as const)("%s %j: 없는 포트", (kind, text) => {
    expect(resolvePortName(kind, text)).toBeUndefined();
  });
});

describe("interface 명령어의 해석", () => {
  const parse = (line: string) => parseLine(line, "config", "switch", INTERFACE_COMMANDS);

  test.each([
    ["interface fa0/1", "FastEthernet0/1"],
    ["interface FastEthernet0/2", "FastEthernet0/2"],
    ["int f0/3", "FastEthernet0/3"],
    ["interface fastethernet 0/4", "FastEthernet0/4"],
    ["int fa 0/5", "FastEthernet0/5"],
  ])("%j → %s", (line, port) => {
    const result = parse(line);
    const outcome = result.ok
      ? result.definition.run(result.args, {
          device: twoPcSwitchDocument.devices.find((device) => device.kind === "switch")!,
          document: twoPcSwitchDocument,
          session: { mode: "config" },
          dispatch: () => ({ ok: true, notices: [] }) as never,
        })
      : undefined;

    expect(outcome).toEqual({ session: { mode: "config-if", targetPort: port } });
  });

  test.each([
    ["interface fa0/9", { code: "CLI_INVALID_VALUE", params: { token: "fa0/9" } }, 10],
    ["interface xyz", { code: "CLI_INVALID_VALUE", params: { token: "xyz" } }, 10],
    ["interface g0/1", { code: "CLI_INVALID_VALUE", params: { token: "g0/1" } }, 10],
    ["int  fa0/1 extra", { code: "CLI_UNKNOWN_COMMAND", params: { token: "extra" } }, 11],
  ])("%j: 오류와 위치", (line, error, position) => {
    expect(parse(line)).toEqual({ ok: false, error, position });
  });

  test("이름이 빠지면 끝나지 않은 명령어다", () => {
    expect(parse("interface")).toEqual({ ok: false, error: { code: "CLI_INCOMPLETE_COMMAND", params: {} } });
  });

  test("종류와 번호를 띄어 썼는데 없는 포트면 값이 틀렸다고 알린다", () => {
    const result = parse("interface fastethernet 0/9");
    const outcome = result.ok
      ? result.definition.run(result.args, {
          device: twoPcSwitchDocument.devices.find((device) => device.kind === "switch")!,
          document: twoPcSwitchDocument,
          session: { mode: "config" },
          dispatch: () => ({ ok: true, notices: [] }) as never,
        })
      : undefined;

    expect(outcome).toEqual({
      lines: [{ kind: "error", code: "CLI_INVALID_VALUE", params: { token: "fastethernet 0/9" } }],
    });
  });
});

describe("Switch 콘솔의 인터페이스 설정 모드", () => {
  async function open(...lines: string[]) {
    const simulator = createSimulator();
    simulator.load(twoPcSwitchDocument);
    const port = simulator.console(TWO_PC_SWITCH.sw1.id);
    for (const line of ["enable", "configure terminal", ...lines]) await port.exec(line);
    return { simulator, port };
  }

  test.each([
    [["interface fa0/1"], "SW1(config-if)#"],
    [["int f0/1"], "SW1(config-if)#"],
    [["interface fa0/1", "exit"], "SW1(config)#"],
    [["interface fa0/1", "end"], "SW1#"],
    // 인터페이스 설정 모드에서 config 모드의 명령을 칠 수 있다
    [["interface fa0/1", "interface fa0/2"], "SW1(config-if)#"],
    [["interface fa0/1", "vlan 20"], "SW1(config-vlan)#"],
    [["vlan 20", "int fa0/3"], "SW1(config-if)#"],
    // 없는 포트면 모드가 바뀌지 않는다
    [["interface fa0/9"], "SW1(config)#"],
  ])("%j 뒤의 프롬프트는 %s", async (lines, prompt) => {
    const { port } = await open(...lines);

    expect(port.prompt()).toBe(prompt);
  });

  test("privileged 모드에서는 쓸 수 없다", async () => {
    const simulator = createSimulator();
    simulator.load(twoPcSwitchDocument);
    const port = simulator.console(TWO_PC_SWITCH.sw1.id);
    await port.exec("enable");

    const result = await port.exec("interface fa0/1");

    expect(result.lines).toEqual([
      { kind: "error", code: "CLI_WRONG_MODE", params: { token: "interface" }, position: 0 },
    ]);
  });

  test("도움말과 완성에 나온다", async () => {
    const { port } = await open();

    expect(port.complete("int")).toBe("interface ");
    expect(port.help("interface ")).toEqual([
      { token: "<port>", description: "Interface name (for example fa0/1)" },
      { token: "<type>", description: "Interface type (for example fastethernet)" },
    ]);
  });
});

describe("세션이 가리키던 대상이 사라졌을 때", () => {
  const sw1 = twoPcSwitchDocument.devices.find((device) => device.id === TWO_PC_SWITCH.sw1.id)!;

  test("이 장비에 없는 포트를 가리키는 인터페이스 세션은 config 모드로 돌아간다", () => {
    expect(effectiveSession({ mode: "config-if", targetPort: "FastEthernet0/1" }, sw1)).toEqual({
      mode: "config-if",
      targetPort: "FastEthernet0/1",
    });
    expect(effectiveSession({ mode: "config-if", targetPort: "GigabitEthernet0/0" }, sw1)).toEqual({ mode: "config" });
    expect(effectiveSession({ mode: "config-if" }, sw1)).toEqual({ mode: "config" });
  });

  test("config 모드로 물러난 세션은 대상이 다시 생겨도 되살아나지 않는다", async () => {
    const simulator = createSimulator();
    simulator.load(twoPcSwitchDocument);
    const port = simulator.console(TWO_PC_SWITCH.sw1.id);
    for (const line of ["enable", "configure terminal", "vlan 30"]) await port.exec(line);

    simulator.dispatch({ type: "vlan/remove", deviceId: TWO_PC_SWITCH.sw1.id, vlanId: 30 });
    expect(port.prompt()).toBe("SW1(config)#");
    await port.exec("");
    simulator.dispatch({ type: "vlan/create", deviceId: TWO_PC_SWITCH.sw1.id, vlanId: 30 });

    expect(port.prompt()).toBe("SW1(config)#");
  });
});
