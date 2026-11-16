import { normalizeRouterConfig, PORT_NAMES, validateDocument, validateTrace, vpnModeOf } from "@ping9/shared";
import type { Command, ConsoleResult, RouterDevice, TopologyDocument, VpnMode } from "@ping9/shared";
import { greLabDocument, ipsecLabDocument, VPN_LAB as LAB } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";
import { createSimulator } from "../../simulator";

const text = (result: ConsoleResult) => result.lines.flatMap(line => line.kind === "text" ? [line.text] : []).join("\n");
const open = (document: TopologyDocument) => { const sim = createSimulator(); expect(sim.load(document).ok).toBe(true); return sim; };
const router = (sim: ReturnType<typeof open>, id: string = LAB.r1) => sim.getSnapshot().document.devices.find(device => device.id === id) as RouterDevice;
const latest = (sim: ReturnType<typeof open>) => sim.getTrace(sim.getSnapshot().traces[0]!.id)!;
const ping = async (sim: ReturnType<typeof open>) => text(await sim.console(LAB.pcA).exec("ping -n 1 192.168.2.10"));
const set = (sim: ReturnType<typeof open>, mode: VpnMode | null, ids: readonly string[] = [LAB.r1, LAB.r2]) => {
  for (const deviceId of ids) expect(sim.dispatch({ type: "router/set-vpn-mode", deviceId, mode }).ok).toBe(true);
};

