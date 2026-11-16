// 서버로 쓰는 PC의 서비스와 그것을 쓰는 명령어 (T0.20). 공개 인터페이스(createSimulator)로만 확인한다.
// 토폴로지: PC1 — eth0 [FW1] eth1 — SRV1. Firewall의 TCP·UDP 규칙을 실제 패킷으로 확인한다.
import { validateDocument, validateTrace } from "@ping9/shared";
import type { Command, ConsoleResult, PcDevice, Trace } from "@ping9/shared";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../../simulator";
import { parseUrl } from "./service-commands";

const PC1 = "11111111-1111-4111-8111-111111111111";
const SRV = "22222222-2222-4222-8222-222222222222";
const FW = "33333333-3333-4333-8333-333333333333";
const MID = "44444444-4444-4444-8444-444444444444";
const LINK1 = "55555555-5555-4555-8555-555555555555";
const LINK2 = "66666666-6666-4666-8666-666666666666";

const texts = (result: ConsoleResult): string[] => result.lines.flatMap((line) => (line.kind === "text" ? [line.text] : line.kind === "trace" ? [] : [`[${line.kind}]`]));
const PAGE = "<html><body><h1>SRV1</h1><p>PING9 web server</p></body></html>";

type Middle = "firewall" | "router" | "switch";

/** PC1 — 가운데 장비 — SRV1. 가운데가 Switch면 한 네트워크다 */
async function lab(middle: Middle = "firewall", clientOs: "windows" | "linux" = "linux") {
  const sim = createSimulator();
  const send = (command: unknown) => sim.dispatch(command as Command);
  const must = (command: unknown) => expect(send(command)).toMatchObject({ ok: true });
  must({ type: "device/add", id: PC1, kind: "pc", position: { x: 0, y: 0 }, os: clientOs });
  must({ type: "device/add", id: SRV, kind: "pc", position: { x: 400, y: 0 }, os: "server" });
  must({ type: "device/rename", deviceId: SRV, name: "SRV1" });
  must({ type: "device/add", id: middle === "firewall" ? FW : MID, kind: middle, position: { x: 200, y: 0 } });
  const mid = middle === "firewall" ? FW : MID;
  const ports = { firewall: ["Ethernet0", "Ethernet1"], router: ["GigabitEthernet0/0", "GigabitEthernet0/1"], switch: ["FastEthernet0/1", "FastEthernet0/2"] }[middle];
  must({ type: "link/add", id: LINK1, ends: [{ deviceId: PC1, port: "Ethernet0" }, { deviceId: mid, port: ports[0] }] });
  must({ type: "link/add", id: LINK2, ends: [{ deviceId: SRV, port: "Ethernet0" }, { deviceId: mid, port: ports[1] }] });

  const routed = middle !== "switch";
  const serverIp = routed ? "10.0.2.10" : "10.0.1.20";
  must({ type: "pc/set-ip", deviceId: PC1, ip: "10.0.1.10", mask: "255.255.255.0", gateway: routed ? "10.0.1.1" : null });
  must({ type: "pc/set-ip", deviceId: SRV, ip: serverIp, mask: "255.255.255.0", gateway: routed ? "10.0.2.1" : null });
  if (routed) {
    for (const [port, ip] of [[ports[0], "10.0.1.1"], [ports[1], "10.0.2.1"]] as const) {
      must({ type: "interface/set-ip", deviceId: mid, port, ip, mask: "255.255.255.0" });
      must({ type: "interface/set-admin", deviceId: mid, port, adminUp: true });
    }
  }

  const run = async (deviceId: string, line: string) => sim.console(deviceId).exec(line);
  const pc = (line: string) => run(PC1, line);
  const fw = async (line: string) => {
    const result = await run(FW, line);
    expect(result.lines.filter((entry) => entry.kind === "error")).toEqual([]);
    return result;
  };
  const lastTrace = (): Trace => sim.getTrace(sim.getSnapshot().traces[0]!.id)!;
  const primaryDrop = () => {
    const trace = lastTrace();
    expect(validateTrace(trace).ok).toBe(true);
    return trace.events[trace.result.primaryDropSeq!]!;
  };
  const serverConfig = () => (sim.getSnapshot().document.devices.find((device) => device.id === SRV) as PcDevice).config;
  return { sim, send, must, run, pc, fw, lastTrace, primaryDrop, serverConfig, serverIp };
}

