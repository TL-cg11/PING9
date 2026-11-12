// 경로 교환을 저절로 실행하고 보관하기 (T11.2.3)
import { PORT_NAMES } from "@ping9/shared";
import type { RouterDevice, TopologyDocument, Trace } from "@ping9/shared";
import { RIP_LAB, threeRouterRipDocument, twoPcSwitchDocument, TWO_PC_SWITCH } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { createSimulator } from "./index";
import type { Simulator } from "./index";

const GI1 = PORT_NAMES.router[1];
const ROUTERS = [RIP_LAB.r1, RIP_LAB.r2, RIP_LAB.r3] as const;

/** RIP를 뺀 같은 토폴로지 */
const withoutRip: TopologyDocument = {
  ...threeRouterRipDocument,
  devices: threeRouterRipDocument.devices.map(device => {
    if (device.kind !== "router") return device;
    const { interfaces, staticRoutes } = device.config;
    return { ...device, config: { interfaces, staticRoutes } } satisfies RouterDevice;
  }),
};

function open(document: TopologyDocument) {
  const simulator = createSimulator();
  expect(simulator.load(document)).toEqual({ ok: true });
  return simulator;
}

const ripSummaries = (simulator: Simulator) => simulator.getSnapshot().traces.filter(summary => summary.kind === "rip");
/** 가장 최근 경로 교환의 Trace 번호. 없으면 undefined */
const lastExchange = (simulator: Simulator) => ripSummaries(simulator)[0]?.id;
const ripRouteCount = (simulator: Simulator, deviceId: string) => {
  const view = simulator.getSnapshot().views[deviceId];
  return view?.kind === "router" ? view.routingTable.filter(route => route.source === "rip").length : 0;
};

/** 그 Router가 RIP로 배운 경로 가운데 `network`로 가는 것이 있는가 */
const hasRipRoute = (simulator: Simulator, deviceId: string, network: string) => {
  const view = simulator.getSnapshot().views[deviceId];
  return view?.kind === "router" && view.routingTable.some(route => route.source === "rip" && route.network === network);
};

async function pingWorks(simulator: Simulator): Promise<boolean> {
  const result = await simulator.console(RIP_LAB.pc1.id).exec(`ping -n 1 ${RIP_LAB.pc2.ip}`);
  return result.lines.some(line => line.kind === "text" && line.text.includes("bytes=32"));
}

async function enableRipByCli(simulator: Simulator, deviceId: string) {
  const port = simulator.console(deviceId);
  for (const line of ["enable", "configure terminal", "router rip", "version 2", "no auto-summary", "network 10.0.0.0", "end"]) {
    const result = await port.exec(line);
    expect(result.lines.filter(entry => entry.kind === "error")).toEqual([]);
  }
}

describe("완료 기준", () => {
  test("CLI로 router rip / network만 치면 따로 무엇을 하지 않아도 ping이 된다", async () => {
    const simulator = open(withoutRip);
    expect(await pingWorks(simulator)).toBe(false);
    for (const id of ROUTERS) await enableRipByCli(simulator, id);
    expect(await pingWorks(simulator)).toBe(true);
    expect(ripSummaries(simulator)).toMatchObject([{ kind: "rip", status: "success", routers: 3, learned: 6 }]);
  });
});

