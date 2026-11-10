// 스위치 모델에 의존하지 않는 라우터 실습: PC—R1—(R2)—PC.
import { PORT_NAMES } from "../document";
import type { RouterDevice, TopologyDocument } from "../document";

export const ROUTER_LAB = {
  pc1: "00000000-0000-4000-8000-000000001001",
  r1: "00000000-0000-4000-8000-000000001002",
  r2: "00000000-0000-4000-8000-000000001003",
  pc2: "00000000-0000-4000-8000-000000001004",
  leftLink: "00000000-0000-4000-8000-000000001101",
  transitLink: "00000000-0000-4000-8000-000000001102",
  rightLink: "00000000-0000-4000-8000-000000001103",
} as const;
const [GI0, GI1] = PORT_NAMES.router;
const mask = "255.255.255.0";
const router = (id: string, name: string, x: number, config: RouterDevice["config"]): RouterDevice => ({
  id, name, kind: "router", position: { x, y: 180 }, config,
});
const pc1 = { id: ROUTER_LAB.pc1, name: "PC1", kind: "pc" as const, position: { x: 100, y: 180 },
  config: { ip: "192.168.1.10", mask, gateway: "192.168.1.1" } };
const pc2 = { id: ROUTER_LAB.pc2, name: "PC2", kind: "pc" as const, position: { x: 760, y: 180 },
  config: { ip: "192.168.2.10", mask, gateway: "192.168.2.1" } };

export const oneRouterLabDocument: TopologyDocument = {
  schemaVersion: 1, devices: [pc1, router(ROUTER_LAB.r1, "R1", 430, {
    interfaces: { [GI0]: { adminUp: true, ip: "192.168.1.1", mask }, [GI1]: { adminUp: true, ip: "192.168.2.1", mask } }, staticRoutes: [],
  }), pc2],
  links: [
    { id: ROUTER_LAB.leftLink, ends: [{ deviceId: pc1.id, port: "Ethernet0" }, { deviceId: ROUTER_LAB.r1, port: GI0 }] },
    { id: ROUTER_LAB.rightLink, ends: [{ deviceId: ROUTER_LAB.r1, port: GI1 }, { deviceId: pc2.id, port: "Ethernet0" }] },
  ],
};

export const staticRoutingLabDocument: TopologyDocument = {
  schemaVersion: 1, devices: [pc1, router(ROUTER_LAB.r1, "R1", 320, {
    interfaces: { [GI0]: { adminUp: true, ip: "192.168.1.1", mask }, [GI1]: { adminUp: true, ip: "10.0.12.1", mask: "255.255.255.252" } },
    staticRoutes: [{ network: "192.168.2.0", mask, nextHop: "10.0.12.2" }],
  }), router(ROUTER_LAB.r2, "R2", 540, {
    interfaces: { [GI0]: { adminUp: true, ip: "10.0.12.2", mask: "255.255.255.252" }, [GI1]: { adminUp: true, ip: "192.168.2.1", mask } },
    staticRoutes: [{ network: "192.168.1.0", mask, nextHop: "10.0.12.1" }],
  }), pc2],
  links: [oneRouterLabDocument.links[0]!,
    { id: ROUTER_LAB.transitLink, ends: [{ deviceId: ROUTER_LAB.r1, port: GI1 }, { deviceId: ROUTER_LAB.r2, port: GI0 }] },
    { id: ROUTER_LAB.rightLink, ends: [{ deviceId: ROUTER_LAB.r2, port: GI1 }, { deviceId: pc2.id, port: "Ethernet0" }] },
  ],
};

/** 양 끝 LAN에 Switch를 넣는다. Router 1대·2대 실습에서 같은 배선을 쓴다. */
export function withRouterLabSwitches(base: TopologyDocument): TopologyDocument {
  const sw1 = "00000000-0000-4000-8000-000000001005";
  const sw2 = "00000000-0000-4000-8000-000000001006";
  return {
    ...base,
    devices: [...base.devices, ...[sw1, sw2].map((id, index) => ({
      id, name: `SW${index + 1}`, kind: "switch" as const, position: { x: 210 + index * 440, y: 180 },
      config: { vlans: [{ id: 1, name: "default" }], ports: {} },
    }))],
    links: base.links.flatMap((link, index) => {
      const pcEnd = link.ends.find(end => end.deviceId === ROUTER_LAB.pc1 || end.deviceId === ROUTER_LAB.pc2);
      if (pcEnd === undefined) return [link];
      const routerEnd = link.ends.find(end => end !== pcEnd)!;
      const switchId = pcEnd.deviceId === ROUTER_LAB.pc1 ? sw1 : sw2;
      return [
        { ...link, ends: [pcEnd, { deviceId: switchId, port: "FastEthernet0/1" }] as const },
        { id: `00000000-0000-4000-8000-00000000120${index}`,
          ends: [{ deviceId: switchId, port: "FastEthernet0/2" }, routerEnd] as const },
      ];
    }),
  };
}
export const switchedStaticRoutingLabDocument = withRouterLabSwitches(staticRoutingLabDocument);