describe("서버의 서비스에 요청한다", () => {
  test("curl은 TCP 연결을 맺고 웹 문서를 받는다. 추적에 SYN, SYN-ACK, ACK, 요청, 응답이 차례로 남는다", async () => {
    const { sim, pc, lastTrace } = await lab();
    const result = await pc("curl http://10.0.2.10/");
    expect(texts(result)).toEqual([PAGE]);
    // 첫 줄 바로 뒤가 추적 줄이다. 화면이 그 추적을 재생한 뒤에 줄을 보인다
    expect(result.lines[1]).toEqual({ kind: "trace", traceId: sim.getSnapshot().traces[0]!.id });

    const trace = lastTrace();
    expect(validateTrace(trace)).toMatchObject({ ok: true });
    expect(trace.result.status).toBe("success");
    const sent = trace.events.filter((event) => event.action === "create" || event.action === "reply")
      .filter((event) => event.frame.tcp !== undefined)
      .map((event) => `${event.deviceId === PC1 ? "PC1" : "SRV1"} ${event.frame.tcp!.flags}${event.frame.application === undefined ? "" : ` ${event.frame.application.message}`}`);
    expect(sent).toEqual(["PC1 SYN", "SRV1 SYN-ACK", "PC1 ACK", "PC1 PSH-ACK GET /", "SRV1 PSH-ACK 200 OK"]);
    expect(sim.getSnapshot().traces[0]).toMatchObject({ kind: "ping", service: "http", targetIp: "10.0.2.10", status: "success" });
  });

  test("Firewall이 전달한 프레임에도 TCP와 응용 계층이 그대로 있다", async () => {
    const { pc, lastTrace } = await lab();
    await pc("curl 10.0.2.10");
    const forwarded = lastTrace().events.filter((event) => event.deviceId === FW && event.reason.code === "IPV4_FORWARDED");
    expect(forwarded.length).toBe(5);
    expect(forwarded.every((event) => event.frame.tcp !== undefined)).toBe(true);
    expect(forwarded.at(-1)!.frame.application).toEqual({ service: "http", message: "200 OK", data: PAGE });
  });

  test.each<[Middle]>([["router"], ["switch"]])("%s를 지나서도 된다", async (middle) => {
    const { pc, serverIp, lastTrace } = await lab(middle);
    expect(texts(await pc(`curl http://${serverIp}/readme.txt`))).toEqual(["Files on SRV1 are served over HTTP and FTP."]);
    expect(validateTrace(lastTrace())).toMatchObject({ ok: true });
    expect(texts(await pc(`nslookup www.ping9.test ${serverIp}`)).at(-1)).toBe("** server can't find www.ping9.test: NXDOMAIN");
  });

  test("없는 문서는 404, 포트와 경로를 직접 적을 수 있다", async () => {
    const { pc } = await lab();
    expect(texts(await pc("curl http://10.0.2.10/nope.html"))).toEqual(["<h1>404 Not Found</h1>"]);
    expect(texts(await pc("curl http://10.0.2.10:80/index.html"))).toEqual([PAGE]);
    expect(texts(await pc("curl 10.0.2.10:8080"))).toEqual(["curl: (7) Failed to connect to 10.0.2.10 port 8080: Connection refused"]);
  });

  test("FTP는 목록과 파일을 준다", async () => {
    const { pc } = await lab();
    expect(texts(await pc("curl ftp://10.0.2.10/"))).toEqual(["index.html", "readme.txt"]);
    expect(texts(await pc("curl ftp://10.0.2.10/readme.txt"))).toEqual(["Files on SRV1 are served over HTTP and FTP."]);
    expect(texts(await pc("curl ftp://10.0.2.10/nope"))).toEqual(["curl: (78) RETR response: 550"]);
  });

  test("DNS는 넣어 둔 이름에 답한다 (Linux와 Windows의 출력)", async () => {
    const linux = await lab();
    linux.must({ type: "pc/add-dns-record", deviceId: SRV, name: "WWW.ping9.test", address: "10.0.2.10" });
    expect(texts(await linux.pc("nslookup www.ping9.test 10.0.2.10"))).toEqual([
      "Server:\t\t10.0.2.10", "Address:\t10.0.2.10#53", "", "Name:\twww.ping9.test", "Address: 10.0.2.10",
    ]);
    expect(linux.lastTrace().events.filter((event) => event.frame.udp !== undefined && event.action !== "receive" && event.action !== "forward")
      .map((event) => event.frame.application?.message)).toEqual(["A www.ping9.test", "www.ping9.test A 10.0.2.10"]);

    const windows = await lab("firewall", "windows");
    windows.must({ type: "pc/add-dns-record", deviceId: SRV, name: "www.ping9.test", address: "10.0.2.10" });
    expect(texts(await windows.pc("nslookup WWW.PING9.TEST 10.0.2.10"))).toEqual([
      "Server:  UnKnown", "Address:  10.0.2.10", "", "Name:    www.ping9.test", "Address:  10.0.2.10",
    ]);
    expect(texts(await windows.pc("nslookup nope.test 10.0.2.10")).at(-1)).toBe("*** UnKnown can't find nope.test: Non-existent domain");
  });

  test("NTP는 계층과 왕복 시간을 답한다", async () => {
    const linux = await lab();
    expect(texts(await linux.pc("ntpdate -q 10.0.2.10"))[0]).toMatch(/^server 10\.0\.2\.10, stratum 1, offset \+0\.000000, delay 0\.00\d{3}$/);
    const windows = await lab("firewall", "windows");
    expect(texts(await windows.pc("w32tm /stripchart /computer:10.0.2.10"))[0]).toMatch(/^d:\+00\.00\d{5}s o:\+00\.0000000s {2}\[10\.0\.2\.10:123\]$/);
  });
});

