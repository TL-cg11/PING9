// 링크가 끊기면 경로가 바뀐다 (T11.3.1): 사각형에서 끊김 종류별 재수렴, 고리, metric = 최단 hop 수, 바뀐 경로 목록
import { PORT_NAMES } from "@ping9/shared";
import type { Command, Link, RouterDevice, SwitchDevice, TopologyDocument } from "@ping9/shared";
import { fourRouterRipDocument, RIP_SQUARE } from "@ping9/shared/examples";
import fc from "fast-check";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../../index";
import type { Simulator } from "../../index";

const [GI0, GI1, GI2] = PORT_NAMES.router as readonly [string, string, string, ...string[]];
const [FA1, FA2] = PORT_NAMES.switch as readonly [string, string, ...string[]];
const P2P = "255.255.255.252";
const SW = "00000000-0000-4000-8000-000000003007";

function open(document: TopologyDocument): Simulator {
  const simulator = createSimulator();
  expect(simulator.load(document)).toEqual({ ok: true });
  return simulator;
}

const lastExchange = (simulator: Simulator) => simulator.getSnapshot().traces.find(summary => summary.kind === "rip")!;

/** 그 Router의 RIP 경로 하나. 없으면 undefined */
function ripRoute(simulator: Simulator, deviceId: string, network: string) {
  const view = simulator.getSnapshot().views[deviceId];
  const route = view?.kind === "router" ? view.routingTable.find(entry => entry.source === "rip" && entry.network === network) : undefined;
  return route === undefined ? undefined : { nextHop: route.nextHop, port: route.port, metric: route.metric };
}

async function pingWorks(simulator: Simulator): Promise<boolean> {
  const result = await simulator.console(RIP_SQUARE.pc1.id).exec(`ping -n 1 ${RIP_SQUARE.pc2.ip}`);
  return result.lines.some(line => line.kind === "text" && line.text.includes("bytes=32"));
}

const VIA_R2 = { nextHop: "10.0.12.2", port: GI1, metric: 2 };
const VIA_R4 = { nextHop: "10.0.14.2", port: GI2, metric: 2 };

/** R1–R2 사이에 Switch를 둔 사각형. R1은 SW의 FA1, R2는 FA2 */
const squareWithSwitch: TopologyDocument = {
  ...fourRouterRipDocument,
  devices: [...fourRouterRipDocument.devices, {
    id: SW, name: "SW1", kind: "switch", position: { x: 380, y: 40 }, config: { vlans: [{ id: 1, name: "default" }], ports: {} },
  } satisfies SwitchDevice],
  links: fourRouterRipDocument.links.flatMap(link => link.id !== RIP_SQUARE.links.r1R2 ? [link] : [
    { id: link.id, ends: [{ deviceId: RIP_SQUARE.r1, port: GI1 }, { deviceId: SW, port: FA1 }] },
    { id: "00000000-0000-4000-8000-000000003107", ends: [{ deviceId: SW, port: FA2 }, { deviceId: RIP_SQUARE.r2, port: GI0 }] },
  ]),
};

describe("완료 기준", () => {
  test("R1–R2를 끊으면 R1이 R4 쪽 경로로 바꾸고 PC1 → PC2 ping이 다시 된다", async () => {
    const simulator = open(fourRouterRipDocument);
    expect(ripRoute(simulator, RIP_SQUARE.r1, "10.0.3.0")).toEqual(VIA_R2);
    expect(await pingWorks(simulator)).toBe(true);

    expect(simulator.dispatch({ type: "link/remove", linkId: RIP_SQUARE.links.r1R2 }).ok).toBe(true);
    expect(ripRoute(simulator, RIP_SQUARE.r1, "10.0.3.0")).toEqual(VIA_R4);
    expect(await pingWorks(simulator)).toBe(true);
  });
});

