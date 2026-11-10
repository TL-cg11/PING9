import type { ConsoleResult } from "@ping9/shared";
import { pingRoundKind, validateTrace } from "@ping9/shared";
import {
  ROUTER_LAB as LAB, oneRouterLabDocument, staticRoutingLabDocument, withRouterLabSwitches,
} from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";
import { createSimulator } from "../../simulator";

const lines = (result: ConsoleResult) => result.lines.filter(line => line.kind === "text").map(line => line.text).join("\n");
const sw1 = "00000000-0000-4000-8000-000000001005";
const sw2 = "00000000-0000-4000-8000-000000001006";

describe("PC—Switch—Router—Switch—PC 통합", () => {
  for (const [name, base, ttl] of [
    ["직접 연결", oneRouterLabDocument, 127],
    ["정적 경로", staticRoutingLabDocument, 126],
  ] as const) {
    test(name + ": 양방향 ping, TTL, ARP와 MAC 학습", async () => {
      const sim = createSimulator();
      expect(sim.load(withRouterLabSwitches(base)).ok).toBe(true);
      for (const [id, target] of [[LAB.pc1, "192.168.2.10"], [LAB.pc2, "192.168.1.10"]] as const) {
        const result = lines(await sim.console(id).exec("ping " + target));
        expect(result.match(/bytes=32/g)).toHaveLength(4);
        expect(result.match(new RegExp("TTL=" + ttl, "g"))).toHaveLength(4);
      }
      for (const id of [sw1, sw2]) {
        const view = sim.getSnapshot().views[id];
        expect(view?.kind === "switch" && view.macTable.length).toBe(2);
        await sim.console(id).exec("enable");
        expect(lines(await sim.console(id).exec("show mac address-table"))).toContain("Fa0/2");
      }
      await sim.console(LAB.r1).exec("enable");
      expect(lines(await sim.console(LAB.r1).exec("show arp"))).toContain("192.168.1.10");
      expect(lines(await sim.console(LAB.r1).exec("ping 192.168.2.10"))).toContain("Success rate: 4/4");
      expect(lines(await sim.console(LAB.pc1).exec("arp -a"))).toContain("192.168.1.1");
      for (const summary of sim.getSnapshot().traces) {
        const trace = sim.getTrace(summary.id)!;
        expect(summary.status).toBe("success");
        expect(validateTrace(trace).ok).toBe(true);
        expect(trace.events.some(event => event.deviceId === sw2 && event.reason.code === "FRAME_FORWARDED")).toBe(true);
      }
    });
  }

  test("Switch 포트 종료·VLAN 차단 시 실패하고 설정 복구 시 다시 성공한다", async () => {
    const sim = createSimulator();
    expect(sim.load(withRouterLabSwitches(oneRouterLabDocument)).ok).toBe(true);
    const ping = async () => lines(await sim.console(LAB.pc1).exec("ping -n 1 192.168.2.10"));
    expect(await ping()).toContain("bytes=32");
    const port = sim.console(sw2);
    for (const cmd of ["enable", "configure terminal", "interface fa0/2", "shutdown"]) await port.exec(cmd);
    expect(await ping()).not.toContain("bytes=32");
    await port.exec("no shutdown");
    expect(await ping()).toContain("bytes=32");
    for (const cmd of ["exit", "vlan 10", "exit", "interface fa0/2", "switchport access vlan 10"]) {
      expect((await port.exec(cmd)).lines.some(line => line.kind === "error")).toBe(false);
    }
    expect(await ping()).not.toContain("bytes=32");
    await port.exec("switchport access vlan 1");
    expect(await ping()).toContain("bytes=32");
  });

  test("Switch 경유 ICMP 오류도 회차와 통계에 반영되고 경로 복구 시 성공한다", async () => {
    const sim = createSimulator();
    expect(sim.load(withRouterLabSwitches(staticRoutingLabDocument)).ok).toBe(true);
    const route = { deviceId: LAB.r1, network: "192.168.2.0", mask: "255.255.255.0", nextHop: "10.0.12.2" };
    expect(sim.dispatch({ type: "route/remove", ...route }).ok).toBe(true);
    expect(lines(await sim.console(LAB.pc1).exec("ping -n 1 192.168.2.10"))).toContain("Destination net unreachable.");
    const failed = sim.getSnapshot().traces[0]!;
    expect(failed.status).toBe("failed");
    expect(pingRoundKind(sim.getTrace(failed.id)!, LAB.pc1, 1)).toBe("icmp-error");
    expect(sim.dispatch({ type: "route/add", ...route }).ok).toBe(true);
    expect(lines(await sim.console(LAB.pc1).exec("ping -n 1 192.168.2.10"))).toContain("bytes=32");
  });
});
