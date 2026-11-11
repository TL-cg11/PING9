// RIP 모듈: 경로 교환 1회로 경로를 주고받고 배운다 (T11.2.2)
import { PORT_NAMES, validateTrace } from "@ping9/shared";
import type { Command, RouteEntryView, RouterDevice, TopologyDocument, Trace } from "@ping9/shared";
import { RIP_LAB, threeRouterRipDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../../index";
import type { Simulator } from "../../index";

const [GI0, GI1, GI2] = PORT_NAMES.router as readonly [string, string, string, ...string[]];
const RIP_ROUTERS = [RIP_LAB.r1, RIP_LAB.r2, RIP_LAB.r3] as const;

function open(document: TopologyDocument = threeRouterRipDocument) {
  const simulator = createSimulator();
  expect(simulator.load(document)).toEqual({ ok: true });
  return simulator;
}

const tableOf = (simulator: Simulator, deviceId: string): readonly RouteEntryView[] => {
  const view = simulator.getSnapshot().views[deviceId];
  return view?.kind === "router" ? view.routingTable : [];
};
const ripRoutes = (simulator: Simulator, deviceId: string) =>
  tableOf(simulator, deviceId).filter(route => route.source === "rip")
    .map(route => `${route.network}/${route.mask} [${route.distance}/${route.metric}] via ${route.nextHop} ${route.port}`);

async function ping(simulator: Simulator, from: string, to: string): Promise<string> {
  const result = await simulator.console(from).exec(`ping -n 1 ${to}`);
  return result.lines.map(line => (line.kind === "text" ? line.text : "")).join("\n");
}

const sentEntries = (trace: Trace, deviceId: string, port: string) =>
  trace.events.filter(event => event.reason.code === "RIP_RESPONSE_SENT" && event.deviceId === deviceId && event.outPort === port)
    .flatMap(event => event.frame.rip?.entries.map(entry => entry.network) ?? []);

/** RIP 구성을 바꾼 문서 */
function withRip(document: TopologyDocument, deviceId: string, rip: RouterDevice["config"]["rip"]): TopologyDocument {
  return {
    ...document,
    devices: document.devices.map(device => device.id === deviceId && device.kind === "router"
      ? { ...device, config: { ...device.config, ...(rip === undefined ? { rip: undefined } : { rip }) } }
      : device),
  } as TopologyDocument;
}

describe("완료 기준: Router 3대 일렬", () => {
  test("경로 교환 1회로 양 끝이 [120/2]로 배워 ping이 된다", async () => {
    // RIP 없이는 PC1 → PC2가 안 된다 (Static도 없음)
    const plain = open(RIP_ROUTERS.reduce((document, id) => withRip(document, id, undefined), threeRouterRipDocument));
    expect(await ping(plain, RIP_LAB.pc1.id, RIP_LAB.pc2.ip)).not.toContain("bytes=32");

    const simulator = open();
    const trace = simulator.exchangeRoutes()!;
    expect(trace.result.status).toBe("success");
    expect(validateTrace(trace).ok).toBe(true);

    expect(ripRoutes(simulator, RIP_LAB.r1)).toEqual([
      `10.0.3.0/255.255.255.0 [120/2] via 10.0.12.2 ${GI1}`,
      `10.0.23.0/255.255.255.252 [120/1] via 10.0.12.2 ${GI1}`,
    ]);
    expect(ripRoutes(simulator, RIP_LAB.r3)).toEqual([
      `10.0.1.0/255.255.255.0 [120/2] via 10.0.23.1 ${GI0}`,
      `10.0.12.0/255.255.255.252 [120/1] via 10.0.23.1 ${GI0}`,
    ]);
    expect(ripRoutes(simulator, RIP_LAB.r2)).toEqual([
      `10.0.1.0/255.255.255.0 [120/1] via 10.0.12.1 ${GI0}`,
      `10.0.3.0/255.255.255.0 [120/1] via 10.0.23.2 ${GI1}`,
    ]);
    expect(await ping(simulator, RIP_LAB.pc1.id, RIP_LAB.pc2.ip)).toContain("bytes=32");
  });

  test("show ip route에 R 줄이 나온다", async () => {
    const simulator = open();
    simulator.exchangeRoutes();
    const port = simulator.console(RIP_LAB.r1);
    await port.exec("enable");
    const lines = (await port.exec("show ip route")).lines.map(line => (line.kind === "text" ? line.text : ""));
    expect(lines.find(line => line.startsWith("R "))).toMatch(/^R\s+10\.0\.3\.0\/24\s+120\/2\s+10\.0\.12\.2\s+GigabitEthernet0\/1$/);
  });

  test("RIP Router가 없으면 실행하지 않는다", () => {
    const simulator = createSimulator();
    expect(simulator.exchangeRoutes()).toBeNull();
  });

  test("같은 문서로 두 번 교환하면 같은 사건이 같은 순서로 일어난다 (AD-6)", () => {
    const strip = (trace: Trace) => trace.events.map(({ seq, time, reason, deviceId, inPort, outPort }) =>
      ({ seq, time, reason, deviceId, inPort, outPort }));
    const first = open().exchangeRoutes()!;
    const second = open().exchangeRoutes()!;
    expect(strip(second)).toEqual(strip(first));
  });
});

describe("보내기 규칙", () => {
  test("split horizon: R2는 R1에게서 배운 10.0.1.0을 R1 쪽으로 알리지 않는다", () => {
    const trace = open().exchangeRoutes()!;
    expect(sentEntries(trace, RIP_LAB.r2, GI0)).not.toContain("10.0.1.0");
    expect(sentEntries(trace, RIP_LAB.r2, GI1)).toContain("10.0.1.0");
  });

  test("passive 인터페이스로는 보내지 않지만 듣고 배운다", () => {
    const simulator = open(withRip(threeRouterRipDocument, RIP_LAB.r2, { networks: ["10.0.0.0"], passiveInterfaces: [GI1] }));
    const trace = simulator.exchangeRoutes()!;
    expect(trace.events.filter(event => event.deviceId === RIP_LAB.r2 && event.outPort === GI1 && event.layer === "RIP")).toEqual([]);
    expect(ripRoutes(simulator, RIP_LAB.r2)).toContain(`10.0.3.0/255.255.255.0 [120/1] via 10.0.23.2 ${GI1}`);
    // R3은 R2에게서 아무것도 듣지 못한다
    expect(ripRoutes(simulator, RIP_LAB.r3)).toEqual([]);
  });

  test("`network`에 없는 인터페이스는 참여하지 않고, 그 인터페이스로 온 RIP는 버린다", () => {
    // R3의 LAN을 192.168.3.0으로 바꾸면 10.0.0.0에 들지 않는다
    const document = {
      ...threeRouterRipDocument,
      devices: threeRouterRipDocument.devices.map(device => device.id === RIP_LAB.r3 && device.kind === "router"
        ? { ...device, config: { ...device.config, interfaces: { ...device.config.interfaces, [GI1]: { adminUp: true, ip: "192.168.3.1", mask: "255.255.255.0" } } } }
        : device.id === RIP_LAB.pc2.id && device.kind === "pc"
          ? { ...device, config: { ip: "192.168.3.10", mask: "255.255.255.0", gateway: "192.168.3.1" } }
          : device),
    } as TopologyDocument;
    const simulator = open(document);
    const trace = simulator.exchangeRoutes()!;
    expect(sentEntries(trace, RIP_LAB.r3, GI1)).toEqual([]);
    expect(ripRoutes(simulator, RIP_LAB.r1).join()).not.toContain("192.168.3.0");
  });

  test("Static route는 알리지 않는다", () => {
    const simulator = open();
    simulator.dispatch({ type: "route/add", deviceId: RIP_LAB.r3, network: "172.16.0.0", mask: "255.255.0.0", nextHop: "10.0.3.10" } as Command);
    simulator.exchangeRoutes();
    expect(ripRoutes(simulator, RIP_LAB.r1).join()).not.toContain("172.16.0.0");
  });

  test("RIP를 켜지 않은 Router는 RIP를 정상 폐기(NOT_FOR_ME)하고 배우지 않는다", () => {
    const simulator = open(withRip(threeRouterRipDocument, RIP_LAB.r3, undefined));
    const trace = simulator.exchangeRoutes()!;
    const atR3 = trace.events.filter(event => event.deviceId === RIP_LAB.r3);
    expect(atR3.length).toBeGreaterThan(0);
    expect(atR3.every(event => event.action === "drop" && event.reason.code === "NOT_FOR_ME")).toBe(true);
    expect(trace.result).toEqual({ status: "success" });
  });

  test("PC는 받은 RIP 멀티캐스트를 NOT_FOR_ME로 버린다", () => {
    const trace = open().exchangeRoutes()!;
    const atPc = trace.events.filter(event => event.deviceId === RIP_LAB.pc1.id);
    expect(atPc.length).toBeGreaterThan(0);
    expect(atPc.every(event => event.reason.code === "NOT_FOR_ME")).toBe(true);
  });
});

describe("배우기", () => {
  test("교환마다 처음부터 배운다: 링크를 지우고 다시 교환하면 그 너머 경로가 사라진다", () => {
    const simulator = open();
    simulator.exchangeRoutes();
    expect(ripRoutes(simulator, RIP_LAB.r1)).toHaveLength(2);
    simulator.dispatch({ type: "link/remove", linkId: RIP_LAB.links[2] });
    simulator.exchangeRoutes();
    expect(ripRoutes(simulator, RIP_LAB.r1)).toEqual([]);
  });

  test("나가는 인터페이스가 꺼지면 교환 없이도 그 경로가 테이블에서 빠진다", () => {
    const simulator = open();
    simulator.exchangeRoutes();
    simulator.dispatch({ type: "interface/set-admin", deviceId: RIP_LAB.r1, port: GI1, adminUp: false });
    expect(ripRoutes(simulator, RIP_LAB.r1)).toEqual([]);
  });

  test("RIP를 끈 Router는 배운 경로를 버리고, 이웃도 그 Router의 LAN을 잊는다", () => {
    const simulator = open();
    simulator.dispatch({ type: "rip/disable", deviceId: RIP_LAB.r1 });
    expect(ripRoutes(simulator, RIP_LAB.r1)).toEqual([]);
    expect(ripRoutes(simulator, RIP_LAB.r2).join()).not.toContain("10.0.1.0");
  });

  test("같은 목적지에 Static이 있으면 Static이 쓰인다 (AD 1 < 120)", () => {
    const simulator = open();
    simulator.dispatch({ type: "route/add", deviceId: RIP_LAB.r1, network: "10.0.3.0", mask: "255.255.255.0", nextHop: "10.0.12.2" });
    simulator.exchangeRoutes();
    const toLan = tableOf(simulator, RIP_LAB.r1).filter(route => route.network === "10.0.3.0");
    expect(toLan.map(route => route.source)).toEqual(["static"]);
  });

  test("hop 15까지 배우고 16은 배우지 못한다 (Router 17대 일렬)", () => {
    const count = 17;
    const id = (index: number) => `00000000-0000-4000-8000-${String(3000 + index).padStart(12, "0")}`;
    const linkId = (index: number) => `00000000-0000-4000-8000-${String(4000 + index).padStart(12, "0")}`;
    // Router i: GI0은 10.0.i.2/24 (왼쪽), GI1은 10.0.(i+1).1/24 (오른쪽). 0번의 왼쪽은 LAN 10.0.0.0/24
    const devices: RouterDevice[] = Array.from({ length: count }, (_, index) => ({
      id: id(index), name: `R${index + 1}`, kind: "router", position: { x: index * 40, y: 0 },
      config: {
        interfaces: {
          [GI0]: { adminUp: true, ip: `10.0.${index}.2`, mask: "255.255.255.0" },
          [GI1]: { adminUp: true, ip: `10.0.${index + 1}.1`, mask: "255.255.255.0" },
        },
        staticRoutes: [],
        rip: { networks: ["10.0.0.0"], passiveInterfaces: [] },
      },
    }));
    const links = Array.from({ length: count - 1 }, (_, index) => ({
      id: linkId(index), ends: [{ deviceId: id(index), port: GI1 }, { deviceId: id(index + 1), port: GI0 }] as const,
    }));
    const simulator = open({ schemaVersion: 1, devices, links });
    const trace = simulator.exchangeRoutes()!;
    expect(trace.result.status).toBe("success");
    // 첫 Router의 직접 연결 10.0.0.0/24, 10.0.1.0/24. 마지막 Router에서 10.0.1.0은 hop 15, 10.0.0.0은 hop 16
    const last = tableOf(simulator, id(count - 1));
    expect(last.find(route => route.network === "10.0.1.0")?.metric).toBe(15);
    expect(last.find(route => route.network === "10.0.0.0")).toBeUndefined();
  });

  test("경로가 25개를 넘으면 Response를 나눠 보낸다", () => {
    // Router 15대 일렬, 각 Router의 GI2에 PC가 달린 LAN. R2가 R1 쪽으로 알릴 경로는 27개다
    // (R2 오른쪽 링크 13개 + R2~R15의 LAN 14개)
    const count = 15;
    const id = (index: number) => `00000000-0000-4000-8000-${String(5000 + index).padStart(12, "0")}`;
    const pcId = (index: number) => `00000000-0000-4000-8000-${String(5100 + index).padStart(12, "0")}`;
    const linkId = (index: number) => `00000000-0000-4000-8000-${String(6000 + index).padStart(12, "0")}`;
    const lanLinkId = (index: number) => `00000000-0000-4000-8000-${String(6100 + index).padStart(12, "0")}`;
    const devices: TopologyDocument["devices"][number][] = Array.from({ length: count }, (_, index): RouterDevice => ({
      id: id(index), name: `R${index + 1}`, kind: "router", position: { x: index * 30, y: 0 },
      config: {
        interfaces: {
          [GI0]: { adminUp: true, ip: `10.0.${index}.2`, mask: "255.255.255.0" },
          [GI1]: { adminUp: true, ip: `10.0.${index + 1}.1`, mask: "255.255.255.0" },
          [GI2]: { adminUp: true, ip: `10.100.${index}.1`, mask: "255.255.255.0" },
        },
        staticRoutes: [],
        rip: { networks: ["10.0.0.0"], passiveInterfaces: [] },
      },
    }));
    for (let index = 0; index < count; index += 1) {
      devices.push({ id: pcId(index), name: `PC${index + 1}`, kind: "pc", position: { x: index * 30, y: 60 },
        config: { ip: `10.100.${index}.10`, mask: "255.255.255.0", gateway: `10.100.${index}.1` } });
    }
    const links = [
      ...Array.from({ length: count - 1 }, (_, index) => ({
        id: linkId(index), ends: [{ deviceId: id(index), port: GI1 }, { deviceId: id(index + 1), port: GI0 }] as const,
      })),
      ...Array.from({ length: count }, (_, index) => ({
        id: lanLinkId(index), ends: [{ deviceId: id(index), port: GI2 }, { deviceId: pcId(index), port: "Ethernet0" }] as const,
      })),
    ];
    const trace = open({ schemaVersion: 1, devices, links }).exchangeRoutes()!;
    expect(trace.result.status).toBe("success");
    const responses = trace.events.filter(event => event.reason.code === "RIP_RESPONSE_SENT");
    expect(Math.max(...responses.map(event => event.frame.rip!.entries.length))).toBe(25);
    // 정기 갱신에서 R2가 R1 쪽으로 보낸 전체 경로: 25개 + 2개
    const toR1 = responses.filter(event => event.deviceId === id(1) && event.outPort === GI0).map(event => event.frame.rip!.entries.length);
    expect(toR1.slice(-2)).toEqual([25, 2]);
  });
});