describe("끊김 종류", () => {
  test.each<[string, TopologyDocument, readonly Command[]]>([
    ["케이블 삭제", fourRouterRipDocument, [{ type: "link/remove", linkId: RIP_SQUARE.links.r1R2 }]],
    ["R1 GI0/1 shutdown", fourRouterRipDocument, [{ type: "interface/set-admin", deviceId: RIP_SQUARE.r1, port: GI1, adminUp: false }]],
    ["R2 삭제", fourRouterRipDocument, [{ type: "device/remove", deviceId: RIP_SQUARE.r2 }]],
    ["사이 Switch의 R2 쪽 포트 shutdown", squareWithSwitch, [{ type: "interface/set-admin", deviceId: SW, port: FA2, adminUp: false }]],
    ["사이 Switch의 R2 쪽 포트 VLAN 바꿈", squareWithSwitch, [
      { type: "vlan/create", deviceId: SW, vlanId: 10 },
      { type: "switchport/set-access-vlan", deviceId: SW, port: FA2, vlanId: 10 },
    ]],
  ])("%s: R1의 경로가 R4 경유가 되고 ping이 된다", async (_name, document, commands) => {
    const simulator = open(document);
    // R2–R3 링크는 R2 쪽이 1 hop으로 가장 짧다. 10.0.3.0은 두 길이 같아 먼저 들은 쪽이라 Switch를 두면 R4일 수 있다
    expect(ripRoute(simulator, RIP_SQUARE.r1, "10.0.23.0")).toEqual({ nextHop: "10.0.12.2", port: GI1, metric: 1 });
    for (const command of commands) expect(simulator.dispatch(command)).toMatchObject({ ok: true });
    expect(ripRoute(simulator, RIP_SQUARE.r1, "10.0.3.0")).toEqual(VIA_R4);
    const view = simulator.getSnapshot().views[RIP_SQUARE.r1];
    expect(view?.kind === "router" && view.routingTable.some(route => route.nextHop === "10.0.12.2")).toBe(false);
    expect(await pingWorks(simulator)).toBe(true);
  });

  test("Switch 포트를 끄면 R1 포트는 살아 있어도 R2에게서 배운 경로가 모두 빠진다", () => {
    const simulator = open(squareWithSwitch);
    expect(simulator.dispatch({ type: "interface/set-admin", deviceId: SW, port: FA2, adminUp: false }).ok).toBe(true);
    const view = simulator.getSnapshot().views[RIP_SQUARE.r1];
    expect(view?.kind === "router" && view.routingTable.some(route => route.nextHop === "10.0.12.2")).toBe(false);
    expect(view?.kind === "router" && view.routingTable.some(route => route.source === "connected" && route.port === GI1)).toBe(true);
  });
});

describe("다시 이음", () => {
  const cut: Command = { type: "link/remove", linkId: RIP_SQUARE.links.r1R2 };
  const rejoin: Command = { type: "link/add", id: RIP_SQUARE.links.r1R2, ends: fourRouterRipDocument.links.find(link => link.id === RIP_SQUARE.links.r1R2)!.ends };

  test("다시 이으면 원래 경로로 돌아온다", () => {
    const simulator = open(fourRouterRipDocument);
    const before = simulator.getSnapshot().views;
    expect(simulator.dispatch(cut).ok).toBe(true);
    expect(simulator.dispatch(rejoin).ok).toBe(true);
    for (const id of [RIP_SQUARE.r1, RIP_SQUARE.r2, RIP_SQUARE.r3, RIP_SQUARE.r4]) {
      expect(simulator.getSnapshot().views[id]).toEqual(before[id]);
    }
  });

  test("같은 순서면 두 Simulator에서 같은 Trace와 같은 바뀐 경로 (AD-6)", () => {
    const [a, b] = [open(fourRouterRipDocument), open(fourRouterRipDocument)];
    for (const simulator of [a, b]) for (const command of [cut, rejoin, cut]) simulator.dispatch(command);
    const [lastA, lastB] = [lastExchange(a), lastExchange(b)];
    expect(a.getTrace(lastA.id)).toEqual(b.getTrace(lastB.id));
    expect(a.getRouteChanges(lastA.id)).toEqual(b.getRouteChanges(lastB.id));
  });
});