describe("서비스가 꺼져 있거나 닿지 않을 때", () => {
  test("끈 TCP 서비스는 RST로 거절한다. 원인은 서버의 PORT_CLOSED다", async () => {
    const { pc, must, primaryDrop } = await lab();
    must({ type: "pc/set-service", deviceId: SRV, service: "http", enabled: false });
    expect(texts(await pc("curl http://10.0.2.10/"))).toEqual(["curl: (7) Failed to connect to 10.0.2.10 port 80: Connection refused"]);
    const drop = primaryDrop();
    expect(drop.deviceId).toBe(SRV);
    expect(drop.reason).toEqual({ code: "PORT_CLOSED", params: { device: { deviceId: SRV, deviceName: "SRV1" }, protocol: "tcp", port: 80 } });
    // 다른 서비스는 그대로다
    expect(texts(await pc("curl ftp://10.0.2.10/"))).toHaveLength(2);
  });

  test("끈 UDP 서비스는 ICMP 도달 불가로 답한다", async () => {
    const { pc, must, primaryDrop, lastTrace } = await lab();
    must({ type: "pc/set-service", deviceId: SRV, service: "dns", enabled: false });
    expect(texts(await pc("nslookup www.ping9.test 10.0.2.10"))).toEqual([
      ";; communications error to 10.0.2.10#53: connection refused", ";; no servers could be reached",
    ]);
    expect(primaryDrop().reason).toMatchObject({ code: "PORT_CLOSED", params: { protocol: "udp", port: 53 } });
    expect(lastTrace().events.some((event) => event.deviceId === PC1 && event.reason.code === "ICMP_ERROR_RECEIVED")).toBe(true);
    expect(texts(await pc("ntpdate -q 10.0.2.10"))[0]).toMatch(/^server 10\.0\.2\.10, stratum 1/);
  });

  test("서버가 아닌 PC는 어느 포트도 듣지 않는다", async () => {
    const { pc, must } = await lab();
    must({ type: "pc/set-os", deviceId: SRV, os: "linux" });
    expect(texts(await pc("curl http://10.0.2.10/"))).toEqual(["curl: (7) Failed to connect to 10.0.2.10 port 80: Connection refused"]);
    // 다시 Server로 고르면 서비스가 돌아온다
    must({ type: "pc/set-os", deviceId: SRV, os: "server" });
    expect(texts(await pc("curl http://10.0.2.10/"))).toEqual([PAGE]);
  });

  test("보낼 수 없거나 응답이 없을 때의 문구", async () => {
    const { pc, must, sim } = await lab();
    // 같은 네트워크의 없는 주소: ARP 응답이 없다
    expect(texts(await pc("curl http://10.0.1.99/"))).toEqual(["curl: (7) Failed to connect to 10.0.1.99 port 80: No route to host"]);
    // 서버의 케이블을 뗀다: Firewall에 그쪽 경로가 없어 ICMP 도달 불가가 돌아온다. 거절로 보인다
    expect(sim.dispatch({ type: "link/remove", linkId: LINK2 }).ok).toBe(true);
    expect(texts(await pc("curl http://10.0.2.10/"))).toEqual(["curl: (7) Failed to connect to 10.0.2.10 port 80: Connection refused"]);
    expect(texts(await pc("ntpdate -q 10.0.2.10"))).toEqual(["ntpdate: no server suitable for synchronization found"]);
    must({ type: "pc/set-ip", deviceId: PC1, ip: null, mask: null, gateway: null });
    expect(texts(await pc("curl http://10.0.2.10/"))).toEqual(["curl: (7) Failed to connect to 10.0.2.10 port 80: Network is unreachable"]);
  });
});

