// vlan, name, no vlan, show vlan brief (FR-31). 공개 인터페이스(createSimulator)로만 확인한다.
import type { ConsoleLine, ConsoleResult, SwitchConfig } from "@ping9/shared";
import { TWO_PC_SWITCH, twoPcSwitchDocument, twoSwitchVlanDocument, TWO_SWITCH_VLAN } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../../index";
import type { ConsolePort, Simulator } from "../../index";

const SW = TWO_PC_SWITCH.sw1.id;
const CONFIG = ["enable", "configure terminal"];

async function run(port: ConsolePort, ...lines: string[]): Promise<ConsoleResult> {
  let result: ConsoleResult = { lines: [] as readonly ConsoleLine[], prompt: port.prompt() };
  for (const line of lines) result = await port.exec(line);
  return result;
}

function open() {
  const simulator = createSimulator();
  simulator.load(twoPcSwitchDocument);
  return { simulator, port: simulator.console(SW) };
}

const vlansOf = (simulator: Simulator) =>
  (simulator.getSnapshot().document.devices.find((device) => device.id === SW)!.config as SwitchConfig).vlans;

const text = (...lines: string[]) => lines.map((line) => ({ kind: "text", text: line }));

describe("vlan과 name", () => {
  test("vlan 10 → name SALES → end → show vlan brief", async () => {
    const { simulator, port } = open();

    expect(await run(port, ...CONFIG, "vlan 10")).toEqual({ lines: [], prompt: "SW1(config-vlan)#" });
    expect(await run(port, "name SALES")).toEqual({ lines: [], prompt: "SW1(config-vlan)#" });
    expect(await run(port, "end", "show vlan brief")).toEqual({
      lines: text(
        "VLAN  Name     Status  Ports",
        "1     default  active  Fa0/1, Fa0/2, Fa0/3",
        "                       Fa0/4, Fa0/5, Fa0/6",
        "                       Fa0/7, Fa0/8",
        "10    SALES    active",
      ),
      prompt: "SW1#",
    });
    expect(vlansOf(simulator)).toEqual([
      { id: 1, name: "default" },
      { id: 10, name: "SALES" },
    ]);
  });

  test("이미 있는 VLAN은 만들지 않고 들어가기만 한다", async () => {
    const { simulator, port } = open();
    await run(port, ...CONFIG, "vlan 10", "exit");
    const version = simulator.getSnapshot().docVersion;

    expect(await run(port, "vlan 10")).toEqual({ lines: [], prompt: "SW1(config-vlan)#" });
    expect(simulator.getSnapshot().docVersion).toBe(version);
  });

  test("config-vlan에서 다른 vlan 명령을 치면 그 VLAN으로 옮겨 간다", async () => {
    const { simulator, port } = open();

    expect((await run(port, ...CONFIG, "vlan 10", "vlan 20", "name DEV")).prompt).toBe("SW1(config-vlan)#");
    expect(vlansOf(simulator)).toEqual([
      { id: 1, name: "default" },
      { id: 10, name: "VLAN0010" },
      { id: 20, name: "DEV" },
    ]);
  });

  test("VLAN 1의 이름은 바꿀 수 없다", async () => {
    const { port } = open();

    expect(await run(port, ...CONFIG, "vlan 1", "name CORE")).toEqual({
      lines: [{ kind: "error", code: "DEFAULT_VLAN_READONLY", params: { deviceId: SW } }],
      prompt: "SW1(config-vlan)#",
    });
  });

  test("틀린 이름은 reducer의 오류가 그대로 나온다", async () => {
    const { port } = open();

    expect((await run(port, ...CONFIG, "vlan 10", `name ${"x".repeat(33)}`)).lines).toEqual([
      { kind: "error", code: "INVALID_VLAN_NAME", params: { value: "x".repeat(33) } },
    ]);
  });

  test("한도를 넘는 vlan은 오류가 나고 config 모드에 남는다", async () => {
    const { simulator, port } = open();
    for (let id = 2; id <= 64; id += 1) simulator.dispatch({ type: "vlan/create", deviceId: SW, vlanId: id });

    expect(await run(port, ...CONFIG, "vlan 65")).toEqual({
      lines: [{ kind: "error", code: "LIMIT_EXCEEDED", params: { limit: "vlans", max: 64 } }],
      prompt: "SW1(config)#",
    });
  });

  test("틀린 번호는 Document를 바꾸지 않는다", async () => {
    const { simulator, port } = open();
    await run(port, ...CONFIG);
    const before = simulator.getSnapshot();

    for (const line of ["vlan 0", "vlan 4095", "vlan 1e1", "vlan -1", "vlan 10.0", "vlan"]) {
      expect((await port.exec(line)).lines[0], line).toMatchObject({ kind: "error" });
    }
    expect(simulator.getSnapshot()).toBe(before);
    expect(port.prompt()).toBe("SW1(config)#");
  });
});