/** Router n대와 링크 목록으로 문서를 만든다. 링크 i는 10.1.i.0/30, 앞 장비가 .1 */
function routerGraph(count: number, edges: readonly (readonly [number, number])[]): TopologyDocument {
  const id = (index: number) => `00000000-0000-4000-8000-${(0x4000 + index).toString().padStart(12, "0")}`;
  const ports = Array.from({ length: count }, () => new Map<string, readonly [string, string]>());
  const links: Link[] = edges.map(([from, to], index) => {
    const ends = ([[from, 1], [to, 2]] as const).map(([router, host]) => {
      const port = PORT_NAMES.router[ports[router]!.size]!;
      ports[router]!.set(port, [`10.1.${index}.${host}`, P2P]);
      return { deviceId: id(router), port };
    });
    return { id: `00000000-0000-4000-8000-${(0x5000 + index).toString().padStart(12, "0")}`, ends: [ends[0]!, ends[1]!] };
  });
  return {
    schemaVersion: 1,
    devices: ports.map((routerPorts, index): RouterDevice => ({
      id: id(index), name: `R${index + 1}`, kind: "router", position: { x: index * 100, y: 0 },
      config: {
        interfaces: Object.fromEntries([...routerPorts].map(([port, [ip, mask]]) => [port, { adminUp: true, ip, mask }])),
        staticRoutes: [],
        rip: { networks: ["10.0.0.0"], passiveInterfaces: [] },
      },
    })),
    links,
  };
}

/** 너비 우선으로 구한 hop 수 */
function hops(count: number, edges: readonly (readonly [number, number])[], from: number): number[] {
  const distance = Array<number>(count).fill(Infinity);
  distance[from] = 0;
  const queue = [from];
  for (let head = 0; head < queue.length; head += 1) {
    const at = queue[head]!;
    for (const [a, b] of edges) {
      const next = a === at ? b : b === at ? a : -1;
      if (next >= 0 && distance[next] === Infinity) { distance[next] = distance[at]! + 1; queue.push(next); }
    }
  }
  return distance;
}

/** 연결된 무작위 그래프. 먼저 나무를 만들고 링크를 더 넣는다. Router 포트(4개)를 넘지 않는다 */
const connectedGraph = fc.integer({ min: 2, max: 7 }).chain(count => fc.tuple(
  fc.constant(count),
  fc.tuple(...Array.from({ length: count - 1 }, (_, index) => fc.nat({ max: index }))),
  fc.array(fc.tuple(fc.nat({ max: count - 1 }), fc.nat({ max: count - 1 })), { maxLength: 6 }),
)).map(([count, parents, extra]) => {
  const degree = Array<number>(count).fill(0);
  const edges: [number, number][] = [];
  const add = (a: number, b: number) => {
    if (a === b || degree[a]! >= PORT_NAMES.router.length || degree[b]! >= PORT_NAMES.router.length) return;
    if (edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) return;
    edges.push([a, b]); degree[a]! += 1; degree[b]! += 1;
  };
  parents.forEach((parent, index) => add(parent, index + 1));
  for (const [a, b] of extra) add(a, b);
  return { count, edges };
}).filter(({ count, edges }) => hops(count, edges, 0).every(distance => distance !== Infinity));

describe("고리", () => {
  test.each([
    ["삼각형", routerGraph(3, [[0, 1], [1, 2], [2, 0]])],
    ["사각형", fourRouterRipDocument],
  ])("%s: 경로 교환이 한도 안에서 끝난다", (_name, document) => {
    const summary = lastExchange(open(document));
    expect(summary.status).toBe("success");
    expect(summary.eventCount).toBeLessThan(2_000);
  });

  test("속성: 무작위 연결 그래프에서 배운 metric = 최단 hop 수, 같은 입력에 같은 Trace", () => {
    fc.assert(fc.property(connectedGraph, ({ count, edges }) => {
      const document = routerGraph(count, edges);
      const simulator = open(document);
      expect(lastExchange(simulator).status).toBe("success");
      for (let router = 0; router < count; router += 1) {
        const distance = hops(count, edges, router);
        // 링크 i의 네트워크는 양 끝 Router 가운데 가까운 쪽까지의 hop 수로 배운다. 내 링크는 connected
        const expected = edges.flatMap(([a, b], index) => a === router || b === router ? []
          : [[`10.1.${index}.0`, Math.min(distance[a]!, distance[b]!)] as const])
          .filter(([, metric]) => metric < 16)
          .sort(([x], [y]) => x.localeCompare(y));
        const view = simulator.getSnapshot().views[document.devices[router]!.id];
        const learned = view?.kind === "router"
          ? view.routingTable.filter(route => route.source === "rip").map(route => [route.network, route.metric] as const)
            .sort(([x], [y]) => x.localeCompare(y))
          : [];
        expect(learned).toEqual(expected);
      }
      const again = open(document);
      expect(again.getTrace(lastExchange(again).id)).toEqual(simulator.getTrace(lastExchange(simulator).id));
    }), { numRuns: 60 });
  });
});