describe("Firewall의 TCP·UDP 규칙이 실제 패킷을 거른다", () => {
  test("`--dport 80`을 DROP하면 HTTP만 시간 초과다. FTP, DNS, ping은 지나간다", async () => {
    const { pc, fw, primaryDrop } = await lab();
    await fw("iptables -A FORWARD -p tcp --dport 80 -j DROP");
    expect(texts(await pc("curl http://10.0.2.10/"))).toEqual(["curl: (28) Failed to connect to 10.0.2.10 port 80: Connection timed out"]);
    const drop = primaryDrop();
    expect(drop.reason).toEqual({
      code: "FIREWALL_BLOCKED", params: { device: { deviceId: FW, deviceName: "FW1" }, chain: "FORWARD", target: "DROP", rule: 1 },
    });
    expect(drop.frame.tcp).toEqual({ sourcePort: 49152, destinationPort: 80, flags: "SYN" });

    expect(texts(await pc("curl ftp://10.0.2.10/"))).toHaveLength(2);
    expect(texts(await pc("nslookup a.test 10.0.2.10")).at(-1)).toContain("NXDOMAIN");
    expect(texts(await pc("ping -c 1 10.0.2.10")).join("\n")).toContain("1 received");
  });

  test("REJECT는 ICMP 도달 불가를 돌려줘 바로 거절로 보인다", async () => {
    const { pc, fw, primaryDrop } = await lab();
    await fw("iptables -A FORWARD -p tcp --dport 21 -j REJECT");
    expect(texts(await pc("curl ftp://10.0.2.10/"))).toEqual(["curl: (7) Failed to connect to 10.0.2.10 port 21: Connection refused"]);
    expect(primaryDrop().reason).toMatchObject({ code: "FIREWALL_BLOCKED", params: { target: "REJECT" } });
  });

  test("UDP 포트로 고른다", async () => {
    const { pc, fw } = await lab();
    await fw("iptables -A FORWARD -p udp --dport 53 -j DROP");
    expect(texts(await pc("nslookup a.test 10.0.2.10"))).toEqual([
      ";; communications error to 10.0.2.10#53: timed out", ";; no servers could be reached",
    ]);
    expect(texts(await pc("ntpdate -q 10.0.2.10"))[0]).toMatch(/^server 10\.0\.2\.10/);
  });

  test("무상태라 돌아오는 SYN-ACK를 막아도 연결이 맺어지지 않는다", async () => {
    const { pc, fw, primaryDrop } = await lab();
    await fw("iptables -A FORWARD -p tcp --sport 80 -j DROP");
    expect(texts(await pc("curl http://10.0.2.10/"))[0]).toContain("Connection timed out");
    expect(primaryDrop().frame.tcp?.flags).toBe("SYN-ACK");
  });

  test("기본 정책을 DROP으로 두고 웹만 양방향으로 연다", async () => {
    const { pc, fw } = await lab();
    await fw("iptables -P FORWARD DROP");
    expect(texts(await pc("curl http://10.0.2.10/"))[0]).toContain("Connection timed out");
    await fw("iptables -A FORWARD -i eth0 -o eth1 -p tcp --dport 80 -j ACCEPT");
    await fw("iptables -A FORWARD -i eth1 -o eth0 -p tcp --sport 80 -j ACCEPT");
    expect(texts(await pc("curl http://10.0.2.10/"))).toEqual([PAGE]);
    expect(texts(await pc("curl ftp://10.0.2.10/"))[0]).toContain("Connection timed out");
    expect(texts(await pc("ping -c 1 10.0.2.10")).join("\n")).toContain("100% packet loss");
  });

  test("포트 범위와 프로토콜 없는 규칙도 맞는다", async () => {
    const { pc, fw } = await lab();
    await fw("iptables -A FORWARD -p tcp --dport 20:21 -j DROP");
    expect(texts(await pc("curl ftp://10.0.2.10/"))[0]).toContain("Connection timed out");
    expect(texts(await pc("curl http://10.0.2.10/"))).toEqual([PAGE]);
    await fw("iptables -I FORWARD -d 10.0.2.10 -j DROP");
    expect(texts(await pc("curl http://10.0.2.10/"))[0]).toContain("Connection timed out");
  });
});

