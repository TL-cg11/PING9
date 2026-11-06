// `show running-config`와 왕복 (T3.4.1): 출력을 새 Switch에 그대로 입력하면 같은 구성이 된다.

import type { Command, ConsoleResult, SwitchDevice, TopologyDocument, VlanRange } from "@ping9/shared";
import { TWO_PC_SWITCH, TWO_SWITCH_VLAN, twoPcSwitchDocument, twoSwitchVlanDocument } from "@ping9/shared/examples";
import fc from "fast-check";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../../index";
import type { Simulator } from "../../index";

function open(document: TopologyDocument): Simulator {
  const simulator = createSimulator();
  simulator.load(document);
  return simulator;
}

const configOf = (simulator: Simulator, deviceId: string) =>
  (simulator.getSnapshot().document.devices.find((device) => device.id === deviceId) as SwitchDevice).config;

const textOf = (result: ConsoleResult) => result.lines.map((line) => (line.kind === "text" ? line.text : `[${line.kind}]`));

async function runningConfig(simulator: Simulator, deviceId: string): Promise<string[]> {
  const port = simulator.console(deviceId);
  await port.exec("end");
  await port.exec("enable");
  return textOf(await port.exec("show running-config"));
}

/** 출력을 그 Switch의 콘솔에 한 줄씩 입력한다. 오류 줄이 나오면 모아서 돌려준다 */
async function paste(simulator: Simulator, deviceId: string, lines: readonly string[]): Promise<string[]> {
  const port = simulator.console(deviceId);
  const errors: string[] = [];
  for (const line of ["enable", "configure terminal", ...lines]) {
    const result = await port.exec(line);
    for (const output of result.lines) if (output.kind === "error") errors.push(`${line}: ${output.code}`);
  }
  return errors;
}

describe("show running-config", () => {
  test("기본값과 같은 설정은 출력하지 않는다", async () => {
    expect(await runningConfig(open(twoPcSwitchDocument), TWO_PC_SWITCH.sw1.id)).toEqual(["hostname SW1", "!", "end"]);
  });

  test("예시 문서의 SW1 (설계 7.4절의 출력)", async () => {
    expect(await runningConfig(open(twoSwitchVlanDocument), TWO_SWITCH_VLAN.sw1.id)).toEqual([
      "hostname SW1",
      "!",
      "vlan 10",
      " name SALES",
      "!",
      "vlan 20",
      " name DEV",
      "!",
      "interface FastEthernet0/1",
      " switchport access vlan 10",
      "!",
      "interface FastEthernet0/2",
      " switchport access vlan 20",
      "!",
      "interface FastEthernet0/8",
      " switchport mode trunk",
      " switchport trunk allowed vlan 10,20",
      "!",
      "end",
    ]);
  });

  test("기본 이름인 VLAN은 name 줄이 없고, 꺼진 포트는 shutdown 줄이 나온다", async () => {
    const simulator = open(twoPcSwitchDocument);
    await paste(simulator, TWO_PC_SWITCH.sw1.id, [
      "vlan 30",
      "interface fa0/3",
      "shutdown",
      "switchport trunk allowed vlan none",
      "interface fa0/2",
      "switchport mode trunk",
      "switchport access vlan 30",
    ]);

    expect(await runningConfig(simulator, TWO_PC_SWITCH.sw1.id)).toEqual([
      "hostname SW1",
      "!",
      "vlan 30",
      "!",
      "interface FastEthernet0/2",
      " switchport mode trunk",
      " switchport access vlan 30",
      "!",
      "interface FastEthernet0/3",
      " switchport trunk allowed vlan none",
      " shutdown",
      "!",
      "end",
    ]);
  });

  test("줄여 쓸 수 있고, privileged 모드에서만 쓸 수 있다", async () => {
    const simulator = open(twoPcSwitchDocument);
    const port = simulator.console(TWO_PC_SWITCH.sw1.id);

    expect((await port.exec("show running-config")).lines).toEqual([
      { kind: "error", code: "CLI_WRONG_MODE", params: { token: "show" }, position: 0 },
    ]);
    await port.exec("enable");
    expect(textOf(await port.exec("sh run"))).toEqual(["hostname SW1", "!", "end"]);
  });
});

