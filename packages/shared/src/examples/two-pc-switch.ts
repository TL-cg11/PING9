// 예시: PC 2대가 Switch 1대를 거쳐 연결된 문서.
// 이 문서에 대한 기대 Trace는 Switch 모델(T1.7.3)을 만들 때 함께 추가한다.

import type { TopologyDocument } from "../document";

export const TWO_PC_SWITCH = {
  pc1: { id: "00000000-0000-4000-8000-000000000011", name: "PC1", ip: "192.168.1.1" },
  pc2: { id: "00000000-0000-4000-8000-000000000012", name: "PC2", ip: "192.168.1.2" },
  sw1: { id: "00000000-0000-4000-8000-000000000013", name: "SW1" },
  mask: "255.255.255.0",
  link1Id: "00000000-0000-4000-8000-0000000000b1",
  link2Id: "00000000-0000-4000-8000-0000000000b2",
} as const;

const { pc1, pc2, sw1, mask, link1Id, link2Id } = TWO_PC_SWITCH;

export const twoPcSwitchDocument: TopologyDocument = {
  schemaVersion: 1,
  devices: [
    {
      id: pc1.id,
      kind: "pc",
      name: pc1.name,
      position: { x: 150, y: 320 },
      config: { ip: pc1.ip, mask },
    },
    {
      id: pc2.id,
      kind: "pc",
      name: pc2.name,
      position: { x: 550, y: 320 },
      config: { ip: pc2.ip, mask },
    },
    {
      id: sw1.id,
      kind: "switch",
      name: sw1.name,
      position: { x: 350, y: 160 },
      // ports에 없는 포트는 기본값(켜짐, access, VLAN 1)이다
      config: { vlans: [{ id: 1, name: "default" }], ports: {} },
    },
  ],
  links: [
    {
      id: link1Id,
      ends: [
        { deviceId: pc1.id, port: "Ethernet0" },
        { deviceId: sw1.id, port: "FastEthernet0/1" },
      ],
    },
    {
      id: link2Id,
      ends: [
        { deviceId: pc2.id, port: "Ethernet0" },
        { deviceId: sw1.id, port: "FastEthernet0/2" },
      ],
    },
  ],
};
