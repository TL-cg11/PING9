// Linux PC 콘솔의 명령어 (T0.7). 공개 인터페이스(createSimulator)로만 확인한다.
import type { ConsoleLine, ConsoleResult, PcDevice, TopologyDocument } from "@ping9/shared";
import { TWO_PC, twoPcDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../../index";
import { readAddress, readCidr } from "./linux-commands";

const { pc1, pc2, mask } = TWO_PC;

/** PC1의 구성을 바꾼 문서. `os`를 주지 않으면 linux */
function withPc1(config: PcDevice["config"], links = twoPcDocument.links): TopologyDocument {
  return {
    ...twoPcDocument,
    links,
    devices: twoPcDocument.devices.map((device) =>
      device.id === pc1.id ? ({ ...device, config: { os: "linux", ...config } } as typeof device) : device,
    ),
  };
}

const linuxPc1 = withPc1({ ip: pc1.ip, mask });

function open(document: TopologyDocument = linuxPc1) {
  const simulator = createSimulator();
  simulator.load(document);
  const pc1Config = () =>
    (simulator.getSnapshot().document.devices.find((device) => device.id === pc1.id) as PcDevice).config;
  return { simulator, port: simulator.console(pc1.id), pc1Config };
}

const texts = (result: ConsoleResult): string[] =>
  result.lines.map((line) => (line.kind === "text" ? line.text : `[${line.kind}]`));

const errorOf = (result: ConsoleResult): ConsoleLine | undefined =>
  result.lines.find((line) => line.kind === "error");

describe("OS에 따라 명령 목록과 프롬프트가 다르다", () => {
  test("Linux PC의 프롬프트는 `이름$`, Windows는 `이름>`", () => {
    expect(open().port.prompt()).toBe("user@PC1 ~ $");
    expect(open(twoPcDocument).port.prompt()).toBe("PC1 User>");
  });

  test("Linux PC에서 `ipconfig`는 알 수 없는 명령어다", async () => {
    expect((await open().port.exec("ipconfig")).lines).toEqual([
      { kind: "text", text: "ipconfig: command not found" },
      { kind: "notice", code: "PC_UNKNOWN_COMMAND", params: { token: "ipconfig" } },
    ]);
  });

  test("Windows PC에서 `ip addr`는 오류다. `ip`는 `ipconfig`의 줄임으로 읽혀 주소 자리의 오류가 된다", async () => {
    const result = await open(twoPcDocument).port.exec("ip addr");
    expect(result.lines.map((line) => line.kind)).toEqual(["error"]);
  });

  test("OS를 바꾸면 다음 명령부터 새 목록과 프롬프트를 쓴다", async () => {
    const { simulator, port } = open(twoPcDocument);
    expect(port.prompt()).toBe("PC1 User>");

    expect(simulator.dispatch({ type: "pc/set-os", deviceId: pc1.id, os: "linux" }).ok).toBe(true);

    expect(port.prompt()).toBe("user@PC1 ~ $");
    expect(texts(await port.exec("ip a"))[0]).toMatch(/^1: lo:/);
  });

  test("실행 결과의 프롬프트도 OS의 것이다", async () => {
    expect((await open().port.exec("ip addr")).prompt).toBe("user@PC1 ~ $");
    expect((await open().port.exec("")).prompt).toBe("user@PC1 ~ $");
  });

  test("Tab 완성과 `?` 도움말이 Linux 목록을 쓴다", () => {
    const { port } = open();
    expect(port.complete("ip ro")).toBe("ip route ");
    expect(port.help("ip addr ").map((entry) => entry.token)).toEqual(
      expect.arrayContaining(["add", "del", "flush", "show"]),
    );
  });
});

describe("ip addr", () => {
  test("lo와 eth0, MAC, 주소를 CIDR로 보여 준다", async () => {
    expect(texts(await open().port.exec("ip addr"))).toEqual([
      "1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 state UNKNOWN",
      "    inet 127.0.0.1/8 scope host lo",
      "2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 state UP",
      `    link/ether ${pc1.mac} brd ff:ff:ff:ff:ff:ff`,
      `    inet ${pc1.ip}/24 scope global eth0`,
    ]);
  });

  test.each(["ip a", "ip addr show", "ip addr show eth0", "ip ad sh"])("%s도 같다", async (line) => {
    const { port } = open();
    expect(texts(await port.exec(line))).toEqual(texts(await port.exec("ip addr")));
  });

  test("IP가 없으면 eth0의 inet 줄이 없다", async () => {
    const lines = texts(await open(withPc1({})).port.exec("ip addr"));
    expect(lines).toHaveLength(4);
    expect(lines.some((line) => line.includes("scope global"))).toBe(false);
  });

  test("링크가 없으면 NO-CARRIER, state DOWN", async () => {
    expect(texts(await open(withPc1({ ip: pc1.ip, mask }, [])).port.exec("ip addr"))[2]).toBe(
      "2: eth0: <NO-CARRIER,BROADCAST,MULTICAST,UP> mtu 1500 state DOWN",
    );
  });
});

describe("ip addr add / del / flush", () => {
  test("add는 설정 패널과 같은 Command로 주소를 바꾸고 출력이 없다", async () => {
    const { port, pc1Config } = open(withPc1({}));

    expect((await port.exec("ip addr add 10.0.0.5/24 dev eth0")).lines).toEqual([]);
    expect(pc1Config()).toEqual({ ip: "10.0.0.5", mask: "255.255.255.0", os: "linux" });
  });

  test("Windows의 ipconfig와 Linux의 ip addr add는 같은 문서가 된다", async () => {
    const linux = open(withPc1({}));
    await linux.port.exec("ip addr add 10.0.0.5/30 dev eth0");

    const windows = open(withPc1({ os: "windows" }));
    await windows.port.exec("ipconfig 10.0.0.5 255.255.255.252");

    const address = ({ ip, mask: m, gateway }: PcDevice["config"]) => ({ ip, mask: m, gateway });
    expect(address(linux.pc1Config())).toEqual(address(windows.pc1Config()));
    expect(linux.pc1Config().ip).toBe("10.0.0.5");
  });

  test("add는 새 네트워크 안의 게이트웨이를 남긴다", async () => {
    const { port, pc1Config } = open(withPc1({ ip: pc1.ip, mask, gateway: "192.168.1.254" }));
    await port.exec("ip addr add 192.168.1.50/24 dev eth0");
    expect(pc1Config().gateway).toBe("192.168.1.254");
  });

  test("add는 새 네트워크 밖이 된 게이트웨이를 지운다", async () => {
    const { port, pc1Config } = open(withPc1({ ip: pc1.ip, mask, gateway: "192.168.1.254" }));
    expect(errorOf(await port.exec("ip addr add 10.0.0.5/24 dev eth0"))).toBeUndefined();
    expect(pc1Config()).toEqual({ ip: "10.0.0.5", mask: "255.255.255.0", os: "linux" });
  });

  test("다른 장비와 같은 IP면 바꾸고 알린다 (FR-27)", async () => {
    const result = await open().port.exec(`ip addr add ${pc2.ip}/24 dev eth0`);
    expect(result.lines.map((line) => line.kind)).toEqual(["notice"]);
  });

  test("reducer의 규칙을 그대로 따른다: 네트워크 주소는 거부", async () => {
    expect(errorOf(await open().port.exec("ip addr add 10.0.0.0/24 dev eth0"))).toMatchObject({
      code: "IP_IS_NETWORK_ADDRESS",
    });
  });

  test("del은 지금 주소와 길이가 같을 때만 지운다", async () => {
    const { port, pc1Config } = open(withPc1({ ip: pc1.ip, mask, gateway: "192.168.1.254" }));

    expect(errorOf(await port.exec(`ip addr del ${pc1.ip}/16 dev eth0`))).toEqual({
      kind: "error",
      code: "PC_ADDRESS_NOT_FOUND",
      params: { deviceId: pc1.id, ip: `${pc1.ip}/16` },
    });
    expect(pc1Config().ip).toBe(pc1.ip);

    expect((await port.exec(`ip addr del ${pc1.ip}/24 dev eth0`)).lines).toEqual([]);
    expect(pc1Config()).toEqual({ os: "linux" });
  });

  test("flush는 주소와 게이트웨이를 지운다", async () => {
    const { port, pc1Config } = open(withPc1({ ip: pc1.ip, mask, gateway: "192.168.1.254" }));
    expect((await port.exec("ip addr flush dev eth0")).lines).toEqual([]);
    expect(pc1Config()).toEqual({ os: "linux" });
  });

  test("eth0가 아닌 인터페이스는 해석 오류", async () => {
    expect(errorOf(await open().port.exec("ip addr add 10.0.0.5/24 dev eth1"))?.kind).toBe("error");
  });
});

describe("ip route add / del default", () => {
  test("기본 게이트웨이를 넣고 지운다", async () => {
    const { port, pc1Config } = open();

    expect((await port.exec("ip route add default via 192.168.1.254")).lines).toEqual([]);
    expect(pc1Config().gateway).toBe("192.168.1.254");

    expect((await port.exec("ip route del default")).lines).toEqual([]);
    expect(pc1Config()).toEqual({ ip: pc1.ip, mask, os: "linux" });
  });

  test("주소가 없으면 거부한다", async () => {
    expect(errorOf(await open(withPc1({})).port.exec("ip route add default via 192.168.1.254"))).toMatchObject({
      code: "PC_ADDRESS_INCOMPLETE",
    });
  });

  test("다른 네트워크의 게이트웨이는 거부한다", async () => {
    expect(errorOf(await open().port.exec("ip route add default via 10.0.0.1"))).toMatchObject({
      code: "GATEWAY_NOT_IN_NETWORK",
    });
  });
});

describe("ifconfig (옛 명령)", () => {
  test("eth0과 lo를 실제 형식으로 보여 준다. 브로드캐스트 주소를 계산한다", async () => {
    expect(texts(await open().port.exec("ifconfig"))).toEqual([
      "eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500",
      `        inet ${pc1.ip}  netmask ${mask}  broadcast 192.168.1.255`,
      `        ether ${pc1.mac}  txqueuelen 1000  (Ethernet)`,
      "",
      "lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536",
      "        inet 127.0.0.1  netmask 255.0.0.0",
      "        loop  txqueuelen 1000  (Local Loopback)",
    ]);
  });

  test("ifconfig eth0은 eth0만", async () => {
    expect(texts(await open().port.exec("ifconfig eth0"))).toHaveLength(3);
  });

  test("링크가 없으면 RUNNING이 없고, IP가 없으면 inet 줄이 없다", async () => {
    expect(texts(await open(withPc1({}, [])).port.exec("ifconfig eth0"))).toEqual([
      "eth0: flags=4099<UP,BROADCAST,MULTICAST>  mtu 1500",
      `        ether ${pc1.mac}  txqueuelen 1000  (Ethernet)`,
    ]);
  });

  test.each([
    ["ifconfig eth0 10.0.0.5 netmask 255.255.255.0", "255.255.255.0"],
    ["ifconfig eth0 10.0.0.5/30", "255.255.255.252"],
    ["ifconfig eth0 10.0.0.5/30 netmask 255.255.0.0", "255.255.0.0"],
  ])("%s → 마스크 %s", async (line, expectedMask) => {
    const { port, pc1Config } = open(withPc1({}));
    expect((await port.exec(line)).lines).toEqual([]);
    expect(pc1Config()).toEqual({ ip: "10.0.0.5", mask: expectedMask, os: "linux" });
  });

  test("마스크 없이 주소만 주면 지금 마스크를 쓴다", async () => {
    const { port, pc1Config } = open();
    await port.exec("ifconfig eth0 192.168.1.77");
    expect(pc1Config()).toEqual({ ip: "192.168.1.77", mask, os: "linux" });
  });

  test("마스크가 어디에도 없으면 거부한다", async () => {
    expect(errorOf(await open(withPc1({})).port.exec("ifconfig eth0 10.0.0.5"))).toMatchObject({
      code: "PC_ADDRESS_INCOMPLETE",
      params: { missing: "mask" },
    });
  });

  test("새 네트워크 밖이 된 게이트웨이는 지운다", async () => {
    const { port, pc1Config } = open(withPc1({ ip: pc1.ip, mask, gateway: "192.168.1.254" }));
    await port.exec("ifconfig eth0 10.0.0.5/24");
    expect(pc1Config().gateway).toBeUndefined();
  });
});

describe("route add / del default (옛 명령)", () => {
  test("기본 게이트웨이를 넣고 지운다", async () => {
    const { port, pc1Config } = open();

    expect((await port.exec("route add default gw 192.168.1.254")).lines).toEqual([]);
    expect(pc1Config().gateway).toBe("192.168.1.254");

    expect((await port.exec("route del default")).lines).toEqual([]);
    expect(pc1Config()).toEqual({ ip: pc1.ip, mask, os: "linux" });
  });

  test("주소가 없으면 거부한다", async () => {
    expect(errorOf(await open(withPc1({})).port.exec("route add default gw 192.168.1.254"))).toMatchObject({
      code: "PC_ADDRESS_INCOMPLETE",
    });
  });

  test("다른 네트워크의 게이트웨이는 거부한다", async () => {
    expect(errorOf(await open().port.exec("route add default gw 10.0.0.1"))).toMatchObject({
      code: "GATEWAY_NOT_IN_NETWORK",
    });
  });
});

describe("readAddress", () => {
  test("주소만, 주소와 길이 모두 받는다", () => {
    expect(readAddress("10.0.0.5")).toEqual({ ok: true, value: "10.0.0.5" });
    expect(readAddress("10.0.0.5/24")).toEqual({ ok: true, value: "10.0.0.5/24" });
  });

  test("틀린 주소와 길이는 거부한다", () => {
    const code = (text: string) => {
      const result = readAddress(text);
      return result.ok ? null : result.error.code;
    };
    expect(code("10.0.0")).toBe("INVALID_IPV4");
    expect(code("10.0.0.5/40")).toBe("CLI_INVALID_VALUE");
  });
});

describe("readCidr", () => {
  test.each([
    ["10.0.0.2/24", "10.0.0.2/24"],
    ["10.0.0.2/0", "10.0.0.2/0"],
    ["10.0.0.2/32", "10.0.0.2/32"],
    ["10.0.0.2/08", "10.0.0.2/8"],
  ])("%s → %s", (input, value) => {
    expect(readCidr(input)).toEqual({ ok: true, value });
  });

  test.each([
    ["10.0.0.2", "CLI_INVALID_VALUE"],
    ["10.0.0.2/", "CLI_INVALID_VALUE"],
    ["10.0.0.2/33", "CLI_INVALID_VALUE"],
    ["10.0.0.2/-1", "CLI_INVALID_VALUE"],
    ["10.0.0.2/2x", "CLI_INVALID_VALUE"],
    ["/24", "INVALID_IPV4"],
    ["10.0.0/24", "INVALID_IPV4"],
  ])("%s → %s", (input, code) => {
    const result = readCidr(input);
    expect(result.ok ? null : result.error.code).toBe(code);
  });

  test("오류에 담는 글은 64자까지", () => {
    const result = readCidr(`10.0.0.2/${"1".repeat(100)}`);
    expect(result.ok ? null : JSON.stringify(result.error).length).toBeLessThan(120);
  });
});