describe("no vlan", () => {
  test("VLAN을 지우고, VLAN 1은 지울 수 없다", async () => {
    const { simulator, port } = open();

    expect(await run(port, ...CONFIG, "vlan 10", "exit", "no vlan 10")).toEqual({
      lines: [],
      prompt: "SW1(config)#",
    });
    expect(vlansOf(simulator)).toEqual([{ id: 1, name: "default" }]);

    expect(await run(port, "no vlan 1")).toEqual({
      lines: [{ kind: "error", code: "DEFAULT_VLAN_READONLY", params: { deviceId: SW } }],
      prompt: "SW1(config)#",
    });
  });

  test("없는 VLAN은 VLAN_NOT_FOUND", async () => {
    const { port } = open();

    expect((await run(port, ...CONFIG, "no vlan 30")).lines).toEqual([
      { kind: "error", code: "VLAN_NOT_FOUND", params: { deviceId: SW, vlanId: 30 } },
    ]);
  });

  test("config-vlan에서 자기 VLAN을 지우면 config 모드로 돌아간다", async () => {
    const { port } = open();

    expect(await run(port, ...CONFIG, "vlan 10", "no vlan 10")).toEqual({ lines: [], prompt: "SW1(config)#" });
  });
});

describe("show vlan", () => {
  test("show vlan은 show vlan brief와 같다", async () => {
    const { port } = open();

    const brief = await run(port, "enable", "show vlan brief");

    expect(brief.lines.length).toBeGreaterThan(0);
    expect((await run(port, "show vlan")).lines).toEqual(brief.lines);
  });

  test("privileged 모드에서만 쓸 수 있다", async () => {
    const { port } = open();

    expect((await run(port, "show vlan brief")).lines).toEqual([
      { kind: "error", code: "CLI_WRONG_MODE", params: { token: "show" }, position: 0 },
    ]);
  });

  test("예시 문서의 SW1: access 포트만 VLAN별로 나온다", async () => {
    const simulator = createSimulator();
    simulator.load(twoSwitchVlanDocument);

    const result = await run(simulator.console(TWO_SWITCH_VLAN.sw1.id), "enable", "show vlan brief");

    expect(result.lines).toEqual(
      text(
        "VLAN  Name     Status  Ports",
        "1     default  active  Fa0/3, Fa0/4, Fa0/5",
        "                       Fa0/6, Fa0/7",
        "10    SALES    active  Fa0/1",
        "20    DEV      active  Fa0/2",
      ),
    );
  });
});

describe("대상 VLAN이 사라졌을 때", () => {
  test("config-vlan에 있는 동안 그 VLAN이 다른 경로로 지워지면 config 모드로 돌아간다", async () => {
    const { simulator, port } = open();
    await run(port, ...CONFIG, "vlan 10");

    simulator.dispatch({ type: "vlan/remove", deviceId: SW, vlanId: 10 });

    expect(port.prompt()).toBe("SW1(config)#");
    expect(await run(port, "name X")).toEqual({
      lines: [{ kind: "error", code: "CLI_WRONG_MODE", params: { token: "name" }, position: 0 }],
      prompt: "SW1(config)#",
    });
  });

  test("VLAN 1이 없는 문서에서도 vlan 1로 들어갈 수 있다", async () => {
    const document = JSON.parse(JSON.stringify(twoPcSwitchDocument)) as typeof twoPcSwitchDocument;
    (document.devices.find((device) => device.id === SW)!.config as { vlans: unknown[] }).vlans = [];
    const simulator = createSimulator();
    expect(simulator.load(document)).toEqual({ ok: true });
    const port = simulator.console(SW);

    expect((await run(port, ...CONFIG, "vlan 1")).prompt).toBe("SW1(config-vlan)#");
    expect(simulator.getSnapshot().docVersion).toBe(1);
  });
});
