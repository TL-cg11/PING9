// T0.14: PC 포트 끄고 켜기와 라우팅 표 보기. 공개 인터페이스(createSimulator)로만 확인한다.
import type { Command, ConsoleResult, PcConfig, PcDevice, TopologyDocument } from "@ping9/shared";
import { TWO_PC, twoPcDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../../index";

const { pc1, pc2, mask } = TWO_PC;
const GATEWAY = "192.168.1.254";

/** PC1의 구성만 바꾼 문서 */
function withPc1(config: PcConfig, document: TopologyDocument = twoPcDocument): TopologyDocument {
  return {
    ...document,
    devices: document.devices.map((device) =>
      device.id === pc1.id ? ({ ...device, config } as typeof device) : device,
    ),
  };
}

function open(document: TopologyDocument = twoPcDocument) {
  const simulator = createSimulator();
  expect(simulator.load(document)).toEqual({ ok: true });
  const pc1Config = () =>
    (simulator.getSnapshot().document.devices.find((device) => device.id === pc1.id) as PcDevice).config;
  const statusOf = (deviceId: string) => simulator.getSnapshot().views[deviceId]?.ports[0]?.status;
  return { simulator, port: simulator.console(pc1.id), pc1Config, statusOf };
}

const texts = (result: ConsoleResult): string[] =>
  result.lines.map((line) => {
    if (line.kind === "text") return line.text;
    if (line.kind === "trace") return `[trace ${line.traceId}]`;
    return `[${line.kind} ${"code" in line ? line.code : ""}]`;
  });

const setAdmin = (fields: Record<string, unknown>) =>
  ({ type: "interface/set-admin", deviceId: pc1.id, port: "Ethernet0", adminUp: false, ...fields }) as Command;

describe("interface/set-admin (PC)", () => {
  test("끄면 adminUp: false, PC는 admin-down, 상대는 peer-down. 켜면 true로 남고 up", () => {
    const { simulator, pc1Config, statusOf } = open();

    expect(simulator.dispatch(setAdmin({})).ok).toBe(true);
    expect(pc1Config()).toEqual({ ip: pc1.ip, mask, adminUp: false });
    expect(statusOf(pc1.id)).toBe("admin-down");
    expect(statusOf(pc2.id)).toBe("peer-down");

    expect(simulator.dispatch(setAdmin({ adminUp: true })).ok).toBe(true);
    expect(pc1Config()).toEqual({ ip: pc1.ip, mask, adminUp: true });
    expect(statusOf(pc1.id)).toBe("up");
    expect(statusOf(pc2.id)).toBe("up");
  });

  test("칸이 없는 옛 문서는 켜짐", () => {
    expect(open().statusOf(pc1.id)).toBe("up");
  });

  test("끈 채로 저장한 문서를 열면 꺼짐", () => {
    expect(open(withPc1({ ip: pc1.ip, mask, adminUp: false })).statusOf(pc1.id)).toBe("admin-down");
  });

  test("IP·게이트웨이는 그대로 둔다 (결정 4)", () => {
    const { simulator, pc1Config } = open(withPc1({ ip: pc1.ip, mask, gateway: GATEWAY }));
    simulator.dispatch(setAdmin({}));
    expect(pc1Config()).toEqual({ ip: pc1.ip, mask, gateway: GATEWAY, adminUp: false });
  });

  test.each([
    ["Ethernet0이 아닌 포트", { port: "Ethernet1" }, "UNKNOWN_PORT"],
    ["줄여 쓴 포트", { port: "eth0" }, "UNKNOWN_PORT"],
    ["글이 아닌 포트", { port: 0 }, "UNKNOWN_PORT"],
    ["참거짓이 아닌 값", { adminUp: "down" }, "DOCUMENT_INVALID_SHAPE"],
    ["빠진 값", { adminUp: undefined }, "DOCUMENT_INVALID_SHAPE"],
  ])("%s: 거부하고 문서를 바꾸지 않는다", (_name, fields, code) => {
    const { simulator } = open();
    const before = simulator.getSnapshot();
    expect(simulator.dispatch(setAdmin(fields))).toMatchObject({ ok: false, error: { code } });
    expect(simulator.getSnapshot()).toBe(before);
  });
});

describe("엔진: 꺼진 PC 포트", () => {
  test("꺼진 PC에서 ping은 보내지 못한 회차다 (IF_DOWN). 펭귄이 출발하지 않는다", async () => {
    const { simulator, port } = open(withPc1({ ip: pc1.ip, mask, adminUp: false }));
    expect(texts(await port.exec("ping -n 2 192.168.1.2"))).toEqual([
      "Pinging 192.168.1.2 with 32 bytes of data:",
      "PING: transmit failed. General failure.",
      "[trace 1]",
      "PING: transmit failed. General failure.",
      "[trace 2]",
      "",
      "Ping statistics for 192.168.1.2:",
      "    Packets: Sent = 2, Received = 0, Lost = 2 (100% loss)",
    ]);
    const events = simulator.getTrace(1)?.events ?? [];
    expect(events.map((event) => event.reason.code)).toEqual(["IF_DOWN"]);
    expect(events.some((event) => event.action === "create" || event.linkId !== undefined)).toBe(false);
  });

  test("IP가 없어도 꺼져 있으면 IF_DOWN", async () => {
    const { simulator, port } = open(withPc1({ adminUp: false }));
    await port.exec("ping -n 1 192.168.1.2");
    expect(simulator.getTrace(1)?.events.map((event) => event.reason.code)).toEqual(["IF_DOWN"]);
  });

  test("Linux는 한 줄로 끝난다", async () => {
    const { port } = open(withPc1({ ip: pc1.ip, mask, os: "linux", adminUp: false }));
    expect(texts(await port.exec("ping -c 4 192.168.1.2"))).toEqual([
      "ping: connect: Network is unreachable",
      "[trace 1]",
    ]);
  });

  test("꺼진 PC로 ping하면 받는 쪽에서 IF_DOWN으로 버린다", async () => {
    const { simulator } = open(withPc1({ ip: pc1.ip, mask, adminUp: false }));
    const result = await simulator.console(pc2.id).exec("ping -n 1 192.168.1.1");
    expect(texts(result)).toContain("Reply from 192.168.1.2: Destination host unreachable.");
    const drops = (simulator.getTrace(1)?.events ?? []).filter((event) => event.action === "drop");
    expect(drops.find((event) => event.deviceId === pc1.id)?.reason).toEqual({
      code: "IF_DOWN",
      params: { device: { deviceId: pc1.id, deviceName: pc1.name }, port: "Ethernet0" },
    });
  });

  test("끄면 ARP 테이블을 비우고, 다시 켜면 ping이 된다", async () => {
    const { simulator, port } = open();
    await port.exec("ping -n 1 192.168.1.2");
    const arpOf = () => {
      const view = simulator.getSnapshot().views[pc1.id];
      return view?.kind === "pc" ? view.arpTable : undefined;
    };
    expect(arpOf()?.length).toBe(1);

    simulator.dispatch(setAdmin({}));
    expect(arpOf()).toEqual([]);

    simulator.dispatch(setAdmin({ adminUp: true }));
    expect(texts(await port.exec("ping -n 1 192.168.1.2"))).toContain("Reply from 192.168.1.2: bytes=32 time=4ms TTL=128");
  });

  test("꺼진 Windows PC의 tracert는 첫 hop을 보내지 못한다 (결정 10). 보내지 못한 hop의 줄은 T11.4.1의 것", async () => {
    const { port } = open(withPc1({ ip: pc1.ip, mask, adminUp: false }));
    expect(texts(await port.exec("tracert 192.168.1.2"))).toContain("  1  Transmit error: code 1231.");
  });

  test("꺼진 Linux PC의 traceroute는 connect: Network is unreachable", async () => {
    const { port } = open(withPc1({ ip: pc1.ip, mask, os: "linux", adminUp: false }));
    expect(texts(await port.exec("traceroute 192.168.1.2"))).toContain("connect: Network is unreachable");
  });
});

const RULE = "=".repeat(75);
const routePrint = (routes: readonly string[]) => [
  RULE,
  "Interface List",
  "  2...02 00 00 00 01 00 ......Ethernet0",
  RULE,
  "",
  "IPv4 Route Table",
  RULE,
  "Active Routes:",
  "Network Destination        Netmask          Gateway       Interface  Metric",
  ...routes,
  RULE,
  "Persistent Routes:",
  "  None",
];

describe("Windows route print", () => {
  test("게이트웨이·내 네트워크·내 주소 세 줄", async () => {
    const { port } = open(withPc1({ ip: pc1.ip, mask, gateway: GATEWAY }));
    expect(texts(await port.exec("route print"))).toEqual(routePrint([
      "          0.0.0.0          0.0.0.0    192.168.1.254      192.168.1.1     25",
      "      192.168.1.0    255.255.255.0         On-link       192.168.1.1    281",
      "      192.168.1.1  255.255.255.255         On-link       192.168.1.1    281",
    ]));
  });

  test("게이트웨이가 없으면 0.0.0.0 줄만 빠진다", async () => {
    expect(texts(await open().port.exec("route print"))).toEqual(routePrint([
      "      192.168.1.0    255.255.255.0         On-link       192.168.1.1    281",
      "      192.168.1.1  255.255.255.255         On-link       192.168.1.1    281",
    ]));
  });

  test.each([
    ["IP가 없으면", { gateway: undefined, ip: undefined, mask: undefined }],
    ["포트가 꺼져 있으면", { adminUp: false }],
  ])("%s 경로 줄이 없다", async (_name, change) => {
    const config = { ip: pc1.ip, mask, gateway: GATEWAY, ...change } as PcConfig;
    const clean = Object.fromEntries(Object.entries(config).filter(([, value]) => value !== undefined)) as PcConfig;
    expect(texts(await open(withPc1(clean)).port.exec("route print"))).toEqual(routePrint([]));
  });

  test("대소문자를 구분하지 않는다 (T0.9)", async () => {
    expect(texts(await open().port.exec("ROUTE PRINT"))).toEqual(texts(await open().port.exec("route print")));
  });
});

const linux = (config: PcConfig = { ip: pc1.ip, mask, gateway: GATEWAY }, document?: TopologyDocument) =>
  open(withPc1({ os: "linux", ...config }, document));

describe("Linux ip route, route -n", () => {
  const ROUTE_N_HEAD = [
    "Kernel IP routing table",
    "Destination     Gateway         Genmask         Flags Metric Ref    Use Iface",
  ];

  test("ip route: 기본 경로와 내 네트워크", async () => {
    expect(texts(await linux().port.exec("ip route"))).toEqual([
      "default via 192.168.1.254 dev eth0",
      "192.168.1.0/24 dev eth0 proto kernel scope link src 192.168.1.1",
    ]);
  });

  test.each(["ip route show", "ip r", "ip ro sh"])("%s도 같다", async (line) => {
    expect(texts(await linux().port.exec(line))).toEqual(texts(await linux().port.exec("ip route")));
  });

  test("route -n: 같은 경로를 옛 형식으로", async () => {
    expect(texts(await linux().port.exec("route -n"))).toEqual([
      ...ROUTE_N_HEAD,
      "0.0.0.0         192.168.1.254   0.0.0.0         UG    0      0        0 eth0",
      "192.168.1.0     0.0.0.0         255.255.255.0   U     0      0        0 eth0",
    ]);
  });

  test("게이트웨이가 없으면 내 네트워크 줄만", async () => {
    const { port } = linux({ ip: pc1.ip, mask });
    expect(texts(await port.exec("ip route"))).toEqual([
      "192.168.1.0/24 dev eth0 proto kernel scope link src 192.168.1.1",
    ]);
    expect(texts(await port.exec("route -n"))).toEqual([
      ...ROUTE_N_HEAD,
      "192.168.1.0     0.0.0.0         255.255.255.0   U     0      0        0 eth0",
    ]);
  });

  test.each([
    ["IP가 없으면", {}],
    ["포트가 꺼져 있으면 (게이트웨이는 문서에 남음)", { ip: pc1.ip, mask, gateway: GATEWAY, adminUp: false }],
  ])("%s 아무 경로도 없다", async (_name, config) => {
    const { port } = linux(config);
    expect(texts(await port.exec("ip route"))).toEqual([]);
    expect(texts(await port.exec("route -n"))).toEqual(ROUTE_N_HEAD);
  });

  test("케이블이 없으면 줄 끝에 linkdown", async () => {
    const { port } = linux(undefined, { ...twoPcDocument, links: [] });
    expect(texts(await port.exec("ip route"))).toEqual([
      "default via 192.168.1.254 dev eth0 linkdown",
      "192.168.1.0/24 dev eth0 proto kernel scope link src 192.168.1.1 linkdown",
    ]);
  });

  test("대소문자를 구분한다 (T0.9)", async () => {
    expect(texts(await linux().port.exec("ip ROUTE"))[0]).toBe("[error CLI_UNKNOWN_COMMAND]");
  });
});

describe("Linux ip link, ip link set, ifconfig eth0 down/up", () => {
  const LO = [
    "1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 state UNKNOWN",
    "    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00",
  ];
  const ETH0_UP = [
    "2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 state UP",
    "    link/ether 02:00:00:00:01:00 brd ff:ff:ff:ff:ff:ff",
  ];
  const ETH0_DOWN = [
    "2: eth0: <BROADCAST,MULTICAST> mtu 1500 state DOWN",
    "    link/ether 02:00:00:00:01:00 brd ff:ff:ff:ff:ff:ff",
  ];

  test("ip link: lo와 eth0", async () => {
    expect(texts(await linux().port.exec("ip link"))).toEqual([...LO, ...ETH0_UP]);
  });

  test("ip link show eth0은 eth0만", async () => {
    expect(texts(await linux().port.exec("ip link show eth0"))).toEqual(ETH0_UP);
  });

  test.each([
    ["ip link set eth0 down", "ip link set eth0 up"],
    ["ifconfig eth0 down", "ifconfig eth0 up"],
  ])("%s는 출력 없이 끄고, 켜는 명령으로 다시 켠다", async (down, up) => {
    const { port, pc1Config, statusOf } = linux();
    expect(texts(await port.exec(down))).toEqual([]);
    expect(pc1Config().adminUp).toBe(false);
    expect(statusOf(pc1.id)).toBe("admin-down");
    expect(texts(await port.exec("ip link show"))).toEqual([...LO, ...ETH0_DOWN]);
    expect(texts(await port.exec("ip route"))).toEqual([]);

    expect(texts(await port.exec(up))).toEqual([]);
    expect(pc1Config()).toMatchObject({ adminUp: true, gateway: GATEWAY });
    expect(texts(await port.exec("ip route"))).toHaveLength(2);
  });

  test("이미 꺼진 포트를 또 꺼도 오류가 없다", async () => {
    const { port } = linux({ ip: pc1.ip, mask, adminUp: false });
    expect(texts(await port.exec("ip link set eth0 down"))).toEqual([]);
  });

  test("eth0이 아닌 이름은 해석 오류", async () => {
    const result = await linux().port.exec("ip link set eth1 down");
    expect(result.lines.map((line) => line.kind)).toEqual(["error"]);
  });

  test("ifconfig와 ip addr도 꺼진 상태를 보인다", async () => {
    const { port } = linux({ ip: pc1.ip, mask, adminUp: false });
    expect(texts(await port.exec("ifconfig eth0"))[0]).toBe("eth0: flags=4098<BROADCAST,MULTICAST>  mtu 1500");
  });
});

describe("help", () => {
  test("Windows: route print", async () => {
    expect(texts(await open().port.exec("help")).some((line) => line.includes("route print"))).toBe(true);
  });

  test("Linux: ip route, ip link, route -n, ip link set eth0 down", async () => {
    const lines = texts(await linux().port.exec("help"));
    for (const usage of ["ip route ", "ip link ", "route -n", "ip link set eth0 down", "ifconfig eth0 up"]) {
      expect(lines.some((line) => line.includes(usage))).toBe(true);
    }
  });
});
