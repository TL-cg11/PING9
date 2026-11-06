// Switch의 프레임 전달 규칙 (T1.7.3). 손으로 만든 프레임으로 확인한다.

import { BROADCAST_MAC } from "@ping9/shared";
import type { SwitchConfig } from "@ping9/shared";
import { describe, expect, test } from "vitest";

import { EMPTY_MAC_TABLE, MAC_AGING_US, macTableView, pruneMacTable, switchForward } from "./forwarding";
import type { MacTable } from "./forwarding";

const FA = (n: number) => `FastEthernet0/${n}`;
const MAC_A = "02:00:00:00:01:00";
const MAC_B = "02:00:00:00:02:00";
const MAC_C = "02:00:00:00:03:00";

const DEFAULT_CONFIG: SwitchConfig = { vlans: [{ id: 1, name: "default" }], ports: {} };
const allUp = () => true;

interface Send {
  readonly inPort: string;
  readonly from: string;
  readonly to: string;
  readonly now?: number;
  readonly macTable?: MacTable;
  readonly isPortUp?: (port: string) => boolean;
  readonly config?: SwitchConfig;
  readonly vlanTag?: number;
}

function forward(send: Send) {
  return switchForward({
    config: send.config ?? DEFAULT_CONFIG,
    isPortUp: send.isPortUp ?? allUp,
    macTable: send.macTable ?? EMPTY_MAC_TABLE,
    now: send.now ?? 0,
    inPort: send.inPort,
    frame: {
      sourceMac: send.from,
      destinationMac: send.to,
      ...(send.vlanTag !== undefined && { vlanTag: send.vlanTag }),
    },
  });
}

const portsOf = (result: ReturnType<typeof forward>) => result.outputs.map((output) => output.port);

describe("switchForward: 학습과 전달", () => {
  test("모르는 목적지는 받은 포트를 뺀 모든 포트로 내보내고(flooding), 출발 MAC을 배운다", () => {
    const result = forward({ inPort: FA(1), from: MAC_A, to: MAC_B });

    expect(portsOf(result)).toEqual([FA(2), FA(3), FA(4), FA(5), FA(6), FA(7), FA(8)]);
    expect(result.outputs.every((output) => output.flooded)).toBe(true);
    expect(result.learned).toEqual({ mac: MAC_A, port: FA(1), vlan: 1 });
    expect(result.macTable).toEqual([{ vlan: 1, mac: MAC_A, port: FA(1), lastSeen: 0 }]);
    expect(result.vlan).toBe(1);
    expect(result.blocked).toEqual([]);
  });

  test("배운 목적지는 그 포트 하나로만 내보낸다", () => {
    const first = forward({ inPort: FA(1), from: MAC_A, to: MAC_B });

    const reply = forward({ inPort: FA(2), from: MAC_B, to: MAC_A, macTable: first.macTable, now: 10 });

    expect(reply.outputs).toEqual([{ port: FA(1), flooded: false }]);
    expect(reply.learned).toEqual({ mac: MAC_B, port: FA(2), vlan: 1 });
  });

  test("브로드캐스트는 항상 flooding이고, 브로드캐스트 주소는 배우지 않는다", () => {
    const known = forward({ inPort: FA(1), from: MAC_A, to: MAC_B }).macTable;

    const result = forward({ inPort: FA(2), from: BROADCAST_MAC, to: BROADCAST_MAC, macTable: known });

    expect(portsOf(result)).toEqual([FA(1), FA(3), FA(4), FA(5), FA(6), FA(7), FA(8)]);
    expect(result.learned).toBeUndefined();
    expect(result.macTable).toEqual(known);
  });

  test("목적지가 받은 포트에 있으면 내보내지 않는다 (실패가 아니다)", () => {
    const known = forward({ inPort: FA(1), from: MAC_A, to: MAC_B }).macTable;

    const result = forward({ inPort: FA(1), from: MAC_C, to: MAC_A, macTable: known });

    expect(result.samePort).toBe(true);
    expect(result.outputs).toEqual([]);
    expect(result.ingressDrop).toBeUndefined();
  });

  test("이미 아는 주소를 같은 포트에서 다시 보면 새로 배운 것으로 알리지 않고 시각만 고친다", () => {
    const known = forward({ inPort: FA(1), from: MAC_A, to: MAC_B }).macTable;

    const result = forward({ inPort: FA(1), from: MAC_A, to: MAC_B, macTable: known, now: 500 });

    expect(result.learned).toBeUndefined();
    expect(result.macTable).toEqual([{ vlan: 1, mac: MAC_A, port: FA(1), lastSeen: 500 }]);
  });

  test("주소가 다른 포트로 옮겨 가면 새 포트로 배운다", () => {
    const known = forward({ inPort: FA(1), from: MAC_A, to: MAC_B }).macTable;

    const result = forward({ inPort: FA(5), from: MAC_A, to: MAC_B, macTable: known, now: 1 });

    expect(result.learned).toEqual({ mac: MAC_A, port: FA(5), vlan: 1 });
    expect(result.macTable).toEqual([{ vlan: 1, mac: MAC_A, port: FA(5), lastSeen: 1 }]);
  });

  test("받은 테이블을 고치지 않는다", () => {
    const table: MacTable = Object.freeze([Object.freeze({ vlan: 1, mac: MAC_B, port: FA(2), lastSeen: 0 })]);

    const result = forward({ inPort: FA(1), from: MAC_A, to: MAC_B, macTable: table, now: 5 });

    expect(table).toEqual([{ vlan: 1, mac: MAC_B, port: FA(2), lastSeen: 0 }]);
    expect(result.macTable).not.toBe(table);
  });

  test("테이블의 순서는 VLAN, MAC 순이라 같은 입력이면 항상 같다", () => {
    let table = EMPTY_MAC_TABLE;
    for (const [port, mac] of [[FA(3), MAC_C], [FA(1), MAC_A], [FA(2), MAC_B]] as const) {
      table = forward({ inPort: port, from: mac, to: BROADCAST_MAC, macTable: table }).macTable;
    }

    expect(table.map((entry) => entry.mac)).toEqual([MAC_A, MAC_B, MAC_C]);
  });
});

