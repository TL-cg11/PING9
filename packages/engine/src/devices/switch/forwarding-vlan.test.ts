// 전달 규칙의 VLAN 부분: access 포트 (T5.2.1). trunk는 T5.3.1에서 더한다.

import { BROADCAST_MAC } from "@ping9/shared";
import type { SwitchConfig } from "@ping9/shared";
import { describe, expect, test } from "vitest";

import { EMPTY_MAC_TABLE, pruneMacTable, switchForward } from "./forwarding";
import type { MacTable } from "./forwarding";

const FA = (n: number) => `FastEthernet0/${n}`;
const MAC_A = "02:00:00:00:01:00";
const MAC_B = "02:00:00:00:02:00";
const MAC_C = "02:00:00:00:03:00";

const allUp = () => true;

/** Fa0/1, Fa0/3은 VLAN 10, Fa0/2는 VLAN 20, 나머지는 VLAN 1 */
const ACCESS_CONFIG: SwitchConfig = {
  vlans: [
    { id: 1, name: "default" },
    { id: 10, name: "SALES" },
    { id: 20, name: "DEV" },
  ],
  ports: {
    [FA(1)]: { adminUp: true, mode: "access", accessVlan: 10 },
    [FA(2)]: { adminUp: true, mode: "access", accessVlan: 20 },
    [FA(3)]: { adminUp: true, mode: "access", accessVlan: 10 },
  },
};

interface Send {
  readonly config?: SwitchConfig;
  readonly inPort: string;
  readonly from: string;
  readonly to: string;
  readonly macTable?: MacTable;
  readonly isPortUp?: (port: string) => boolean;
  readonly vlanTag?: number;
}

function forward(send: Send) {
  return switchForward({
    config: send.config ?? ACCESS_CONFIG,
    isPortUp: send.isPortUp ?? allUp,
    macTable: send.macTable ?? EMPTY_MAC_TABLE,
    now: 0,
    inPort: send.inPort,
    frame: {
      sourceMac: send.from,
      destinationMac: send.to,
      ...(send.vlanTag !== undefined && { vlanTag: send.vlanTag }),
    },
  });
}

describe("switchForward: access 포트의 VLAN", () => {
  test("flooding은 같은 VLAN의 포트로만 가고, VLAN 때문에 빠진 포트를 알려 준다", () => {
    const result = forward({ inPort: FA(1), from: MAC_A, to: BROADCAST_MAC });

    expect(result.vlan).toBe(10);
    expect(result.outputs).toEqual([{ port: FA(3), flooded: true }]);
    expect(result.blocked).toEqual([
      { reason: "VLAN_BLOCKED", params: { frameVlan: 10, port: FA(2), portVlan: 20 } },
      ...[4, 5, 6, 7, 8].map((n) => ({ reason: "VLAN_BLOCKED", params: { frameVlan: 10, port: FA(n), portVlan: 1 } })),
    ]);
    expect(result.learned).toEqual({ mac: MAC_A, port: FA(1), vlan: 10 });
  });

  test("꺼진 포트는 VLAN이 달라도 빠진 포트로 치지 않는다", () => {
    const result = forward({
      inPort: FA(1),
      from: MAC_A,
      to: BROADCAST_MAC,
      isPortUp: (port) => port === FA(1) || port === FA(2),
    });

    expect(result.outputs).toEqual([]);
    expect(result.blocked).toEqual([{ reason: "VLAN_BLOCKED", params: { frameVlan: 10, port: FA(2), portVlan: 20 } }]);
  });

  test("VLAN을 쓰지 않는 구성에서는 모든 포트로 가고 빠진 포트가 없다", () => {
    const result = forward({
      config: { vlans: [{ id: 1, name: "default" }], ports: {} },
      inPort: FA(1),
      from: MAC_A,
      to: MAC_B,
    });

    expect(result.outputs.map((output) => output.port)).toEqual([2, 3, 4, 5, 6, 7, 8].map(FA));
    expect(result.blocked).toEqual([]);
  });

  test("같은 MAC이라도 VLAN이 다르면 따로 배운다", () => {
    const first = forward({ inPort: FA(1), from: MAC_A, to: BROADCAST_MAC });

    const second = forward({ inPort: FA(2), from: MAC_A, to: BROADCAST_MAC, macTable: first.macTable });

    expect(second.macTable).toEqual([
      { vlan: 10, mac: MAC_A, port: FA(1), lastSeen: 0 },
      { vlan: 20, mac: MAC_A, port: FA(2), lastSeen: 0 },
    ]);
  });

  test("다른 VLAN에서 배운 주소로는 보내지 않는다", () => {
    const known = forward({ inPort: FA(2), from: MAC_B, to: BROADCAST_MAC }).macTable;

    const result = forward({ inPort: FA(1), from: MAC_A, to: MAC_B, macTable: known });

    expect(result.outputs).toEqual([{ port: FA(3), flooded: true }]);
  });

  test("같은 VLAN에서 배운 주소로는 그 포트 하나로 보낸다", () => {
    const known = forward({ inPort: FA(3), from: MAC_C, to: BROADCAST_MAC }).macTable;

    const result = forward({ inPort: FA(1), from: MAC_A, to: MAC_C, macTable: known });

    expect(result.outputs).toEqual([{ port: FA(3), flooded: false }]);
    expect(result.blocked).toEqual([]);
  });

  test("태그가 포트의 VLAN과 같으면 받고, 내보낼 때는 태그를 뗀다", () => {
    const result = forward({ inPort: FA(1), from: MAC_A, to: BROADCAST_MAC, vlanTag: 10 });

    expect(result.vlan).toBe(10);
    expect(result.outputs).toEqual([{ port: FA(3), flooded: true }]);
  });

  test("태그가 포트의 VLAN과 다르면 VLAN_BLOCKED로 폐기한다", () => {
    const result = forward({ inPort: FA(1), from: MAC_A, to: BROADCAST_MAC, vlanTag: 20 });

    expect(result.ingressDrop).toEqual({ reason: "VLAN_BLOCKED", params: { frameVlan: 20, port: FA(1), portVlan: 10 } });
    expect(result.outputs).toEqual([]);
    expect(result.macTable).toEqual([]);
  });

  test("포트의 VLAN이 지워졌으면 VLAN_INACTIVE로 폐기한다", () => {
    const removed: SwitchConfig = { ...ACCESS_CONFIG, vlans: ACCESS_CONFIG.vlans.filter((vlan) => vlan.id !== 10) };

    const result = forward({ config: removed, inPort: FA(1), from: MAC_A, to: BROADCAST_MAC });

    expect(result.ingressDrop).toEqual({ reason: "VLAN_INACTIVE", params: { port: FA(1), vlan: 10 } });
    expect(result.outputs).toEqual([]);
    expect(result.learned).toBeUndefined();
  });

  test("VLAN 1은 구성의 목록에 없어도 있는 것으로 친다", () => {
    const result = forward({ config: { vlans: [], ports: {} }, inPort: FA(1), from: MAC_A, to: BROADCAST_MAC });

    expect(result.ingressDrop).toBeUndefined();
    expect(result.vlan).toBe(1);
    expect(result.outputs).toHaveLength(7);
  });

  test("배운 뒤에 그 포트의 VLAN이 바뀌었으면 그 항목을 쓰지 않는다", () => {
    const known = forward({ inPort: FA(3), from: MAC_C, to: BROADCAST_MAC }).macTable;
    const moved: SwitchConfig = {
      ...ACCESS_CONFIG,
      ports: { ...ACCESS_CONFIG.ports, [FA(3)]: { adminUp: true, mode: "access", accessVlan: 20 } },
    };

    const result = forward({ config: moved, inPort: FA(1), from: MAC_A, to: MAC_C, macTable: known });

    expect(result.outputs).toEqual([]);
    expect(result.blocked.map((drop) => drop.params.port)).toContain(FA(3));
  });
});

