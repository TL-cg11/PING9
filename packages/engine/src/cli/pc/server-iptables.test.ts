// 서버로 쓰는 PC의 iptables (T0.21). 공개 인터페이스(createSimulator)로만 확인한다.
// 토폴로지: PC1 — R1 — SRV1. 규칙은 SRV1의 콘솔에서 건다. 서버는 포트가 하나라 INPUT과 OUTPUT만 패킷을 본다.
import { validateDocument, validateTrace } from "@ping9/shared";
import type { Command, ConsoleLine, ConsoleResult, PcDevice, Trace } from "@ping9/shared";
import { describe, expect, test } from "vitest";

import { needsRouteExchange } from "../../routing-inputs";
import { createSimulator } from "../../simulator";
import { splitWords } from "../ios/parse";
import { parseIptables } from "./iptables";

const PC1 = "11111111-1111-4111-8111-111111111111";
const SRV = "22222222-2222-4222-8222-222222222222";
const R1 = "44444444-4444-4444-8444-444444444444";

const texts = (result: ConsoleResult): string[] => result.lines.flatMap((line) => (line.kind === "text" ? [line.text] : line.kind === "trace" ? [] : [`[${line.kind}]`]));
const errorOf = (result: ConsoleResult): Extract<ConsoleLine, { kind: "error" }> | undefined =>
  result.lines.find((line): line is Extract<ConsoleLine, { kind: "error" }> => line.kind === "error");
const parse = (line: string) => parseIptables(splitWords(line).slice(1));
const PAGE = "<html><body><h1>SRV1</h1><p>PING9 web server</p></body></html>";

/** PC1(10.0.1.10, Linux) — R1 — SRV1(10.0.2.10, Server) */
async function lab() {
  const sim = createSimulator();
  const send = (command: unknown) => sim.dispatch(command as Command);
  const must = (command: unknown) => expect(send(command)).toMatchObject({ ok: true });
  must({ type: "device/add", id: PC1, kind: "pc", position: { x: 0, y: 0 }, os: "linux" });
  must({ type: "device/add", id: SRV, kind: "pc", position: { x: 400, y: 0 }, os: "server" });
  must({ type: "device/rename", deviceId: SRV, name: "SRV1" });
  must({ type: "device/add", id: R1, kind: "router", position: { x: 200, y: 0 } });
  must({ type: "link/add", id: "55555555-5555-4555-8555-555555555555", ends: [{ deviceId: PC1, port: "Ethernet0" }, { deviceId: R1, port: "GigabitEthernet0/0" }] });
  must({ type: "link/add", id: "66666666-6666-4666-8666-666666666666", ends: [{ deviceId: SRV, port: "Ethernet0" }, { deviceId: R1, port: "GigabitEthernet0/1" }] });
  must({ type: "pc/set-ip", deviceId: PC1, ip: "10.0.1.10", mask: "255.255.255.0", gateway: "10.0.1.1" });
  must({ type: "pc/set-ip", deviceId: SRV, ip: "10.0.2.10", mask: "255.255.255.0", gateway: "10.0.2.1" });
  for (const [port, ip] of [["GigabitEthernet0/0", "10.0.1.1"], ["GigabitEthernet0/1", "10.0.2.1"]] as const) {
    must({ type: "interface/set-ip", deviceId: R1, port, ip, mask: "255.255.255.0" });
    must({ type: "interface/set-admin", deviceId: R1, port, adminUp: true });
  }
  const pc = (line: string) => sim.console(PC1).exec(line);
  const raw = (line: string) => sim.console(SRV).exec(line);
  /** 오류 없이 끝나야 하는 서버 명령 */
  const srv = async (line: string) => {
    const result = await raw(line);
    expect(result.lines.filter((entry) => entry.kind === "error")).toEqual([]);
    return result;
  };
  const lastTrace = (): Trace => sim.getTrace(sim.getSnapshot().traces[0]!.id)!;
  const primaryDrop = () => {
    const trace = lastTrace();
    expect(validateTrace(trace)).toMatchObject({ ok: true });
    return trace.events[trace.result.primaryDropSeq!]!;
  };
  const config = () => (sim.getSnapshot().document.devices.find((device) => device.id === SRV) as PcDevice).config;
  return { sim, send, must, pc, raw, srv, lastTrace, primaryDrop, config };
}

const server = { deviceId: SRV, deviceName: "SRV1" };

