// RIP 확인 명령어: show ip protocols, show ip route <출처>, show ip route 순서 (T11.2.4)
import { PORT_NAMES } from "@ping9/shared";
import type { ConsoleResult, TopologyDocument } from "@ping9/shared";
import { RIP_LAB, threeRouterRipDocument, twoPcSwitchDocument, TWO_PC_SWITCH } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../../index";

const GI2 = PORT_NAMES.router[2]!;
const texts = (result: ConsoleResult) => result.lines.map(line => (line.kind === "text" ? line.text : `[${line.kind}]`));

async function consoleOf(document: TopologyDocument, deviceId: string) {
  const simulator = createSimulator();
  expect(simulator.load(document)).toEqual({ ok: true });
  const port = simulator.console(deviceId);
  await port.exec("enable");
  return { simulator, port };
}

/** R1의 GI2를 passive로 */
const withPassive: TopologyDocument = {
  ...threeRouterRipDocument,
  devices: threeRouterRipDocument.devices.map(device => device.id === RIP_LAB.r1 && device.kind === "router"
    ? { ...device, config: { ...device.config, rip: { networks: ["10.0.0.0"], passiveInterfaces: [GI2] } } }
    : device),
};

describe("show ip protocols", () => {
  test("PING9에서 참인 줄만, 이웃별 배운 경로 수", async () => {
    const { port } = await consoleOf(withPassive, RIP_LAB.r1);
    expect(texts(await port.exec("show ip protocols"))).toEqual([
      'Routing Protocol is "rip"',
      "  Sending updates when the topology changes (PING9 does not use timers)",
      "  Default version control: send version 2, receive version 2",
      "    Interface           Send  Recv",
      "    GigabitEthernet0/0  2     2",
      "    GigabitEthernet0/1  2     2",
      "  Automatic network summarization is not in effect",
      "  Routing for Networks:",
      "    10.0.0.0",
      "  Passive Interface(s):",
      `    ${GI2}`,
      "  Routing Information Sources:",
      "    Gateway    Distance  Routes",
      "    10.0.12.2  120       2",
      "  Distance: (default is 120)",
    ]);
  });

  test("passive가 없으면 그 묶음이 없고, passive 인터페이스는 보내는 목록에서 빠진다", async () => {
    const { port } = await consoleOf(threeRouterRipDocument, RIP_LAB.r2);
    const lines = texts(await port.exec("show ip protocols"));
    expect(lines).not.toContain("  Passive Interface(s):");
    expect(lines.filter(line => line.startsWith("    GigabitEthernet"))).toHaveLength(2);
    expect(lines.filter(line => /^ {4}10\.0\.(12\.1|23\.2) /.test(line))).toHaveLength(2);
  });

  test("RIP를 켜지 않으면 아무것도 없다. Switch에는 없는 명령이다", async () => {
    const plain = {
      ...threeRouterRipDocument,
      devices: threeRouterRipDocument.devices.map(device => {
        if (device.kind !== "router") return device;
        const { interfaces, staticRoutes } = device.config;
        return { ...device, config: { interfaces, staticRoutes } };
      }),
    } as TopologyDocument;
    expect((await (await consoleOf(plain, RIP_LAB.r1)).port.exec("show ip protocols")).lines).toEqual([]);
    const sw = await consoleOf(twoPcSwitchDocument, TWO_PC_SWITCH.sw1.id);
    expect((await sw.port.exec("show ip protocols")).lines).toMatchObject([{ code: "CLI_UNKNOWN_COMMAND" }]);
  });
});

describe("show ip route", () => {
  test("출처와 상관없이 네트워크 주소 순", async () => {
    const { port } = await consoleOf(threeRouterRipDocument, RIP_LAB.r1);
    expect(texts(await port.exec("show ip route")).slice(2).map(line => line.split(/\s+/).slice(0, 2).join(" "))).toEqual([
      "C 10.0.1.0/24",
      "R 10.0.3.0/24",
      "C 10.0.12.0/30",
      "R 10.0.23.0/30",
    ]);
  });

  test.each([
    ["rip", ["R 10.0.3.0/24", "R 10.0.23.0/30"]],
    ["connected", ["C 10.0.1.0/24", "C 10.0.12.0/30"]],
    ["static", []],
    ["r", ["R 10.0.3.0/24", "R 10.0.23.0/30"]],
  ])("show ip route %s는 그 출처만", async (source, expected) => {
    const { port } = await consoleOf(threeRouterRipDocument, RIP_LAB.r1);
    const lines = texts(await port.exec(`show ip route ${source}`));
    expect(lines[0]).toBe("Codes: C - connected, S - static, R - RIP");
    expect(lines.slice(2).map(line => line.split(/\s+/).slice(0, 2).join(" "))).toEqual(expected);
  });

  test("show ip route <IPv4>와 겹치지 않는다", async () => {
    const { port } = await consoleOf(threeRouterRipDocument, RIP_LAB.r1);
    expect(texts(await port.exec("show ip route 10.0.3.5"))[0]).toBe("Routing entry for 10.0.3.0/24");
  });
});
