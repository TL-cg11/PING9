// 경로 출처와 AD: 같은 목적지는 AD가 작은 경로만, floating static, AD 255 (T11.1.1)
import { PORT_NAMES } from "@ping9/shared";
import type { ConsoleResult, PortView, RouterConfig, RouterDevice, StaticRoute } from "@ping9/shared";
import fc from "fast-check";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../../index";
import type { ConsolePort, Simulator } from "../../index";
import { lookupRoute, routingTable } from "./routing";
import type { RoutingEntry } from "./routing";

const [GI0, GI1] = PORT_NAMES.router as readonly [string, string, ...string[]];
const UP: readonly PortView[] = [{ name: GI0, status: "up" }, { name: GI1, status: "up" }];
const DESTINATION = { network: "10.0.3.0", mask: "255.255.255.0" };

const configWith = (staticRoutes: readonly StaticRoute[]): RouterConfig => ({
  interfaces: {
    [GI0]: { adminUp: true, ip: "10.0.12.1", mask: "255.255.255.252" },
    [GI1]: { adminUp: true, ip: "10.0.13.1", mask: "255.255.255.252" },
  },
  staticRoutes,
});
const STATIC: StaticRoute = { ...DESTINATION, nextHop: "10.0.12.2" };
const FLOATING: StaticRoute = { ...STATIC, distance: 130 };
/** T11.2.2의 RIP 모듈이 넣을 배운 경로. 이 Task에서는 테스트가 직접 넣는다 */
const RIP: RoutingEntry = { source: "rip", ...DESTINATION, nextHop: "10.0.13.2", port: GI1, distance: 120, metric: 2 };

const toDestination = (table: readonly RoutingEntry[]) =>
  table.filter(route => route.network === DESTINATION.network).map(route => `${route.source} ${route.distance}`);

describe("같은 목적지는 AD가 작은 경로만 테이블에 넣는다", () => {
  test.each<[string, readonly StaticRoute[], readonly RoutingEntry[], readonly string[]]>([
    ["Static(1)이 RIP(120)를 이긴다", [STATIC], [RIP], ["static 1"]],
    ["Static이 없으면 RIP가 올라온다", [], [RIP], ["rip 120"]],
    ["floating static(130)은 RIP(120)에 진다", [FLOATING], [RIP], ["rip 120"]],
    ["RIP가 없으면 floating static이 쓰인다", [FLOATING], [], ["static 130"]],
    ["AD 255는 넣지 않는다", [{ ...STATIC, distance: 255 }], [], []],
    ["같은 AD의 Static 둘은 모두 남는다", [STATIC, { ...DESTINATION, nextHop: "10.0.13.2" }], [], ["static 1", "static 1"]],
  ])("%s", (_name, staticRoutes, learned, expected) => {
    expect(toDestination(routingTable(configWith(staticRoutes), UP, learned))).toEqual(expected);
  });

  test("Connected와 같은 목적지의 Static은 테이블에 없고 패킷은 Connected로 나간다", () => {
    const table = routingTable(configWith([{ network: "10.0.13.0", mask: "255.255.255.252", nextHop: "10.0.12.2" }]), UP);
    expect(table.filter(route => route.network === "10.0.13.0").map(route => route.source)).toEqual(["connected"]);
    expect(lookupRoute(table, "10.0.13.2")).toMatchObject({ port: GI1, nextHop: "10.0.13.2" });
  });

  test("AD는 같은 목적지끼리만 비교한다. AD가 큰 /25가 AD가 작은 /24보다 길어 이긴다", () => {
    const longer: RoutingEntry = { ...RIP, network: "10.0.3.128", mask: "255.255.255.128" };
    const table = routingTable(configWith([STATIC]), UP, [longer]);
    expect(lookupRoute(table, "10.0.3.200")?.route.source).toBe("rip");
    expect(lookupRoute(table, "10.0.3.5")?.route.source).toBe("static");
  });

  test("Static을 지우면 숨어 있던 RIP 경로가 다음 계산에 올라온다", () => {
    expect(lookupRoute(routingTable(configWith([STATIC]), UP, [RIP]), "10.0.3.9")).toMatchObject({ nextHop: "10.0.12.2" });
    expect(lookupRoute(routingTable(configWith([]), UP, [RIP]), "10.0.3.9")).toMatchObject({ nextHop: "10.0.13.2" });
  });
});

const ID = "00000000-0000-4000-8000-000000000100";
const staticRoutesOf = (simulator: Simulator) =>
  (simulator.getSnapshot().document.devices.find(device => device.id === ID) as RouterDevice).config.staticRoutes;
const texts = (result: ConsoleResult) => result.lines.map(line => (line.kind === "text" ? line.text : `[${line.kind}]`));

function open() {
  const simulator = createSimulator();
  expect(simulator.dispatch({ type: "device/add", id: ID, kind: "router", position: { x: 0, y: 0 } }).ok).toBe(true);
  return { simulator, port: simulator.console(ID) };
}

async function configure(port: ConsolePort, lines: readonly string[]) {
  const results: ConsoleResult[] = [];
  for (const line of ["enable", "configure terminal", ...lines]) results.push(await port.exec(line));
  return results.flatMap(result => result.lines).filter(line => line.kind === "error");
}

