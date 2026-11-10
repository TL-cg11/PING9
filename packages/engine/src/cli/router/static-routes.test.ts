import { PORT_NAMES } from "@ping9/shared";
import type { ConsoleResult, RouterDevice } from "@ping9/shared";
import fc from "fast-check";
import { describe, expect, test } from "vitest";

import type { ConsolePort } from "../../console";
import { createSimulator } from "../../simulator";

const R1 = "00000000-0000-4000-8000-000000000100";
const R2 = "00000000-0000-4000-8000-000000000101";
const LINK = "00000000-0000-4000-8000-000000000200";
const GI0 = PORT_NAMES.router[0];
const text = (result: ConsoleResult) => result.lines.map(line => line.kind === "text" ? line.text : "").join("\n");
function open() {
  const sim = createSimulator();
  sim.dispatch({ type: "device/add", id: R1, kind: "router", position: { x: 0, y: 0 } });
  return { sim, port: sim.console(R1) };
}
const router = (sim: ReturnType<typeof open>["sim"]) => sim.getSnapshot().document.devices[0] as RouterDevice;
async function run(port: ConsolePort, lines: readonly string[]) {
  for (const line of lines) expect((await port.exec(line)).lines.filter(line => line.kind === "error")).toEqual([]);
}

describe("정적 경로 CLI와 활성화", () => {
  test("config 모드에서 추가·삭제하고 축약·완성·도움말·구성 출력을 지원한다", async () => {
    const { sim, port } = open();
    expect((await port.exec("ip route 192.168.2.0 255.255.255.0 10.0.12.2")).lines).toMatchObject([{ code: "CLI_WRONG_MODE" }]);
    await run(port, ["en", "conf t"]);
    expect((await port.exec("ip address 10.0.12.1 255.255.255.252")).lines).toMatchObject([{ code: "CLI_WRONG_MODE" }]);
    expect(port.complete("ip r")).toBe("ip route ");
    expect(port.help("ip route ").map(entry => entry.token)).toEqual(["<network>"]);
    expect(port.help("ip route 192.168.2.0 255.255.255.0 ").map(entry => entry.token)).toEqual(["<nextHop>"]);
    await run(port, ["ip r 192.168.2.0 255.255.255.0 10.0.12.2", "ip route 0.0.0.0 0.0.0.0 10.0.12.2", "end"]);
    expect(text(await port.exec("show running-config"))).toContain("ip route 192.168.2.0 255.255.255.0 10.0.12.2");
    expect(text(await port.exec("show ip route"))).not.toContain("192.168.2.0/24");
    await run(port, ["conf t", "int gi0/0", "no ip r 192.168.2.0 255.255.255.0 10.0.12.2", "end"]);
    expect(router(sim).config.staticRoutes).toEqual([{ network: "0.0.0.0", mask: "0.0.0.0", nextHop: "10.0.12.2" }]);
  });

  test.each([
    ["ip route 192.168.2.0 255.255.255.0", "CLI_INCOMPLETE_COMMAND"],
    ["ip route 192.168.2.0 255.255.255.0 bad", "INVALID_IPV4"],
    ["ip route 192.168.2.0 255.0.255.0 10.0.12.2", "INVALID_MASK"],
    ["ip route 192.168.2.1 255.255.255.0 10.0.12.2", "ROUTE_NETWORK_NOT_ALIGNED"],
    ["ip route 192.168.2.0 255.255.255.0 127.0.0.1", "RESERVED_IPV4"],
  ])("오류 명령 %s도 문서를 유지한다", async (line, code) => {
    const { sim, port } = open(); await run(port, ["en", "conf t"]); const before = sim.getSnapshot();
    expect((await port.exec(line)).lines).toMatchObject([{ code }]); expect(sim.getSnapshot()).toBe(before);
  });

  test("활성 직접 연결망으로만 다음 홉을 해석하고 상태 변경에 따라 활성 경로를 갱신한다", async () => {
    const { sim, port } = open();
    sim.dispatch({ type: "device/add", id: R2, kind: "router", position: { x: 100, y: 0 } });
    await run(port, ["en", "conf t", "ip route 192.168.2.0 255.255.255.0 10.0.12.2",
      "ip route 172.16.0.0 255.255.0.0 192.168.2.2", // 다른 정적 경로를 통한 재귀 해석은 하지 않음
      "int gi0/0", "ip address 10.0.12.1 255.255.255.252", "no shut", "end"]);
    const routes = () => {
      const view = sim.getSnapshot().views[R1]!;
      return view.kind === "router" ? view.routingTable : [];
    };
    const stored = router(sim).config.staticRoutes;
    expect(routes()).toEqual([]);
    const link = { type: "link/add", id: LINK, ends: [{ deviceId: R1, port: GI0 }, { deviceId: R2, port: GI0 }] } as const;
    sim.dispatch(link); expect(routes()).toEqual([]);
    sim.dispatch({ type: "interface/set-admin", deviceId: R2, port: GI0, adminUp: true });
    expect(routes()).toEqual([
      { source: "connected", network: "10.0.12.0", mask: "255.255.255.252", port: GI0 },
      { source: "static", network: "192.168.2.0", mask: "255.255.255.0", nextHop: "10.0.12.2", port: GI0 },
    ]);
    const output = text(await port.exec("show ip route"));
    expect(output).toMatch(/S\s+192\.168\.2\.0\/24/); expect(output).toContain("10.0.12.2"); expect(output).toContain(GI0);
    for (const peer of [R1, R2]) {
      sim.dispatch({ type: "interface/set-admin", deviceId: peer, port: GI0, adminUp: false }); expect(routes()).toEqual([]);
      expect(router(sim).config.staticRoutes).toEqual(stored);
      sim.dispatch({ type: "interface/set-admin", deviceId: peer, port: GI0, adminUp: true }); expect(routes()).toHaveLength(2);
    }
    sim.dispatch({ type: "interface/set-ip", deviceId: R1, port: GI0, ip: "10.0.13.1", mask: "255.255.255.252" });
    expect(routes()).toHaveLength(1);
    sim.dispatch({ type: "interface/set-ip", deviceId: R1, port: GI0, ip: "10.0.12.1", mask: "255.255.255.252" });
    expect(routes()).toHaveLength(2);
    sim.dispatch({ type: "link/remove", linkId: LINK }); expect(routes()).toEqual([]);
    expect(router(sim).config.staticRoutes).toEqual(stored);
    sim.dispatch(link); expect(routes()).toHaveLength(2);
    sim.dispatch({ type: "interface/clear-ip", deviceId: R1, port: GI0 }); expect(routes()).toEqual([]);
  });

  test("인터페이스와 호스트·기본·미활성 경로를 새 Router에 명령어로 복원한다", async () => {
    await fc.assert(fc.asyncProperty(fc.uniqueArray(fc.integer({ min: 0, max: 254 }), { maxLength: 8 }), async nets => {
      const source = open();
      await run(source.port, ["en", "conf t", "int gi0/0", "ip address 10.0.12.1 255.255.255.252", "no shut",
        "ip route 0.0.0.0 0.0.0.0 10.0.12.2", "ip route 192.168.2.10 255.255.255.255 10.0.99.2",
        ...nets.map(n => `ip route 172.16.${n}.0 255.255.255.0 10.0.12.2`), "end"]);
      const lines = text(await source.port.exec("show running-config")).split("\n");
      const target = open(); await run(target.port, ["en", "conf t", ...lines]);
      expect(router(target.sim).config).toEqual(router(source.sim).config);
    }), { numRuns: 40, seed: 20261109 });
  });
});