describe("서버의 콘솔", () => {
  test("서버는 Linux 콘솔에 `ss`와 `systemctl`이 더 있다", async () => {
    const { run, serverConfig } = await lab();
    expect(texts(await run(SRV, "ss -tuln"))).toEqual([
      "Netid  State   Local Address:Port",
      "udp    UNCONN  0.0.0.0:53",
      "udp    UNCONN  0.0.0.0:123",
      "tcp    LISTEN  0.0.0.0:21",
      "tcp    LISTEN  0.0.0.0:80",
    ]);
    expect((await run(SRV, "systemctl stop httpd")).lines).toEqual([]);
    expect(serverConfig().services).toEqual(["dns", "ntp", "ftp"]);
    expect(texts(await run(SRV, "systemctl status http"))).toEqual(["○ http.service - PING9 HTTP server", "     Active: inactive (dead)"]);
    expect(texts(await run(SRV, "ss -tuln"))).not.toContain("tcp    LISTEN  0.0.0.0:80");
    expect((await run(SRV, "systemctl start http.service")).lines).toEqual([]);
    expect(texts(await run(SRV, "systemctl status http"))).toEqual([
      "● http.service - PING9 HTTP server", "     Active: active (running)", "     Listen: tcp/80",
    ]);
    expect((await run(SRV, "systemctl start sshd")).lines[0]).toMatchObject({ kind: "error", code: "CLI_INVALID_VALUE" });
  });

  test("서버가 아닌 Linux PC에는 서버 명령어가 없다", async () => {
    const { pc } = await lab();
    expect(texts(await pc("systemctl status http"))[0]).toBe("systemctl: command not found");
    expect(texts(await pc("ss -tuln"))[0]).toBe("ss: command not found");
  });

  test("자기 주소와 127.x로 보낸 요청은 링크를 지나지 않고 바로 답한다", async () => {
    const { sim, run, pc } = await lab();
    const before = sim.getSnapshot().traces.length;
    expect(texts(await run(SRV, "curl http://127.0.0.1/"))).toEqual([PAGE]);
    expect(texts(await run(SRV, "curl 10.0.2.10/readme.txt"))).toEqual(["Files on SRV1 are served over HTTP and FTP."]);
    expect(texts(await pc("curl 127.0.0.1"))).toEqual(["curl: (7) Failed to connect to 127.0.0.1 port 80: Connection refused"]);
    expect(sim.getSnapshot().traces).toHaveLength(before);
  });

  test("서버도 다른 서버에 요청할 수 있고 ping에 답한다", async () => {
    const { run, pc } = await lab();
    expect(texts(await pc("ping -c 1 10.0.2.10")).join("\n")).toContain("1 received");
    expect(texts(await run(SRV, "curl http://10.0.1.10/"))).toEqual(["curl: (7) Failed to connect to 10.0.1.10 port 80: Connection refused"]);
  });

  test("help에 서비스 명령어가 나온다", async () => {
    const { run, pc } = await lab();
    const server = texts(await run(SRV, "help")).join("\n");
    expect(server).toContain("systemctl start <service>");
    expect(server).toContain("curl <url>");
    expect(texts(await pc("help")).join("\n")).not.toContain("systemctl");
  });
});