describe("switchForward: MAC 주소의 대소문자", () => {
  test("대문자로 적힌 브로드캐스트 주소도 브로드캐스트다", () => {
    const upper = "FF:FF:FF:FF:FF:FF";

    const result = forward({ inPort: FA(1), from: upper, to: upper });

    expect(result.learned).toBeUndefined();
    expect(result.outputs).toEqual([{ port: FA(3), flooded: true }]);
  });

  test("대소문자만 다른 주소는 같은 주소로 배우고 찾는다", () => {
    const known = forward({ inPort: FA(3), from: "02:00:00:00:0A:BC", to: BROADCAST_MAC }).macTable;

    const result = forward({ inPort: FA(1), from: MAC_A, to: "02:00:00:00:0a:bc", macTable: known });

    expect(known).toEqual([{ vlan: 10, mac: "02:00:00:00:0a:bc", port: FA(3), lastSeen: 0 }]);
    expect(result.outputs).toEqual([{ port: FA(3), flooded: false }]);
  });
});

describe("pruneMacTable: VLAN이 바뀐 뒤", () => {
  const table: MacTable = [
    { vlan: 10, mac: MAC_A, port: FA(1), lastSeen: 0 },
    { vlan: 10, mac: MAC_C, port: FA(3), lastSeen: 0 },
    { vlan: 20, mac: MAC_B, port: FA(2), lastSeen: 0 },
  ];

  test("포트의 access VLAN이 바뀌면 그 포트의 항목을 지운다", () => {
    const moved: SwitchConfig = {
      ...ACCESS_CONFIG,
      ports: { ...ACCESS_CONFIG.ports, [FA(3)]: { adminUp: true, mode: "access", accessVlan: 20 } },
    };

    expect(pruneMacTable(table, { config: moved, isPortUp: allUp }).map((entry) => entry.mac)).toEqual([MAC_A, MAC_B]);
  });

  test("포트의 모드가 바뀌면, 그 VLAN을 여전히 나르더라도 그 포트의 항목을 지운다", () => {
    const toTrunk: SwitchConfig = {
      ...ACCESS_CONFIG,
      ports: { ...ACCESS_CONFIG.ports, [FA(1)]: { adminUp: true, mode: "trunk", accessVlan: 10 } },
    };

    // 바뀌기 전의 구성을 주지 않으면 무엇이 바뀌었는지 알 수 없어 남는다
    expect(pruneMacTable(table, { config: toTrunk, isPortUp: allUp })).toHaveLength(3);
    expect(
      pruneMacTable(table, { config: toTrunk, isPortUp: allUp, previousConfig: ACCESS_CONFIG }).map((entry) => entry.mac),
    ).toEqual([MAC_C, MAC_B]);
  });

  test("지워진 VLAN의 항목을 지운다", () => {
    const removed: SwitchConfig = { ...ACCESS_CONFIG, vlans: ACCESS_CONFIG.vlans.filter((vlan) => vlan.id !== 10) };

    expect(pruneMacTable(table, { config: removed, isPortUp: allUp })).toEqual([
      { vlan: 20, mac: MAC_B, port: FA(2), lastSeen: 0 },
    ]);
  });
});
