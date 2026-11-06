// 전달 규칙의 trunk 부분 (T5.3.1): 태그와 허용 목록. Switch 2대를 이어 부르는 장면 테스트를 포함한다.

import { BROADCAST_MAC } from "@ping9/shared";
import type { SwitchConfig, SwitchDevice } from "@ping9/shared";
import { TWO_SWITCH_VLAN, twoSwitchVlanDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { EMPTY_MAC_TABLE, pruneMacTable, switchForward } from "./forwarding";
import type { ForwardFrame, MacTable } from "./forwarding";

const FA = (n: number) => `FastEthernet0/${n}`;
const MAC_A = "02:00:00:00:01:00";
const MAC_B = "02:00:00:00:02:00";

const allUp = () => true;

/** Fa0/1은 VLAN 10, Fa0/2는 VLAN 20, Fa0/8은 trunk (10, 20 허용). 나머지는 VLAN 1 */
const TRUNK_CONFIG: SwitchConfig = {
  vlans: [
    { id: 1, name: "default" },
    { id: 10, name: "SALES" },
    { id: 20, name: "DEV" },
  ],
  ports: {
    [FA(1)]: { adminUp: true, mode: "access", accessVlan: 10 },
    [FA(2)]: { adminUp: true, mode: "access", accessVlan: 20 },
    [FA(8)]: { adminUp: true, mode: "trunk", allowedVlans: [[10, 10], [20, 20]] },
  },
};

const withTrunk = (allowedVlans?: readonly (readonly [number, number])[]): SwitchConfig => ({
  ...TRUNK_CONFIG,
  ports: {
    ...TRUNK_CONFIG.ports,
    [FA(8)]: { adminUp: true, mode: "trunk", ...(allowedVlans !== undefined && { allowedVlans }) },
  },
});

function forward(config: SwitchConfig, inPort: string, frame: Partial<ForwardFrame> = {}, macTable: MacTable = EMPTY_MAC_TABLE) {
  return switchForward({
    config,
    isPortUp: allUp,
    macTable,
    now: 0,
    inPort,
    frame: { sourceMac: MAC_A, destinationMac: BROADCAST_MAC, ...frame },
  });
}

describe("switchForward: trunk로 나갈 때", () => {
  test("VLAN 1이 아닌 프레임은 그 VLAN의 태그를 달고 나간다", () => {
    const result = forward(TRUNK_CONFIG, FA(1));

    expect(result.vlan).toBe(10);
    expect(result.outputs).toEqual([{ port: FA(8), vlanTag: 10, flooded: true }]);
  });

  test("VLAN 1의 프레임은 태그 없이 나간다", () => {
    const result = forward(withTrunk(), FA(3));

    expect(result.vlan).toBe(1);
    expect(result.outputs).toContainEqual({ port: FA(8), flooded: true });
  });

  test("허용 목록에 없는 VLAN은 내보내지 않고 빠진 포트로 알린다", () => {
    const result = forward(withTrunk([[20, 20]]), FA(1));

    expect(result.outputs).toEqual([]);
    expect(result.blocked).toContainEqual({ reason: "TRUNK_NOT_ALLOWED", params: { port: FA(8), vlan: 10 } });
  });

  test("허용 목록이 없으면 전부 허용이다", () => {
    expect(forward(withTrunk(), FA(1)).outputs).toEqual([{ port: FA(8), vlanTag: 10, flooded: true }]);
    expect(forward(withTrunk(), FA(2)).outputs).toEqual([{ port: FA(8), vlanTag: 20, flooded: true }]);
  });

  test("빈 허용 목록은 아무 VLAN도 내보내지 않는다", () => {
    const result = forward(withTrunk([]), FA(1));

    expect(result.outputs).toEqual([]);
  });
});

describe("switchForward: trunk로 들어올 때", () => {
  test("태그의 VLAN으로 분류하고, 그 VLAN의 access 포트로 태그 없이 내보낸다", () => {
    const result = forward(TRUNK_CONFIG, FA(8), { vlanTag: 20 });

    expect(result.vlan).toBe(20);
    expect(result.outputs).toEqual([{ port: FA(2), flooded: true }]);
    expect(result.learned).toEqual({ mac: MAC_A, port: FA(8), vlan: 20 });
  });

  test("태그가 없으면 VLAN 1이다", () => {
    const result = forward(withTrunk(), FA(8));

    expect(result.vlan).toBe(1);
    expect(result.outputs.map((output) => output.port)).toEqual([3, 4, 5, 6, 7].map(FA));
  });

  test("허용 목록에 없는 태그는 TRUNK_NOT_ALLOWED로 폐기한다", () => {
    const result = forward(withTrunk([[20, 20]]), FA(8), { vlanTag: 10 });

    expect(result.ingressDrop).toEqual({ reason: "TRUNK_NOT_ALLOWED", params: { port: FA(8), vlan: 10 } });
    expect(result.outputs).toEqual([]);
    expect(result.macTable).toEqual([]);
  });

  test("태그가 없는데 허용 목록에 VLAN 1이 없으면 TRUNK_NOT_ALLOWED로 폐기한다", () => {
    const result = forward(TRUNK_CONFIG, FA(8));

    expect(result.ingressDrop).toEqual({ reason: "TRUNK_NOT_ALLOWED", params: { port: FA(8), vlan: 1 } });
  });

  test("허용되지만 이 Switch에 없는 VLAN은 VLAN_INACTIVE로 폐기한다", () => {
    const result = forward(withTrunk(), FA(8), { vlanTag: 30 });

    expect(result.ingressDrop).toEqual({ reason: "VLAN_INACTIVE", params: { port: FA(8), vlan: 30 } });
  });

  test("trunk에서 배운 주소로는 태그를 달아 그 trunk 하나로 보낸다", () => {
    const known = forward(TRUNK_CONFIG, FA(8), { sourceMac: MAC_B, vlanTag: 10 }).macTable;

    const result = forward(TRUNK_CONFIG, FA(1), { destinationMac: MAC_B }, known);

    expect(result.outputs).toEqual([{ port: FA(8), vlanTag: 10, flooded: false }]);
  });
});

describe("pruneMacTable: trunk의 허용 목록이 바뀐 뒤", () => {
  test("더는 허용하지 않는 VLAN의 항목을 지운다", () => {
    const table: MacTable = [
      { vlan: 10, mac: MAC_A, port: FA(8), lastSeen: 0 },
      { vlan: 20, mac: MAC_B, port: FA(8), lastSeen: 0 },
    ];

    expect(pruneMacTable(table, { config: withTrunk([[20, 20]]), isPortUp: allUp })).toEqual([
      { vlan: 20, mac: MAC_B, port: FA(8), lastSeen: 0 },
    ]);
  });
});

describe("장면: Switch 2대 (예시 문서. SW1의 trunk는 10·20, SW2의 trunk는 20만 허용)", () => {
  const configOf = (id: string) =>
    (twoSwitchVlanDocument.devices.find((device) => device.id === id) as SwitchDevice).config;
  const sw1 = configOf(TWO_SWITCH_VLAN.sw1.id);
  const sw2 = configOf(TWO_SWITCH_VLAN.sw2.id);

  test("VLAN 20의 프레임은 trunk에서 태그 20을 달고 건너가 SW2의 VLAN 20 포트로만 나온다", () => {
    const first = forward(sw1, FA(2));
    expect(first.outputs).toEqual([{ port: FA(8), vlanTag: 20, flooded: true }]);

    const second = forward(sw2, FA(8), { vlanTag: first.outputs[0]!.vlanTag! });
    expect(second.vlan).toBe(20);
    expect(second.outputs).toEqual([{ port: FA(2), flooded: true }]);
  });

  test("VLAN 10의 프레임은 SW1을 떠나지만 SW2의 trunk가 허용하지 않아 버려진다 (시안의 실패 장면)", () => {
    const first = forward(sw1, FA(1));
    expect(first.outputs).toEqual([{ port: FA(8), vlanTag: 10, flooded: true }]);

    const second = forward(sw2, FA(8), { vlanTag: 10 });
    expect(second.ingressDrop).toEqual({ reason: "TRUNK_NOT_ALLOWED", params: { port: FA(8), vlan: 10 } });
    expect(second.outputs).toEqual([]);
  });
});
