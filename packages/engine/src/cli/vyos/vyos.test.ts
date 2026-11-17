import { PORT_NAMES, validateTrace } from "@ping9/shared";
import type { Command, ConsoleResult, RouterDevice, TopologyDocument } from "@ping9/shared";
import { greLabDocument, ipsecLabDocument, VPN_LAB as LAB, vpnUnderlayDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";
import { createSimulator } from "../../simulator";

const text = (result: ConsoleResult) => result.lines.flatMap(line => line.kind === "text" ? [line.text] : []).join("\n");
const open = (document: TopologyDocument = vpnUnderlayDocument) => {
  const sim = createSimulator(); expect(sim.load(document).ok).toBe(true);
  for (const deviceId of [LAB.r1, LAB.r2]) expect(sim.dispatch({ type: "router/set-cli-style", deviceId, style: "vyos" }).ok).toBe(true);
  return sim;
};
type Sim = ReturnType<typeof open>;
const router = (sim: Sim, id: string = LAB.r1) => sim.getSnapshot().document.devices.find(device => device.id === id) as RouterDevice;
async function run(sim: Sim, id: string, commands: readonly string[]) {
  for (const command of commands) expect((await sim.console(id).exec(command)).lines.filter(line => line.kind === "error"), command).toEqual([]);
}
const pcPing = async (sim: Sim, id: string = LAB.pcA, target = "192.168.2.10") => text(await sim.console(id).exec(`ping -n 1 ${target}`));
const trace = (sim: Sim) => sim.getTrace(sim.getSnapshot().traces[0]!.id)!;
const gre = (left: boolean) => [
  "set interfaces tunnel tun0 encapsulation gre",
  `set interfaces tunnel tun0 source-address ${left ? "10.0.13.1" : "10.0.23.2"}`,
  `set interfaces tunnel tun0 remote ${left ? "10.0.23.2" : "10.0.13.1"}`,
  `set interfaces tunnel tun0 address ${left ? "172.16.12.1" : "172.16.12.2"}/30`,
  `set protocols static route ${left ? "192.168.2.0" : "192.168.1.0"}/24 next-hop ${left ? "172.16.12.2" : "172.16.12.1"}`,
];
const ipsec = (left: boolean) => {
  const name = left ? "R2" : "R1", root = `set vpn ipsec site-to-site peer ${name}`;
  return [
    `set vpn ipsec interface ${left ? "eth1" : "eth0"}`,
    "set vpn ipsec ike-group IKE key-exchange ikev2", "set vpn ipsec ike-group IKE lifetime 28800",
    "set vpn ipsec ike-group IKE proposal 10 encryption aes256", "set vpn ipsec ike-group IKE proposal 10 hash sha256", "set vpn ipsec ike-group IKE proposal 10 dh-group 14",
    "set vpn ipsec esp-group ESP mode tunnel", "set vpn ipsec esp-group ESP lifetime 3600", "set vpn ipsec esp-group ESP pfs enable",
    "set vpn ipsec esp-group ESP proposal 10 encryption aes256", "set vpn ipsec esp-group ESP proposal 10 hash sha256",
    "set vpn ipsec authentication psk LAB id 10.0.13.1", "set vpn ipsec authentication psk LAB id 10.0.23.2", "set vpn ipsec authentication psk LAB secret 'LAB_SHARED'",
    `${root} local-address ${left ? "10.0.13.1" : "10.0.23.2"}`, `${root} remote-address ${left ? "10.0.23.2" : "10.0.13.1"}`,
    `${root} authentication mode pre-shared-secret`, `${root} ike-group IKE`, `${root} default-esp-group ESP`,
    `${root} tunnel 0 local prefix ${left ? "192.168.1.0" : "192.168.2.0"}/24`, `${root} tunnel 0 remote prefix ${left ? "192.168.2.0" : "192.168.1.0"}/24`,
    `set protocols static route ${left ? "192.168.2.0" : "192.168.1.0"}/24 next-hop ${left ? "10.0.13.2" : "10.0.23.1"}`,
  ];
};
async function both(sim: Sim, make: (left: boolean) => readonly string[]) {
  for (const id of [LAB.r1, LAB.r2]) await run(sim, id, ["configure", ...make(id === LAB.r1), "commit", "exit"]);
}

describe("VyOS 1.4 VPN subset", () => {
  test.each([["GRE", gre], ["IPsec", ipsec]] as const)("%s candidate는 트래픽에 영향이 없고 commit 후 양방향 PC·Router ping을 전달한다", async (mode, make) => {
    const sim = open(); const before = router(sim).config;
    expect(sim.console(LAB.r1).prompt()).toBe("vyos@R1:~$");
    await run(sim, LAB.r1, ["configure", ...make(true)]);
    expect(sim.console(LAB.r1).prompt()).toBe("vyos@R1#");
    expect(router(sim).config).toBe(before);
    expect(await pcPing(sim)).not.toContain("bytes=32");
    await run(sim, LAB.r1, ["commit", "exit"]);
    await run(sim, LAB.r2, ["configure", ...make(false), "commit", "exit"]);
    expect(await pcPing(sim)).toContain("TTL=126");
    expect(await pcPing(sim, LAB.pcB, "192.168.1.10")).toContain("TTL=126");
    expect(text(await sim.console(LAB.r1).exec("ping 192.168.2.10"))).toContain("Success rate: 4/4");
    expect(validateTrace(trace(sim)).ok).toBe(true);
    const encapsulation = mode === "GRE" ? "GRE_ENCAPSULATED" : "IPSEC_PROTECTED";
    expect(trace(sim).events.some(event => event.reason.code === encapsulation)).toBe(true);
    if (mode === "IPsec") {
      const a = Object.values(router(sim).config.ipsec!)[0]!, b = Object.values(router(sim, LAB.r2).config.ipsec!)[0]!;
      expect(a.inboundSpi).toBe(b.outboundSpi); expect(a.outboundSpi).toBe(b.inboundSpi);
      expect(text(await sim.console(LAB.r1).exec("show vpn ipsec sa"))).toContain("R2: active");
      expect(text(await sim.console(LAB.r1).exec("show vpn ipsec connections"))).toContain("NO encryption");
      expect(router(sim).config.tunnels).toBeUndefined();
    }
  });

  test("잘못된 candidate commit은 원자적으로 실패하고 수정 후 같은 세션에서 복구한다", async () => {
    const sim = open(); const before = sim.getSnapshot().document;
    await run(sim, LAB.r1, ["configure", ...gre(true), "set interfaces tunnel tun0 remote 999.1.1.1"]);
    expect((await sim.console(LAB.r1).exec("commit")).lines.some(line => line.kind === "error")).toBe(true);
    expect(sim.getSnapshot().document).toBe(before);
    expect(text(await sim.console(LAB.r1).exec("show"))).toContain("999.1.1.1");
    await run(sim, LAB.r1, ["set interfaces tunnel tun0 remote 10.0.23.2", "commit"]);
    expect(router(sim).config.tunnels!.Tunnel0!.destination).toBe("10.0.23.2");
    const committed = sim.getSnapshot().document;
    await run(sim, LAB.r1, ["set interfaces ethernet eth0 address 192.168.1.20/24"]);
    expect((await sim.console(LAB.r1).exec("commit")).lines.some(line => line.kind === "error")).toBe(true);
    expect(sim.getSnapshot().document).toBe(committed);
  });

  test("candidate가 있으면 exit로 유실되지 않고 discard로 취소하며 설정 모드 조회/ping은 run이다", async () => {
    const sim = open(); await run(sim, LAB.r1, ["configure", ...gre(true)]);
    expect(text(await sim.console(LAB.r1).exec("exit"))).toContain("Uncommitted");
    expect(sim.console(LAB.r1).prompt()).toBe("vyos@R1#");
    expect(text(await sim.console(LAB.r1).exec("run show ip route"))).toContain("10.0.13.0/30");
    expect((await sim.console(LAB.r1).exec("show ip route")).lines.some(line => line.kind === "error")).toBe(true);
    await run(sim, LAB.r1, ["discard", "exit"]);
    expect(router(sim).config.tunnels).toBeUndefined();
    await run(sim, LAB.r1, ["configure", ...gre(true), "exit discard"]);
    expect(sim.console(LAB.r1).prompt()).toBe("vyos@R1:~$");
  });

  test.each(["key", "policy", "id"])("IPsec %s 불일치는 교육 정책 검사에서 거절하고 평문 우회하지 않는다", async problem => {
    const sim = open(); await both(sim, ipsec);
    expect(await pcPing(sim)).toContain("bytes=32");
    const change = problem === "key" ? ["set vpn ipsec authentication psk LAB secret WRONG"] : problem === "policy" ? ["set vpn ipsec esp-group ESP proposal 10 encryption aes128"] : [
      "set vpn ipsec authentication psk LAB id wrong-id", "set vpn ipsec site-to-site peer R1 authentication remote-id wrong-id",
    ];
    await run(sim, LAB.r2, ["configure", ...change, "commit", "exit"]);
    expect(await pcPing(sim)).not.toContain("bytes=32");
    expect(trace(sim).events.some(event => event.dropReason === "IPSEC_REJECTED")).toBe(true);
    expect(trace(sim).events.some(event => event.deviceId === LAB.isp && event.frame.ipv4?.sourceIp === "192.168.1.10")).toBe(false);
  });

  test("참조된 PSK 삭제는 실패하고 peer 삭제 후에는 일반 라우팅으로 돌아간다", async () => {
    const sim = open(); await both(sim, ipsec); const before = router(sim).config;
    await run(sim, LAB.r1, ["configure", "delete vpn ipsec authentication psk LAB"]);
    expect((await sim.console(LAB.r1).exec("commit")).lines.some(line => line.kind === "error")).toBe(true);
    expect(router(sim).config).toBe(before);
    await run(sim, LAB.r1, ["discard", "delete vpn ipsec site-to-site peer R2", "commit", "exit"]);
    expect(router(sim).config.ipsec).toBeUndefined();
    expect(await pcPing(sim)).not.toContain("bytes=32"); // ISP에는 사설 LAN의 경로가 없다.
    expect(trace(sim).events.some(event => event.reason.code === "IPSEC_PROTECTED")).toBe(false);
  });

  test.each([[gre, "set interfaces tunnel tun0 disable", "delete interfaces tunnel tun0 disable"], [ipsec, "set vpn ipsec site-to-site peer R2 tunnel 0 disable", "delete vpn ipsec site-to-site peer R2 tunnel 0 disable"]] as const)("disable도 commit부터 반영되고 delete disable로 복구한다", async (make, disable, enable) => {
    const sim = open(); await both(sim, make);
    await run(sim, LAB.r1, ["configure", disable]); expect(await pcPing(sim)).toContain("bytes=32");
    await run(sim, LAB.r1, ["commit"]); expect(await pcPing(sim)).not.toContain("bytes=32");
    await run(sim, LAB.r1, [enable, "commit", "exit"]); expect(await pcPing(sim)).toContain("bytes=32");
  });

  test("양쪽 VyOS IPsec 정책 disable 뒤 일반 경로가 있으면 ESP 없이 전달한다", async () => {
    const sim = open(); await both(sim, ipsec);
    for (const [network, nextHop] of [["192.168.1.0", "10.0.13.1"], ["192.168.2.0", "10.0.23.2"]] as const) {
      expect(sim.dispatch({ type: "route/add", deviceId: LAB.isp, network, mask: "255.255.255.0", nextHop }).ok).toBe(true);
    }
    for (const [id, name] of [[LAB.r1, "R2"], [LAB.r2, "R1"]] as const) await run(sim, id, ["configure", `set vpn ipsec site-to-site peer ${name} tunnel 0 disable`, "commit", "exit"]);
    expect(await pcPing(sim)).toContain("TTL=125");
    expect(trace(sim).events.some(event => event.frame.esp !== undefined)).toBe(false);
  });

  test.each(["delete interfaces tunnel tun0 source-address", "set vpn ipsec ike-group UNUSED proposal 10 encryption typo"])("미완성 터널과 사용하지 않는 그룹의 잘못된 값도 commit을 거부한다", async change => {
    const sim = open(); await run(sim, LAB.r1, ["configure", ...gre(true), change]);
    const before = sim.getSnapshot().document;
    expect((await sim.console(LAB.r1).exec("commit")).lines.some(line => line.kind === "error")).toBe(true);
    expect(sim.getSnapshot().document).toBe(before);
  });

  test("다른 편집기의 활성 변경을 stale candidate가 덮어쓰지 않으며 discard 후 새 설정으로 시작한다", async () => {
    const sim = open(); await both(sim, gre); await run(sim, LAB.r1, ["configure", "set interfaces tunnel tun0 disable"]);
    expect(sim.dispatch({ type: "interface/set-admin", deviceId: LAB.r1, port: PORT_NAMES.router[0], adminUp: false }).ok).toBe(true);
    expect(text(await sim.console(LAB.r1).exec("commit"))).toContain("다른 곳에서 변경");
    await run(sim, LAB.r1, ["discard", "commit", "exit"]);
    expect(router(sim).config.interfaces[PORT_NAMES.router[0]]!.adminUp).toBe(false);
    expect(router(sim).config.tunnels!.Tunnel0!.adminUp).toBe(true);
  });

  test.each([greLabDocument, ipsecLabDocument])("기존 문서 변환과 set 출력 재실행 및 JSON 저장·복원을 지원한다", async document => {
    const source = open(document); await run(source, LAB.r1, ["configure", "commit", "exit"]);
    await run(source, LAB.r2, ["configure", "commit", "exit"]);
    expect(await pcPing(source)).toContain("bytes=32");
    const target = open();
    for (const id of [LAB.r1, LAB.r2]) {
      const output = text(await source.console(id).exec("show configuration commands"));
      await run(target, id, ["configure", ...output.split("\n"), "commit", "exit"]);
      // 기존 수동 SPI는 source에 남고 target은 자동 번호를 생성한다. 각 쌍은 서로 대응한다.
      expect(router(target, id).config.vyos).toEqual(router(source, id).config.vyos);
    }
    expect(await pcPing(target)).toContain("bytes=32");
    await run(target, LAB.r1, ["configure", "set interfaces ethernet eth0 disable"]);
    const saved = JSON.parse(JSON.stringify(target.getSnapshot().document));
    expect(JSON.stringify(saved)).not.toContain("vyosCandidate");
    const restored = open(saved); expect(await pcPing(restored)).toContain("bytes=32");
    expect(restored.console(LAB.r1).prompt()).toBe("vyos@R1:~$");
  });

  test("스타일 변경은 세션을 초기화하고 기존 IOS는 독립적으로 작동한다", async () => {
    const sim = open(); await run(sim, LAB.r1, ["configure", ...gre(true)]);
    sim.dispatch({ type: "router/set-cli-style", deviceId: LAB.r1, style: "ios" });
    expect(sim.console(LAB.r1).prompt()).toBe("R1>");
    await run(sim, LAB.r1, ["enable", "configure terminal", "interface gi0/0", "no shutdown", "end"]);
    expect(router(sim).config.tunnels).toBeUndefined();
    expect(sim.dispatch({ type: "router/set-cli-style", deviceId: LAB.pcA, style: "vyos" }).ok).toBe(false);
    expect(sim.dispatch({ type: "router/set-cli-style", deviceId: LAB.r1, style: "bad" } as unknown as Command).ok).toBe(false);
  });

  test.each(["set vpn mode ipsec", "set interfaces tunnel tun9 remote 10.0.1.1", "set vpn ipsec ike-group __proto__ key-exchange ikev2", "set vpn ipsec ike-group IKE proposal 1 encryption aes256", "set interfaces tunnel tun0 remote '10.0.1.1", "commit; exit", "save"])("지원 밖 문법을 적용한 것처럼 성공시키지 않는다: %s", async command => {
    const sim = open(); await run(sim, LAB.r1, ["configure"]); const before = sim.getSnapshot().document;
    expect((await sim.console(LAB.r1).exec(command)).lines.some(line => line.kind === "error")).toBe(true);
    expect(sim.getSnapshot().document).toBe(before);
  });

  test("도움말/Tab은 VyOS 모드와 IOS 모드를 구분한다", async () => {
    const sim = open(); const cli = sim.console(LAB.r1);
    expect(cli.complete("conf")).toBe("configure ");
    expect(cli.help("show vpn ipsec ").map(entry => entry.token)).toEqual(["connections", "sa"]);
    await run(sim, LAB.r1, ["configure"]);
    expect(cli.complete("set interfaces tunnel tun0 enc")).toBe("set interfaces tunnel tun0 encapsulation gre ");
    expect(cli.help("set vpn ipsec ").map(entry => entry.token)).toContain("site-to-site");
    expect(cli.help("set vpn ipsec site-to-site peer CUSTOM ").map(entry => entry.token)).toContain("local-address");
    expect(cli.complete("set interfaces tunnel tun2 source-a")).toBe("set interfaces tunnel tun2 source-address <IPv4>");
  });
});
