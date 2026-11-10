import { PORT_NAMES, validateTrace } from "@ping9/shared";
import type { ConsoleResult, Trace } from "@ping9/shared";
import { oneRouterLabDocument, ROUTER_LAB as LAB, staticRoutingLabDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../../simulator";
import { portMac } from "../../topology";

const text = (result: ConsoleResult) => result.lines.map(line => line.kind === "text" ? line.text : "").join("\n");
const open = (two = false) => {
  const sim = createSimulator(); expect(sim.load(two ? staticRoutingLabDocument : oneRouterLabDocument).ok).toBe(true); return sim;
};
async function ping(sim: ReturnType<typeof open>, source: string = LAB.pc1, target = "192.168.2.10") {
  const result = await sim.console(source).exec(`ping -n 1 ${target}`);
  const line = result.lines.find(line => line.kind === "trace");
  expect(line).toBeDefined();
  if (line?.kind !== "trace") throw new Error(text(result));
  const trace = sim.getTrace(line.traceId)!;
  expect(validateTrace(trace).ok).toBe(true);
  return { result, trace };
}
const forwarded = (trace: Trace) => trace.events.filter(event => event.reason.code === "IPV4_FORWARDED");

describe("Router 실제 패킷 전달", () => {
  test("한 Router를 사이에 둔 두 PC가 양방향 ping하고 TTL과 MAC이 바뀌며 frameId가 유지된다", async () => {
    const sim = open(); const before = sim.getSnapshot();
    const { result, trace } = await ping(sim);
    expect(trace.result.status).toBe("success"); expect(text(result)).toContain("TTL=127");
    expect(forwarded(trace)).toHaveLength(2);
    for (const event of forwarded(trace)) {
      const received = trace.events.find(candidate => candidate.frameId === event.frameId && candidate.deviceId === LAB.r1 && candidate.reason.code === "IPV4_RECEIVED");
      expect(received).toBeDefined();
      expect(event.frame.ipv4?.ttl).toBe(received!.frame.ipv4!.ttl - 1);
      expect(event.frame.ipv4?.sourceIp).toBe(received!.frame.ipv4!.sourceIp);
      expect(event.frame.ipv4?.destinationIp).toBe(received!.frame.ipv4!.destinationIp);
      expect(event.frame.ethernet.sourceMac).not.toBe(received!.frame.ethernet.sourceMac);
      expect(event.frame.ethernet.destinationMac).not.toBe(received!.frame.ethernet.destinationMac);
      expect(event.frame.ethernet.sourceMac).toBe(portMac(oneRouterLabDocument.devices[1]!, event.outPort!));
    }
    expect(sim.getSnapshot().document).toBe(before.document);
    const view = sim.getSnapshot().views[LAB.r1]!;
    expect(view.kind === "router" && view.arpTable.map(entry => entry.ip)).toEqual(["192.168.1.10", "192.168.2.10"]);
    expect((await ping(sim, LAB.pc2, "192.168.1.10")).trace.result.status).toBe("success");
    const cached = await ping(sim);
    expect(cached.trace.events.filter(event => event.reason.code === "ARP_REQUEST_SENT")).toHaveLength(0);
  });

  test("PC에서 연결된 게이트웨이와 반대편 Router IP에 ping하면 Router가 응답한다", async () => {
    const sim = open();
    for (const target of ["192.168.1.1", "192.168.2.1"]) {
      const { result, trace } = await ping(sim, LAB.pc1, target);
      expect(trace.result.status).toBe("success"); expect(text(result)).toContain("TTL=64");
      expect(trace.events.some(event => event.deviceId === LAB.r1 && event.reason.code === "ICMP_ECHO_REPLY_SENT")).toBe(true);
    }
  });

  test("Router 두 대의 정적 경로로 양방향 ping하고 응답 TTL은 126이다", async () => {
    const sim = open(true);
    const { result, trace } = await ping(sim);
    expect(trace.result.status).toBe("success"); expect(text(result)).toContain("TTL=126");
    expect(forwarded(trace)).toHaveLength(4);
    expect((await ping(sim, LAB.pc2, "192.168.1.10")).trace.result.status).toBe("success");
  });

  test("상대 PC가 Linux면 응답 TTL 64에서 두 Router를 거쳐 62가 된다", async () => {
    const sim = open(true); expect(sim.dispatch({ type: "pc/set-os", deviceId: LAB.pc2, os: "linux" }).ok).toBe(true);
    expect(text((await ping(sim)).result)).toContain("TTL=62");
    const linux = await sim.console(LAB.pc2).exec("ping -c 1 192.168.1.10");
    expect(text(linux)).toContain("ttl=126");
  });

  test("shutdown·케이블 제거 때 실패하고 복구하면 다시 성공한다", async () => {
    const sim = open(true); await ping(sim);
    const port = PORT_NAMES.router[1];
    sim.dispatch({ type: "interface/set-admin", deviceId: LAB.r1, port, adminUp: false });
    expect((await ping(sim)).trace.result.status).toBe("failed");
    sim.dispatch({ type: "interface/set-admin", deviceId: LAB.r1, port, adminUp: true });
    expect((await ping(sim)).trace.result.status).toBe("success");
    sim.dispatch({ type: "link/remove", linkId: LAB.transitLink });
    expect((await ping(sim)).trace.result.status).toBe("failed");
    sim.dispatch({ type: "link/add", ...staticRoutingLabDocument.links[1]! });
    expect((await ping(sim)).trace.result.status).toBe("success");
  });

  test("없는 다음 홉의 ARP는 재시도 뒤 종료하고 load는 모든 동적 상태를 초기화한다", async () => {
    const sim = open(true);
    const broken = { ...staticRoutingLabDocument, devices: staticRoutingLabDocument.devices.map(device => device.id === LAB.r1 && device.kind === "router"
      ? { ...device, config: { ...device.config, interfaces: { ...device.config.interfaces,
        [PORT_NAMES.router[1]]: { adminUp: true, ip: "10.0.12.1", mask: "255.255.255.0" } },
        staticRoutes: [{ network: "192.168.2.0", mask: "255.255.255.0", nextHop: "10.0.12.99" }] } } : device) };
    expect(sim.load(broken).ok).toBe(true);
    const failed = (await ping(sim)).trace;
    expect(failed.result.status).toBe("failed");
    expect(failed.events.some(event => event.deviceId === LAB.r1 && event.reason.code === "ARP_TIMEOUT")).toBe(true);
    expect(sim.load(staticRoutingLabDocument).ok).toBe(true);
    expect(sim.getSnapshot().traces).toEqual([]);
    expect((await ping(sim)).trace.result.status).toBe("success");
  });
});
