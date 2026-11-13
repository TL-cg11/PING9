import { normalizeRouterConfig, PORT_NAMES, validateTrace } from "@ping9/shared";
import type { ConsoleResult, EspPacket, IpsecProfileConfig, RouterDevice, TopologyDocument } from "@ping9/shared";
import { ipsecLabDocument, VPN_LAB as LAB, vpnUnderlayDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";
import { createSimulator } from "../../simulator";
import { createKernel } from "../../kernel";
import { deviceRun } from "../link";
import { RouterModel } from "./router-model";
import { PcModel } from "../pc/pc-model";
import { IpsecModule } from "./ipsec";

const [GI0, GI1] = PORT_NAMES.router;
const text = (result: ConsoleResult) => result.lines.flatMap(line => line.kind === "text" ? [line.text] : []).join("\n");
const open = (document = ipsecLabDocument) => { const sim = createSimulator(); expect(sim.load(document).ok).toBe(true); return sim; };
const routerIn = (document: TopologyDocument, id: string) => document.devices.find(device => device.id === id) as RouterDevice;
const profileOf = (sim: ReturnType<typeof open>, id = LAB.r2) => routerIn(sim.getSnapshot().document, id).config.ipsec!.VPN!;
const latest = (sim: ReturnType<typeof open>) => sim.getTrace(sim.getSnapshot().traces[0]!.id)!;
const ping = async (sim: ReturnType<typeof open>, id: string = LAB.pcA, target = "192.168.2.10") => text(await sim.console(id).exec(`ping -n 1 ${target}`));
async function run(sim: ReturnType<typeof open>, id: string, lines: readonly string[]) {
  for (const line of lines) expect((await sim.console(id).exec(line)).lines.filter(item => item.kind === "error"), line).toEqual([]);
}

describe("IPsec 단독 ESP tunnel 교육 시뮬레이션", () => {
  test("CLI 구성으로 GRE 없이 PC 양방향·Router 출발 ping, 양방향 SPI와 카운터를 확인한다", async () => {
    const sim = open(vpnUnderlayDocument);
    for (const [id, iface, peer, local, remote, inbound, outbound, nextHop] of [
      [LAB.r1, GI1, "10.0.23.2", "192.168.1.0", "192.168.2.0", 2001, 1001, "10.0.13.2"],
      [LAB.r2, GI0, "10.0.13.1", "192.168.2.0", "192.168.1.0", 1001, 2001, "10.0.23.1"],
    ] as const) {
      await run(sim, id, ["enable", "configure terminal", `ip route ${remote} 255.255.255.0 ${nextHop}`,
        "crypto ipsec profile VPN", `source-interface ${iface}`, `peer ${peer}`, `local-subnet ${local} 255.255.255.0`,
        `remote-subnet ${remote} 255.255.255.0`, "key-id LAB_SHARED", `spi inbound ${inbound}`, `spi outbound ${outbound}`, "no shutdown", "end"]);
    }
    expect(await ping(sim)).toContain("TTL=126");
    expect(await ping(sim, LAB.pcB, "192.168.1.10")).toContain("TTL=126");
    for (const [id, target] of [[LAB.r1, "192.168.2.10"], [LAB.r2, "192.168.1.10"]] as const) {
      expect(text(await sim.console(id).exec(`ping ${target}`))).toContain("Success rate: 4/4");
      const output = text(await sim.console(id).exec("show crypto ipsec sa"));
      expect(output).toContain("NO encryption"); expect(output).toContain("VPN: active");
      const device = routerIn(sim.getSnapshot().document, id);
      expect(device.config.tunnels).toBeUndefined();
      const view = sim.getSnapshot().views[id]!;
      expect(view.kind === "router" && view.ipsec?.[0]?.encapsulated).toBeGreaterThanOrEqual(6);
    }
    const trace = latest(sim); expect(validateTrace(trace).ok).toBe(true);
    const transit = trace.events.filter(event => event.deviceId === LAB.isp && event.reason.code === "IPV4_FORWARDED");
    expect(transit).toHaveLength(2);
    expect(transit.every(event => event.frame.esp !== undefined && event.frame.gre === undefined && event.frame.icmp === undefined && event.frame.ipv4?.protocol === 50)).toBe(true);
    expect(routerIn(sim.getSnapshot().document, LAB.isp).config.staticRoutes).toEqual([]);
    expect(trace.events.some(event => event.reason.code === "IPSEC_PROTECTED")).toBe(true);
    expect(trace.events.some(event => event.reason.code === "IPSEC_UNPROTECTED")).toBe(true);
  });

  test.each(["key", "spi", "peer", "selector", "disabled", "incomplete"])("수신 %s 불일치 때 보호 패킷을 폐기하며 평문으로 재전송하지 않는다", async problem => {
    const sim = open(); const original = profileOf(sim);
    const patch: Partial<IpsecProfileConfig> = problem === "key" ? { keyId: "OTHER" } : problem === "spi" ? { inboundSpi: 9001 } :
      problem === "peer" ? { peer: "10.0.13.2" } : problem === "selector" ? { remote: { network: "192.168.3.0", mask: "255.255.255.0" } } :
      problem === "disabled" ? { adminUp: false } : { keyId: undefined };
    expect(sim.dispatch({ type: "ipsec/set", deviceId: LAB.r2, name: "VPN", config: { ...original, ...patch } }).ok).toBe(true);
    expect(await ping(sim)).not.toContain("bytes=32");
    const trace = latest(sim);
    expect(trace.events.some(event => event.dropReason === "IPSEC_REJECTED")).toBe(true);
    expect(trace.events.some(event => event.deviceId === LAB.isp && event.frame.ipv4?.sourceIp === "192.168.1.10")).toBe(false);
    expect(validateTrace(trace).ok).toBe(true);
    sim.load(ipsecLabDocument); expect(await ping(sim)).toContain("bytes=32");
  });

  test("꺼진 송신 정책도 보호 대상으로 남아 평문 통과를 차단하고 일반 underlay ping은 허용한다", async () => {
    const sim = open(); const profile = routerIn(sim.getSnapshot().document, LAB.r1).config.ipsec!.VPN!;
    sim.dispatch({ type: "ipsec/set", deviceId: LAB.r1, name: "VPN", config: { ...profile, adminUp: false } });
    expect(await ping(sim)).not.toContain("bytes=32");
    expect(latest(sim).events.some(event => event.reason.code === "IPSEC_PROTECTED")).toBe(false);
    expect(latest(sim).events.some(event => event.dropReason === "IPSEC_REJECTED")).toBe(true);
    await run(sim, LAB.r1, ["enable"]);
    expect(text(await sim.console(LAB.r1).exec("ping 10.0.23.2"))).toContain("Success rate: 4/4");
  });

  test("배치 이동·경로 변경·물리 포트 장애 복구에서도 SA sequence를 되돌리지 않는다", async () => {
    const sim = open(); expect(await ping(sim)).toContain("bytes=32");
    sim.dispatch({ type: "device/move", deviceId: LAB.r1, position: { x: 330, y: 250 } });
    sim.dispatch({ type: "route/add", deviceId: LAB.r1, network: "203.0.113.0", mask: "255.255.255.0", nextHop: "10.0.13.2" });
    sim.dispatch({ type: "interface/set-admin", deviceId: LAB.r1, port: GI1, adminUp: false });
    expect(await ping(sim)).not.toContain("bytes=32");
    sim.dispatch({ type: "interface/set-admin", deviceId: LAB.r1, port: GI1, adminUp: true });
    expect(await ping(sim)).toContain("bytes=32");
    const view = sim.getSnapshot().views[LAB.r1]!;
    expect(view.kind === "router" && view.ipsec?.[0]?.txSequence).toBe(2);
  });

  test("만료한 SA는 가상 시계에 따라 조회되고 다음 ping을 차단한다", async () => {
    const sim = open();
    for (const id of [LAB.r1, LAB.r2]) {
      const profile = routerIn(sim.getSnapshot().document, id).config.ipsec!.VPN!;
      sim.dispatch({ type: "ipsec/set", deviceId: id, name: "VPN", config: { ...profile, lifetimeSeconds: 1 } });
    }
    expect(await ping(sim)).toContain("bytes=32");
    await ping(sim, LAB.pcA, "192.168.1.99"); // ARP 무응답으로 가상 시간 2초 경과
    expect(await ping(sim)).not.toContain("bytes=32");
    expect(latest(sim).events.some(event => event.reason.code === "IPSEC_REJECTED" && event.reason.params.detail.includes("expired"))).toBe(true);
    await run(sim, LAB.r1, ["enable"]);
    expect(text(await sim.console(LAB.r1).exec("show crypto ipsec sa"))).toContain("VPN: expired");
  });

  test("안쪽 TTL 만료의 ICMP 오류도 역방향 IPsec 정책으로 전달된다", async () => {
    const sim = open();
    await sim.console(LAB.pcA).exec("tracert -h 3 192.168.2.10");
    const traces = sim.getSnapshot().traces.map(summary => sim.getTrace(summary.id)!);
    expect(traces.some(trace => trace.events.some(event => event.deviceId === LAB.r2 && event.dropReason === "TTL_EXPIRED"))).toBe(true);
    expect(traces.some(trace => trace.events.some(event => event.deviceId === LAB.pcA && event.reason.code === "ICMP_ERROR_RECEIVED" && event.frame.ipv4?.sourceIp === "192.168.2.1"))).toBe(true);
    expect(traces.every(trace => validateTrace(trace).ok)).toBe(true);
  });

  test("실제 수신 Router는 중복 ESP를 두 번 복원하지 않고 보호 대상 평문도 차단한다", () => {
    const document = ipsecLabDocument; const kernel = createKernel();
    const models = new Map(document.devices.map(device => [device.id, device.kind === "router"
      ? new RouterModel(device.id, () => document, () => kernel.now()) : new PcModel(device.id, () => document)]));
    const source = models.get(LAB.pcA) as PcModel;
    const run = deviceRun({ docVersion: 1, models, start: ctx => source.ipv4.sendEcho(ctx, "Ethernet0", "192.168.2.10", 1),
      outcome: () => source.ipv4.repliesReceived().includes(1) ? "success" : "failed" });
    const trace = kernel.run({ ...run, onFrame: (ctx, target, frame) => {
      run.onFrame(ctx, target, frame);
      if (target.deviceId === LAB.r2 && frame.snapshot.esp !== undefined) {
        run.onFrame(ctx, target, frame); // 같은 sequence의 중복
        const plain = ctx.updateFrame(frame, { ethernet: frame.snapshot.ethernet,
          ipv4: frame.snapshot.esp.payload.ipv4, icmp: frame.snapshot.esp.payload.icmp });
        run.onFrame(ctx, target, plain);
      }
    } });
    expect(trace.result.status).toBe("success"); expect(validateTrace(trace).ok).toBe(true);
    expect(trace.events.filter(event => event.deviceId === LAB.r2 && event.reason.code === "IPSEC_UNPROTECTED")).toHaveLength(1);
    const rejects = trace.events.filter(event => event.reason.code === "IPSEC_REJECTED");
    expect(rejects).toHaveLength(2);
    expect(JSON.stringify(rejects)).toContain("anti-replay"); expect(JSON.stringify(rejects)).toContain("평문");
  });

  test("CLI running-config 왕복과 문서 load는 설정을 보존하고 동적 SA를 초기화한다", async () => {
    const source = open(); await ping(source);
    const target = open(vpnUnderlayDocument);
    for (const id of [LAB.r1, LAB.r2]) {
      await run(source, id, ["enable"]);
      await run(target, id, ["enable", "configure terminal", ...text(await source.console(id).exec("show running-config")).split("\n")]);
      expect(routerIn(target.getSnapshot().document, id).config).toEqual(normalizeRouterConfig(routerIn(source.getSnapshot().document, id).config));
    }
    expect(await ping(target)).toContain("bytes=32");
    const saved = JSON.parse(JSON.stringify(target.getSnapshot().document));
    expect(JSON.stringify(saved)).not.toContain("txSequence"); expect(JSON.stringify(saved)).not.toContain("received");
    target.load(saved); await run(target, LAB.r1, ["enable"]);
    expect(text(await target.console(LAB.r1).exec("show crypto ipsec sa"))).toContain("tx sequence 0, rx highest 0");
    expect(await ping(target)).toContain("bytes=32");
  });
});

describe("SA의 sequence 창과 가상 lifetime", () => {
  const left = () => new IpsecModule(() => routerIn(ipsecLabDocument, LAB.r1));
  const right = () => new IpsecModule(() => routerIn(ipsecLabDocument, LAB.r2));
  const inner = { sourceIp: "192.168.1.10", destinationIp: "192.168.2.10", ttl: 127 };
  const outer = { sourceIp: "10.0.13.1", destinationIp: "10.0.23.2", ttl: 63, protocol: 50 as const };
  const packet = (sender: IpsecModule, time = 0): EspPacket => {
    const result = sender.protect("VPN", inner, { type: "echo-request", sequence: 1 }, time);
    if (!result.ok) throw new Error(result.detail);
    return result.value;
  };

  test("64개 창 안의 순서 뒤바뀜은 허용하고 중복·창 밖·잘못된 sequence를 거부한다", () => {
    const sender = left(); const receiver = right();
    const packets = Array.from({ length: 70 }, () => packet(sender));
    expect(receiver.unprotect("VPN", outer, packets[69]!, GI0, 0).ok).toBe(true);
    expect(receiver.unprotect("VPN", outer, packets[6]!, GI0, 0).ok).toBe(true); // seq 7: 창의 마지막
    expect(receiver.unprotect("VPN", outer, packets[5]!, GI0, 0).ok).toBe(false); // seq 6: 창 밖
    expect(receiver.unprotect("VPN", outer, packets[6]!, GI0, 0).ok).toBe(false);
    for (const sequence of [0, -1, 1.5, 0x100000000]) expect(receiver.unprotect("VPN", outer, { ...packets[69]!, sequence }, GI0, 0).ok).toBe(false);
  });

  test("잘못된 키/selector 패킷은 수신 창을 전진시키지 않는다", () => {
    const sender = left(); const receiver = right(); const good = packet(sender);
    expect(receiver.unprotect("VPN", outer, { ...good, sequence: 500, simulation: { ...good.simulation, keyId: "WRONG" } }, GI0, 0).ok).toBe(false);
    expect(receiver.unprotect("VPN", outer, good, GI0, 0).ok).toBe(true);
  });

  test("실제 시간이 아닌 가상 시간으로 SA를 만료시키며 자동 평문 fallback이나 sequence 재시작이 없다", () => {
    const sender = left(); const receiver = right(); const first = packet(sender);
    expect(receiver.unprotect("VPN", outer, first, GI0, 0).ok).toBe(true);
    expect(sender.protect("VPN", inner, { type: "echo-request", sequence: 1 }, 3_600_000_000)).toMatchObject({ ok: false, detail: expect.stringContaining("expired") });
    expect(receiver.unprotect("VPN", outer, { ...first, sequence: 2 }, GI0, 3_600_000_000)).toMatchObject({ ok: false, detail: expect.stringContaining("expired") });
    expect(sender.protect("VPN", inner, { type: "echo-request", sequence: 1 }, 3_600_000_001).ok).toBe(false);
  });
});
