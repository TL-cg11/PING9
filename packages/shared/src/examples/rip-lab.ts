// RIP 실습 (T11.2.2): PC1—R1—R2—R3—PC2. Static route 없이 RIP(network 10.0.0.0)만 켠다.
// 사각형 (T11.3.1): R1과 R3 사이에 R4로 가는 두 번째 길을 더한다.
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

export const RIP_SQUARE = {
  pc1: { id: "00000000-0000-4000-8000-000000003001", ip: "10.0.1.10" },
  r1: "00000000-0000-4000-8000-000000003002",
  r2: "00000000-0000-4000-8000-000000003003",
  r3: "00000000-0000-4000-8000-000000003004",
  r4: "00000000-0000-4000-8000-000000003005",
  pc2: { id: "00000000-0000-4000-8000-000000003006", ip: "10.0.3.10" },
  links: {
    pc1R1: "00000000-0000-4000-8000-000000003101",
    r1R2: "00000000-0000-4000-8000-000000003102",
    r2R3: "00000000-0000-4000-8000-000000003103",
    r3Pc2: "00000000-0000-4000-8000-000000003104",
    r1R4: "00000000-0000-4000-8000-000000003105",
    r4R3: "00000000-0000-4000-8000-000000003106",
  },
} as const;

const [, , GI2] = PORT_NAMES.router as readonly [string, string, string, ...string[]];

const squareRouter = (id: string, name: string, position: { x: number; y: number },
  ports: Readonly<Record<string, readonly [string, string]>>): RouterDevice => ({
  id, name, kind: "router", position,
  config: {
    interfaces: Object.fromEntries(Object.entries(ports).map(([port, [ip, mask]]) => [port, { adminUp: true, ip, mask }])),
    staticRoutes: [],
    rip: { networks: ["10.0.0.0"], passiveInterfaces: [] },
  },
});

/**
 * Router 4대 사각형. R1–R2–R3 위쪽 길과 R1–R4–R3 아래쪽 길이 같은 hop 수다.
 * R1–R2를 끊으면 R1은 PC2의 LAN(10.0.3.0)을 R4 쪽으로 다시 배운다
 */
export const fourRouterRipDocument: TopologyDocument = {
  schemaVersion: 1,
  devices: [
    { ...pc(RIP_SQUARE.pc1.id, "PC1", 80, RIP_SQUARE.pc1.ip, "10.0.1.1"), position: { x: 80, y: 120 } },
    squareRouter(RIP_SQUARE.r1, "R1", { x: 260, y: 120 },
      { [GI0]: ["10.0.1.1", LAN], [GI1]: ["10.0.12.1", P2P], [GI2]: ["10.0.14.1", P2P] }),
    squareRouter(RIP_SQUARE.r2, "R2", { x: 500, y: 120 }, { [GI0]: ["10.0.12.2", P2P], [GI1]: ["10.0.23.1", P2P] }),
    squareRouter(RIP_SQUARE.r3, "R3", { x: 740, y: 120 },
      { [GI0]: ["10.0.23.2", P2P], [GI1]: ["10.0.3.1", LAN], [GI2]: ["10.0.34.1", P2P] }),
    squareRouter(RIP_SQUARE.r4, "R4", { x: 500, y: 300 }, { [GI0]: ["10.0.14.2", P2P], [GI1]: ["10.0.34.2", P2P] }),
    { ...pc(RIP_SQUARE.pc2.id, "PC2", 920, RIP_SQUARE.pc2.ip, "10.0.3.1"), position: { x: 920, y: 120 } },
  ],
  links: [
    { id: RIP_SQUARE.links.pc1R1, ends: [{ deviceId: RIP_SQUARE.pc1.id, port: "Ethernet0" }, { deviceId: RIP_SQUARE.r1, port: GI0 }] },
    { id: RIP_SQUARE.links.r1R2, ends: [{ deviceId: RIP_SQUARE.r1, port: GI1 }, { deviceId: RIP_SQUARE.r2, port: GI0 }] },
    { id: RIP_SQUARE.links.r2R3, ends: [{ deviceId: RIP_SQUARE.r2, port: GI1 }, { deviceId: RIP_SQUARE.r3, port: GI0 }] },
    { id: RIP_SQUARE.links.r3Pc2, ends: [{ deviceId: RIP_SQUARE.r3, port: GI1 }, { deviceId: RIP_SQUARE.pc2.id, port: "Ethernet0" }] },
    { id: RIP_SQUARE.links.r1R4, ends: [{ deviceId: RIP_SQUARE.r1, port: GI2 }, { deviceId: RIP_SQUARE.r4, port: GI0 }] },
    { id: RIP_SQUARE.links.r4R3, ends: [{ deviceId: RIP_SQUARE.r4, port: GI1 }, { deviceId: RIP_SQUARE.r3, port: GI2 }] },
  ],
};
