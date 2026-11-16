// Firewall 콘솔과 iptables 명령 (T14.2.1). 공개 인터페이스(createSimulator)로만 확인한다.
import type { ConsoleLine, ConsoleResult, FirewallDevice } from "@ping9/shared";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../../simulator";
import { splitWords } from "../ios/parse";
import { parseIptables } from "./iptables";

const FW = "33333333-3333-4333-8333-333333333333";

function open() {
  const sim = createSimulator();
  expect(sim.dispatch({ type: "device/add", id: FW, kind: "firewall", position: { x: 0, y: 0 } }).ok).toBe(true);
  const port = sim.console(FW);
  const config = () => (sim.getSnapshot().document.devices[0] as FirewallDevice).config;
  return { sim, port, config };
}

const texts = (result: ConsoleResult): string[] => result.lines.map((line) => (line.kind === "text" ? line.text : `[${line.kind}]`));
const errorOf = (result: ConsoleResult): Extract<ConsoleLine, { kind: "error" }> | undefined =>
  result.lines.find((line): line is Extract<ConsoleLine, { kind: "error" }> => line.kind === "error");
const parse = (line: string) => parseIptables(splitWords(line).slice(1));

describe("Linux 콘솔", () => {
  test("프롬프트는 root이고 장비 이름을 따라 바뀐다", () => {
    const { sim, port } = open();
    expect(port.prompt()).toBe("root@FW1:~#");
    expect(sim.dispatch({ type: "device/rename", deviceId: FW, name: "edge" }).ok).toBe(true);
    expect(port.prompt()).toBe("root@edge:~#");
  });

  test("없는 명령어는 Linux의 줄과 한국어 안내를 낸다. IOS 명령어는 없다", async () => {
    const { port } = open();
    expect((await port.exec("enable")).lines).toEqual([
      { kind: "text", text: "enable: command not found" },
      { kind: "notice", code: "PC_UNKNOWN_COMMAND", params: { token: "enable" } },
    ]);
  });

  test("대소문자를 구분한다", async () => {
    const { port } = open();
    expect(texts(await port.exec("IP addr"))[0]).toBe("IP: command not found");
  });

  test("파이프와 리다이렉트는 실행하지 않는다", async () => {
    const { port } = open();
    expect(errorOf(await port.exec("iptables -L | grep DROP"))).toMatchObject({ code: "CLI_UNSUPPORTED_SYNTAX", position: 12 });
  });

  test("`ip addr`는 인터페이스 넷을 보이고, 주소를 넣고 지울 수 있다", async () => {
    const { port, config } = open();
    expect((await port.exec("ip addr add 192.168.0.1/24 dev eth2")).lines).toEqual([]);
    expect(config().interfaces["Ethernet2"]).toEqual({ adminUp: true, ip: "192.168.0.1", mask: "255.255.255.0" });
    const shown = texts(await port.exec("ip addr"));
    expect(shown.filter((line) => /^\d: /.test(line)).map((line) => line.split(":")[1]!.trim())).toEqual(["lo", "eth0", "eth1", "eth2", "eth3"]);
    expect(shown).toContain("    inet 192.168.0.1/24 scope global eth2");
    expect(texts(await port.exec("ip addr show eth2"))).toHaveLength(3);

    expect(texts(await port.exec("ip addr del 192.168.0.9/24 dev eth2"))).toEqual(["Error: ipv4: Address not found."]);
    expect((await port.exec("ip addr del 192.168.0.1/24 dev eth2")).lines).toEqual([]);
    expect(config().interfaces["Ethernet2"]).toEqual({ adminUp: true });
  });

  test("없는 인터페이스 이름은 그 자리를 가리키는 오류다", async () => {
    const { port } = open();
    expect(errorOf(await port.exec("ip addr add 10.0.0.1/24 dev eth4"))).toMatchObject({
      code: "CLI_INVALID_VALUE", params: { token: "eth4" }, position: 28,
    });
  });

  test("두 인터페이스에 겹치는 네트워크는 넣을 수 없다", async () => {
    const { port } = open();
    await port.exec("ip addr add 10.0.0.1/24 dev eth0");
    expect(errorOf(await port.exec("ip addr add 10.0.0.129/25 dev eth1"))?.code).toBe("INTERFACE_NETWORK_OVERLAP");
  });

  test("`help`는 명령어 전체와 iptables의 쓰는 법을 보인다", async () => {
    const shown = texts(await open().port.exec("help")).join("\n");
    expect(shown).toContain("ip addr add <cidr> dev <iface>");
    expect(shown).toContain("Usage: iptables -[AD] chain rule-specification");
  });

  test("Tab은 `iptables`를 완성한다", () => {
    expect(open().port.complete("ipt")).toBe("iptables ");
  });
});

