// `switchport/set-mode`, `switchport/set-access-vlan`과 그 명령어 (T5.2.1, FR-32).

import { LIMITS, validateDocument } from "@ping9/shared";
import type { Command, SwitchDevice, TopologyDocument } from "@ping9/shared";
import { TWO_PC_SWITCH, twoPcSwitchDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../index";
import type { Simulator } from "../index";

const { sw1, pc1 } = TWO_PC_SWITCH;
const FA1 = "FastEthernet0/1";

function open(document: TopologyDocument = twoPcSwitchDocument): Simulator {
  const simulator = createSimulator();
  simulator.load(document);
  return simulator;
}

const configOf = (simulator: Simulator) =>
  (simulator.getSnapshot().document.devices.find((device) => device.id === sw1.id) as SwitchDevice).config;

const send = (simulator: Simulator, command: Record<string, unknown>) =>
  simulator.dispatch({ deviceId: sw1.id, port: FA1, ...command } as unknown as Command);

/** SW1의 구성을 바꾼 문서 */
function withConfig(config: SwitchDevice["config"]): TopologyDocument {
  return {
    ...twoPcSwitchDocument,
    devices: twoPcSwitchDocument.devices.map((device) =>
      device.id === sw1.id && device.kind === "switch" ? { ...device, config } : device,
    ),
  };
}

describe("switchport/set-mode", () => {
  test("모드만 바꾼다", () => {
    const simulator = open();

    expect(send(simulator, { type: "switchport/set-mode", mode: "trunk" })).toEqual({ ok: true, notices: [] });

    expect(configOf(simulator).ports).toEqual({ [FA1]: { adminUp: true, mode: "trunk" } });
  });

  test("access로 되돌리면 기본값이라 포트 항목이 없어진다", () => {
    const simulator = open();
    send(simulator, { type: "switchport/set-mode", mode: "trunk" });

    send(simulator, { type: "switchport/set-mode", mode: "access" });

    expect(configOf(simulator).ports).toEqual({});
  });

  test("access VLAN과 허용 목록은 그대로 둔다", () => {
    const simulator = open(
      withConfig({
        vlans: [{ id: 1, name: "default" }, { id: 10, name: "SALES" }],
        ports: { [FA1]: { adminUp: true, mode: "access", accessVlan: 10, allowedVlans: [[10, 20]] } },
      }),
    );

    send(simulator, { type: "switchport/set-mode", mode: "trunk" });

    expect(configOf(simulator).ports[FA1]).toEqual({
      adminUp: true,
      mode: "trunk",
      accessVlan: 10,
      allowedVlans: [[10, 20]],
    });
  });

  test.each([
    ["없는 모드", { mode: "hybrid" }, "DOCUMENT_INVALID_SHAPE"],
    ["글이 아닌 모드", { mode: { toString: 1 } }, "DOCUMENT_INVALID_SHAPE"],
    ["없는 포트", { mode: "trunk", port: "FastEthernet0/9" }, "UNKNOWN_PORT"],
    ["없는 장비", { mode: "trunk", deviceId: "00000000-0000-4000-8000-00000000ffff" }, "DEVICE_NOT_FOUND"],
    ["Switch가 아닌 장비", { mode: "trunk", deviceId: pc1.id }, "DEVICE_KIND_MISMATCH"],
  ])("%s: 거부하고 문서를 바꾸지 않는다", (_name, fields, code) => {
    const simulator = open();
    const before = simulator.getSnapshot();

    expect(send(simulator, { type: "switchport/set-mode", ...fields })).toMatchObject({ ok: false, error: { code } });
    expect(simulator.getSnapshot()).toBe(before);
  });
});

describe("switchport/set-access-vlan", () => {
  test("없는 VLAN이면 기본 이름으로 만들고 알린다", () => {
    const simulator = open();

    const result = send(simulator, { type: "switchport/set-access-vlan", vlanId: 10 });

    expect(result).toEqual({
      ok: true,
      notices: [{ code: "VLAN_AUTO_CREATED", params: { device: { deviceId: sw1.id, deviceName: "SW1" }, vlanId: 10 } }],
    });
    expect(configOf(simulator)).toEqual({
      vlans: [{ id: 1, name: "default" }, { id: 10, name: "VLAN0010" }],
      ports: { [FA1]: { adminUp: true, mode: "access", accessVlan: 10 } },
    });
    expect(validateDocument(simulator.getSnapshot().document).ok).toBe(true);
  });

  test("있는 VLAN이면 알림이 없다", () => {
    const simulator = open();
    simulator.dispatch({ type: "vlan/create", deviceId: sw1.id, vlanId: 10, name: "SALES" });

    expect(send(simulator, { type: "switchport/set-access-vlan", vlanId: 10 })).toEqual({ ok: true, notices: [] });
    expect(configOf(simulator).vlans).toEqual([{ id: 1, name: "default" }, { id: 10, name: "SALES" }]);
  });

  test("VLAN 1로 되돌리면 기본값이라 포트 항목이 없어진다", () => {
    const simulator = open();
    send(simulator, { type: "switchport/set-access-vlan", vlanId: 10 });

    expect(send(simulator, { type: "switchport/set-access-vlan", vlanId: 1 })).toEqual({ ok: true, notices: [] });

    expect(configOf(simulator).ports).toEqual({});
    // 자동으로 만든 VLAN은 남는다
    expect(configOf(simulator).vlans.map((vlan) => vlan.id)).toEqual([1, 10]);
  });

  test("trunk 모드인 포트에도 값은 저장된다", () => {
    const simulator = open();
    send(simulator, { type: "switchport/set-mode", mode: "trunk" });

    send(simulator, { type: "switchport/set-access-vlan", vlanId: 20 });

    expect(configOf(simulator).ports[FA1]).toEqual({ adminUp: true, mode: "trunk", accessVlan: 20 });
  });

  test.each([0, 4095, 1.5, -1, "10", null, undefined, { valueOf: 1 }])("번호 %j는 거부한다", (vlanId) => {
    const simulator = open();
    const before = simulator.getSnapshot();

    expect(send(simulator, { type: "switchport/set-access-vlan", vlanId })).toMatchObject({
      ok: false,
      error: { code: "INVALID_VLAN_ID" },
    });
    expect(simulator.getSnapshot()).toBe(before);
  });

  test("자동으로 만들면 한도를 넘는 경우에는 거부한다", () => {
    const vlans = Array.from({ length: LIMITS.maxVlansPerSwitch }, (_unused, index) => ({
      id: index + 1,
      name: index === 0 ? "default" : `V${index + 1}`,
    }));
    const simulator = open(withConfig({ vlans, ports: {} }));
    const before = simulator.getSnapshot();

    expect(send(simulator, { type: "switchport/set-access-vlan", vlanId: 999 })).toEqual({
      ok: false,
      error: { code: "LIMIT_EXCEEDED", params: { limit: "vlans", max: LIMITS.maxVlansPerSwitch } },
    });
    expect(simulator.getSnapshot()).toBe(before);
    // 이미 있는 VLAN으로는 바꿀 수 있다
    expect(send(simulator, { type: "switchport/set-access-vlan", vlanId: 64 }).ok).toBe(true);
  });

  test.each([
    ["없는 포트", { port: "fa0/1" }, "UNKNOWN_PORT"],
    ["Switch가 아닌 장비", { deviceId: pc1.id }, "DEVICE_KIND_MISMATCH"],
  ])("%s: 거부한다", (_name, fields, code) => {
    expect(send(open(), { type: "switchport/set-access-vlan", vlanId: 10, ...fields })).toMatchObject({
      ok: false,
      error: { code },
    });
  });
});

describe("switchport 명령어", () => {
  async function run(...lines: string[]) {
    const simulator = open();
    const port = simulator.console(sw1.id);
    let last = await port.exec("enable");
    for (const line of ["configure terminal", ...lines]) last = await port.exec(line);
    return { simulator, port, last };
  }

  test("switchport access vlan: 없는 VLAN은 만들어지고 알림 줄이 나온다", async () => {
    const { simulator, last } = await run("interface fa0/1", "switchport access vlan 10");

    expect(last).toEqual({
      lines: [
        {
          kind: "notice",
          code: "VLAN_AUTO_CREATED",
          params: { device: { deviceId: sw1.id, deviceName: "SW1" }, vlanId: 10 },
        },
      ],
      prompt: "SW1(config-if)#",
    });
    expect(configOf(simulator).ports[FA1]).toEqual({ adminUp: true, mode: "access", accessVlan: 10 });
  });

  test("no switchport access vlan은 VLAN 1로 되돌린다", async () => {
    const { simulator } = await run("interface fa0/1", "switchport access vlan 10", "no switchport access vlan");

    expect(configOf(simulator).ports).toEqual({});
  });

  test("switchport mode trunk와 access", async () => {
    const trunk = await run("interface fa0/8", "switchport mode trunk");
    expect(configOf(trunk.simulator).ports).toEqual({ "FastEthernet0/8": { adminUp: true, mode: "trunk" } });
    expect(trunk.last.lines).toEqual([]);

    const access = await run("interface fa0/8", "switchport mode trunk", "switchport mode access");
    expect(configOf(access.simulator).ports).toEqual({});
  });

  test("줄여 쓸 수 있다 (시안의 명령 순서)", async () => {
    const { simulator, port } = await run("vlan 10", "name SALES", "int fa0/1", "sw acc vlan 10", "sw mo acc", "end");

    const shown = await port.exec("sh vl br");

    expect(configOf(simulator).ports[FA1]).toEqual({ adminUp: true, mode: "access", accessVlan: 10 });
    expect(shown.lines.map((line) => (line.kind === "text" ? line.text : ""))).toEqual([
      "VLAN  Name     Status  Ports",
      "1     default  active  Fa0/2, Fa0/3, Fa0/4",
      "                       Fa0/5, Fa0/6, Fa0/7",
      "                       Fa0/8",
      "10    SALES    active  Fa0/1",
    ]);
  });

  test("값이 틀리면 오류와 위치", async () => {
    const { last } = await run("interface fa0/1", "switchport access vlan 4095");

    expect(last.lines).toEqual([
      { kind: "error", code: "INVALID_VLAN_ID", params: { value: 4095 }, position: 23 },
    ]);

    const mode = await run("interface fa0/1", "switchport mode hybrid");
    expect(mode.last.lines).toEqual([
      { kind: "error", code: "CLI_UNKNOWN_COMMAND", params: { token: "hybrid" }, position: 16 },
    ]);
  });

  test("인터페이스 설정 모드가 아니면 쓸 수 없다", async () => {
    const { last } = await run("switchport mode trunk");

    expect(last.lines).toEqual([
      { kind: "error", code: "CLI_WRONG_MODE", params: { token: "switchport" }, position: 0 },
    ]);
  });
});