describe("INPUT 체인은 서버로 온 패킷을 거른다", () => {
  test("규칙이 없으면 ping과 서비스가 모두 된다", async () => {
    const { pc, config } = await lab();
    expect(config().filter).toBeUndefined();
    expect(texts(await pc("ping -c 1 10.0.2.10")).join("\n")).toContain("1 received");
    expect(texts(await pc("curl http://10.0.2.10/"))).toEqual([PAGE]);
  });

  test("ping만 막는다. 어느 규칙이 막았는지 폐기 사유에 남는다 (Story 14.3)", async () => {
    const { pc, srv, primaryDrop } = await lab();
    await srv("iptables -A INPUT -p tcp --dport 22 -j ACCEPT");
    await srv("iptables -A INPUT -p icmp --icmp-type echo-request -j DROP");
    expect(texts(await pc("ping -c 1 10.0.2.10")).join("\n")).toContain("100% packet loss");
    const drop = primaryDrop();
    expect(drop.deviceId).toBe(SRV);
    expect(drop.inPort).toBe("Ethernet0");
    expect(drop.reason).toEqual({ code: "FIREWALL_BLOCKED", params: { device: server, chain: "INPUT", target: "DROP", rule: 2 } });
    expect(texts(await pc("curl http://10.0.2.10/"))).toEqual([PAGE]);
  });

  test("`--dport 80`을 DROP하면 HTTP만 시간 초과다. FTP, DNS, ping은 된다", async () => {
    const { pc, srv, primaryDrop } = await lab();
    await srv("iptables -A INPUT -p tcp --dport 80 -j DROP");
    expect(texts(await pc("curl http://10.0.2.10/"))).toEqual(["curl: (28) Failed to connect to 10.0.2.10 port 80: Connection timed out"]);
    const drop = primaryDrop();
    expect(drop.reason).toEqual({ code: "FIREWALL_BLOCKED", params: { device: server, chain: "INPUT", target: "DROP", rule: 1 } });
    expect(drop.frame.tcp).toEqual({ sourcePort: 49152, destinationPort: 80, flags: "SYN" });
    expect(texts(await pc("curl ftp://10.0.2.10/"))).toHaveLength(2);
    expect(texts(await pc("nslookup a.test 10.0.2.10")).at(-1)).toContain("NXDOMAIN");
    expect(texts(await pc("ping -c 1 10.0.2.10")).join("\n")).toContain("1 received");
  });

  test("REJECT는 ICMP 도달 불가를 돌려줘 바로 거절로 보인다", async () => {
    const { pc, srv, primaryDrop, lastTrace } = await lab();
    await srv("iptables -A INPUT -p tcp --dport 21 -j REJECT");
    expect(texts(await pc("curl ftp://10.0.2.10/"))).toEqual(["curl: (7) Failed to connect to 10.0.2.10 port 21: Connection refused"]);
    expect(primaryDrop().reason).toMatchObject({ code: "FIREWALL_BLOCKED", params: { chain: "INPUT", target: "REJECT", rule: 1 } });
    expect(lastTrace().events.some((event) => event.deviceId === SRV && event.reason.code === "ICMP_ERROR_SENT")).toBe(true);

    await srv("iptables -A INPUT -p icmp -j REJECT");
    expect(texts(await pc("ping -c 1 10.0.2.10")).join("\n")).toContain("Destination Net Unreachable");
  });

  test("UDP 포트와 출발지 주소로 고른다", async () => {
    const { pc, srv, sim } = await lab();
    await srv("iptables -A INPUT -p udp --dport 53 -j DROP");
    expect(texts(await pc("nslookup a.test 10.0.2.10"))).toEqual([
      ";; communications error to 10.0.2.10#53: timed out", ";; no servers could be reached",
    ]);
    expect(texts(await pc("ntpdate -q 10.0.2.10"))[0]).toMatch(/^server 10\.0\.2\.10/);

    await srv("iptables -F");
    await srv("iptables -A INPUT -s 10.0.1.10 -p tcp --dport 80 -j DROP");
    expect(texts(await pc("curl http://10.0.2.10/"))[0]).toContain("Connection timed out");
    // 다른 주소에서 오면 지나간다
    expect(sim.dispatch({ type: "pc/set-ip", deviceId: PC1, ip: "10.0.1.11", mask: "255.255.255.0", gateway: "10.0.1.1" }).ok).toBe(true);
    expect(texts(await pc("curl http://10.0.2.10/"))).toEqual([PAGE]);
  });

  test("기본 정책을 DROP으로 두고 웹만 연다 (화이트리스트)", async () => {
    const { pc, srv, primaryDrop } = await lab();
    await srv("iptables -P INPUT DROP");
    expect(texts(await pc("curl http://10.0.2.10/"))[0]).toContain("Connection timed out");
    // 규칙이 아니라 기본 정책이 막았으면 규칙 번호가 없다
    expect(primaryDrop().reason).toEqual({ code: "FIREWALL_BLOCKED", params: { device: server, chain: "INPUT", target: "DROP" } });
    await srv("iptables -A INPUT -i eth0 -p tcp --dport 80 -j ACCEPT");
    expect(texts(await pc("curl http://10.0.2.10/"))).toEqual([PAGE]);
    expect(texts(await pc("curl ftp://10.0.2.10/"))[0]).toContain("Connection timed out");
    expect(texts(await pc("ping -c 1 10.0.2.10")).join("\n")).toContain("100% packet loss");
  });

  test("위에서부터 보고 처음 맞는 규칙을 따른다. -I로 앞에 끼우면 결과가 바뀐다", async () => {
    const { pc, srv } = await lab();
    await srv("iptables -A INPUT -p tcp --dport 20:80 -j DROP");
    expect(texts(await pc("curl http://10.0.2.10/"))[0]).toContain("Connection timed out");
    expect(texts(await pc("curl ftp://10.0.2.10/"))[0]).toContain("Connection timed out");
    await srv("iptables -I INPUT -p tcp --dport 80 -j ACCEPT");
    expect(texts(await pc("curl http://10.0.2.10/"))).toEqual([PAGE]);
    await srv("iptables -D INPUT 1");
    expect(texts(await pc("curl http://10.0.2.10/"))[0]).toContain("Connection timed out");
  });

  test("UDP를 REJECT하면 ICMP 도달 불가가 돌아와 바로 실패한다. 막힌 ICMP 오류에는 답하지 않는다", async () => {
    const { pc, srv, primaryDrop, lastTrace } = await lab();
    await srv("iptables -A INPUT -p udp --dport 53 -j REJECT");
    const lines = texts(await pc("nslookup a.test 10.0.2.10"));
    expect(lines.join("\n")).not.toContain("timed out");
    expect(primaryDrop().reason).toMatchObject({ code: "FIREWALL_BLOCKED", params: { chain: "INPUT", target: "REJECT", rule: 1 } });
    expect(lastTrace().events.filter((event) => event.deviceId === SRV && event.reason.code === "ICMP_ERROR_SENT")).toHaveLength(1);

    // 서버가 없는 곳으로 ping을 보내 Router의 ICMP 오류를 받는다. 그 오류를 REJECT해도 오류로 답하지 않는다
    await srv("iptables -F");
    await srv("iptables -A INPUT -p icmp -j REJECT");
    await srv("ping -c 1 172.16.9.9");
    const trace = lastTrace();
    expect(validateTrace(trace)).toMatchObject({ ok: true });
    expect(trace.events.some((event) => event.deviceId === SRV && event.reason.code === "FIREWALL_BLOCKED")).toBe(true);
    expect(trace.events.some((event) => event.deviceId === SRV && event.reason.code === "ICMP_ERROR_SENT")).toBe(false);
  });

  test("ARP는 거르지 않는다: 모든 것을 막아도 주소는 알아낸다", async () => {
    const { pc, srv, sim } = await lab();
    await srv("iptables -P INPUT DROP");
    await srv("iptables -P OUTPUT DROP");
    await pc("ping -c 1 10.0.2.10");
    const view = sim.getSnapshot().views[SRV]!;
    expect(view.kind === "pc" && view.arpTable.map((entry) => entry.ip)).toEqual(["10.0.2.1"]);
  });
});

