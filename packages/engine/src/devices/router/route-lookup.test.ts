import { formatIpv4, PORT_NAMES, prefixLengthToMask } from "@ping9/shared";
import fc from "fast-check";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../../simulator";
import { lookupRoute } from "./routing";
import type { RoutingEntry } from "./routing";

const [GI0, GI1] = PORT_NAMES.router;
const route = (network: string, prefix: number, source: "connected" | "static" = "static", nextHop = "10.0.12.2"): RoutingEntry => ({
  network, mask: prefixLengthToMask(prefix)!, source, port: source === "connected" ? GI0 : GI1,
  ...(source === "static" ? { nextHop } : {}),
});

describe("경로 선택", () => {
  const table = [route("0.0.0.0", 0), route("192.168.0.0", 16), route("192.168.2.0", 24), route("192.168.2.10", 32)];
  test.each([
    ["192.168.2.10", 32], ["192.168.2.0", 24], ["192.168.2.255", 24],
    ["192.168.3.1", 16], ["192.168.255.255", 16], ["192.169.0.0", 0], ["255.255.255.255", 0], ["0.0.0.0", 0],
  ])("%s에는 /%i 경로를 선택한다", (destination, prefix) => {
    expect(lookupRoute(table, destination)?.route.mask).toBe(prefixLengthToMask(prefix));
  });

  test("기본 경로가 없을 때 불일치, 빈 테이블, 잘못된 IP는 경로 없음이다", () => {
    expect(lookupRoute(table.slice(1), "8.8.8.8")).toBeNull();
    expect(lookupRoute([], "192.168.2.10")).toBeNull();
    expect(lookupRoute(table, "bad")).toBeNull();
  });

  test("같은 길이면 직접 연결을 우선하고 직접 목적지에 ARP한다", () => {
    const connected = route("192.168.2.0", 24, "connected");
    const candidates = [table[2]!, connected];
    for (const routes of [candidates, [...candidates].reverse()]) {
      expect(lookupRoute(routes, "192.168.2.10")).toEqual({ route: connected, port: GI0, nextHop: "192.168.2.10" });
    }
    const specific = route("192.168.2.10", 32);
    expect(lookupRoute([connected, specific], "192.168.2.10")?.route).toEqual(specific);
  });

  test("같은 길이의 정적 경로는 작은 다음 홉을 고르고 입력 순서나 원본을 바꾸지 않는다", () => {
    const low = route("192.168.2.0", 24, "static", "10.0.12.2");
    const high = route("192.168.2.0", 24, "static", "10.0.12.10");
    const candidates = Object.freeze([Object.freeze(high), Object.freeze(low)]);
    expect(lookupRoute(candidates, "192.168.2.10")).toEqual({ route: low, port: GI1, nextHop: "10.0.12.2" });
    expect(lookupRoute([...candidates].reverse(), "192.168.2.10")?.route).toEqual(low);
    expect(candidates[0]).toBe(high);
  });

  test("무작위 목적지·경로 1000건에서 주소 범위 기준 최장 일치와 같고 순서에 영향받지 않는다", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 0xffffffff }), fc.array(fc.record({
      base: fc.integer({ min: 0, max: 0xffffffff }), prefix: fc.integer({ min: 0, max: 32 }),
      connected: fc.boolean(), hop: fc.integer({ min: 2, max: 200 }),
    }), { maxLength: 40 }), (destination, specs) => {
      const candidates = specs.map(spec => {
        const size = 2 ** (32 - spec.prefix);
        const start = Math.floor(spec.base / size) * size;
        return { spec, start, end: start + size - 1, route: route(formatIpv4(start), spec.prefix,
          spec.connected ? "connected" : "static", `10.0.12.${spec.hop}`) };
      });
      const matching = candidates.filter(candidate => destination >= candidate.start && destination <= candidate.end);
      matching.sort((a, b) => b.spec.prefix - a.spec.prefix || Number(b.spec.connected) - Number(a.spec.connected) ||
        (a.spec.connected ? 0 : a.spec.hop - b.spec.hop));
      const routes = candidates.map(candidate => candidate.route);
      const actual = lookupRoute(routes, formatIpv4(destination));
      expect(actual?.route ?? null).toEqual(matching[0]?.route ?? null);
      expect(lookupRoute([...routes].reverse(), formatIpv4(destination))).toEqual(actual);
    }), { numRuns: 1000, seed: 20261109 });
  });

  test("CLI로 설정한 경로를 목적지로 조회하고 링크 해제 뒤에는 선택하지 않는다", async () => {
    const sim = createSimulator(); const r1 = "00000000-0000-4000-8000-000000000100";
    const r2 = "00000000-0000-4000-8000-000000000101"; const linkId = "00000000-0000-4000-8000-000000000200";
    for (const id of [r1, r2]) sim.dispatch({ type: "device/add", id, kind: "router", position: { x: 0, y: 0 } });
    sim.dispatch({ type: "link/add", id: linkId, ends: [{ deviceId: r1, port: GI0 }, { deviceId: r2, port: GI0 }] });
    sim.dispatch({ type: "interface/set-admin", deviceId: r2, port: GI0, adminUp: true });
    const port = sim.console(r1);
    for (const line of ["en", "conf t", "int gi0/0", "ip address 10.0.12.1 255.255.255.252", "no shut",
      "ip route 192.168.2.0 255.255.255.0 10.0.12.2", "end"]) {
      expect((await port.exec(line)).lines.filter(line => line.kind === "error")).toEqual([]);
    }
    const show = async (destination: string) => (await port.exec(`show ip route ${destination}`)).lines
      .map(line => line.kind === "text" ? line.text : "").join("\n");
    expect(await show("192.168.2.10")).toContain("Next hop: 10.0.12.2");
    expect(await show("192.168.2.10")).toContain(`Outgoing interface: ${GI0}`);
    expect(await show("10.0.12.2")).toContain("C - connected");
    expect(await show("8.8.8.8")).toBe("No route to 8.8.8.8");
    sim.dispatch({ type: "link/remove", linkId });
    expect(await show("192.168.2.10")).toBe("No route to 192.168.2.10");
  });
});
