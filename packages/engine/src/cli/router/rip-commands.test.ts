// RIP 구성: Command(reducer), config-router 모드, 명령어, show running-config 왕복 (T11.2.1)
import { PORT_NAMES } from "@ping9/shared";
import type { Command, ConsoleResult, RouterDevice } from "@ping9/shared";
import { TWO_PC_SWITCH, twoPcSwitchDocument } from "@ping9/shared/examples";
import fc from "fast-check";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../../index";
import type { ConsolePort, Simulator } from "../../index";

const ID = "00000000-0000-4000-8000-000000000100";
const [GI0, GI1, GI2] = PORT_NAMES.router as readonly [string, string, string, ...string[]];

/** deviceId를 뺀 Command. union마다 따로 뺀다 */
type Bare = Command extends infer C ? (C extends Command ? Omit<C, "deviceId"> : never) : never;

const configOf = (simulator: Simulator) =>
  (simulator.getSnapshot().document.devices.find((device) => device.id === ID) as RouterDevice).config;
const texts = (result: ConsoleResult) => result.lines.map((line) => (line.kind === "text" ? line.text : `[${line.kind}]`));
const errors = (results: readonly ConsoleResult[]) =>
  results.flatMap((result) => result.lines).filter((line) => line.kind === "error");

function open() {
  const simulator = createSimulator();
  expect(simulator.dispatch({ type: "device/add", id: ID, kind: "router", position: { x: 0, y: 0 } }).ok).toBe(true);
  return { simulator, port: simulator.console(ID) };
}

async function run(port: ConsolePort, lines: readonly string[]) {
  const results: ConsoleResult[] = [];
  for (const line of lines) results.push(await port.exec(line));
  return results;
}

const configure = (port: ConsolePort, lines: readonly string[]) => run(port, ["enable", "configure terminal", ...lines]);

describe("reducer", () => {
  const dispatch = (simulator: Simulator, command: Bare) => simulator.dispatch({ deviceId: ID, ...command } as Command);

  test("켜고, 네트워크를 클래스풀로 맞춰 정렬해 넣고, 끄면 모두 사라진다", () => {
    const { simulator } = open();
    expect(dispatch(simulator, { type: "rip/enable" }).ok).toBe(true);
    expect(configOf(simulator).rip).toEqual({ networks: [], passiveInterfaces: [] });

    dispatch(simulator, { type: "rip/add-network", network: "192.168.1.77" });
    dispatch(simulator, { type: "rip/add-network", network: "10.0.1.0" });
    dispatch(simulator, { type: "rip/set-passive", port: GI2, passive: true });
    dispatch(simulator, { type: "rip/set-passive", port: GI0, passive: true });
    expect(configOf(simulator).rip).toEqual({ networks: ["10.0.0.0", "192.168.1.0"], passiveInterfaces: [GI0, GI2] });

    expect(dispatch(simulator, { type: "rip/disable" }).ok).toBe(true);
    expect(configOf(simulator).rip).toBeUndefined();
  });

  test("이미 그 상태면 문서가 바뀌지 않는다", () => {
    const { simulator } = open();
    dispatch(simulator, { type: "rip/enable" });
    dispatch(simulator, { type: "rip/add-network", network: "10.0.0.0" });
    const before = simulator.getSnapshot().document;

    for (const command of [
      { type: "rip/enable" },
      { type: "rip/add-network", network: "10.9.9.9" },
      { type: "rip/set-passive", port: GI1, passive: false },
    ] as const) {
      expect(dispatch(simulator, command)).toMatchObject({ ok: true });
      expect(simulator.getSnapshot().document).toBe(before);
    }
  });

  test.each<[string, Bare, string]>([
    ["RIP 없이 network", { type: "rip/add-network", network: "10.0.0.0" }, "RIP_NOT_ENABLED"],
    ["RIP 없이 no network", { type: "rip/remove-network", network: "10.0.0.0" }, "RIP_NOT_ENABLED"],
    ["RIP 없이 passive", { type: "rip/set-passive", port: GI0, passive: true }, "RIP_NOT_ENABLED"],
  ])("%s는 거부한다", (_name, command, code) => {
    const { simulator } = open();
    expect(dispatch(simulator, command)).toMatchObject({ ok: false, error: { code } });
  });

  test.each<[string, Bare, string]>([
    ["멀티캐스트", { type: "rip/add-network", network: "224.0.0.9" }, "RIP_NETWORK_INVALID"],
    ["loopback", { type: "rip/add-network", network: "127.0.0.1" }, "RIP_NETWORK_INVALID"],
    ["IPv4 아님", { type: "rip/add-network", network: "ten" }, "RIP_NETWORK_INVALID"],
    ["없는 네트워크 지움", { type: "rip/remove-network", network: "172.16.0.0" }, "RIP_NETWORK_NOT_FOUND"],
    ["없는 포트", { type: "rip/set-passive", port: "Ethernet0", passive: true }, "UNKNOWN_PORT"],
  ])("RIP가 켜져 있어도 %s는 거부한다", (_name, command, code) => {
    const { simulator } = open();
    dispatch(simulator, { type: "rip/enable" });
    const before = simulator.getSnapshot().document;
    expect(dispatch(simulator, command)).toMatchObject({ ok: false, error: { code } });
    expect(simulator.getSnapshot().document).toBe(before);
  });

  test("network는 16개까지", () => {
    const { simulator } = open();
    dispatch(simulator, { type: "rip/enable" });
    for (let first = 1; first <= 16; first += 1) {
      expect(dispatch(simulator, { type: "rip/add-network", network: `${first}.0.0.0` }).ok).toBe(true);
    }
    expect(dispatch(simulator, { type: "rip/add-network", network: "17.0.0.0" })).toMatchObject({
      ok: false,
      error: { code: "LIMIT_EXCEEDED", params: { limit: "ripNetworks", max: 16 } },
    });
  });

  test("Router가 아니면 거부한다", () => {
    const simulator = createSimulator();
    simulator.load(twoPcSwitchDocument);
    expect(simulator.dispatch({ type: "rip/enable", deviceId: TWO_PC_SWITCH.sw1.id })).toMatchObject({
      ok: false,
      error: { code: "DEVICE_KIND_MISMATCH" },
    });
  });
});