describe("OUTPUT 체인은 서버가 보내는 패킷을 거른다", () => {
  test("응답을 막으면 요청은 받고도 답이 나가지 못한다 (무상태)", async () => {
    const { pc, srv, primaryDrop, lastTrace } = await lab();
    await srv("iptables -A OUTPUT -p icmp --icmp-type echo-reply -j DROP");
    expect(texts(await pc("ping -c 1 10.0.2.10")).join("\n")).toContain("100% packet loss");
    const drop = primaryDrop();
    expect(drop.outPort).toBe("Ethernet0");
    expect(drop.reason).toEqual({ code: "FIREWALL_BLOCKED", params: { device: server, chain: "OUTPUT", target: "DROP", rule: 1 } });
    expect(lastTrace().events.some((event) => event.deviceId === SRV && event.reason.code === "ICMP_ECHO_REQUEST_RECEIVED")).toBe(true);

    await srv("iptables -F");
    await srv("iptables -A OUTPUT -p tcp --sport 80 -j DROP");
    expect(texts(await pc("curl http://10.0.2.10/"))[0]).toContain("Connection timed out");
    expect(primaryDrop().frame.tcp?.flags).toBe("SYN-ACK");
  });

  test("서버가 보내는 ping과 요청도 지난다", async () => {
    const { srv, primaryDrop } = await lab();
    await srv("iptables -A OUTPUT -d 10.0.1.0/24 -j DROP");
    expect(texts(await srv("ping -c 1 10.0.1.10")).join("\n")).toContain("100% packet loss");
    expect(primaryDrop().reason).toMatchObject({ code: "FIREWALL_BLOCKED", params: { chain: "OUTPUT", rule: 1 } });
    expect(texts(await srv("curl http://10.0.1.10/"))[0]).toContain("Connection timed out");
    // 게이트웨이로 가는 것은 막지 않았다
    expect(texts(await srv("ping -c 1 10.0.2.1")).join("\n")).toContain("1 received");
  });

  test("돌아온 응답은 INPUT을 지난다", async () => {
    const { srv } = await lab();
    await srv("iptables -P INPUT DROP");
    expect(texts(await srv("ping -c 1 10.0.1.10")).join("\n")).toContain("100% packet loss");
    await srv("iptables -A INPUT -p icmp --icmp-type echo-reply -j ACCEPT");
    expect(texts(await srv("ping -c 1 10.0.1.10")).join("\n")).toContain("1 received");
  });
});