describe("reducer", () => {
  const add = (simulator: Simulator, distance?: number) =>
    simulator.dispatch({ type: "route/add", deviceId: ID, ...STATIC, ...(distance === undefined ? {} : { distance }) });
  const remove = (simulator: Simulator, distance?: number) =>
    simulator.dispatch({ type: "route/remove", deviceId: ID, ...STATIC, ...(distance === undefined ? {} : { distance }) });

  test.each([0, 256, 1.5, Number.NaN])("AD %s는 거부한다", (distance) => {
    const { simulator } = open();
    expect(add(simulator, distance)).toMatchObject({ ok: false, error: { code: "ROUTE_DISTANCE_INVALID" } });
  });

  test("AD 1은 저장하지 않는다 (옛 문서와 같은 모양)", () => {
    const { simulator } = open();
    add(simulator, 1);
    expect(staticRoutesOf(simulator)).toEqual([STATIC]);
  });

  test("같은 경로를 다른 AD로 넣으면 AD만 바뀌고, 같은 AD면 문서가 그대로다", () => {
    const { simulator } = open();
    add(simulator);
    add(simulator, 130);
    expect(staticRoutesOf(simulator)).toEqual([FLOATING]);
    const before = simulator.getSnapshot().document;
    expect(add(simulator, 130).ok).toBe(true);
    expect(simulator.getSnapshot().document).toBe(before);
    add(simulator);
    expect(staticRoutesOf(simulator)).toEqual([STATIC]);
  });

  test("지울 때 AD를 주면 그 AD일 때만, 안 주면 AD와 상관없이 지운다", () => {
    const { simulator } = open();
    add(simulator, 130);
    expect(remove(simulator, 50)).toMatchObject({ ok: false, error: { code: "ROUTE_NOT_FOUND" } });
    expect(remove(simulator, 130).ok).toBe(true);
    expect(staticRoutesOf(simulator)).toEqual([]);
    add(simulator, 130);
    expect(remove(simulator).ok).toBe(true);
    expect(staticRoutesOf(simulator)).toEqual([]);
    add(simulator);
    expect(remove(simulator, 1).ok).toBe(true);
  });
});

describe("CLI", () => {
  test("ip route ... <AD>, no ip route ... <AD>", async () => {
    const { simulator, port } = open();
    expect(await configure(port, ["ip route 10.0.3.0 255.255.255.0 10.0.12.2 130"])).toEqual([]);
    expect(staticRoutesOf(simulator)).toEqual([FLOATING]);
    expect((await port.exec("no ip route 10.0.3.0 255.255.255.0 10.0.12.2 50")).lines).toMatchObject([{ code: "ROUTE_NOT_FOUND" }]);
    expect((await port.exec("no ip route 10.0.3.0 255.255.255.0 10.0.12.2 130")).lines).toEqual([]);
    expect(staticRoutesOf(simulator)).toEqual([]);
  });

  test.each([
    ["ip route 10.0.3.0 255.255.255.0 10.0.12.2 0", "ROUTE_DISTANCE_INVALID"],
    ["ip route 10.0.3.0 255.255.255.0 10.0.12.2 256", "ROUTE_DISTANCE_INVALID"],
    ["ip route 10.0.3.0 255.255.255.0 10.0.12.2 far", "CLI_INVALID_VALUE"],
  ])("`%s`는 %s", async (line, code) => {
    const { port } = open();
    expect(await configure(port, [line])).toMatchObject([{ code }]);
  });

  test("show ip route에 AD/Metric 칸이 있고, show ip route <목적지>에 AD가 나온다", async () => {
    const { simulator, port } = open();
    const peer = "00000000-0000-4000-8000-000000000101";
    simulator.dispatch({ type: "device/add", id: peer, kind: "router", position: { x: 0, y: 0 } });
    simulator.dispatch({ type: "interface/set-admin", deviceId: peer, port: GI0, adminUp: true });
    simulator.dispatch({
      type: "link/add", id: "00000000-0000-4000-8000-000000000200",
      ends: [{ deviceId: ID, port: GI0 }, { deviceId: peer, port: GI0 }],
    });
    expect(await configure(port, [
      "interface g0/0", "ip address 10.0.12.1 255.255.255.252", "no shutdown", "exit",
      "ip route 10.0.3.0 255.255.255.0 10.0.12.2 130", "end",
    ])).toEqual([]);
    const table = texts(await port.exec("show ip route"));
    expect(table[0]).toBe("Codes: C - connected, S - static, R - RIP");
    expect(table[1]).toMatch(/^Type\s+Network\s+AD\/Metric\s+Next hop\s+Interface$/);
    expect(table.find(line => line.startsWith("C "))).toMatch(/10\.0\.12\.0\/30\s+0\/0\s+directly connected/);
    expect(table.find(line => line.startsWith("S "))).toMatch(/10\.0\.3\.0\/24\s+130\/0\s+10\.0\.12\.2/);
    expect(texts(await port.exec("show ip route 10.0.3.9"))).toContain("  Distance: 130, metric: 0");
  });

  test("왕복: show running-config의 AD를 새 Router에 넣으면 같은 경로가 된다", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.tuple(fc.integer({ min: 1, max: 200 }), fc.integer({ min: 1, max: 255 })), {
          maxLength: 5, selector: ([third]) => third,
        }),
        async (routes) => {
          const source = open();
          for (const [third, distance] of routes) {
            source.simulator.dispatch({
              type: "route/add", deviceId: ID, network: `10.0.${third}.0`, mask: "255.255.255.0", nextHop: "10.0.12.2", distance,
            });
          }
          await source.port.exec("enable");
          const shown = texts(await source.port.exec("show running-config"));
          const target = open();
          expect(await configure(target.port, shown)).toEqual([]);
          expect(staticRoutesOf(target.simulator)).toEqual(staticRoutesOf(source.simulator));
        },
      ),
      { numRuns: 30 },
    );
  });
});