describe("언제 교환하나", () => {
  test("인터페이스, 링크, 장비 추가는 교환한다", () => {
    const simulator = open(threeRouterRipDocument);
    for (const command of [
      { type: "interface/set-admin", deviceId: RIP_LAB.r2, port: GI1, adminUp: false },
      { type: "interface/set-admin", deviceId: RIP_LAB.r2, port: GI1, adminUp: true },
      { type: "link/remove", linkId: RIP_LAB.links[3] },
      { type: "device/add", id: "00000000-0000-4000-8000-000000002999", kind: "switch", position: { x: 0, y: 0 } },
    ] as const) {
      const before = lastExchange(simulator);
      expect(simulator.dispatch(command).ok).toBe(true);
      expect(lastExchange(simulator)).not.toBe(before);
    }
  });

  test("장비 옮기기, PC 설정 바꾸기는 교환하지 않는다", () => {
    const simulator = open(threeRouterRipDocument);
    const before = lastExchange(simulator);
    expect(simulator.dispatch({ type: "device/move", deviceId: RIP_LAB.r1, position: { x: 1, y: 1 } }).ok).toBe(true);
    expect(simulator.dispatch({ type: "pc/set-ip", deviceId: RIP_LAB.pc1.id, ip: "10.0.1.11", mask: "255.255.255.0", gateway: "10.0.1.1" }).ok)
      .toBe(true);
    expect(lastExchange(simulator)).toBe(before);
  });

  test("Router에 꽂힌 PC의 포트를 끄면 교환해서 그 LAN을 잊고, 켜면 다시 배워 ping이 된다 (T0.14)", async () => {
    const simulator = open(threeRouterRipDocument);
    const first = lastExchange(simulator);
    expect(hasRipRoute(simulator, RIP_LAB.r1, "10.0.3.0")).toBe(true);

    // PC2의 포트가 꺼지면 R3의 그 인터페이스에 신호가 없어 10.0.3.0/24가 연결 경로에서 빠진다
    expect(simulator.dispatch({ type: "interface/set-admin", deviceId: RIP_LAB.pc2.id, port: "Ethernet0", adminUp: false }).ok).toBe(true);
    const whileOff = lastExchange(simulator);
    expect(whileOff).not.toBe(first);
    expect(hasRipRoute(simulator, RIP_LAB.r1, "10.0.3.0")).toBe(false);

    expect(simulator.dispatch({ type: "interface/set-admin", deviceId: RIP_LAB.pc2.id, port: "Ethernet0", adminUp: true }).ok).toBe(true);
    expect(lastExchange(simulator)).not.toBe(whileOff);
    expect(hasRipRoute(simulator, RIP_LAB.r1, "10.0.3.0")).toBe(true);
    expect(await pingWorks(simulator)).toBe(true);
  });

  test("끈 적 없는 PC의 포트를 켜는 것은 달라지는 것이 없어 교환하지 않는다 (T0.14)", () => {
    const simulator = open(threeRouterRipDocument);
    const before = lastExchange(simulator);
    expect(simulator.dispatch({ type: "interface/set-admin", deviceId: RIP_LAB.pc1.id, port: "Ethernet0", adminUp: true }).ok).toBe(true);
    expect(lastExchange(simulator)).toBe(before);
  });

  test("RIP Router가 없으면 교환하지 않는다", () => {
    const simulator = open(twoPcSwitchDocument);
    simulator.dispatch({ type: "interface/set-admin", deviceId: TWO_PC_SWITCH.sw1.id, port: "FastEthernet0/1", adminUp: false });
    expect(ripSummaries(simulator)).toEqual([]);
  });

  test("가운데 Router의 RIP를 끄면 양 끝이 서로를 잊는다", async () => {
    const simulator = open(threeRouterRipDocument);
    simulator.dispatch({ type: "rip/disable", deviceId: RIP_LAB.r2 });
    expect(ripRouteCount(simulator, RIP_LAB.r1)).toBe(0);
    expect(ripRouteCount(simulator, RIP_LAB.r3)).toBe(0);
    expect(await pingWorks(simulator)).toBe(false);
  });

  test("마지막 RIP Router를 끄면 배운 경로가 모두 사라진다", () => {
    const simulator = open(threeRouterRipDocument);
    for (const id of ROUTERS) simulator.dispatch({ type: "rip/disable", deviceId: id });
    expect(ROUTERS.map(id => ripRouteCount(simulator, id))).toEqual([0, 0, 0]);
  });
});

describe("열기와 보관", () => {
  test("RIP 문서를 열면 바로 배워 ping이 된다", async () => {
    const simulator = open(threeRouterRipDocument);
    expect(ripSummaries(simulator)).toMatchObject([{ routers: 3, learned: 6 }]);
    expect(await pingWorks(simulator)).toBe(true);
  });

  test("교환을 여러 번 해도 목록의 RIP Trace는 하나이고 ping Trace는 그대로다", async () => {
    const simulator = open(threeRouterRipDocument);
    await pingWorks(simulator);
    const pings = simulator.getSnapshot().traces.filter(summary => summary.kind === "ping");
    expect(pings).toHaveLength(1);
    for (let index = 0; index < 5; index += 1) {
      simulator.dispatch({ type: "interface/set-admin", deviceId: RIP_LAB.r3, port: GI1, adminUp: index % 2 === 1 });
    }
    expect(ripSummaries(simulator)).toHaveLength(1);
    expect(simulator.getSnapshot().traces.filter(summary => summary.kind === "ping")).toEqual(pings);
    expect(simulator.getTrace(lastExchange(simulator)!)).toBeDefined();
  });

  test("같은 순서의 dispatch를 두 Simulator에 하면 같은 경로 교환이 일어난다 (AD-6)", () => {
    const run = () => {
      const simulator = open(threeRouterRipDocument);
      simulator.dispatch({ type: "link/remove", linkId: RIP_LAB.links[1] });
      return simulator.getTrace(lastExchange(simulator)!)!;
    };
    const strip = (trace: Trace) => trace.events.map(({ time, deviceId, inPort, outPort, reason }) => ({ time, deviceId, inPort, outPort, reason }));
    expect(strip(run())).toEqual(strip(run()));
  });
});

describe("clear ip route *", () => {
  test("출력 없이 경로 교환 1회", async () => {
    const simulator = open(threeRouterRipDocument);
    const before = lastExchange(simulator);
    const port = simulator.console(RIP_LAB.r1);
    await port.exec("enable");
    expect((await port.exec("clear ip route *")).lines).toEqual([]);
    expect(lastExchange(simulator)).not.toBe(before);
    expect(ripRouteCount(simulator, RIP_LAB.r1)).toBe(2);
  });

  test("Switch에는 없는 명령이다", async () => {
    const simulator = open(twoPcSwitchDocument);
    const port = simulator.console(TWO_PC_SWITCH.sw1.id);
    await port.exec("enable");
    expect((await port.exec("clear ip route *")).lines).toMatchObject([{ code: "CLI_UNKNOWN_COMMAND" }]);
  });

  test("RIP Router가 없으면 아무것도 하지 않는다", async () => {
    const simulator = open(withoutRip);
    const port = simulator.console(RIP_LAB.r1);
    await port.exec("enable");
    expect((await port.exec("clear ip route *")).lines).toEqual([]);
    expect(ripSummaries(simulator)).toEqual([]);
  });
});