describe("바뀐 경로", () => {
  const hop = (nextHop: string, port: string, metric: number) => ({ nextHop, port, metric });
  const R = (deviceId: string, deviceName: string) => ({ deviceId, deviceName });

  test("R1–R2를 끊은 뒤: 바뀐 것과 사라진 것, 요약 개수", () => {
    const simulator = open(fourRouterRipDocument);
    simulator.dispatch({ type: "link/remove", linkId: RIP_SQUARE.links.r1R2 });
    const summary = lastExchange(simulator);
    expect(summary).toMatchObject({ kind: "rip", learned: 12, added: 0, removed: 2, changed: 5 });
    expect(simulator.getRouteChanges(summary.id)).toEqual([
      { device: R(RIP_SQUARE.r1, "R1"), network: "10.0.3.0", mask: "255.255.255.0",
        before: hop("10.0.12.2", GI1, 2), after: hop("10.0.14.2", GI2, 2) },
      { device: R(RIP_SQUARE.r1, "R1"), network: "10.0.23.0", mask: P2P, before: hop("10.0.12.2", GI1, 1), after: hop("10.0.14.2", GI2, 2) },
      { device: R(RIP_SQUARE.r2, "R2"), network: "10.0.1.0", mask: "255.255.255.0",
        before: hop("10.0.12.1", GI0, 1), after: hop("10.0.23.2", GI1, 3) },
      { device: R(RIP_SQUARE.r2, "R2"), network: "10.0.14.0", mask: P2P, before: hop("10.0.12.1", GI0, 1), after: hop("10.0.23.2", GI1, 2) },
      { device: R(RIP_SQUARE.r3, "R3"), network: "10.0.1.0", mask: "255.255.255.0",
        before: hop("10.0.23.1", GI0, 2), after: hop("10.0.34.2", GI2, 2) },
      { device: R(RIP_SQUARE.r3, "R3"), network: "10.0.12.0", mask: P2P, before: hop("10.0.23.1", GI0, 1) },
      { device: R(RIP_SQUARE.r4, "R4"), network: "10.0.12.0", mask: P2P, before: hop("10.0.14.1", GI0, 1) },
    ]);
  });

  test("문서를 열면 모두 새로 배움, 아무것도 안 바뀐 교환(clear ip route *)은 빈 목록", async () => {
    const simulator = open(fourRouterRipDocument);
    const first = lastExchange(simulator);
    expect(first).toMatchObject({ learned: 14, added: 14, removed: 0, changed: 0 });
    expect(simulator.getRouteChanges(first.id)!.every(change => change.before === undefined)).toBe(true);

    const port = simulator.console(RIP_SQUARE.r1);
    await port.exec("enable");
    await port.exec("clear ip route *");
    const again = lastExchange(simulator);
    expect(again.id).not.toBe(first.id);
    expect(again).toMatchObject({ added: 0, removed: 0, changed: 0 });
    expect(simulator.getRouteChanges(again.id)).toEqual([]);
    // 앞의 교환은 목록에서 빠졌다
    expect(simulator.getRouteChanges(first.id)).toBeUndefined();
  });

  test("RIP를 끈 Router의 경로는 사라짐으로, ping Trace에는 목록이 없다", async () => {
    const simulator = open(fourRouterRipDocument);
    simulator.dispatch({ type: "rip/disable", deviceId: RIP_SQUARE.r4 });
    const changes = simulator.getRouteChanges(lastExchange(simulator).id)!;
    expect(changes.filter(change => change.device.deviceId === RIP_SQUARE.r4).map(change => change.after)).toEqual([
      undefined, undefined, undefined, undefined,
    ]);
    await pingWorks(simulator);
    const ping = simulator.getSnapshot().traces.find(summary => summary.kind === "ping")!;
    expect(simulator.getRouteChanges(ping.id)).toBeUndefined();
  });
});
