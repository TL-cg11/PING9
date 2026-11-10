// RIP 실습 (T11.2.2): PC1—R1—R2—R3—PC2. Static route 없이 RIP(network 10.0.0.0)만 켠다.
import { PORT_NAMES } from "../document";
import type { PcDevice, RouterDevice, TopologyDocument } from "../document";

export const RIP_LAB = {
  pc1: { id: "00000000-0000-4000-8000-000000002001", ip: "10.0.1.10" },
  r1: "00000000-0000-4000-8000-000000002002",
  r2: "00000000-0000-4000-8000-000000002003",
  r3: "00000000-0000-4000-8000-000000002004",
  pc2: { id: "00000000-0000-4000-8000-000000002005", ip: "10.0.3.10" },
  links: [
    "00000000-0000-4000-8000-000000002101",
    "00000000-0000-4000-8000-000000002102",
    "00000000-0000-4000-8000-000000002103",
    "00000000-0000-4000-8000-000000002104",
  ],
} as const;

const [GI0, GI1] = PORT_NAMES.router as readonly [string, string, ...string[]];
const LAN = "255.255.255.0";
const P2P = "255.255.255.252";

const pc = (id: string, name: string, x: number, ip: string, gateway: string): PcDevice => ({
  id, name, kind: "pc", position: { x, y: 180 }, config: { ip, mask: LAN, gateway },
});

const router = (id: string, name: string, x: number, left: [string, string], right: [string, string]): RouterDevice => ({
  id, name, kind: "router", position: { x, y: 180 },
  config: {
    interfaces: {
      [GI0]: { adminUp: true, ip: left[0], mask: left[1] },
      [GI1]: { adminUp: true, ip: right[0], mask: right[1] },
    },
    staticRoutes: [],
    rip: { networks: ["10.0.0.0"], passiveInterfaces: [] },
  },
});

const chain = [
  pc(RIP_LAB.pc1.id, "PC1", 80, RIP_LAB.pc1.ip, "10.0.1.1"),
  router(RIP_LAB.r1, "R1", 260, ["10.0.1.1", LAN], ["10.0.12.1", P2P]),
  router(RIP_LAB.r2, "R2", 440, ["10.0.12.2", P2P], ["10.0.23.1", P2P]),
  router(RIP_LAB.r3, "R3", 620, ["10.0.23.2", P2P], ["10.0.3.1", LAN]),
  pc(RIP_LAB.pc2.id, "PC2", 800, RIP_LAB.pc2.ip, "10.0.3.1"),
] as const;

const portOf = (device: PcDevice | RouterDevice, side: 0 | 1) => (device.kind === "pc" ? "Ethernet0" : side === 0 ? GI0 : GI1);

/** Router 3대 일렬. 경로 교환 1회 뒤 R1과 R3이 서로의 끝 LAN을 `[120/2]`로 배운다 */
export const threeRouterRipDocument: TopologyDocument = {
  schemaVersion: 1,
  devices: [...chain],
  links: RIP_LAB.links.map((id, index) => ({
    id,
    ends: [
      { deviceId: chain[index]!.id, port: portOf(chain[index]!, 1) },
      { deviceId: chain[index + 1]!.id, port: portOf(chain[index + 1]!, 0) },
    ] as const,
  })),
};