describe("switchForward: 꺼진 포트", () => {
  const downPorts = (...ports: string[]) => (port: string) => !ports.includes(port);

  test("꺼진 포트로 들어온 프레임은 IF_DOWN으로 폐기하고 배우지 않는다", () => {
    const result = forward({ inPort: FA(1), from: MAC_A, to: MAC_B, isPortUp: downPorts(FA(1)) });

    expect(result.ingressDrop).toEqual({ reason: "IF_DOWN", params: { port: FA(1) } });
    expect(result.outputs).toEqual([]);
    expect(result.macTable).toEqual([]);
    expect(result.vlan).toBeUndefined();
    expect(result.learned).toBeUndefined();
  });

  test("flooding은 켜진 포트로만 간다", () => {
    const result = forward({ inPort: FA(1), from: MAC_A, to: MAC_B, isPortUp: (port) => [FA(1), FA(2), FA(8)].includes(port) });

    expect(portsOf(result)).toEqual([FA(2), FA(8)]);
  });

  test("배운 포트가 꺼져 있으면 그 항목을 쓰지 않고 flooding한다", () => {
    const known = forward({ inPort: FA(2), from: MAC_B, to: BROADCAST_MAC }).macTable;

    const result = forward({ inPort: FA(1), from: MAC_A, to: MAC_B, macTable: known, isPortUp: downPorts(FA(2)) });

    expect(result.outputs.every((output) => output.flooded)).toBe(true);
    expect(portsOf(result)).not.toContain(FA(2));
  });
});

describe("switchForward: 300초 만료", () => {
  const known = forward({ inPort: FA(2), from: MAC_B, to: BROADCAST_MAC, now: 1_000 }).macTable;

  test("300초가 지나기 전에는 배운 포트로 보낸다", () => {
    const result = forward({ inPort: FA(1), from: MAC_A, to: MAC_B, macTable: known, now: 1_000 + MAC_AGING_US - 1 });

    expect(result.outputs).toEqual([{ port: FA(2), flooded: false }]);
  });

  test("300초 동안 다시 보이지 않은 주소는 없는 것으로 치고 테이블에서도 지운다", () => {
    const result = forward({ inPort: FA(1), from: MAC_A, to: MAC_B, macTable: known, now: 1_000 + MAC_AGING_US });

    expect(result.outputs.every((output) => output.flooded)).toBe(true);
    expect(result.macTable).toEqual([{ vlan: 1, mac: MAC_A, port: FA(1), lastSeen: 1_000 + MAC_AGING_US }]);
  });

  test("다시 보이면 만료 시각이 미뤄진다", () => {
    const refreshed = forward({ inPort: FA(2), from: MAC_B, to: BROADCAST_MAC, macTable: known, now: 200_000_000 }).macTable;

    const result = forward({ inPort: FA(1), from: MAC_A, to: MAC_B, macTable: refreshed, now: 400_000_000 });

    expect(result.outputs).toEqual([{ port: FA(2), flooded: false }]);
  });
});

describe("pruneMacTable", () => {
  const table: MacTable = [
    { vlan: 1, mac: MAC_A, port: FA(1), lastSeen: 0 },
    { vlan: 1, mac: MAC_B, port: FA(2), lastSeen: 0 },
  ];

  test("꺼졌거나 링크가 없어진 포트의 항목을 지운다", () => {
    expect(pruneMacTable(table, { config: DEFAULT_CONFIG, isPortUp: (port) => port !== FA(2) })).toEqual([
      { vlan: 1, mac: MAC_A, port: FA(1), lastSeen: 0 },
    ]);
  });

  test("지울 것이 없으면 받은 테이블을 그대로 돌려준다", () => {
    expect(pruneMacTable(table, { config: DEFAULT_CONFIG, isPortUp: allUp })).toBe(table);
  });
});

describe("macTableView", () => {
  test("화면에 보일 목록: 만료된 항목을 빼고 VLAN, MAC 순", () => {
    const table: MacTable = [
      { vlan: 1, mac: MAC_A, port: FA(1), lastSeen: 0 },
      { vlan: 1, mac: MAC_B, port: FA(2), lastSeen: 200_000_000 },
    ];

    expect(macTableView(table, MAC_AGING_US)).toEqual([{ mac: MAC_B, port: FA(2), vlan: 1 }]);
    expect(macTableView(table, 0)).toEqual([
      { mac: MAC_A, port: FA(1), vlan: 1 },
      { mac: MAC_B, port: FA(2), vlan: 1 },
    ]);
  });
});
