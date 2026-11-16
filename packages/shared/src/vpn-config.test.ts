import { describe, expect, test } from "vitest";
import type { RouterConfig, RouterDevice, TopologyDocument } from "./document";
import { PORT_NAMES } from "./document";
import { greLabDocument, ipsecLabDocument, VPN_LAB as LAB, vpnUnderlayDocument } from "./examples";
import { validateDocument } from "./validate";

const replace = (document: TopologyDocument, config: RouterConfig): TopologyDocument => ({ ...document,
  devices: document.devices.map(device => device.id === LAB.r1 && device.kind === "router" ? { ...device, config } : device) });
const router = (document: TopologyDocument) => document.devices.find(device => device.id === LAB.r1) as RouterDevice;

describe("VPN 저장 계약", () => {
  test("옛 Router 문서는 VPN 필드 없이 읽으며 GRE와 IPsec 예시는 각자 다른 설정이다", () => {
    expect(validateDocument(vpnUnderlayDocument)).toEqual({ ok: true, document: vpnUnderlayDocument });
    expect(router(greLabDocument).config.ipsec).toBeUndefined();
    expect(router(ipsecLabDocument).config.tunnels).toBeUndefined();
  });

  test.each([
    { Tunnel4: { mode: "gre", adminUp: true } },
    { Tunnel0: { mode: "gre", adminUp: true, source: "Tunnel1" } },
    { Tunnel0: { mode: "ipsec", adminUp: true } },
    { Tunnel0: { mode: "gre", adminUp: true, destination: "10.0.13.1" } },
    { Tunnel0: { mode: "gre", adminUp: true, ip: "172.16.1.1" } },
    { Tunnel0: { mode: "gre", adminUp: true, ip: "192.168.1.2", mask: "255.255.255.0" } },
  ])("잘못된 Tunnel 설정을 로드 단계에서 거부한다: %j", tunnels => {
    expect(validateDocument(replace(greLabDocument, { ...router(greLabDocument).config, tunnels } as unknown as RouterConfig)).ok).toBe(false);
  });

  test("논리 Tunnel을 물리 케이블 포트로 연결할 수 없다", () => {
    expect(validateDocument({ ...greLabDocument, links: [{ ...greLabDocument.links[0], ends: [
      { deviceId: LAB.r1, port: "Tunnel0" }, { deviceId: LAB.r2, port: PORT_NAMES.router[2] },
    ] }] })).toMatchObject({ ok: false, error: { code: "LINK_PORT_NOT_FOUND" } });
  });

  test.each([
    { interface: "Tunnel0" }, { peer: "10.0.13.1" }, { inboundSpi: 255 }, { outboundSpi: 0x100000000 },
    { keyId: "not a word" }, { lifetimeSeconds: 0 }, { lifetimeSeconds: 86401 },
    { local: { network: "192.168.1.10", mask: "255.255.255.0" } },
    { remote: { network: "192.168.1.0", mask: "255.255.255.0" } },
  ])("잘못된 IPsec 설정을 거부한다: %j", patch => {
    const config = router(ipsecLabDocument).config;
    expect(validateDocument(replace(ipsecLabDocument, { ...config, ipsec: { VPN: { ...config.ipsec!.VPN!, ...patch } } })).ok).toBe(false);
  });

  test("중복 보호 selector와 inbound SPI를 거부하며 네 개의 미완성 프로필까지만 저장한다", () => {
    const config = router(ipsecLabDocument).config;
    expect(validateDocument(replace(ipsecLabDocument, { ...config, ipsec: { ...config.ipsec, OTHER: config.ipsec!.VPN! } })).ok).toBe(false);
    const profiles = Object.fromEntries(Array.from({ length: 4 }, (_, index) => [`VPN${index}`, { adminUp: false }]));
    expect(validateDocument(replace(ipsecLabDocument, { ...config, ipsec: profiles })).ok).toBe(true);
    expect(validateDocument(replace(ipsecLabDocument, { ...config, ipsec: { ...profiles, FIFTH: { adminUp: false } } })).ok).toBe(false);
  });
});
