import type { TopologyDocument } from "@ping9/shared";
import { describe, expect, test } from "vitest";

import { addressBelow, bandOf, labelSide, lastOctet, portAddress, segmentBands } from "./port-address";

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const access = { adminUp: true, mode: "access", accessVlan: 1 } as const;

/** PC1·PC2 – SW1 – SW2 – R1 – R2 – SW3 – PC3 */
const document = {
  schemaVersion: 1,
  devices: [
    { id: id(1), kind: "pc", name: "PC1", position: { x: 0, y: 0 }, config: { ip: "192.168.1.10", mask: "255.255.255.0" } },
    { id: id(2), kind: "pc", name: "PC2", position: { x: 0, y: 0 }, config: { ip: "192.168.1.11", mask: "255.255.255.0" } },
    { id: id(3), kind: "switch", name: "SW1", position: { x: 0, y: 0 }, config: { vlans: [{ id: 1, name: "default" }], ports: { "FastEthernet0/1": access, "FastEthernet0/2": access, "FastEthernet0/8": access } } },
    { id: id(4), kind: "switch", name: "SW2", position: { x: 0, y: 0 }, config: { vlans: [{ id: 1, name: "default" }], ports: { "FastEthernet0/1": access, "FastEthernet0/8": access } } },
    { id: id(5), kind: "router", name: "R1", position: { x: 0, y: 0 }, config: { staticRoutes: [], interfaces: {
      "GigabitEthernet0/0": { adminUp: true, ip: "192.168.1.1", mask: "255.255.255.0" },
      "GigabitEthernet0/1": { adminUp: true, ip: "10.0.12.1", mask: "255.255.255.252" },
    } } },
    { id: id(6), kind: "router", name: "R2", position: { x: 0, y: 0 }, config: { staticRoutes: [], interfaces: {
      "GigabitEthernet0/0": { adminUp: true, ip: "10.0.12.2", mask: "255.255.255.252" },
      "GigabitEthernet0/1": { adminUp: true, ip: "192.168.2.1", mask: "255.255.255.0" },
    } } },
    { id: id(7), kind: "switch", name: "SW3", position: { x: 0, y: 0 }, config: { vlans: [{ id: 1, name: "default" }], ports: { "FastEthernet0/1": access, "FastEthernet0/2": access } } },
    { id: id(8), kind: "pc", name: "PC3", position: { x: 0, y: 0 }, config: { ip: "192.168.2.10", mask: "255.255.255.0" } },
  ],
  links: [
    { id: id(0x101), ends: [{ deviceId: id(1), port: "Ethernet0" }, { deviceId: id(3), port: "FastEthernet0/1" }] },
    { id: id(0x102), ends: [{ deviceId: id(2), port: "Ethernet0" }, { deviceId: id(3), port: "FastEthernet0/2" }] },
    { id: id(0x103), ends: [{ deviceId: id(3), port: "FastEthernet0/8" }, { deviceId: id(4), port: "FastEthernet0/8" }] },
    { id: id(0x104), ends: [{ deviceId: id(4), port: "FastEthernet0/1" }, { deviceId: id(5), port: "GigabitEthernet0/0" }] },
    { id: id(0x105), ends: [{ deviceId: id(5), port: "GigabitEthernet0/1" }, { deviceId: id(6), port: "GigabitEthernet0/0" }] },
    { id: id(0x106), ends: [{ deviceId: id(8), port: "Ethernet0" }, { deviceId: id(7), port: "FastEthernet0/2" }] },
    { id: id(0x107), ends: [{ deviceId: id(6), port: "GigabitEthernet0/1" }, { deviceId: id(7), port: "FastEthernet0/1" }] },
  ],
} as unknown as TopologyDocument;

describe("포트 주소와 대역", () => {
  test("PC·Router 포트는 주소가 있고 Switch 포트는 없다", () => {
    expect(portAddress(document, { deviceId: id(5), port: "GigabitEthernet0/1" })).toEqual({ ip: "10.0.12.1", mask: "255.255.255.252", prefix: 30 });
    expect(portAddress(document, { deviceId: id(1), port: "Ethernet0" })?.ip).toBe("192.168.1.10");
    expect(portAddress(document, { deviceId: id(3), port: "FastEthernet0/1" })).toBeNull();
    expect(lastOctet("10.0.12.1")).toBe(".1");
    expect(bandOf({ ip: "10.0.12.2", mask: "255.255.255.252", prefix: 30 })).toBe("10.0.12.0/30");
  });

  test("대역은 Switch 구간마다 한 번, Router 쪽 링크에. Switch끼리 링크는 없음", () => {
    expect([...segmentBands(document)].sort()).toEqual([
      [id(0x104), "192.168.1.0/24"],
      [id(0x105), "10.0.12.0/30"],
      [id(0x107), "192.168.2.0/24"],
    ]);
  });
});

describe("포트 이름을 놓는 쪽", () => {
  test("케이블이 하나면 위쪽", () => {
    expect(labelSide({ x: 1, y: 0 }, []).y).toBe(-1);
  });

  test("두 케이블이 위로 벌어지면 각자 바깥 (왼쪽 케이블은 왼쪽, 오른쪽 케이블은 오른쪽)", () => {
    const left = { x: -0.6, y: -0.8 };
    const right = { x: 0.6, y: -0.8 };
    expect(labelSide(left, [right]).x).toBeLessThan(0);
    expect(labelSide(right, [left]).x).toBeGreaterThan(0);
  });

  test("반대쪽으로 뻗은 케이블만 있으면 위쪽 그대로", () => {
    expect(labelSide({ x: 1, y: 0 }, [{ x: -1, y: 0 }]).y).toBe(-1);
  });
});

describe("주소를 포트 이름 위·아래 어디에", () => {
  const box = (left: number, top: number) => ({ left, top, right: left + 10, bottom: top + 10 });
  test("위가 장비 이름과 겹치고 아래는 비면 아래", () => {
    expect(addressBelow(box(0, 0), box(0, 30), [box(5, 5)])).toBe(true);
  });
  test("위가 비면 위", () => {
    expect(addressBelow(box(0, 0), box(0, 30), [box(50, 50)])).toBe(false);
  });
  test("아래도 겹치면 위 그대로", () => {
    expect(addressBelow(box(0, 0), box(0, 30), [box(5, 5), box(5, 32)])).toBe(false);
  });
});