describe("주소와 이름 읽기", () => {
  test.each([
    ["10.0.2.10", { scheme: "http", host: "10.0.2.10", port: 80, path: "/" }],
    ["http://10.0.2.10/a/b.html", { scheme: "http", host: "10.0.2.10", port: 80, path: "/a/b.html" }],
    ["FTP://10.0.2.10/x", { scheme: "ftp", host: "10.0.2.10", port: 21, path: "/x" }],
    ["ftp://10.0.2.10", { scheme: "ftp", host: "10.0.2.10", port: 21, path: "/" }],
    ["10.0.2.10:8080/x", { scheme: "http", host: "10.0.2.10", port: 8080, path: "/x" }],
    ["https://10.0.2.10/", null],
    ["http://www.ping9.test/", null],
    ["http://10.0.2.300/", null],
    ["http://10.0.2.10:0/", null],
    ["http://10.0.2.10:70000/", null],
    ["http://10.0.2.10/a b", null],
    [`http://10.0.2.10/${"a".repeat(60)}`, null],
  ])("parseUrl(%s)", (value, expected) => {
    expect(parseUrl(value)).toEqual(expected);
  });

  test("읽을 수 없는 주소와 이름은 그 자리를 가리키는 오류다", async () => {
    const { pc } = await lab();
    expect((await pc("curl http://www.ping9.test/")).lines).toEqual([
      { kind: "error", code: "SERVICE_URL_INVALID", params: { value: "http://www.ping9.test/" }, position: 5 },
    ]);
    expect((await pc("nslookup bad_name 10.0.2.10")).lines[0]).toMatchObject({ kind: "error", code: "DNS_NAME_INVALID", position: 9 });
  });
});

