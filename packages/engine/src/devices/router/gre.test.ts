import { normalizeRouterConfig, PORT_NAMES, validateDocument, validateTrace } from "@ping9/shared";
import type { ConsoleResult, RouterDevice } from "@ping9/shared";
import { greLabDocument, VPN_LAB as LAB, vpnUnderlayDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";
import { createSimulator } from "../../simulator";

const [GI0, GI1] = PORT_NAMES.router;
const text = (result: ConsoleResult) => result.lines.flatMap(line => line.kind === "text" ? [line.text] : []).join("\n");
const open = (document = greLabDocument) => { const sim = createSimulator(); expect(sim.load(document).ok).toBe(true); return sim; };
const configOf = (sim: ReturnType<typeof open>, id: string) => (sim.getSnapshot().document.devices.find(device => device.id === id) as RouterDevice).config;
const latest = (sim: ReturnType<typeof open>) => sim.getTrace(sim.getSnapshot().traces[0]!.id)!;
const ping = async (sim: ReturnType<typeof open>, id: string = LAB.pcA, target = "192.168.2.10") => text(await sim.console(id).exec(`ping -n 1 ${target}`));
async function run(sim: ReturnType<typeof open>, id: string, lines: readonly string[]) {
  for (const line of lines) expect((await sim.console(id).exec(line)).lines.filter(item => item.kind === "error"), line).toEqual([]);
}

describe("GRE는 실제 underlay를 통과한다", () => {
  test("터널 없이는 실패하고 CLI로 양 끝을 설정하면 PC와 Router ping이 성공한다", async () => {
    const sim = open(vpnUnderlayDocument);
    expect(await ping(sim)).not.toContain("bytes=32");
    for (const [id, source, peer, ip, nextHop, network] of [
      [LAB.r1, GI1, "10.0.23.2", "172.16.12.1", "172.16.12.2", "192.168.2.0"],
      [LAB.r2, GI0, "10.0.13.1", "172.16.12.2", "172.16.12.1", "192.168.1.0"],
    ] as const) {
      await run(sim, id, ["enable", "configure terminal", "interface tunnel 0", "tunnel mode gre ip", `tunnel source ${source}`,
        `tunnel destination ${peer}`, `ip address ${ip} 255.255.255.252`, "no shutdown", "exit",
        `ip route ${network} 255.255.255.0 ${nextHop}`, "end"]);
      expect(text(await sim.console(id).exec("show interfaces tunnel0"))).toContain("Tunnel0 is up");
      expect(text(await sim.console(id).exec("show ip interface brief"))).toMatch(/Tunnel0\s+172\.16\.12\.[12]\s+up/);
      expect(text(await sim.console(id).exec(`show ip route ${network.slice(0, -1)}10`))).toContain("Outgoing interface: Tunnel0");
    }
    expect(await ping(sim)).toContain("TTL=126");
    expect(await ping(sim, LAB.pcB, "192.168.1.10")).toContain("TTL=126");
    expect(text(await sim.console(LAB.r1).exec("ping 192.168.2.10"))).toContain("Success rate: 4/4");
    expect(text(await sim.console(LAB.r2).exec("ping 172.16.12.1"))).toContain("Success rate: 4/4");
  });

  test("중간 Router는 바깥 주소만 전달하고 inner TTL/IP는 보존되며 Tunnel에 ARP하지 않는다", async () => {
    const sim = open(); await ping(sim);
    const trace = latest(sim);
    expect(trace.result.status).toBe("success"); expect(validateTrace(trace).ok).toBe(true);
    expect(configOf(sim, LAB.isp).staticRoutes).toEqual([]);
    const transit = trace.events.filter(event => event.deviceId === LAB.isp && event.reason.code === "IPV4_FORWARDED");
    expect(transit).toHaveLength(2);
    expect(transit[0]!.frame).toMatchObject({ ipv4: { sourceIp: "10.0.13.1", destinationIp: "10.0.23.2", ttl: 63, protocol: 47 },
      gre: { version: 0, protocolType: 2048, payload: { ipv4: { sourceIp: "192.168.1.10", destinationIp: "192.168.2.10", ttl: 127 } } } });
    expect(transit[0]!.frame.icmp).toBeUndefined();
    expect(trace.events.filter(event => event.reason.code === "GRE_ENCAPSULATED")).toHaveLength(2);
    expect(trace.events.filter(event => event.reason.code === "GRE_DECAPSULATED")).toHaveLength(2);
    expect(trace.events.some(event => event.frame.arp?.targetIp.startsWith("172.16.12."))).toBe(false);
    expect(transit[0]!.frame.ethernet).not.toEqual(trace.events.find(event => event.deviceId === LAB.r1 && event.frame.gre && event.linkId)!.frame.ethernet);
  });

  test.each(["shutdown", "no-route", "no-link", "wrong-peer"])("장애 %s는 실패하고 복원 후 성공한다", async kind => {
    const sim = open();
    if (kind === "shutdown") sim.dispatch({ type: "interface/set-admin", deviceId: LAB.r2, port: "Tunnel0", adminUp: false });
    if (kind === "no-route") sim.dispatch({ type: "route/remove", deviceId: LAB.r1, network: "10.0.23.0", mask: "255.255.255.252", nextHop: "10.0.13.2" });
    if (kind === "no-link") sim.dispatch({ type: "link/remove", linkId: greLabDocument.links[2]!.id });
    if (kind === "wrong-peer") sim.dispatch({ type: "tunnel/set", deviceId: LAB.r2, name: "Tunnel0", config: { ...configOf(sim, LAB.r2).tunnels!.Tunnel0!, destination: "10.0.13.2" } });
    expect(await ping(sim)).not.toContain("bytes=32");
    expect(latest(sim).events.length).toBeLessThan(150);
    expect(validateTrace(latest(sim)).ok).toBe(true);
    sim.load(greLabDocument); expect(await ping(sim)).toContain("bytes=32");
  });

  test("터널 상대 경로가 자기 Tunnel을 가리키면 중첩 송신 없이 차단한다", async () => {
    const sim = open();
    expect(sim.dispatch({ type: "route/add", deviceId: LAB.r1, network: "10.0.23.2", mask: "255.255.255.255", nextHop: "172.16.12.2" }).ok).toBe(true);
    expect(await ping(sim)).not.toContain("bytes=32");
    expect(latest(sim).events.some(event => event.dropReason === "GRE_REJECTED")).toBe(true);
    expect(latest(sim).events.some(event => event.reason.code === "GRE_ENCAPSULATED")).toBe(false);
  });

  test("running-config에서 재구성하고 JSON을 왕복해도 터널과 전달이 유지된다", async () => {
    const source = open(); const target = open(vpnUnderlayDocument);
    for (const id of [LAB.r1, LAB.r2]) {
      await run(source, id, ["enable"]);
      const lines = text(await source.console(id).exec("show running-config")).split("\n");
      await run(target, id, ["enable", "configure terminal", ...lines]);
      expect(configOf(target, id)).toEqual(normalizeRouterConfig(configOf(source, id)));
    }
    const document = JSON.parse(JSON.stringify(target.getSnapshot().document));
    expect(validateDocument(document).ok).toBe(true); target.load(document);
    expect(await ping(target)).toContain("bytes=32");
    await run(target, LAB.r1, ["enable", "configure terminal", "interface tunnel0", "no ip address", "end"]);
    expect(await ping(target)).not.toContain("bytes=32");
    await run(target, LAB.r1, ["configure terminal", "no interface tunnel0", "end"]);
    expect(configOf(target, LAB.r1).tunnels).toBeUndefined();
  });
});