describe("iptables: 규칙 넣기, 보기, 지우기", () => {
  test("-A는 끝에, -I는 앞이나 고른 자리에 넣는다", async () => {
    const { port, config } = open();
    for (const line of [
      "iptables -A INPUT -p icmp -j ACCEPT",
      "iptables -A INPUT -s 10.0.0.7/24 -j DROP",
      "iptables -I INPUT -p tcp --dport 22 -j ACCEPT",
      "iptables -I INPUT 3 -d 10.0.0.1 -j REJECT",
    ]) expect((await port.exec(line)).lines).toEqual([]);
    expect(config().filter.INPUT.rules).toEqual([
      { protocol: "tcp", destinationPort: "22", target: "ACCEPT" },
      { protocol: "icmp", target: "ACCEPT" },
      { destination: "10.0.0.1/32", target: "REJECT" },
      // 주소는 네트워크 주소로 맞춰 저장한다
      { source: "10.0.0.0/24", target: "DROP" },
    ]);
  });

  test("-L은 실제 iptables의 표 모양이다", async () => {
    const { port } = open();
    await port.exec("iptables -A INPUT -s 10.0.0.0/24 -p icmp --icmp-type echo-request -j DROP");
    await port.exec("iptables -A INPUT -i eth0 -p tcp --dport 80 -j ACCEPT");
    await port.exec("iptables -A FORWARD -d 10.0.2.10 -j REJECT");
    await port.exec("iptables -P OUTPUT DROP");
    expect(texts(await port.exec("iptables -L"))).toEqual([
      "Chain INPUT (policy ACCEPT)",
      "target     prot opt source               destination",
      "DROP       icmp --  10.0.0.0/24          anywhere             icmp echo-request",
      "ACCEPT     tcp  --  anywhere             anywhere             tcp dpt:80",
      "",
      "Chain FORWARD (policy ACCEPT)",
      "target     prot opt source               destination",
      "REJECT     all  --  anywhere             10.0.2.10            reject-with icmp-port-unreachable",
      "",
      "Chain OUTPUT (policy DROP)",
      "target     prot opt source               destination",
    ]);
    expect(texts(await port.exec("iptables -nvL INPUT --line-numbers"))).toEqual([
      "Chain INPUT (policy ACCEPT)",
      "num  target     prot opt in     out    source               destination",
      "1    DROP       icmp --  *      *      10.0.0.0/24          0.0.0.0/0            icmptype 8",
      "2    ACCEPT     tcp  --  eth0   *      0.0.0.0/0            0.0.0.0/0            tcp dpt:80",
    ]);
  });

  test("-S의 줄은 앞에 iptables를 붙여 그대로 다시 넣을 수 있다", async () => {
    const first = open();
    for (const line of [
      "iptables -A INPUT -s 10.0.0.0/24 -i eth0 -p icmp --icmp-type echo-reply -j DROP",
      "iptables -A FORWARD -o eth3 -p udp --sport 53 -j ACCEPT",
      "iptables -A OUTPUT -d 8.8.8.8 -j REJECT",
      "iptables -P FORWARD DROP",
    ]) expect((await first.port.exec(line)).lines).toEqual([]);
    const saved = texts(await first.port.exec("iptables -S"));
    expect(saved.slice(0, 3)).toEqual(["-P INPUT ACCEPT", "-P FORWARD DROP", "-P OUTPUT ACCEPT"]);
    expect(texts(await first.port.exec("iptables -S FORWARD"))).toEqual([
      "-P FORWARD DROP", "-A FORWARD -o eth3 -p udp -m udp --sport 53 -j ACCEPT",
    ]);

    const second = open();
    for (const line of saved) expect((await second.port.exec(`iptables ${line}`)).lines).toEqual([]);
    expect(second.config().filter).toEqual(first.config().filter);
  });

  test("-D는 번호로도, 같은 규칙을 써서도 지운다", async () => {
    const { port, config } = open();
    await port.exec("iptables -A INPUT -p icmp -j DROP");
    await port.exec("iptables -A INPUT -s 10.0.0.5 -j ACCEPT");
    expect((await port.exec("iptables -D INPUT -s 10.0.0.5/32 -j ACCEPT")).lines).toEqual([]);
    expect(texts(await port.exec("iptables -D INPUT -s 10.0.0.5 -j ACCEPT"))).toEqual([
      "iptables: Bad rule (does a matching rule exist in that chain?).",
    ]);
    expect(errorOf(await port.exec("iptables -D INPUT 2"))).toMatchObject({
      code: "FIREWALL_RULE_NOT_FOUND", params: { deviceId: FW, chain: "INPUT", index: 2 },
    });
    expect((await port.exec("iptables -D INPUT 1")).lines).toEqual([]);
    expect(config().filter.INPUT.rules).toEqual([]);
  });

  test("-F는 규칙만 지우고 정책은 그대로 둔다", async () => {
    const { port, config } = open();
    await port.exec("iptables -P INPUT DROP");
    await port.exec("iptables -A INPUT -p icmp -j ACCEPT");
    await port.exec("iptables -A FORWARD -p icmp -j ACCEPT");
    expect((await port.exec("iptables -F INPUT")).lines).toEqual([]);
    expect(config().filter.INPUT).toEqual({ policy: "DROP", rules: [] });
    expect(config().filter.FORWARD.rules).toHaveLength(1);
    await port.exec("iptables -F");
    expect(config().filter.FORWARD.rules).toEqual([]);
  });

  test("`sudo`를 앞에 붙여도 된다. 오류 위치는 친 줄 기준이다", async () => {
    const { port, config } = open();
    expect((await port.exec("sudo iptables -A INPUT -p icmp -j DROP")).lines).toEqual([]);
    expect(config().filter.INPUT.rules).toHaveLength(1);
    expect(errorOf(await port.exec("sudo iptables -A INPUT -p gre -j DROP"))).toMatchObject({ code: "CLI_INVALID_VALUE", position: 26 });
  });

  test("긴 옵션 이름과 프로토콜 번호도 읽는다", () => {
    expect(parse("iptables --append FORWARD --protocol 1 --source 10.0.0.0/8 --in-interface eth1 --jump DROP")).toEqual({
      ok: true,
      command: { kind: "append", chain: "FORWARD", rule: { protocol: "icmp", source: "10.0.0.0/8", inInterface: "Ethernet1", target: "DROP" } },
    });
    expect(parse("iptables -t filter -A INPUT -p all -s 0.0.0.0/0 -j ACCEPT")).toEqual({
      ok: true, command: { kind: "append", chain: "INPUT", rule: { target: "ACCEPT" } },
    });
  });
});

