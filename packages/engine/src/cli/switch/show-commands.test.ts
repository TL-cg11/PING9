// Switch의 show 명령어: show interfaces trunk (T5.3.2), show mac address-table (T3.4.2).

import type { ConsoleResult, TopologyDocument } from "@ping9/shared";
import { TWO_PC_SWITCH, TWO_SWITCH_VLAN, twoPcSwitchDocument, twoSwitchVlanDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../../index";
import { tableLines } from "../ios/table";
import { macAddressTableLines } from "./show-commands";

async function run(document: TopologyDocument, deviceId: string, ...lines: string[]): Promise<ConsoleResult> {
  const simulator = createSimulator();
  simulator.load(document);
  const port = simulator.console(deviceId);
  let last = await port.exec("enable");
  for (const line of lines) last = await port.exec(line);
  return last;
}

const textOf = (result: ConsoleResult) => result.lines.map((line) => (line.kind === "text" ? line.text : `[${line.kind}]`));

describe("tableLines", () => {
  test("열 너비는 머리글과 값 중 가장 긴 것, 열 사이는 공백 2칸, 줄 끝의 공백은 없다", () => {
    expect(tableLines(["Port", "Status", "Allowed VLANs"], [["Fa0/8", "up", "10,20"], ["Fa0/1", "admin-down", ""]])).toEqual([
      "Port   Status      Allowed VLANs",
      "Fa0/8  up          10,20",
      "Fa0/1  admin-down",
    ]);
  });

  test("줄이 없으면 머리줄만 나온다", () => {
    expect(tableLines(["VLAN", "MAC address", "Port"], [])).toEqual(["VLAN  MAC address  Port"]);
  });
});

describe("show interfaces trunk", () => {
  const sw1 = TWO_SWITCH_VLAN.sw1.id;
  const sw2 = TWO_SWITCH_VLAN.sw2.id;

  test("trunk 포트의 상태와 허용 목록", async () => {
    expect(textOf(await run(twoSwitchVlanDocument, sw1, "show interfaces trunk"))).toEqual([
      "Port   Status  Allowed VLANs",
      "Fa0/8  up      10,20",
    ]);
    expect(textOf(await run(twoSwitchVlanDocument, sw2, "show interfaces trunk"))).toEqual([
      "Port   Status  Allowed VLANs",
      "Fa0/8  up      20",
    ]);
  });

  test("trunk 포트가 없으면 머리줄만 나온다", async () => {
    expect(textOf(await run(twoPcSwitchDocument, TWO_PC_SWITCH.sw1.id, "show interfaces trunk"))).toEqual([
      "Port  Status  Allowed VLANs",
    ]);
  });

  test("전부 허용은 all, 빈 목록은 none, 상태는 포트 상태 그대로, 포트 순번대로", async () => {
    const result = await run(
      twoSwitchVlanDocument,
      sw1,
      "configure terminal",
      "interface fa0/8",
      "no switchport trunk allowed vlan",
      "shutdown",
      "interface fa0/3",
      "switchport mode trunk",
      "switchport trunk allowed vlan none",
      "interface fa0/1",
      "switchport mode trunk",
      "switchport trunk allowed vlan 10-20,30",
      "end",
      "show interfaces trunk",
    );

    expect(textOf(result)).toEqual([
      "Port   Status      Allowed VLANs",
      "Fa0/1  up          10-20,30",
      "Fa0/3  no-link     none",
      "Fa0/8  admin-down  all",
    ]);
  });

  test("줄여 쓸 수 있다", async () => {
    expect(textOf(await run(twoSwitchVlanDocument, sw1, "sh int tr"))).toEqual([
      "Port   Status  Allowed VLANs",
      "Fa0/8  up      10,20",
    ]);
  });

  test("privileged 모드가 아니면 쓸 수 없다", async () => {
    const result = await run(twoSwitchVlanDocument, sw1, "disable", "show interfaces trunk");

    expect(result.lines).toEqual([{ kind: "error", code: "CLI_WRONG_MODE", params: { token: "show" }, position: 0 }]);
  });
});

describe("show mac address-table", () => {
  test("VLAN, MAC 주소, 줄인 포트 이름", () => {
    expect(
      macAddressTableLines([
        { vlan: 10, mac: "02:00:00:00:01:00", port: "FastEthernet0/1" },
        { vlan: 4094, mac: "02:00:00:00:02:00", port: "FastEthernet0/8" },
      ]),
    ).toEqual([
      "VLAN  MAC address        Port",
      "10    02:00:00:00:01:00  Fa0/1",
      "4094  02:00:00:00:02:00  Fa0/8",
    ]);
  });

  test("배운 주소가 없으면 머리줄만 나온다 (프레임이 흐르기 전에는 늘 그렇다)", async () => {
    expect(textOf(await run(twoSwitchVlanDocument, TWO_SWITCH_VLAN.sw1.id, "show mac address-table"))).toEqual([
      "VLAN  MAC address  Port",
    ]);
  });

  test("줄여 쓸 수 있고, privileged 모드에서만 쓸 수 있다", async () => {
    expect(textOf(await run(twoSwitchVlanDocument, TWO_SWITCH_VLAN.sw1.id, "sh mac add"))).toEqual([
      "VLAN  MAC address  Port",
    ]);

    const result = await run(twoSwitchVlanDocument, TWO_SWITCH_VLAN.sw1.id, "configure terminal", "show mac address-table");
    expect(result.lines).toEqual([{ kind: "error", code: "CLI_WRONG_MODE", params: { token: "show" }, position: 0 }]);
  });
});
