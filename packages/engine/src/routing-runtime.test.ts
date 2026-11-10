import { PORT_NAMES } from "@ping9/shared";
import { TWO_PC, twoPcDocument } from "@ping9/shared/examples";
import { expect, test } from "vitest";

import { createSimulator } from "./simulator";

test("PC ping·ARP·추적과 Router 경로 조회가 같은 Simulator에서 함께 유지된다", async () => {
  const sim = createSimulator();
  expect(sim.load(twoPcDocument).ok).toBe(true);
  const r1 = "00000000-0000-4000-8000-000000000100";
  const r2 = "00000000-0000-4000-8000-000000000101";
  const linkId = "00000000-0000-4000-8000-000000000200";
  const port = PORT_NAMES.router[0];
  for (const id of [r1, r2]) expect(sim.dispatch({ type: "device/add", id, kind: "router", position: { x: 0, y: 0 } }).ok).toBe(true);
  expect(sim.dispatch({ type: "link/add", id: linkId, ends: [{ deviceId: r1, port }, { deviceId: r2, port }] }).ok).toBe(true);
  expect(sim.dispatch({ type: "interface/set-admin", deviceId: r2, port, adminUp: true }).ok).toBe(true);
  const console = sim.console(r1);
  for (const line of ["en", "conf t", "int gi0/0", "ip address 10.0.12.1 255.255.255.252", "no shut",
    "ip route 192.168.2.0 255.255.255.0 10.0.12.2", "end"]) {
    expect((await console.exec(line)).lines.filter(line => line.kind === "error")).toEqual([]);
  }
  const routeTable = () => {
    const view = sim.getSnapshot().views[r1]!;
    return view.kind === "router" ? view.routingTable : [];
  };
  const before = sim.getSnapshot();
  expect(routeTable()).toHaveLength(2);
  const ping = await sim.console(TWO_PC.pc1.id).exec(`ping -n 1 ${TWO_PC.pc2.ip}`);
  expect(ping.lines).toContainEqual(expect.objectContaining({ kind: "text", text: expect.stringContaining("bytes=32") }));
  const traceLine = ping.lines.find(line => line.kind === "trace");
  expect(traceLine).toBeDefined();
  if (traceLine?.kind !== "trace") throw new Error("Expected ping trace");
  expect(sim.getTrace(traceLine.traceId)?.result.status).toBe("success");
  expect(sim.getSnapshot().document).toBe(before.document);
  expect(sim.getSnapshot().runtimeVersion).toBeGreaterThan(before.runtimeVersion);
  const pc = sim.getSnapshot().views[TWO_PC.pc1.id]!;
  expect(pc.kind === "pc" && pc.arpTable).toContainEqual(expect.objectContaining({ ip: TWO_PC.pc2.ip }));
  expect(routeTable()).toEqual(before.views[r1]!.kind === "router" ? before.views[r1]!.routingTable : []);
  const lookup = await console.exec("show ip route 192.168.2.10");
  expect(lookup.lines).toContainEqual({ kind: "text", text: "  Next hop: 10.0.12.2" });
  expect(lookup.lines).toContainEqual({ kind: "text", text: `  Outgoing interface: ${port}` });
  expect(sim.dispatch({ type: "interface/set-admin", deviceId: r1, port, adminUp: false }).ok).toBe(true);
  expect(routeTable()).toEqual([]);
  const retainedPc = sim.getSnapshot().views[TWO_PC.pc1.id]!;
  expect(retainedPc.kind === "pc" && retainedPc.arpTable).toEqual(pc.kind === "pc" && pc.arpTable);
  expect(sim.dispatch({ type: "interface/set-admin", deviceId: r1, port, adminUp: true }).ok).toBe(true);
  expect(routeTable()).toHaveLength(2);
  expect(sim.load(sim.getSnapshot().document).ok).toBe(true);
  expect(routeTable()).toHaveLength(2);
  expect(sim.getTrace(traceLine.traceId)).toBeUndefined();
  const resetPc = sim.getSnapshot().views[TWO_PC.pc1.id]!;
  expect(resetPc.kind === "pc" && resetPc.arpTable).toEqual([]);
});
