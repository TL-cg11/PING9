import { PORT_NAMES } from "../document";
import type { IpsecProfileConfig, RouterDevice, TopologyDocument } from "../document";

export const VPN_LAB = {
  pcA: "00000000-0000-4000-8000-000000001501",
  r1: "00000000-0000-4000-8000-000000001502",
  isp: "00000000-0000-4000-8000-000000001503",
  r2: "00000000-0000-4000-8000-000000001504",
  pcB: "00000000-0000-4000-8000-000000001505",
} as const;
const [GI0, GI1] = PORT_NAMES.router;
const LAN = "255.255.255.0";
const WAN = "255.255.255.252";
const router = (id: string, name: string, x: number, config: RouterDevice["config"]): RouterDevice => ({
  id, name, kind: "router", position: { x, y: 240 }, config,
});

/** 중간 Router는 양쪽 사설 LAN 경로가 없다. GRE를 구성하기 전에는 PC 간 ping이 실패한다. */
export const vpnUnderlayDocument: TopologyDocument = {
  schemaVersion: 1,
  devices: [
    { id: VPN_LAB.pcA, name: "PC_A", kind: "pc", position: { x: 120, y: 240 }, config: { ip: "192.168.1.10", mask: LAN, gateway: "192.168.1.1" } },
    router(VPN_LAB.r1, "R1", 320, {
      interfaces: { [GI0]: { adminUp: true, ip: "192.168.1.1", mask: LAN }, [GI1]: { adminUp: true, ip: "10.0.13.1", mask: WAN } },
      staticRoutes: [{ network: "10.0.23.0", mask: WAN, nextHop: "10.0.13.2" }],
    }),
    router(VPN_LAB.isp, "ISP", 520, {
      interfaces: { [GI0]: { adminUp: true, ip: "10.0.13.2", mask: WAN }, [GI1]: { adminUp: true, ip: "10.0.23.1", mask: WAN } },
      staticRoutes: [],
    }),
    router(VPN_LAB.r2, "R2", 720, {
      interfaces: { [GI0]: { adminUp: true, ip: "10.0.23.2", mask: WAN }, [GI1]: { adminUp: true, ip: "192.168.2.1", mask: LAN } },
      staticRoutes: [{ network: "10.0.13.0", mask: WAN, nextHop: "10.0.23.1" }],
    }),
    { id: VPN_LAB.pcB, name: "PC_B", kind: "pc", position: { x: 920, y: 240 }, config: { ip: "192.168.2.10", mask: LAN, gateway: "192.168.2.1" } },
  ],
  links: [
    { id: "00000000-0000-4000-8000-000000001511", ends: [{ deviceId: VPN_LAB.pcA, port: "Ethernet0" }, { deviceId: VPN_LAB.r1, port: GI0 }] },
    { id: "00000000-0000-4000-8000-000000001512", ends: [{ deviceId: VPN_LAB.r1, port: GI1 }, { deviceId: VPN_LAB.isp, port: GI0 }] },
    { id: "00000000-0000-4000-8000-000000001513", ends: [{ deviceId: VPN_LAB.isp, port: GI1 }, { deviceId: VPN_LAB.r2, port: GI0 }] },
    { id: "00000000-0000-4000-8000-000000001514", ends: [{ deviceId: VPN_LAB.r2, port: GI1 }, { deviceId: VPN_LAB.pcB, port: "Ethernet0" }] },
  ],
};

export const greLabDocument: TopologyDocument = { ...vpnUnderlayDocument, devices: vpnUnderlayDocument.devices.map(device => {
  if (device.kind !== "router" || device.id === VPN_LAB.isp) return device;
  const left = device.id === VPN_LAB.r1;
  return { ...device, config: { ...device.config,
    tunnels: { Tunnel0: { mode: "gre", adminUp: true, ip: left ? "172.16.12.1" : "172.16.12.2", mask: WAN,
      source: left ? GI1 : GI0, destination: left ? "10.0.23.2" : "10.0.13.1" } },
    staticRoutes: [...device.config.staticRoutes, { network: left ? "192.168.2.0" : "192.168.1.0", mask: LAN, nextHop: left ? "172.16.12.2" : "172.16.12.1" }],
  } };
}) };

/** GRE가 없는 독립 ESP tunnel 교육 실습. 키 식별자는 공개 예시다. */
export const ipsecLabDocument: TopologyDocument = { ...vpnUnderlayDocument, devices: vpnUnderlayDocument.devices.map(device => {
  if (device.kind !== "router" || device.id === VPN_LAB.isp) return device;
  const left = device.id === VPN_LAB.r1;
  const profile: IpsecProfileConfig = { adminUp: true, interface: left ? GI1 : GI0,
    peer: left ? "10.0.23.2" : "10.0.13.1", local: { network: left ? "192.168.1.0" : "192.168.2.0", mask: LAN },
    remote: { network: left ? "192.168.2.0" : "192.168.1.0", mask: LAN }, keyId: "LAB_SHARED",
    inboundSpi: left ? 2001 : 1001, outboundSpi: left ? 1001 : 2001 };
  return { ...device, config: { ...device.config, ipsec: { VPN: profile }, staticRoutes: [...device.config.staticRoutes,
    { network: left ? "192.168.2.0" : "192.168.1.0", mask: LAN, nextHop: left ? "10.0.13.2" : "10.0.23.1" },
  ] } };
}) };