describe("서비스 구성의 Command", () => {
  test("서버가 아닌 PC의 서비스는 바꿀 수 없다", async () => {
    const { send } = await lab();
    expect(send({ type: "pc/set-service", deviceId: PC1, service: "http", enabled: false })).toEqual({
      ok: false, error: { code: "PC_NOT_SERVER", params: { deviceId: PC1 } },
    });
    expect(send({ type: "pc/add-dns-record", deviceId: FW, name: "a.test", address: "10.0.0.1" })).toMatchObject({
      ok: false, error: { code: "DEVICE_KIND_MISMATCH" },
    });
  });

  test("서비스를 끄고 켜면 정해진 순서로 저장된다. 주소를 바꾸거나 종류를 바꿔도 남는다", async () => {
    const { sim, must, serverConfig } = await lab();
    expect(serverConfig().services).toBeUndefined();
    must({ type: "pc/set-service", deviceId: SRV, service: "dns", enabled: false });
    must({ type: "pc/set-service", deviceId: SRV, service: "http", enabled: false });
    must({ type: "pc/set-service", deviceId: SRV, service: "dns", enabled: true });
    expect(serverConfig().services).toEqual(["dns", "ntp", "ftp"]);
    must({ type: "pc/add-dns-record", deviceId: SRV, name: "a.test", address: "10.0.2.10" });
    must({ type: "pc/set-ip", deviceId: SRV, ip: "10.0.2.11", mask: "255.255.255.0", gateway: "10.0.2.1" });
    must({ type: "pc/set-os", deviceId: SRV, os: "windows" });
    must({ type: "interface/set-admin", deviceId: SRV, port: "Ethernet0", adminUp: false });
    must({ type: "pc/set-os", deviceId: SRV, os: "server" });
    expect(serverConfig()).toMatchObject({ services: ["dns", "ntp", "ftp"], dnsRecords: [{ name: "a.test", address: "10.0.2.10" }] });

    const saved = validateDocument(JSON.parse(JSON.stringify(sim.getSnapshot().document)));
    expect(saved.ok).toBe(true);
  });

  test("DNS 이름: 같은 이름은 주소를 바꾸고, 지울 수 있고, 한도가 있다", async () => {
    const { send, must, serverConfig } = await lab();
    must({ type: "pc/add-dns-record", deviceId: SRV, name: "a.test", address: "10.0.2.10" });
    must({ type: "pc/add-dns-record", deviceId: SRV, name: "A.TEST", address: "10.0.2.11" });
    expect(serverConfig().dnsRecords).toEqual([{ name: "a.test", address: "10.0.2.11" }]);
    must({ type: "pc/remove-dns-record", deviceId: SRV, name: "a.test" });
    expect(serverConfig().dnsRecords).toEqual([]);
    expect(send({ type: "pc/remove-dns-record", deviceId: SRV, name: "a.test" })).toMatchObject({ ok: false, error: { code: "DNS_RECORD_NOT_FOUND" } });
    for (let index = 0; index < 32; index += 1) must({ type: "pc/add-dns-record", deviceId: SRV, name: `h${index}.test`, address: "10.0.2.10" });
    expect(send({ type: "pc/add-dns-record", deviceId: SRV, name: "more.test", address: "10.0.2.10" })).toEqual({
      ok: false, error: { code: "LIMIT_EXCEEDED", params: { limit: "dnsRecords", max: 32 } },
    });
  });

  test.each<[string, Record<string, unknown>, string]>([
    ["없는 서비스", { type: "pc/set-service", service: "ssh", enabled: true }, "DOCUMENT_INVALID_SHAPE"],
    ["켜짐이 글", { type: "pc/set-service", service: "http", enabled: "yes" }, "DOCUMENT_INVALID_SHAPE"],
    ["이름이 수", { type: "pc/add-dns-record", name: 5, address: "10.0.2.10" }, "DNS_NAME_INVALID"],
    ["틀린 이름", { type: "pc/add-dns-record", name: "bad_name", address: "10.0.2.10" }, "DNS_NAME_INVALID"],
    ["긴 이름", { type: "pc/add-dns-record", name: `${"a".repeat(41)}.test`, address: "10.0.2.10" }, "DNS_NAME_INVALID"],
    ["틀린 주소", { type: "pc/add-dns-record", name: "a.test", address: "10.0.2.300" }, "INVALID_IPV4"],
    ["쓸 수 없는 주소", { type: "pc/add-dns-record", name: "a.test", address: "0.0.0.0" }, "RESERVED_IPV4"],
    ["주소가 객체", { type: "pc/add-dns-record", name: "a.test", address: {} }, "INVALID_IPV4"],
  ])("%s → %s", async (_name, command, code) => {
    const { send, sim } = await lab();
    const before = sim.getSnapshot().document;
    expect(send({ deviceId: SRV, ...command })).toMatchObject({ ok: false, error: { code } });
    expect(sim.getSnapshot().document).toBe(before);
  });
});

