import { PORT_NAMES, validateDocument } from "@ping9/shared";
import type { Command, RouterDevice } from "@ping9/shared";
import { TWO_PC, twoPcDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../../index";
import type { ConsolePort } from "../../index";

const ROUTER_ID = "00000000-0000-4000-8000-000000000100";
const GI0 = PORT_NAMES.router[0];

function open() {
  const simulator = createSimulator();
  expect(simulator.dispatch({ type: "device/add", id: ROUTER_ID, kind: "router", position: { x: 300, y: 200 } }).ok).toBe(true);
  return { simulator, port: simulator.console(ROUTER_ID) };
}

async function run(port: ConsolePort, ...lines: string[]) {
  let result = await port.exec("");
  for (const line of lines) result = await port.exec(line);
  return result;
}

describe("Router 공통 CLI", () => {
  test.each([
    [["enable"], "R1#"],
    [["enable", "configure terminal"], "R1(config)#"],
    [["en", "conf t", "int gi0/0"], "R1(config-if)#"],
    [["enable", "configure terminal", "interface gigabitethernet 0/3"], "R1(config-if)#"],
    [["enable", "configure terminal", "interface gi0/0", "exit"], "R1(config)#"],
    [["enable", "configure terminal", "interface gi0/0", "end"], "R1#"],
  ])("%j 뒤에 %s가 나온다", async (lines, prompt) => {
    const { port } = open();
    expect((await run(port, ...lines)).prompt).toBe(prompt);
  });

  test("no shutdown과 shutdown이 Router 구성을 바꾼다", async () => {
    const { simulator, port } = open();
    await run(port, "enable", "configure terminal", "interface gi0/0", "no shutdown");
    expect(simulator.getSnapshot().views[ROUTER_ID]!.ports[0]!.status).toBe("no-link");
    expect((await port.exec("shutdown")).lines).toEqual([]);
    expect(simulator.getSnapshot().views[ROUTER_ID]!.ports.every(view => view.status === "admin-down")).toBe(true);
    expect(validateDocument(simulator.getSnapshot().document).ok).toBe(true);
  });

  test("기본 상태와 켠 인터페이스의 상태를 show로 확인한다", async () => {
    const { port } = open();
    const initial = await run(port, "enable", "show ip interface brief");
    const text = initial.lines.map(line => line.kind === "text" ? line.text : "").join("\n");
    PORT_NAMES.router.forEach(name => expect(text).toContain(name));
    expect(text.match(/admin-down/g)).toHaveLength(4);
    expect(text.match(/unassigned/g)).toHaveLength(4);
    const changed = await run(port, "conf t", "int gi0/0", "no shut", "end", "sh ip int br");
    expect(changed.lines.filter(line => line.kind === "text" && line.text.includes("no-link"))).toHaveLength(1);
  });

  test("다른 장비 종류의 포트와 Switch 전용 명령은 거부한다", async () => {
    const { port } = open();
    await run(port, "enable", "configure terminal");
    expect((await port.exec("interface fa0/1")).lines).toMatchObject([{ code: "CLI_INVALID_VALUE" }]);
    expect((await port.exec("vlan 10")).lines).toMatchObject([{ code: "CLI_UNKNOWN_COMMAND" }]);
    await port.exec("interface gi0/0");
    expect((await port.exec("switchport mode trunk")).lines).toMatchObject([{ code: "CLI_UNKNOWN_COMMAND" }]);
  });

  test("Tab과 도움말을 재사용하고 문서를 다시 열면 모드를 초기화한다", async () => {
    const { simulator, port } = open();
    expect(port.complete("en")).toBe("enable ");
    await run(port, "enable", "configure terminal", "int gi0/0");
    expect(port.help("").map(entry => entry.token)).toContain("shutdown");
    expect(port.help("").map(entry => entry.token)).not.toContain("vlan");
    simulator.load(simulator.getSnapshot().document);
    expect(port.prompt()).toBe("R1>");
  });
});

describe("Router interface/set-admin", () => {
  test("リンク両端が動作中なら up、Routerを切ると相手は peer-down", () => {
    const { simulator } = open();
    const router = simulator.getSnapshot().document.devices[0]!;
    expect(simulator.load({
      schemaVersion: 1, devices: [...twoPcDocument.devices, router],
      links: [{ id: TWO_PC.linkId, ends: [{ deviceId: ROUTER_ID, port: GI0 }, { deviceId: TWO_PC.pc1.id, port: TWO_PC.port }] }],
    }).ok).toBe(true);
    simulator.dispatch({ type: "interface/set-admin", deviceId: ROUTER_ID, port: GI0, adminUp: true });
    expect(simulator.getSnapshot().views[ROUTER_ID]!.ports[0]!.status).toBe("up");
    simulator.dispatch({ type: "interface/set-admin", deviceId: ROUTER_ID, port: GI0, adminUp: false });
    expect(simulator.getSnapshot().views[TWO_PC.pc1.id]!.ports[0]!.status).toBe("peer-down");
  });

  test("IP와 정적 경로가 있어도 포트를 전환할 때 다른 값을 유지한다", () => {
    const { simulator } = open();
    const device = simulator.getSnapshot().document.devices[0] as RouterDevice;
    const config = {
      interfaces: { [GI0]: { adminUp: false, ip: "10.0.1.1", mask: "255.255.255.0" } },
      staticRoutes: [{ network: "10.0.2.0", mask: "255.255.255.0", nextHop: "10.0.1.2" }],
    };
    simulator.load({ schemaVersion: 1, devices: [{ ...device, config }], links: [] });
    const before = simulator.getSnapshot();
    expect(simulator.dispatch({ type: "interface/set-admin", deviceId: ROUTER_ID, port: GI0, adminUp: true }).ok).toBe(true);
    expect((simulator.getSnapshot().document.devices[0] as RouterDevice).config).toEqual({
      ...config, interfaces: { [GI0]: { ...config.interfaces[GI0], adminUp: true } },
    });
    expect((before.document.devices[0] as RouterDevice).config.interfaces[GI0]!.adminUp).toBe(false);
  });

  test.each([
    [{ port: "gi0/0" }, "UNKNOWN_PORT"],
    [{ port: "GigabitEthernet0/4" }, "UNKNOWN_PORT"],
    [{ port: { toString: 1 } }, "UNKNOWN_PORT"],
    [{ adminUp: "yes" }, "DOCUMENT_INVALID_SHAPE"],
  ])("잘못된 입력 %j는 상태를 바꾸지 않는다", (fields, code) => {
    const { simulator } = open();
    const before = simulator.getSnapshot();
    expect(simulator.dispatch({ type: "interface/set-admin", deviceId: ROUTER_ID, port: GI0, adminUp: true, ...fields } as Command))
      .toMatchObject({ ok: false, error: { code } });
    expect(simulator.getSnapshot()).toBe(before);
  });
});