describe("hostname", () => {
  test("지금 이름과 같으면 아무 일도 없다 (show running-config의 출력을 다시 넣을 수 있게)", async () => {
    const simulator = open(twoPcSwitchDocument);
    const before = simulator.getSnapshot();

    expect(await paste(simulator, TWO_PC_SWITCH.sw1.id, ["hostname SW1"])).toEqual([]);
    expect(simulator.getSnapshot()).toBe(before);
  });
});

describe("왕복: 출력을 새 Switch에 입력하면 같은 구성이 된다", () => {
  test("예시 문서의 SW1과 SW2", async () => {
    for (const id of [TWO_SWITCH_VLAN.sw1.id, TWO_SWITCH_VLAN.sw2.id]) {
      const source = open(twoSwitchVlanDocument);
      const lines = await runningConfig(source, id);

      // 같은 문서에서 그 Switch의 구성만 처음 상태로 되돌린 것이 "새 Switch"다
      const fresh = open({
        ...twoSwitchVlanDocument,
        devices: twoSwitchVlanDocument.devices.map((device) =>
          device.id === id && device.kind === "switch"
            ? { ...device, config: { vlans: [{ id: 1, name: "default" }], ports: {} } }
            : device,
        ),
      });

      expect(await paste(fresh, id, lines)).toEqual([]);
      expect(configOf(fresh, id)).toEqual(configOf(source, id));
    }
  });

  // 포트가 가리키는 access VLAN이 모두 있는 구성만 만든다 (VLAN을 지우지 않는다. 설계 7.4절의 보장 범위)
  const port = fc.constantFrom("FastEthernet0/1", "FastEthernet0/2", "FastEthernet0/5", "FastEthernet0/8");
  const vlanId = fc.constantFrom(1, 2, 10, 20, 300, 4094);
  const range = fc.tuple(fc.integer({ min: 1, max: 4094 }), fc.integer({ min: 1, max: 4094 })).map(
    ([a, b]): VlanRange => [Math.min(a, b), Math.max(a, b)],
  );
  const command = fc.oneof(
    fc.record({ type: fc.constant("vlan/create"), vlanId }),
    fc.record({ type: fc.constant("vlan/rename"), vlanId, name: fc.constantFrom("SALES", "DEV", "lab-2", "A_b") }),
    fc.record({ type: fc.constant("interface/set-admin"), port, adminUp: fc.boolean() }),
    fc.record({ type: fc.constant("switchport/set-mode"), port, mode: fc.constantFrom("access", "trunk") }),
    fc.record({ type: fc.constant("switchport/set-access-vlan"), port, vlanId }),
    fc.record({ type: fc.constant("switchport/set-allowed-vlans"), port, allowedVlans: fc.array(range, { maxLength: 4 }) }),
  );

  test("reducer로 만들 수 있는 임의의 구성 (속성 기반)", async () => {
    const id = TWO_PC_SWITCH.sw1.id;

    await fc.assert(
      fc.asyncProperty(fc.array(command, { maxLength: 20 }), async (commands) => {
        const source = open(twoPcSwitchDocument);
        for (const fields of commands) source.dispatch({ deviceId: id, ...fields } as unknown as Command);

        const lines = await runningConfig(source, id);
        const fresh = open(twoPcSwitchDocument);

        expect(await paste(fresh, id, lines)).toEqual([]);
        expect(configOf(fresh, id)).toEqual(configOf(source, id));
        // 다시 출력해도 같다
        expect(await runningConfig(fresh, id)).toEqual(lines);
      }),
      { numRuns: 200 },
    );
  });
});