describe("검토에서 나온 것", () => {
  test("가장 긴 DNS 이름으로 물어도 추적이 형식에 맞는다", async () => {
    const { pc, must, sim } = await lab();
    const name = `${"a".repeat(40)}.test`;
    must({ type: "pc/add-dns-record", deviceId: SRV, name, address: "192.168.100.100" });
    expect(texts(await pc(`nslookup ${name} 10.0.2.10`)).at(-1)).toBe("Address: 192.168.100.100");
    expect(texts(await pc(`nslookup ${"b".repeat(40)}.test 10.0.2.10`)).at(-1)).toContain("NXDOMAIN");
    for (const summary of sim.getSnapshot().traces) expect(validateTrace(sim.getTrace(summary.id))).toMatchObject({ ok: true });
  });

  test("Firewall 자신의 주소로 보낸 요청은 닫힌 포트로 거절되고 이유가 남는다", async () => {
    const { pc, primaryDrop } = await lab();
    expect(texts(await pc("curl http://10.0.1.1/"))).toEqual(["curl: (7) Failed to connect to 10.0.1.1 port 80: Connection refused"]);
    expect(primaryDrop().reason).toEqual({ code: "PORT_CLOSED", params: { device: { deviceId: FW, deviceName: "FW1" }, protocol: "tcp", port: 80 } });
    expect(texts(await pc("nslookup a.test 10.0.1.1"))[0]).toBe(";; communications error to 10.0.1.1#53: connection refused");
    expect(primaryDrop().reason).toMatchObject({ code: "PORT_CLOSED", params: { protocol: "udp", port: 53 } });
  });

  test("경로가 고리를 이뤄 TTL이 끝나면 거절이 아니라 닿지 않음으로 보인다", async () => {
    const { pc, fw, must, run, lastTrace } = await lab();
    // 두 번째 Firewall을 달고 172.16/16을 서로에게 보내게 한다
    must({ type: "device/add", id: MID, kind: "firewall", position: { x: 200, y: 200 } });
    must({ type: "link/add", id: "77777777-7777-4777-8777-777777777777", ends: [{ deviceId: FW, port: "Ethernet2" }, { deviceId: MID, port: "Ethernet0" }] });
    await fw("ip addr add 10.0.3.1/24 dev eth2");
    await fw("ip route add 172.16.0.0/16 via 10.0.3.2");
    for (const line of ["ip addr add 10.0.3.2/24 dev eth0", "ip route add 172.16.0.0/16 via 10.0.3.1", "ip route add 10.0.1.0/24 via 10.0.3.1"]) {
      expect((await run(MID, line)).lines).toEqual([]);
    }
    expect(texts(await pc("curl http://172.16.0.1/"))).toEqual(["curl: (7) Failed to connect to 172.16.0.1 port 80: No route to host"]);
    const trace = lastTrace();
    expect(validateTrace(trace)).toMatchObject({ ok: true });
    expect(trace.events.some((event) => event.reason.code === "TTL_EXPIRED")).toBe(true);
    expect(texts(await pc("nslookup a.test 172.16.0.1"))[0]).toBe(";; communications error to 172.16.0.1#53: timed out");
  });

  test("서버 포트가 높은 수여도 닫혀 있으면 RST다", async () => {
    const { pc, primaryDrop } = await lab();
    expect(texts(await pc("curl 10.0.2.10:8080"))).toEqual(["curl: (7) Failed to connect to 10.0.2.10 port 8080: Connection refused"]);
    expect(primaryDrop().reason).toMatchObject({ code: "PORT_CLOSED", params: { protocol: "tcp", port: 8080 } });
  });

  test("HTTP로 FTP 포트에 물으면 받은 줄을 그대로 보인다", async () => {
    const { pc } = await lab();
    expect(texts(await pc("curl http://10.0.2.10:21/"))).toEqual(["550 File not found"]);
  });
});

describe("Router와 서비스 요청", () => {
  test("Router 자신의 주소로 보낸 요청은 닫힌 포트로 거절된다", async () => {
    const { pc, primaryDrop } = await lab("router");
    expect(texts(await pc("curl http://10.0.1.1/"))).toEqual(["curl: (7) Failed to connect to 10.0.1.1 port 80: Connection refused"]);
    expect(primaryDrop().reason).toMatchObject({ code: "PORT_CLOSED", params: { protocol: "tcp", port: 80 } });
    expect(texts(await pc("ntpdate -q 10.0.1.1"))).toEqual(["ntpdate: no server suitable for synchronization found"]);
    expect(primaryDrop().reason).toMatchObject({ code: "PORT_CLOSED", params: { protocol: "udp", port: 123 } });
  });

  test("Router에 경로가 없으면 ICMP 도달 불가가 돌아와 바로 실패한다", async () => {
    const { pc, lastTrace } = await lab("router");
    expect(texts(await pc("curl http://172.16.0.1/"))).toEqual(["curl: (7) Failed to connect to 172.16.0.1 port 80: Connection refused"]);
    const trace = lastTrace();
    expect(validateTrace(trace)).toMatchObject({ ok: true });
    expect(trace.events.map((event) => event.reason.code)).toEqual(expect.arrayContaining(["NO_ROUTE", "ICMP_ERROR_SENT", "ICMP_ERROR_RECEIVED"]));
    // ping의 오류는 예전 그대로다
    expect(texts(await pc("ping -c 1 172.16.0.1")).join("\n")).toContain("Destination Net Unreachable");
  });
});
