import { BROADCAST_MAC, PORT_NAMES, validateTrace } from "@ping9/shared";
import type { ConsoleResult, TopologyDocument } from "@ping9/shared";
import { oneRouterLabDocument, ROUTER_LAB as LAB, staticRoutingLabDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";
import { createKernel } from "../../kernel";
import { createSimulator } from "../../simulator";
import { portMac } from "../../topology";
import { RouterModel } from "./router-model";

const text = (result: ConsoleResult) => result.lines.map(line => line.kind === "text" ? line.text : "").join("\n");
function open(doc: TopologyDocument = staticRoutingLabDocument) {
  const sim = createSimulator(); expect(sim.load(doc).ok).toBe(true); return sim;
}
async function ping(sim: ReturnType<typeof open>, command = "ping -n 1 192.168.2.10") {
  const result = await sim.console(LAB.pc1).exec(command);
  const line = result.lines.find(line => line.kind === "trace");
  if (line?.kind !== "trace") throw new Error(text(result));
  const trace = sim.getTrace(line.traceId)!; expect(validateTrace(trace).ok).toBe(true);
  return { result, trace };
}
function route(sim: ReturnType<typeof open>, deviceId: string, network: string, mask: string, nextHop: string, remove = false) {
  expect(sim.dispatch({ type: remove ? "route/remove" : "route/add", deviceId, network, mask, nextHop }).ok).toBe(true);
}

describe("라우터 ICMP 오류", () => {
  test("가는 경로가 없으면 출발 PC까지 도달 불가를 돌려주고 복구 후 성공한다", async () => {
    const sim = open(); route(sim, LAB.r1, "192.168.2.0", "255.255.255.0", "10.0.12.2", true);
    const { result, trace } = await ping(sim);
    expect(text(result)).toContain("Reply from 192.168.1.1: Destination net unreachable.");
    expect(text(result)).not.toContain("bytes=32"); expect(trace.result.status).toBe("failed");
    const drop = trace.events.find(event => event.reason.code === "NO_ROUTE")!;
    expect(drop.deviceId).toBe(LAB.r1);
    const error = trace.events.find(event => event.reason.code === "ICMP_ERROR_RECEIVED")!;
    expect(error.frame.icmp).toMatchObject({ type: "destination-unreachable", original: {
      sourceIp: "192.168.1.10", destinationIp: "192.168.2.10", sequence: 1,
    } });
    route(sim, LAB.r1, "192.168.2.0", "255.255.255.0", "10.0.12.2");
    expect((await ping(sim)).trace.result.status).toBe("success");
  });

  test("돌아오는 경로 누락은 원래 출발 PC의 timeout이며 Trace에 R2의 NO_ROUTE가 남는다", async () => {
    const sim = open(); route(sim, LAB.r2, "192.168.1.0", "255.255.255.0", "10.0.12.1", true);
    const { result, trace } = await ping(sim);
    expect(text(result)).toContain("Request timed out."); expect(trace.result.status).toBe("failed");
    expect(trace.events).toContainEqual(expect.objectContaining({ deviceId: LAB.r2, reason: expect.objectContaining({ code: "NO_ROUTE" }) }));
    expect(trace.events.some(event => event.deviceId === LAB.pc1 && event.reason.code === "ICMP_ERROR_RECEIVED")).toBe(false);
  });

  test("순환 경로는 TTL을 소진해 종료되고 시간 초과가 출발 PC에 돌아온다", async () => {
    const sim = open();
    route(sim, LAB.r1, "8.8.8.0", "255.255.255.0", "10.0.12.2");
    route(sim, LAB.r2, "8.8.8.0", "255.255.255.0", "10.0.12.1");
    const { result, trace } = await ping(sim, "ping -n 1 8.8.8.8");
    expect(text(result)).toContain("TTL expired in transit."); expect(trace.result.status).toBe("failed");
    const expired = trace.events.find(event => event.reason.code === "TTL_EXPIRED")!;
    expect(expired.frame.ipv4?.ttl).toBe(0);
    expect(trace.events.some(event => event.reason.code === "LOOP_GUARD")).toBe(false);
    expect(trace.events.filter(event => event.reason.code === "ICMP_ERROR_SENT")).toHaveLength(1);
    expect(trace.events.find(event => event.reason.code === "ICMP_ERROR_RECEIVED")?.frame.icmp?.type).toBe("time-exceeded");
  });

  test("ICMP 오류 패킷 자체가 순환해도 또 다른 ICMP 오류를 만들지 않는다", async () => {
    const sim = open();
    route(sim, LAB.r1, "8.8.8.0", "255.255.255.0", "10.0.12.2");
    // R2는 8.8.8.0 경로가 없어 오류 생성. R1의 /32가 오류의 귀환을 R2로 돌려 순환시킨다.
    route(sim, LAB.r1, "192.168.1.10", "255.255.255.255", "10.0.12.2");
    const { trace } = await ping(sim, "ping -n 1 8.8.8.8");
    expect(trace.events.filter(event => event.reason.code === "ICMP_ERROR_SENT")).toHaveLength(1);
    const expired = trace.events.find(event => event.reason.code === "TTL_EXPIRED")!;
    expect(expired.frame.icmp?.type).toBe("destination-unreachable");
    expect(trace.events.length).toBeLessThan(500);
  });

  test("Linux에는 오류 발생 라우터 IP와 실패 종류를 표시한다", async () => {
    const sim = open(); route(sim, LAB.r1, "192.168.2.0", "255.255.255.0", "10.0.12.2", true);
    sim.dispatch({ type: "pc/set-os", deviceId: LAB.pc1, os: "linux" });
    const { result } = await ping(sim, "ping -c 1 192.168.2.10");
    expect(text(result)).toContain("From 192.168.1.1 icmp_seq=1 Destination Net Unreachable");
    expect(text(result)).toContain("1 packets transmitted, 0 received, +1 errors");
  });

  test.each([
    [BROADCAST_MAC, "192.168.1.10", "8.8.8.8"],
    ["own", "0.0.0.0", "8.8.8.8"],
    ["own", "192.168.1.10", "224.0.0.1"],
    ["own", "192.168.1.10", "192.168.2.255"],
  ])("MAC=%s, source=%s, target=%s에는 ICMP 오류를 생성하지 않는다", (mac, sourceIp, destinationIp) => {
    const router = oneRouterLabDocument.devices.find(device => device.id === LAB.r1)!;
    const port = PORT_NAMES.router[0]; const model = new RouterModel(LAB.r1, () => oneRouterLabDocument);
    const trace = createKernel().run({ docVersion: 1,
      start: ctx => model.onFrame(ctx, port, ctx.createFrame({
        ethernet: { sourceMac: "02:00:00:00:01:00", destinationMac: mac === "own" ? portMac(router, port) : mac },
        ipv4: { sourceIp, destinationIp, ttl: 5 }, icmp: { type: "echo-request", sequence: 1 },
      })), onFrame: () => {}, onTimer: () => {},
    });
    expect(trace.events.some(event => event.reason.code === "ICMP_ERROR_SENT")).toBe(false);
  });
});
