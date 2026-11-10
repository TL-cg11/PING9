import { ROUTER_LAB as LAB, staticRoutingLabDocument } from "@ping9/shared/examples";
import { expect, test } from "vitest";
import { createSimulator } from "../../simulator";

test("Router가 경로에 맞는 출발지 IP로 ping을 보내고 show arp로 다음 홉을 확인한다", async () => {
  const sim = createSimulator(); expect(sim.load(staticRoutingLabDocument).ok).toBe(true);
  const port = sim.console(LAB.r1);
  const result = await port.exec("ping 192.168.2.10");
  expect(result.lines).toContainEqual({ kind: "text", text: "Success rate: 4/4" });
  const id = result.lines.find(line => line.kind === "trace");
  if (id?.kind !== "trace") throw new Error("Missing trace");
  const trace = sim.getTrace(id.traceId)!;
  expect(trace.events.find(event => event.reason.code === "ICMP_ECHO_REQUEST_SENT")?.frame.ipv4?.sourceIp).toBe("10.0.12.1");
  expect(trace.result.status).toBe("success");
  await port.exec("enable");
  const arp = (await port.exec("show arp")).lines.map(line => line.kind === "text" ? line.text : "").join("\n");
  expect(arp).toContain("10.0.12.2"); expect(arp).toContain("GigabitEthernet0/1");
});

test("Router 자신의 주소 ping은 링크를 사용하지 않고 응답하며 경로 없으면 실패한다", async () => {
  const sim = createSimulator(); sim.load(staticRoutingLabDocument);
  const port = sim.console(LAB.r1);
  expect((await port.exec("ping 10.0.12.1")).lines.filter(line => line.kind === "trace")).toEqual([]);
  expect(sim.getSnapshot().traces).toEqual([]);
  const failed = await port.exec("ping 8.8.8.8");
  expect(failed.lines).toContainEqual({ kind: "text", text: "Success rate: 0/4" });
  expect(sim.getTrace(1)?.events.some(event => event.reason.code === "NO_ROUTE")).toBe(true);
});