describe("자기 주소로 보낸 요청", () => {
  // 실제 Linux는 lo로 OUTPUT과 INPUT을 지난다. PING9는 패킷을 만들지 않고 바로 답한다 (작업 기록 7절의 알려진 차이)
  test("필터를 지나지 않는다: 모든 것을 막아도 자기 자신에게는 닿는다", async () => {
    const { srv } = await lab();
    await srv("iptables -P INPUT DROP");
    await srv("iptables -P OUTPUT DROP");
    expect(texts(await srv("ping -c 1 10.0.2.10")).join("\n")).toContain("1 received");
    expect(texts(await srv("curl http://127.0.0.1/"))).toEqual([PAGE]);
  });
});

describe("FORWARD 체인", () => {
  test("규칙을 넣고 볼 수 있지만, 서버는 패킷을 전달하지 않아 맞는 패킷이 없다", async () => {
    const { pc, srv, config } = await lab();
    await srv("iptables -P FORWARD DROP");
    await srv("iptables -A FORWARD -j DROP");
    expect(config().filter?.FORWARD).toEqual({ policy: "DROP", rules: [{ target: "DROP" }] });
    expect(texts(await pc("curl http://10.0.2.10/"))).toEqual([PAGE]);
    expect(texts(await pc("ping -c 1 10.0.2.10")).join("\n")).toContain("1 received");
  });
});

