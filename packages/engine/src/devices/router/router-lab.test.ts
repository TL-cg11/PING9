import type { ConsoleResult, Device, TopologyDocument } from "@ping9/shared";
import { PORT_NAMES, validateTrace } from "@ping9/shared";
import { ROUTER_LAB as LAB, staticRoutingLabDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";
import { createSimulator } from "../../simulator";

const text = (result: ConsoleResult) => result.lines.map(line => line.kind === "text" ? line.text : "").join("\n");
const open = () => { const sim = createSimulator(); expect(sim.load(staticRoutingLabDocument).ok).toBe(true); return sim; };
const success = (result: ConsoleResult) => result.lines.filter(line => line.kind === "text" && line.text.includes("bytes=32"));

describe("사용자 라우터 실습의 실제 실행", () => {
  test("빈 IP·꺼진 포트에서 PC 패널 명령과 Router CLI만으로 구성해 양방향 ping한다", async () => {
    const sim = createSimulator();
    const blank: TopologyDocument = { ...staticRoutingLabDocument, devices: staticRoutingLabDocument.devices.map((device): Device =>
      device.kind === "pc" ? { ...device, config: {} } : device.kind === "router"
        ? { ...device, config: { interfaces: {}, staticRoutes: [] } } : device) };
    expect(sim.load(blank).ok).toBe(true);
    for (const [deviceId, ip, gateway] of [[LAB.pc1, "192.168.1.10", "192.168.1.1"], [LAB.pc2, "192.168.2.10", "192.168.2.1"]]) {
      expect(sim.dispatch({ type: "pc/set-ip", deviceId: deviceId!, ip: ip!, mask: "255.255.255.0", gateway: gateway! }).ok).toBe(true);
    }
    const commands = [
      [LAB.r1, ["enable", "configure terminal", "interface gi0/0", "ip address 192.168.1.1 255.255.255.0", "no shutdown",
        "exit", "interface gi0/1", "ip address 10.0.12.1 255.255.255.252", "no shutdown", "exit",
        "ip route 192.168.2.0 255.255.255.0 10.0.12.2", "end"]],
      [LAB.r2, ["enable", "configure terminal", "interface gi0/0", "ip address 10.0.12.2 255.255.255.252", "no shutdown",
        "exit", "interface gi0/1", "ip address 192.168.2.1 255.255.255.0", "no shutdown", "exit",
        "ip route 192.168.1.0 255.255.255.0 10.0.12.1", "end"]],
    ] as const;
    for (const [id, lines] of commands) for (const line of lines) {
      expect((await sim.console(id).exec(line)).lines.filter(line => line.kind === "error")).toEqual([]);
    }
    for (const [id, target] of [[LAB.pc1, "192.168.2.10"], [LAB.pc2, "192.168.1.10"]] as const) {
      const result = await sim.console(id).exec(`ping ${target}`);
      expect(success(result)).toHaveLength(4); expect(text(result)).toContain("TTL=126");
    }
    expect(sim.getSnapshot().traces).toHaveLength(8);
    for (const summary of sim.getSnapshot().traces) {
      expect(summary.status).toBe("success"); expect(validateTrace(sim.getTrace(summary.id)).ok).toBe(true);
    }
    expect(text(await sim.console(LAB.r1).exec("show ip route 192.168.2.10"))).toContain("Outgoing interface: GigabitEthernet0/1");
  });

  test("기본 경로도 전송하며 더 구체적인 경로가 있으면 그 경로가 우선된다", async () => {
    const sim = open();
    sim.dispatch({ type: "route/remove", deviceId: LAB.r1, network: "192.168.2.0", mask: "255.255.255.0", nextHop: "10.0.12.2" });
    expect(sim.dispatch({ type: "route/add", deviceId: LAB.r1, network: "0.0.0.0", mask: "0.0.0.0", nextHop: "10.0.12.2" }).ok).toBe(true);
    expect(success(await sim.console(LAB.pc1).exec("ping -n 1 192.168.2.10"))).toHaveLength(1);
    const specific = { deviceId: LAB.r1, network: "192.168.2.10", mask: "255.255.255.255", nextHop: "192.168.1.10" };
    expect(sim.dispatch({ type: "route/add", ...specific }).ok).toBe(true);
    expect(success(await sim.console(LAB.pc1).exec("ping -n 1 192.168.2.10"))).toHaveLength(0);
    expect(sim.dispatch({ type: "route/remove", ...specific }).ok).toBe(true);
    expect(success(await sim.console(LAB.pc1).exec("ping -n 1 192.168.2.10"))).toHaveLength(1);
  });

  test("게이트웨이 누락·Router 삭제 때는 실패하고 원래 구성의 load로 복구한다", async () => {
    const sim = open();
    sim.dispatch({ type: "pc/set-ip", deviceId: LAB.pc1, ip: "192.168.1.10", mask: "255.255.255.0", gateway: null });
    expect(text(await sim.console(LAB.pc1).exec("ping -n 1 192.168.2.10"))).toContain("General failure");
    sim.load(staticRoutingLabDocument); await sim.console(LAB.pc1).exec("ping -n 1 192.168.2.10");
    expect(sim.dispatch({ type: "device/remove", deviceId: LAB.r2 }).ok).toBe(true);
    expect(success(await sim.console(LAB.pc1).exec("ping -n 1 192.168.2.10"))).toHaveLength(0);
    expect(sim.getSnapshot().views[LAB.r2]).toBeUndefined();
    sim.load(staticRoutingLabDocument);
    expect(success(await sim.console(LAB.pc1).exec("ping -n 1 192.168.2.10"))).toHaveLength(1);
    const view = sim.getSnapshot().views[LAB.r1]!;
    expect(view.kind === "router" && view.arpTable.some(entry => entry.port === PORT_NAMES.router[1] && entry.ip === "10.0.12.2")).toBe(true);
  });
});