describe("iptables: 받지 않는 입력", () => {
  test.each([
    ["iptables", "IPTABLES_NO_COMMAND", undefined],
    ["iptables -n", "IPTABLES_NO_COMMAND", undefined],
    ["iptables -A INPUT -L", "IPTABLES_NO_COMMAND", 18],
    ["iptables -A", "CLI_INCOMPLETE_COMMAND", undefined],
    ["iptables -A INPUT -p icmp", "CLI_INCOMPLETE_COMMAND", undefined],
    ["iptables -A INPUT -j", "CLI_INCOMPLETE_COMMAND", undefined],
    ["iptables -P INPUT", "CLI_INCOMPLETE_COMMAND", undefined],
    ["iptables -A INPUT -p gre -j DROP", "CLI_INVALID_VALUE", 21],
    ["iptables -A INPUT -s 10.0.0.300 -j DROP", "INVALID_IPV4", 21],
    ["iptables -A INPUT -s 10.0.0.0/33 -j DROP", "INVALID_IPV4", 21],
    ["iptables -A INPUT -p tcp --dport 70000 -j DROP", "FIREWALL_PORT_INVALID", 33],
    ["iptables -A INPUT -p tcp --dport 90:80 -j DROP", "FIREWALL_PORT_INVALID", 33],
    ["iptables -A INPUT -i eth7 -j DROP", "CLI_INVALID_VALUE", 21],
    ["iptables -A INPUT --icmp-type 99 -p icmp -j DROP", "CLI_INVALID_VALUE", 30],
    ["iptables -A INPUT -j drop", "CLI_INVALID_VALUE", 21],
    ["iptables -P INPUT REJECT", "CLI_INVALID_VALUE", 18],
    ["iptables -I INPUT 0 -j DROP", "CLI_INVALID_VALUE", 18],
    ["iptables -L INPUT -p icmp", "CLI_INVALID_VALUE", 18],
    ["iptables -A INPUT --foo -j DROP", "CLI_INVALID_VALUE", 18],
    ["iptables -A INPUT 10.0.0.1 -j DROP", "CLI_INVALID_VALUE", 18],
    ["iptables -A input -j DROP", "IPTABLES_UNSUPPORTED", 12],
    ["iptables -t nat -A POSTROUTING -j MASQUERADE", "IPTABLES_UNSUPPORTED", 12],
    ["iptables -A INPUT -m state --state ESTABLISHED -j ACCEPT", "IPTABLES_UNSUPPORTED", 21],
    ["iptables -A INPUT ! -s 10.0.0.1 -j DROP", "IPTABLES_UNSUPPORTED", 18],
    ["iptables -A INPUT -i lo -j ACCEPT", "IPTABLES_UNSUPPORTED", 21],
    ["iptables -A INPUT -j LOG", "IPTABLES_UNSUPPORTED", 21],
    ["iptables -N mychain", "IPTABLES_UNSUPPORTED", 9],
  ] as const)("%s → %s", async (line, code, position) => {
    const { port, config } = open();
    const error = errorOf(await port.exec(line));
    expect(error?.code).toBe(code);
    expect(error?.position).toBe(position);
    expect(config().filter.INPUT.rules).toEqual([]);
  });

  test("체인과 맞지 않는 조건은 reducer가 거부한다", async () => {
    const { port } = open();
    const reasonOf = async (line: string) => errorOf(await port.exec(line))?.params;
    expect(await reasonOf("iptables -A OUTPUT -i eth0 -j DROP")).toEqual({ reason: "in-interface" });
    expect(await reasonOf("iptables -A INPUT -o eth0 -j DROP")).toEqual({ reason: "out-interface" });
    expect(await reasonOf("iptables -A INPUT --icmp-type echo-request -j DROP")).toEqual({ reason: "icmp-type" });
    expect(await reasonOf("iptables -A INPUT -p icmp --dport 80 -j DROP")).toEqual({ reason: "port" });
  });

  test("-h는 쓰는 법을 보인다", async () => {
    expect(texts(await open().port.exec("iptables -h"))[0]).toBe("Usage: iptables -[AD] chain rule-specification");
  });
});

