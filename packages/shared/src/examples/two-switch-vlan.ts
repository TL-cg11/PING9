// 예시: Switch 2대가 trunk로 연결되고, PC 4대가 VLAN 10과 VLAN 20으로 나뉜 문서.
// 화면 시안(docs/superpowers/specs/2026-11-05-switch-vlan-mockup.html)과 같은 장면이다.
// SW2의 trunk는 VLAN 20만 허용한다. 그래서 PC1(VLAN 10)에서 PC3(VLAN 10)으로의 통신은 SW2에서 막힌다.

import type { SwitchConfig, TopologyDocument, Vlan, VlanRange } from "../document";

export const TWO_SWITCH_VLAN = {
  pc1: { id: "00000000-0000-4000-8000-000000000021", name: "PC1", ip: "10.0.10.1" },
  pc2: { id: "00000000-0000-4000-8000-000000000022", name: "PC2", ip: "10.0.20.2" },
  pc3: { id: "00000000-0000-4000-8000-000000000023", name: "PC3", ip: "10.0.10.3" },
  pc4: { id: "00000000-0000-4000-8000-000000000024", name: "PC4", ip: "10.0.20.4" },
  sw1: { id: "00000000-0000-4000-8000-000000000025", name: "SW1" },
  sw2: { id: "00000000-0000-4000-8000-000000000026", name: "SW2" },
  mask: "255.255.255.0",
} as const;

const { pc1, pc2, pc3, pc4, sw1, sw2, mask } = TWO_SWITCH_VLAN;

const VLANS: readonly Vlan[] = [
  { id: 1, name: "default" },
  { id: 10, name: "SALES" },
  { id: 20, name: "DEV" },
];

/** Fa0/1은 VLAN 10, Fa0/2는 VLAN 20, Fa0/8은 trunk. 기본값과 같은 설정은 적지 않는다 */
function switchConfig(trunkAllowed: readonly VlanRange[]): SwitchConfig {
  return {
    vlans: VLANS,
    ports: {
      "FastEthernet0/1": { adminUp: true, mode: "access", accessVlan: 10 },
      "FastEthernet0/2": { adminUp: true, mode: "access", accessVlan: 20 },
      "FastEthernet0/8": { adminUp: true, mode: "trunk", allowedVlans: trunkAllowed },
    },
  };
}

const linkId = (n: number) => `00000000-0000-4000-8000-0000000000c${n}`;

export const twoSwitchVlanDocument: TopologyDocument = {
  schemaVersion: 1,
  devices: [
    { id: pc1.id, kind: "pc", name: pc1.name, position: { x: 110, y: 128 }, config: { ip: pc1.ip, mask } },
    { id: pc2.id, kind: "pc", name: pc2.name, position: { x: 110, y: 250 }, config: { ip: pc2.ip, mask } },
    {
      id: sw1.id,
      kind: "switch",
      name: sw1.name,
      position: { x: 300, y: 189 },
      config: switchConfig([
        [10, 10],
        [20, 20],
      ]),
    },
    {
      id: sw2.id,
      kind: "switch",
      name: sw2.name,
      position: { x: 560, y: 189 },
      config: switchConfig([[20, 20]]),
    },
    { id: pc3.id, kind: "pc", name: pc3.name, position: { x: 750, y: 128 }, config: { ip: pc3.ip, mask } },
    { id: pc4.id, kind: "pc", name: pc4.name, position: { x: 750, y: 250 }, config: { ip: pc4.ip, mask } },
  ],
  links: [
    {
      id: linkId(1),
      ends: [
        { deviceId: pc1.id, port: "Ethernet0" },
        { deviceId: sw1.id, port: "FastEthernet0/1" },
      ],
    },
    {
      id: linkId(2),
      ends: [
        { deviceId: pc2.id, port: "Ethernet0" },
        { deviceId: sw1.id, port: "FastEthernet0/2" },
      ],
    },
    {
      id: linkId(3),
      ends: [
        { deviceId: sw1.id, port: "FastEthernet0/8" },
        { deviceId: sw2.id, port: "FastEthernet0/8" },
      ],
    },
    {
      id: linkId(4),
      ends: [
        { deviceId: sw2.id, port: "FastEthernet0/1" },
        { deviceId: pc3.id, port: "Ethernet0" },
      ],
    },
    {
      id: linkId(5),
      ends: [
        { deviceId: sw2.id, port: "FastEthernet0/2" },
        { deviceId: pc4.id, port: "Ethernet0" },
      ],
    },
  ],
};