describe("iptables 명령", () => {
  test("-L과 -S는 실제 iptables의 모양이다", async () => {
    const { srv } = await lab();
    await srv("iptables -A INPUT -s 10.0.1.0/24 -p icmp --icmp-type echo-request -j DROP");
    await srv("iptables -A INPUT -i eth0 -p tcp --dport 80 -j ACCEPT");
    await srv("iptables -A OUTPUT -d 8.8.8.8 -j REJECT");
    await srv("iptables -P INPUT DROP");
    expect(texts(await srv("iptables -L"))).toEqual([
      "Chain INPUT (policy DROP)",
      "target     prot opt source               destination",
      "DROP       icmp --  10.0.1.0/24          anywhere             icmp echo-request",
      "ACCEPT     tcp  --  anywhere             anywhere             tcp dpt:80",
      "",
      "Chain FORWARD (policy ACCEPT)",
      "target     prot opt source               destination",
      "",
      "Chain OUTPUT (policy ACCEPT)",
      "target     prot opt source               destination",
      "REJECT     all  --  anywhere             8.8.8.8              reject-with icmp-port-unreachable",
    ]);
    expect(texts(await srv("iptables -nvL INPUT --line-numbers"))).toEqual([
      "Chain INPUT (policy DROP)",
      "num  target     prot opt in     out    source               destination",
      "1    DROP       icmp --  *      *      10.0.1.0/24          0.0.0.0/0            icmptype 8",
      "2    ACCEPT     tcp  --  eth0   *      0.0.0.0/0            0.0.0.0/0            tcp dpt:80",
    ]);
    expect(texts(await srv("iptables -S"))).toEqual([
      "-P INPUT DROP",
      "-P FORWARD ACCEPT",
      "-P OUTPUT ACCEPT",
      "-A INPUT -s 10.0.1.0/24 -p icmp -m icmp --icmp-type 8 -j DROP",
      "-A INPUT -i eth0 -p tcp -m tcp --dport 80 -j ACCEPT",
      "-A OUTPUT -d 8.8.8.8/32 -j REJECT",
    ]);
  });

  test("-S의 줄은 앞에 iptables를 붙여 그대로 다시 넣을 수 있다", async () => {
    const first = await lab();
    for (const line of [
      "iptables -A INPUT -s 10.0.0.0/24 -i eth0 -p icmp --icmp-type echo-reply -j DROP",
      "iptables -A OUTPUT -o eth0 -p udp --sport 53 -j ACCEPT",
      "iptables -P OUTPUT DROP",
    ]) await first.srv(line);
    const saved = texts(await first.srv("iptables -S"));
    const second = await lab();
    for (const line of saved) await second.srv(`iptables ${line}`);
    expect(second.config().filter).toEqual(first.config().filter);
  });

  test("-D는 번호로도 같은 규칙을 써서도 지우고, -F는 규칙만 지운다", async () => {
    const { srv, raw, config } = await lab();
    await srv("iptables -P INPUT DROP");
    await srv("iptables -A INPUT -p icmp -j ACCEPT");
    await srv("iptables -A INPUT -s 10.0.1.10 -j ACCEPT");
    await srv("iptables -D INPUT -s 10.0.1.10/32 -j ACCEPT");
    expect(texts(await srv("iptables -D INPUT -s 10.0.1.10 -j ACCEPT"))).toEqual([
      "iptables: Bad rule (does a matching rule exist in that chain?).",
    ]);
    expect(errorOf(await raw("iptables -D INPUT 2"))).toMatchObject({
      code: "FIREWALL_RULE_NOT_FOUND", params: { deviceId: SRV, chain: "INPUT", index: 2 },
    });
    await srv("iptables -F");
    expect(config().filter?.INPUT).toEqual({ policy: "DROP", rules: [] });
  });

  test("`sudo`를 붙여도 되고, 긴 옵션 이름과 프로토콜 번호도 읽는다", async () => {
    const { srv, raw, config } = await lab();
    await srv("sudo iptables -A INPUT -p icmp -j DROP");
    expect(config().filter?.INPUT.rules).toHaveLength(1);
    expect(errorOf(await raw("sudo iptables -A INPUT -p gre -j DROP"))).toMatchObject({ code: "CLI_INVALID_VALUE", position: 26 });
    expect(parse("iptables --append INPUT --protocol 1 --source 10.0.0.0/8 --in-interface eth0 --jump DROP")).toEqual({
      ok: true,
      command: { kind: "append", chain: "INPUT", rule: { protocol: "icmp", source: "10.0.0.0/8", inInterface: "Ethernet0", target: "DROP" } },
    });
    expect(parse("iptables -t filter -A INPUT -p all -s 0.0.0.0/0 -j ACCEPT")).toEqual({
      ok: true, command: { kind: "append", chain: "INPUT", rule: { target: "ACCEPT" } },
    });
  });

  test.each([
    ["iptables", "IPTABLES_NO_COMMAND", undefined],
    ["iptables -n", "IPTABLES_NO_COMMAND", undefined],
    ["iptables -A INPUT -L", "IPTABLES_NO_COMMAND", 18],
    ["iptables -A", "CLI_INCOMPLETE_COMMAND", undefined],
    ["iptables -A INPUT -p icmp", "CLI_INCOMPLETE_COMMAND", undefined],
    ["iptables -P INPUT", "CLI_INCOMPLETE_COMMAND", undefined],
    ["iptables -A INPUT -p gre -j DROP", "CLI_INVALID_VALUE", 21],
    ["iptables -A INPUT -s 10.0.0.300 -j DROP", "INVALID_IPV4", 21],
    ["iptables -A INPUT -p tcp --dport 70000 -j DROP", "FIREWALL_PORT_INVALID", 33],
    ["iptables -A INPUT -i eth1 -j DROP", "CLI_INVALID_VALUE", 21],
    ["iptables -A INPUT --icmp-type 99 -p icmp -j DROP", "CLI_INVALID_VALUE", 30],
    ["iptables -P INPUT REJECT", "CLI_INVALID_VALUE", 18],
    ["iptables -I INPUT 0 -j DROP", "CLI_INVALID_VALUE", 18],
    ["iptables -L INPUT -p icmp", "CLI_INVALID_VALUE", 18],
    ["iptables -A INPUT --foo -j DROP", "CLI_INVALID_VALUE", 18],
    ["iptables -L constructor", "IPTABLES_UNSUPPORTED", 12],
    ["iptables -A INPUT -p constructor -j DROP", "CLI_INVALID_VALUE", 21],
    ["iptables -A input -j DROP", "IPTABLES_UNSUPPORTED", 12],
    ["iptables -t nat -A POSTROUTING -j MASQUERADE", "IPTABLES_UNSUPPORTED", 12],
    ["iptables -A INPUT -m state --state ESTABLISHED -j ACCEPT", "IPTABLES_UNSUPPORTED", 21],
    ["iptables -A INPUT ! -s 10.0.0.1 -j DROP", "IPTABLES_UNSUPPORTED", 18],
    ["iptables -A INPUT -i lo -j ACCEPT", "IPTABLES_UNSUPPORTED", 21],
    ["iptables -A INPUT -j LOG", "IPTABLES_UNSUPPORTED", 21],
    ["iptables -N mychain", "IPTABLES_UNSUPPORTED", 9],
  ] as const)("받지 않는 입력: %s → %s", async (line, code, position) => {
    const { raw, config } = await lab();
    const error = errorOf(await raw(line));
    expect(error?.code).toBe(code);
    expect(error?.position).toBe(position);
    for (const value of Object.values(error?.params ?? {})) expect(typeof value).not.toBe("function");
    expect(config().filter).toBeUndefined();
  });

  test("체인과 맞지 않는 조건은 reducer가 거부한다", async () => {
    const { raw } = await lab();
    const reasonOf = async (line: string) => errorOf(await raw(line))?.params;
    expect(await reasonOf("iptables -A OUTPUT -i eth0 -j DROP")).toEqual({ reason: "in-interface" });
    expect(await reasonOf("iptables -A INPUT -o eth0 -j DROP")).toEqual({ reason: "out-interface" });
    expect(await reasonOf("iptables -A INPUT --icmp-type echo-request -j DROP")).toEqual({ reason: "icmp-type" });
    expect(await reasonOf("iptables -A INPUT -p icmp --dport 80 -j DROP")).toEqual({ reason: "port" });
  });

  test("Tab은 앞의 `sudo`를 건너 완성하고 `sudo`를 지우지 않는다", async () => {
    const { sim } = await lab();
    expect(sim.console(SRV).complete("sudo ipt")).toBe("sudo iptables ");
    expect(sim.console(SRV).complete("  sudo ipt")).toBe("  sudo iptables ");
    expect(sim.console(SRV).candidates("sudo ipt")).toEqual(sim.console(SRV).candidates("ipt"));
    // 서버가 아니면 `sudo`는 명령이 아니다
    expect(sim.console(PC1).complete("sudo pi")).toBeNull();
  });

  test("help와 Tab이 iptables를 안다. 파이프는 실행하지 않는다", async () => {
    const { sim, srv, raw } = await lab();
    expect(texts(await srv("help")).join("\n")).toContain("iptables");
    expect(texts(await srv("iptables -h"))[0]).toBe("Usage: iptables -[AD] chain rule-specification");
    expect(sim.console(SRV).complete("ipt")).toBe("iptables ");
    expect(errorOf(await raw("iptables -L | grep DROP"))).toMatchObject({ code: "CLI_UNSUPPORTED_SYNTAX", position: 12 });
  });
});