describe("config-router 모드", () => {
  test("router rip로 들어가고 exit는 config, end는 privileged로", async () => {
    const { port } = open();
    await configure(port, ["router rip"]);
    expect(port.prompt()).toMatch(/^R\d+\(config-router\)#$/);
    await port.exec("exit");
    expect(port.prompt()).toMatch(/\(config\)#$/);
    await port.exec("router rip");
    await port.exec("end");
    expect(port.prompt()).toMatch(/^R\d+#$/);
  });

  test("config-router에서 config 모드 명령을 칠 수 있다", async () => {
    const { simulator, port } = open();
    expect(errors(await configure(port, ["router rip", "ip route 192.168.9.0 255.255.255.0 10.0.2.2"]))).toEqual([]);
    expect(configOf(simulator).staticRoutes).toEqual([{ network: "192.168.9.0", mask: "255.255.255.0", nextHop: "10.0.2.2" }]);
    expect(port.prompt()).toMatch(/\(config-router\)#$/);
  });

  test("다른 곳에서 RIP를 끄면 config 모드로 돌아간다", async () => {
    const { simulator, port } = open();
    await configure(port, ["router rip"]);
    simulator.dispatch({ type: "rip/disable", deviceId: ID });
    expect(port.prompt()).toMatch(/\(config\)#$/);
    expect((await port.exec("network 10.0.0.0")).lines).toMatchObject([{ code: "CLI_WRONG_MODE" }]);
  });

  test("Switch에는 router rip이 없다", async () => {
    const simulator = createSimulator();
    simulator.load(twoPcSwitchDocument);
    const port = simulator.console(TWO_PC_SWITCH.sw1.id);
    const [, , result] = await configure(port, ["router rip"]);
    expect(result!.lines).toMatchObject([{ code: "CLI_UNKNOWN_COMMAND" }]);
  });
});

describe("명령어", () => {
  test("network, passive-interface(줄임 이름)를 넣고 빼면 dispatch와 같은 구성이 된다", async () => {
    const cli = open();
    expect(
      errors(
        await configure(cli.port, [
          "router rip",
          "version 2",
          "no auto-summary",
          "network 10.0.1.0",
          "network 192.168.5.9",
          "passive-interface g0/2",
          "no network 192.168.5.0",
          "end",
        ]),
      ),
    ).toEqual([]);

    const direct = open();
    direct.simulator.dispatch({ type: "rip/enable", deviceId: ID });
    direct.simulator.dispatch({ type: "rip/add-network", deviceId: ID, network: "10.0.0.0" });
    direct.simulator.dispatch({ type: "rip/set-passive", deviceId: ID, port: GI2, passive: true });
    expect(configOf(cli.simulator)).toEqual(configOf(direct.simulator));
    expect(configOf(cli.simulator).rip).toEqual({ networks: ["10.0.0.0"], passiveInterfaces: [GI2] });
  });

  test.each([
    ["version 1", "RIP_VERSION_UNSUPPORTED"],
    ["auto-summary", "RIP_AUTO_SUMMARY_UNSUPPORTED"],
    ["network 224.0.0.9", "RIP_NETWORK_INVALID"],
    ["no network 172.16.0.0", "RIP_NETWORK_NOT_FOUND"],
    ["version 3", "CLI_INVALID_VALUE"],
    ["passive-interface g0/9", "CLI_INVALID_VALUE"],
  ])("`%s`는 %s", async (line, code) => {
    const { simulator, port } = open();
    await configure(port, ["router rip"]);
    const before = simulator.getSnapshot().document;
    expect((await port.exec(line)).lines).toMatchObject([{ kind: "error", code }]);
    expect(simulator.getSnapshot().document).toBe(before);
  });

  test("no router rip은 RIP 구성을 지운다", async () => {
    const { simulator, port } = open();
    await configure(port, ["router rip", "network 10.0.0.0", "exit", "no router rip"]);
    expect(configOf(simulator).rip).toBeUndefined();
  });
});

describe("show running-config", () => {
  test("인터페이스 → router rip → ip route 순서", async () => {
    const { port } = open();
    await configure(port, [
      "interface g0/1",
      "ip address 10.0.2.1 255.255.255.0",
      "no shutdown",
      "exit",
      "ip route 192.168.9.0 255.255.255.0 10.0.2.2",
      "router rip",
      "network 10.0.0.0",
      "passive-interface g0/2",
      "end",
    ]);
    const lines = texts(await port.exec("show running-config"));
    const from = lines.indexOf("router rip");
    expect(lines.slice(from, from + 6)).toEqual([
      "router rip",
      " version 2",
      ` passive-interface ${GI2}`,
      " network 10.0.0.0",
      " no auto-summary",
      "!",
    ]);
    expect(from).toBeGreaterThan(lines.indexOf(`interface ${GI1}`));
    expect(from).toBeLessThan(lines.indexOf("ip route 192.168.9.0 255.255.255.0 10.0.2.2"));
  });

  test("RIP가 없으면 묶음도 없다", async () => {
    const { port } = open();
    await run(port, ["enable"]);
    expect(texts(await port.exec("show running-config"))).not.toContain("router rip");
  });

  test("왕복: 출력을 새 Router에 넣으면 같은 RIP 구성이 된다", async () => {
    const network = fc.integer({ min: 1, max: 223 }).filter((first) => first !== 127).map((first) => `${first}.1.2.3`);
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(network, { maxLength: 6 }),
        fc.subarray([...PORT_NAMES.router]),
        async (networks, passive) => {
          const source = open();
          source.simulator.dispatch({ type: "rip/enable", deviceId: ID });
          for (const value of networks) source.simulator.dispatch({ type: "rip/add-network", deviceId: ID, network: value });
          for (const port of passive) source.simulator.dispatch({ type: "rip/set-passive", deviceId: ID, port, passive: true });
          await run(source.port, ["enable"]);
          const shown = texts(await source.port.exec("show running-config"));

          const target = open();
          expect(errors(await configure(target.port, shown))).toEqual([]);
          expect(configOf(target.simulator).rip).toEqual(configOf(source.simulator).rip);
        },
      ),
      { numRuns: 40 },
    );
  });
});