describe("검토에서 나온 것", () => {
  test.each([
    "iptables constructor",
    "iptables -L constructor",
    "iptables -L __proto__",
    "iptables -A toString -j DROP",
    "iptables -A INPUT -p constructor -j DROP",
    "iptables -A INPUT -s constructor -j DROP",
    "iptables -A INPUT -p icmp --icmp-type hasOwnProperty -j DROP",
    "iptables -t constructor -L",
    "iptables -A INPUT -j valueOf",
  ])("Object.prototype의 이름이 든 줄(%s)도 예외 없이 오류 줄을 낸다 (AD-16)", async (line) => {
    const { port, config } = open();
    const error = errorOf(await port.exec(line));
    expect(error).toBeDefined();
    // 오류에는 친 글만 실린다
    for (const value of Object.values(error?.params ?? {})) expect(typeof value).toBe("string");
    expect(config().filter.INPUT.rules).toEqual([]);
  });

  test("iproute2의 `dev`를 넣은 형태도 받는다", async () => {
    const { port, config } = open();
    expect((await port.exec("ip link set dev eth1 down")).lines).toEqual([]);
    expect(config().interfaces["Ethernet1"]).toEqual({ adminUp: false });
    expect((await port.exec("ip link set dev eth1 up")).lines).toEqual([]);
    expect(texts(await port.exec("ip addr show dev eth1"))[0]).toMatch(/^3: eth1: /);
  });
});