describe("서버가 아닌 PC", () => {
  test("Linux와 Windows PC에는 iptables가 없다", async () => {
    const { pc, sim } = await lab();
    expect(texts(await pc("iptables -L"))[0]).toBe("iptables: command not found");
    expect(texts(await pc("sudo iptables -L"))[0]).toBe("sudo: command not found");
    expect(sim.dispatch({ type: "pc/set-os", deviceId: PC1, os: "windows" }).ok).toBe(true);
    expect((await pc("iptables -L")).lines.some((line) => line.kind === "notice" && line.code === "PC_UNKNOWN_COMMAND")).toBe(true);
  });

  test("서버가 아닌 PC의 규칙은 바꿀 수 없다", async () => {
    const { send } = await lab();
    expect(send({ type: "firewall/add-rule", deviceId: PC1, chain: "INPUT", rule: { target: "DROP" } })).toEqual({
      ok: false, error: { code: "PC_NOT_SERVER", params: { deviceId: PC1 } },
    });
    expect(send({ type: "firewall/set-policy", deviceId: R1, chain: "INPUT", policy: "DROP" })).toMatchObject({
      ok: false, error: { code: "DEVICE_KIND_MISMATCH", params: { expected: "pc", actual: "router" } },
    });
    expect(send({ type: "firewall/flush-rules", deviceId: "nope" })).toMatchObject({ ok: false, error: { code: "DEVICE_NOT_FOUND" } });
  });

  test("종류를 바꾸면 규칙은 남지만 적용되지 않는다. 다시 Server로 고르면 다시 막는다", async () => {
    const { pc, srv, must, config } = await lab();
    await srv("iptables -A INPUT -p icmp -j DROP");
    must({ type: "pc/set-os", deviceId: SRV, os: "linux" });
    expect(config().filter?.INPUT.rules).toHaveLength(1);
    expect(texts(await pc("ping -c 1 10.0.2.10")).join("\n")).toContain("1 received");
    must({ type: "pc/set-os", deviceId: SRV, os: "server" });
    expect(texts(await pc("ping -c 1 10.0.2.10")).join("\n")).toContain("100% packet loss");
  });
});