describe("라우터 VPN 사용 여부와 모드", () => {
  test.each([["gre", greLabDocument], ["ipsec", ipsecLabDocument]] as const)("%s는 설정을 보존하며 끄기·켜기·JSON 복원이 가능하다", async (mode, document) => {
    const sim = open(document);
    expect(await ping(sim)).toContain("bytes=32");
    const before = normalizeRouterConfig(router(sim).config);
    set(sim, "off");
    expect(vpnModeOf(router(sim).config)).toBe("off");
    expect(router(sim).config.tunnels).toEqual(before.tunnels);
    expect(router(sim).config.ipsec).toEqual(before.ipsec);
    expect(router(sim).config.staticRoutes).toEqual(before.staticRoutes);
    expect(await ping(sim)).not.toContain("bytes=32"); // ISP에는 일반 LAN 경로가 없음
    expect(latest(sim).events.some(event => event.frame.gre !== undefined || event.frame.esp !== undefined)).toBe(false);
    expect(validateTrace(latest(sim)).ok).toBe(true);
    const saved = JSON.parse(JSON.stringify(sim.getSnapshot().document));
    expect(sim.load(saved).ok).toBe(true);
    expect(vpnModeOf(router(sim).config)).toBe("off");
    set(sim, mode);
    expect(await ping(sim)).toContain("bytes=32");
    expect(validateTrace(latest(sim)).ok).toBe(true);
  });

  test("일반 통신은 양방향 일반 경로가 있으면 GRE/ESP 없이 성공한다", async () => {
    const sim = open(ipsecLabDocument); set(sim, "off");
    for (const [network, nextHop] of [["192.168.1.0", "10.0.13.1"], ["192.168.2.0", "10.0.23.2"]]) {
      expect(sim.dispatch({ type: "route/add", deviceId: LAB.isp, network: network!, mask: "255.255.255.0", nextHop: nextHop! }).ok).toBe(true);
    }
    expect(await ping(sim)).toContain("TTL=125");
    expect(latest(sim).events.some(event => event.frame.gre || event.frame.esp)).toBe(false);
    expect(latest(sim).events.some(event => event.deviceId === LAB.isp && event.frame.ipv4?.destinationIp === "192.168.2.10")).toBe(true);
    // IPsec 선택 시 일반 라우팅이 가능해도 잘못된 키 때문에 평문으로 우회하지 않는다.
    set(sim, "ipsec");
    const profile = router(sim, LAB.r2).config.ipsec!.VPN!;
    sim.dispatch({ type: "ipsec/set", deviceId: LAB.r2, name: "VPN", config: { ...profile, keyId: "OTHER" } });
    expect(await ping(sim)).not.toContain("bytes=32");
    expect(latest(sim).events.some(event => event.dropReason === "IPSEC_REJECTED")).toBe(true);
  });

  test.each([["gre", greLabDocument], ["ipsec", ipsecLabDocument]] as const)("%s를 한쪽에서 끄면 수신/복원하지 않으며 선택은 해당 Router에만 적용된다", async (_mode, document) => {
    const sim = open(document); set(sim, "off", [LAB.r2]);
    expect(router(sim, LAB.r1).config.vpnMode).toBeUndefined();
    expect(await ping(sim)).not.toContain("bytes=32");
    expect(latest(sim).events.some(event => event.deviceId === LAB.r2 && ["GRE_DECAPSULATED", "IPSEC_UNPROTECTED"].includes(event.reason.code))).toBe(false);
  });

  test("다른 모드를 선택하면 원래 모드가 계속 적용되지 않으며 off에서는 Tunnel 주소에 응답하지 않는다", async () => {
    const gre = open(greLabDocument); set(gre, "ipsec");
    expect(await ping(gre)).not.toContain("bytes=32");
    expect(latest(gre).events.some(event => event.reason.code === "GRE_ENCAPSULATED")).toBe(false);
    const ipsec = open(ipsecLabDocument); set(ipsec, "gre");
    expect(await ping(ipsec)).not.toContain("bytes=32");
    expect(latest(ipsec).events.some(event => event.reason.code === "IPSEC_PROTECTED")).toBe(false);
    set(gre, "off");
    expect(text(await gre.console(LAB.pcA).exec("ping -n 1 172.16.12.1"))).not.toContain("bytes=32");
  });

  test("모드 전환은 SA sequence를 유지하고 만료·키 실패를 자동 초기화하지 않는다", async () => {
    const sim = open(ipsecLabDocument); expect(await ping(sim)).toContain("bytes=32");
    set(sim, "off"); set(sim, "ipsec");
    expect(await ping(sim)).toContain("bytes=32");
    const view = sim.getSnapshot().views[LAB.r1]!;
    expect(view.kind === "router" && view.ipsec?.[0]?.txSequence).toBe(2);
  });

  test("CLI 모드 선택·조회·running-config 복원·명시적 선택 해제를 지원한다", async () => {
    const source = open(greLabDocument);
    for (const line of ["enable", "configure terminal", "vpn mode off", "end"]) expect((await source.console(LAB.r1).exec(line)).lines.filter(line => line.kind === "error")).toEqual([]);
    expect(text(await source.console(LAB.r1).exec("show vpn"))).toContain("VPN mode: off");
    const lines = text(await source.console(LAB.r1).exec("show running-config")).split("\n");
    const target = open(greLabDocument);
    for (const line of ["enable", "configure terminal", ...lines]) expect((await target.console(LAB.r1).exec(line)).lines.filter(line => line.kind === "error")).toEqual([]);
    expect(router(target).config).toEqual(router(source).config);
    for (const line of ["configure terminal", "no vpn mode", "end"]) await target.console(LAB.r1).exec(line);
    expect(router(target).config.vpnMode).toBeUndefined();
    expect(vpnModeOf(router(target).config)).toBe("gre");
  });

  test("입력 경계에서 잘못된 모드/장비를 거부하며 설정 없는 Router도 명시적 선택을 저장한다", () => {
    const sim = open(ipsecLabDocument); const before = sim.getSnapshot();
    expect(sim.dispatch({ type: "router/set-vpn-mode", deviceId: LAB.r1, mode: "ssl" } as unknown as Command).ok).toBe(false);
    expect(sim.getSnapshot()).toBe(before);
    expect(sim.dispatch({ type: "router/set-vpn-mode", deviceId: LAB.pcA, mode: "off" })).toMatchObject({ ok: false, error: { code: "DEVICE_KIND_MISMATCH" } });
    const bad = { ...router(sim).config, vpnMode: "ssl" };
    expect(validateDocument({ ...ipsecLabDocument, devices: [{ ...router(sim), config: bad }] }).ok).toBe(false);
    set(sim, "off");
    expect(sim.dispatch({ type: "interface/set-admin", deviceId: LAB.r1, port: PORT_NAMES.router[0], adminUp: true }).ok).toBe(true);
    expect(router(sim).config.vpnMode).toBe("off");
    set(sim, null); expect(router(sim).config.vpnMode).toBeUndefined();
  });
});