describe("규칙의 Command", () => {
  const add = (rule: unknown, extra: Record<string, unknown> = {}) => ({ type: "firewall/add-rule", deviceId: SRV, chain: "INPUT", rule, ...extra });

  test("규칙은 토폴로지에 저장되고, 주소를 바꿔도 남고, 내보냈다가 다시 열어도 막는다", async () => {
    const { sim, srv, must, config } = await lab();
    await srv("iptables -A INPUT -s 10.0.1.10 -i eth0 -p tcp --dport 80 -j DROP");
    await srv("iptables -P OUTPUT DROP");
    must({ type: "pc/set-ip", deviceId: SRV, ip: "10.0.2.11", mask: "255.255.255.0", gateway: "10.0.2.1" });
    must({ type: "pc/set-service", deviceId: SRV, service: "ftp", enabled: false });
    must({ type: "pc/add-dns-record", deviceId: SRV, name: "a.test", address: "10.0.0.1" });
    must({ type: "pc/remove-dns-record", deviceId: SRV, name: "a.test" });
    must({ type: "device/rename", deviceId: SRV, name: "WEB1" });
    must({ type: "interface/set-admin", deviceId: SRV, port: "Ethernet0", adminUp: true });
    expect(config().filter).toEqual({
      INPUT: { policy: "ACCEPT", rules: [{ protocol: "tcp", source: "10.0.1.10/32", inInterface: "Ethernet0", destinationPort: "80", target: "DROP" }] },
      FORWARD: { policy: "ACCEPT", rules: [] },
      OUTPUT: { policy: "DROP", rules: [] },
    });
    const saved = validateDocument(JSON.parse(JSON.stringify(sim.getSnapshot().document)));
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const reopened = createSimulator();
    expect(reopened.load(saved.document).ok).toBe(true);
    expect(texts(await reopened.console(SRV).exec("iptables -S INPUT"))).toEqual([
      "-P INPUT ACCEPT", "-A INPUT -s 10.0.1.10/32 -i eth0 -p tcp -m tcp --dport 80 -j DROP",
    ]);
  });

  test("끼울 자리, 한도, 바뀌는 것이 없을 때", async () => {
    const { sim, send, must, config } = await lab();
    must(add({ target: "DROP", source: "10.0.0.9/24" }));
    must(add({ target: "ACCEPT", protocol: "icmp" }, { index: 1 }));
    must(add({ target: "ACCEPT", source: "0.0.0.0/0" }, { index: 3 }));
    expect(config().filter?.INPUT.rules).toEqual([{ protocol: "icmp", target: "ACCEPT" }, { source: "10.0.0.0/24", target: "DROP" }, { target: "ACCEPT" }]);
    const before = sim.getSnapshot().document;
    must({ type: "firewall/flush-rules", deviceId: SRV, chain: "OUTPUT" });
    must({ type: "firewall/set-policy", deviceId: SRV, chain: "INPUT", policy: "ACCEPT" });
    expect(sim.getSnapshot().document).toBe(before);
    for (let count = 3; count < 64; count += 1) must(add({ target: "DROP" }));
    expect(send(add({ target: "DROP" }))).toEqual({ ok: false, error: { code: "LIMIT_EXCEEDED", params: { limit: "firewallRules", max: 64 } } });
  });

  test.each<[string, unknown, string]>([
    ["없는 체인", { type: "firewall/add-rule", deviceId: SRV, chain: "PREROUTING", rule: { target: "DROP" } }, "DOCUMENT_INVALID_SHAPE"],
    ["체인이 수", { type: "firewall/remove-rule", deviceId: SRV, chain: 5, index: 1 }, "DOCUMENT_INVALID_SHAPE"],
    ["없는 정책", { type: "firewall/set-policy", deviceId: SRV, chain: "INPUT", policy: "REJECT" }, "DOCUMENT_INVALID_SHAPE"],
    ["없는 규칙 번호", { type: "firewall/remove-rule", deviceId: SRV, chain: "INPUT", index: 1 }, "FIREWALL_RULE_NOT_FOUND"],
    ["규칙 번호가 글", { type: "firewall/remove-rule", deviceId: SRV, chain: "INPUT", index: "1" }, "FIREWALL_RULE_NOT_FOUND"],
    ["끼울 수 없는 자리", add({ target: "DROP" }, { index: 2 }), "FIREWALL_RULE_NOT_FOUND"],
    ["자리가 NaN", add({ target: "DROP" }, { index: Number.NaN }), "FIREWALL_RULE_NOT_FOUND"],
    ["규칙이 null", add(null), "DOCUMENT_INVALID_SHAPE"],
    ["대상이 없음", add({ protocol: "icmp" }), "DOCUMENT_INVALID_SHAPE"],
    ["없는 대상", add({ target: "LOG" }), "DOCUMENT_INVALID_SHAPE"],
    ["인터페이스가 객체", add({ target: "DROP", inInterface: { toString: 1 } }), "DOCUMENT_INVALID_SHAPE"],
    ["포트가 객체", add({ target: "DROP", protocol: "tcp", sourcePort: {} }), "DOCUMENT_INVALID_SHAPE"],
    ["주소가 수", add({ target: "DROP", source: 10 }), "INVALID_IPV4"],
    ["서버에 없는 인터페이스", add({ target: "DROP", inInterface: "Ethernet1" }), "UNKNOWN_PORT"],
    ["틀린 포트 번호", add({ target: "DROP", protocol: "udp", destinationPort: "70000" }), "FIREWALL_PORT_INVALID"],
    ["체인에 맞지 않는 조건", { type: "firewall/add-rule", deviceId: SRV, chain: "OUTPUT", rule: { target: "DROP", inInterface: "Ethernet0" } }, "FIREWALL_RULE_INVALID"],
  ])("%s → %s", async (_name, command, code) => {
    const { sim, send } = await lab();
    const before = sim.getSnapshot().document;
    expect(send(command)).toMatchObject({ ok: false, error: { code } });
    expect(sim.getSnapshot().document).toBe(before);
  });

  test("긴 글은 오류에 그대로 실리지 않고, 물려받은 칸은 규칙이 아니다", async () => {
    const { send, must, config } = await lab();
    const long = "A".repeat(5000);
    for (const rule of [{ target: "DROP", inInterface: long }, { target: "DROP", protocol: "tcp", sourcePort: long }, { target: "DROP", source: long }, { target: long }]) {
      const result = send(add(rule));
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result).length).toBeLessThan(300);
    }
    must(add({ target: "DROP", comment: "x", __proto__: { protocol: "icmp" } }));
    expect(config().filter?.INPUT.rules).toEqual([{ target: "DROP" }]);
  });

  test("규칙을 바꿔도 RIP 경로 교환을 다시 돌리지 않는다", async () => {
    const { sim, must } = await lab();
    must({ type: "rip/enable", deviceId: R1 });
    const before = sim.getSnapshot().document;
    must(add({ target: "DROP" }));
    expect(needsRouteExchange(before, sim.getSnapshot().document)).toBe(false);
  });
});

describe("옛 Firewall 장비", () => {
  test("Firewall은 놓을 수 없는 종류다", () => {
    const sim = createSimulator();
    expect(sim.dispatch({ type: "device/add", id: R1, kind: "firewall", position: { x: 0, y: 0 } } as unknown as Command)).toEqual({
      ok: false, error: { code: "DOCUMENT_INVALID_SHAPE", params: { path: "kind" } },
    });
  });
});
