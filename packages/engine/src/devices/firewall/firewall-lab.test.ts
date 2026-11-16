// Firewall 실습 (T14.2.1). PC1 — eth0 [FW1] eth1 — PC2. 공개 인터페이스(createSimulator)로만 확인한다.
import { validateDocument, validateTrace } from "@ping9/shared";
import type { ConsoleResult, FirewallDevice, Trace } from "@ping9/shared";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../../simulator";

const PC1 = "11111111-1111-4111-8111-111111111111";
const PC2 = "22222222-2222-4222-8222-222222222222";
const FW = "33333333-3333-4333-8333-333333333333";
const LINK1 = "44444444-4444-4444-8444-444444444444";
const LINK2 = "55555555-5555-4555-8555-555555555555";

const texts = (result: ConsoleResult): string[] => result.lines.map((line) => (line.kind === "text" ? line.text : `[${line.kind}]`));
const replies = (result: ConsoleResult): number => texts(result).filter((line) => line.includes("bytes=32")).length;

/** 주소까지 넣은 실습 토폴로지. 필터는 처음 상태(모두 ACCEPT, 규칙 없음)다 */
async function lab() {
  const sim = createSimulator();
  const ok = (result: { readonly ok: boolean }) => expect(result).toMatchObject({ ok: true });
  ok(sim.dispatch({ type: "device/add", id: PC1, kind: "pc", position: { x: 0, y: 0 } }));
  ok(sim.dispatch({ type: "device/add", id: PC2, kind: "pc", position: { x: 400, y: 0 } }));
  ok(sim.dispatch({ type: "device/add", id: FW, kind: "firewall", position: { x: 200, y: 0 } }));
  ok(sim.dispatch({ type: "link/add", id: LINK1, ends: [{ deviceId: PC1, port: "Ethernet0" }, { deviceId: FW, port: "Ethernet0" }] }));
  ok(sim.dispatch({ type: "link/add", id: LINK2, ends: [{ deviceId: PC2, port: "Ethernet0" }, { deviceId: FW, port: "Ethernet1" }] }));
  ok(sim.dispatch({ type: "pc/set-ip", deviceId: PC1, ip: "10.0.1.10", mask: "255.255.255.0", gateway: "10.0.1.1" }));
  ok(sim.dispatch({ type: "pc/set-ip", deviceId: PC2, ip: "10.0.2.10", mask: "255.255.255.0", gateway: "10.0.2.1" }));

  const fw = sim.console(FW);
  /** 오류 없이 끝나야 하는 Firewall 명령 */
  const run = async (line: string) => {
    const result = await fw.exec(line);
    expect(result.lines.filter((entry) => entry.kind === "error")).toEqual([]);
    return result;
  };
  await run("ip addr add 10.0.1.1/24 dev eth0");
  await run("ip addr add 10.0.2.1/24 dev eth1");

  const ping = (from: string, target: string) => sim.console(from).exec(`ping -n 1 ${target}`);
  /** 가장 최근 추적 */
  const lastTrace = (): Trace => sim.getTrace(sim.getSnapshot().traces[0]!.id)!;
  /** 가장 최근 추적에서 실패의 원인이 된 폐기 */
  const primaryDrop = () => {
    const trace = lastTrace();
    expect(validateTrace(trace).ok).toBe(true);
    return trace.events[trace.result.primaryDropSeq!]!;
  };
  const config = () => (sim.getSnapshot().document.devices.find((device) => device.id === FW) as FirewallDevice).config;
  return { sim, fw, run, ping, lastTrace, primaryDrop, config };
}

describe("Firewall은 인터페이스 사이에서 패킷을 전달한다", () => {
  test("새 Firewall의 이름은 FW1이고 인터페이스는 켜져 있으며 필터는 모두 ACCEPT다", async () => {
    const { sim, fw, config } = await lab();
    expect(fw.prompt()).toBe("root@FW1:~#");
    expect(config().filter).toEqual({
      INPUT: { policy: "ACCEPT", rules: [] }, FORWARD: { policy: "ACCEPT", rules: [] }, OUTPUT: { policy: "ACCEPT", rules: [] },
    });
    expect(Object.values(config().interfaces).every((iface) => iface.adminUp)).toBe(true);
    expect(validateDocument(sim.getSnapshot().document).ok).toBe(true);
  });

  test("규칙이 없으면 두 네트워크 사이의 ping이 양방향으로 성공하고 TTL이 1 줄어든다", async () => {
    const { ping, lastTrace } = await lab();
    const there = await ping(PC1, "10.0.2.10");
    expect(replies(there)).toBe(1);
    expect(texts(there).join("\n")).toContain("TTL=127");
    expect(validateTrace(lastTrace()).ok).toBe(true);
    expect(replies(await ping(PC2, "10.0.1.10"))).toBe(1);
  });

  test("화면용 값에 라우팅 테이블과 ARP 테이블이 있다", async () => {
    const { sim, ping } = await lab();
    await ping(PC1, "10.0.2.10");
    const view = sim.getSnapshot().views[FW]!;
    expect(view.kind).toBe("firewall");
    if (view.kind !== "firewall") return;
    expect(view.routingTable.map((route) => `${route.source} ${route.network} ${route.port}`)).toEqual([
      "connected 10.0.1.0 Ethernet0", "connected 10.0.2.0 Ethernet1",
    ]);
    expect(view.arpTable.map((entry) => `${entry.ip} ${entry.port}`).sort()).toEqual(["10.0.1.10 Ethernet0", "10.0.2.10 Ethernet1"]);
  });

  test("Firewall 자신도 ping에 답하고 ping을 보낸다", async () => {
    const { ping, run } = await lab();
    expect(replies(await ping(PC1, "10.0.1.1"))).toBe(1);
    const sent = texts(await run("ping -c 2 10.0.2.10")).join("\n");
    expect(sent).toContain("2 packets transmitted, 2 received, 0% packet loss");
  });

  test("Static route로 그 너머의 네트워크에 보낸다. 다음 홉에 닿지 않으면 경로 표에 없다", async () => {
    const { run } = await lab();
    await run("ip route add 192.168.9.0/24 via 10.0.2.10");
    await run("ip route add default via 10.0.1.10");
    await run("ip route add 172.16.0.0/16 via 10.9.9.9");
    expect(texts(await run("ip route"))).toEqual([
      "default via 10.0.1.10 dev eth0",
      "10.0.1.0/24 dev eth0 proto kernel scope link src 10.0.1.1",
      "10.0.2.0/24 dev eth1 proto kernel scope link src 10.0.2.1",
      "192.168.9.0/24 via 10.0.2.10 dev eth1",
    ]);
    await run("ip route del 192.168.9.0/24");
    await run("ip route del default via 10.0.1.10");
    expect(texts(await run("ip route del 192.168.9.0/24"))).toEqual(["RTNETLINK answers: No such process"]);
    expect(texts(await run("ip route"))).toHaveLength(2);
  });

  test("인터페이스를 끄면 전달하지 않고, 켜면 다시 전달한다", async () => {
    const { ping, run } = await lab();
    await run("ip link set eth1 down");
    expect(replies(await ping(PC1, "10.0.2.10"))).toBe(0);
    expect(texts(await run("ip link show eth1"))[0]).toContain("state DOWN");
    await run("ip link set eth1 up");
    expect(replies(await ping(PC1, "10.0.2.10"))).toBe(1);
  });
});

describe("FORWARD 체인은 지나가는 패킷을 거른다", () => {
  test("DROP 규칙에 맞으면 버리고, 어느 규칙이 막았는지 폐기 사유에 남는다 (Story 14.3)", async () => {
    const { ping, run, primaryDrop } = await lab();
    await run("iptables -A FORWARD -p tcp --dport 22 -j ACCEPT");
    await run("iptables -A FORWARD -s 10.0.1.0/24 -p icmp -j DROP");
    const result = await ping(PC1, "10.0.2.10");
    expect(replies(result)).toBe(0);
    expect(texts(result).join("\n")).toContain("Request timed out.");
    const drop = primaryDrop();
    expect(drop.deviceId).toBe(FW);
    expect(drop.inPort).toBe("Ethernet0");
    expect(drop.outPort).toBe("Ethernet1");
    expect(drop.reason).toEqual({
      code: "FIREWALL_BLOCKED",
      params: { device: { deviceId: FW, deviceName: "FW1" }, chain: "FORWARD", target: "DROP", rule: 2 },
    });
  });

  test("무상태라 한 방향만 막아도 반대 방향 ping이 실패한다: 응답이 돌아오지 못한다", async () => {
    const { ping, run, primaryDrop } = await lab();
    await run("iptables -A FORWARD -s 10.0.1.0/24 -p icmp --icmp-type echo-reply -j DROP");
    expect(replies(await ping(PC1, "10.0.2.10"))).toBe(1);
    expect(replies(await ping(PC2, "10.0.1.10"))).toBe(0);
    expect(primaryDrop().frame.icmp?.type).toBe("echo-reply");
  });

  test("REJECT는 보낸 쪽에 ICMP 도달 불가를 돌려준다", async () => {
    const { ping, run, primaryDrop } = await lab();
    await run("iptables -A FORWARD -d 10.0.2.10 -j REJECT");
    const result = await ping(PC1, "10.0.2.10");
    expect(texts(result).join("\n")).toContain("Reply from 10.0.1.1: Destination net unreachable.");
    expect(primaryDrop().reason).toMatchObject({ code: "FIREWALL_BLOCKED", params: { chain: "FORWARD", target: "REJECT", rule: 1 } });
  });

  test("기본 정책이 DROP이면 허용한 것만 지나간다. 정책이 막으면 규칙 번호가 없다", async () => {
    const { ping, run, primaryDrop } = await lab();
    await run("iptables -P FORWARD DROP");
    expect(replies(await ping(PC1, "10.0.2.10"))).toBe(0);
    expect(primaryDrop().reason).toEqual({
      code: "FIREWALL_BLOCKED", params: { device: { deviceId: FW, deviceName: "FW1" }, chain: "FORWARD", target: "DROP" },
    });
    await run("iptables -A FORWARD -i eth0 -o eth1 -p icmp --icmp-type echo-request -j ACCEPT");
    await run("iptables -A FORWARD -i eth1 -o eth0 -p icmp --icmp-type echo-reply -j ACCEPT");
    expect(replies(await ping(PC1, "10.0.2.10"))).toBe(1);
    // 반대 방향의 요청은 허용한 적이 없다
    expect(replies(await ping(PC2, "10.0.1.10"))).toBe(0);
    // Firewall 자신에게 온 것은 FORWARD가 아니라 INPUT이라 그대로 된다
    expect(replies(await ping(PC1, "10.0.1.1"))).toBe(1);
  });

  test("들어온 인터페이스와 나가는 인터페이스로 고른다", async () => {
    const { ping, run } = await lab();
    await run("iptables -A FORWARD -i eth1 -p icmp --icmp-type echo-request -j DROP");
    expect(replies(await ping(PC1, "10.0.2.10"))).toBe(1);
    expect(replies(await ping(PC2, "10.0.1.10"))).toBe(0);
  });

  test("위에서부터 보고 처음 맞는 규칙을 따른다. -I로 앞에 끼우면 결과가 바뀐다", async () => {
    const { ping, run } = await lab();
    await run("iptables -A FORWARD -p icmp -j DROP");
    expect(replies(await ping(PC1, "10.0.2.10"))).toBe(0);
    await run("iptables -I FORWARD -s 10.0.1.10 -j ACCEPT");
    await run("iptables -I FORWARD 2 -d 10.0.1.10 -j ACCEPT");
    expect(replies(await ping(PC1, "10.0.2.10"))).toBe(1);
  });
});

describe("INPUT과 OUTPUT 체인은 Firewall 자신의 패킷을 거른다", () => {
  test("INPUT에서 막으면 Firewall은 답하지 않지만 지나가는 패킷은 그대로 간다", async () => {
    const { ping, run, primaryDrop } = await lab();
    await run("iptables -A INPUT -p icmp --icmp-type 8 -j DROP");
    expect(replies(await ping(PC1, "10.0.1.1"))).toBe(0);
    expect(primaryDrop().reason).toMatchObject({ code: "FIREWALL_BLOCKED", params: { chain: "INPUT", rule: 1 } });
    expect(replies(await ping(PC1, "10.0.2.10"))).toBe(1);
  });

  test("OUTPUT에서 막으면 Firewall의 ping이 나가지 못한다", async () => {
    const { run, primaryDrop } = await lab();
    await run("iptables -A OUTPUT -d 10.0.2.0/24 -j DROP");
    expect(texts(await run("ping -c 1 10.0.2.10")).join("\n")).toContain("100% packet loss");
    const drop = primaryDrop();
    expect(drop.outPort).toBe("Ethernet1");
    expect(drop.reason).toMatchObject({ code: "FIREWALL_BLOCKED", params: { chain: "OUTPUT", target: "DROP", rule: 1 } });
    // 다른 쪽으로는 나간다
    expect(texts(await run("ping -c 1 10.0.1.10")).join("\n")).toContain("1 received");
  });

  test("OUTPUT에서 응답을 막으면 ping을 받은 Firewall의 응답이 나가지 못한다", async () => {
    const { ping, run, primaryDrop } = await lab();
    await run("iptables -A OUTPUT -p icmp --icmp-type echo-reply -j DROP");
    expect(replies(await ping(PC1, "10.0.1.1"))).toBe(0);
    expect(primaryDrop().reason).toMatchObject({ code: "FIREWALL_BLOCKED", params: { chain: "OUTPUT" } });
  });

  test("ping으로 돌아온 응답은 INPUT을 지난다", async () => {
    const { run } = await lab();
    await run("iptables -P INPUT DROP");
    expect(texts(await run("ping -c 1 10.0.2.10")).join("\n")).toContain("100% packet loss");
    await run("iptables -A INPUT -p icmp --icmp-type echo-reply -j ACCEPT");
    expect(texts(await run("ping -c 1 10.0.2.10")).join("\n")).toContain("1 received");
  });
});

describe("규칙은 토폴로지에 저장된다", () => {
  test("문서를 내보냈다가 다시 열어도 규칙이 그대로 막는다", async () => {
    const { sim, run } = await lab();
    await run("iptables -A FORWARD -s 10.0.1.10 -d 10.0.2.10 -i eth0 -o eth1 -p icmp --icmp-type echo-request -j DROP");
    await run("iptables -A INPUT -p tcp --sport 1000:2000 --dport 22 -j REJECT");
    await run("iptables -P OUTPUT DROP");
    const saved = JSON.parse(JSON.stringify(sim.getSnapshot().document)) as unknown;
    const checked = validateDocument(saved);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;

    const reopened = createSimulator();
    expect(reopened.load(checked.document).ok).toBe(true);
    expect(texts(await reopened.console(FW).exec("iptables -S"))).toEqual([
      "-P INPUT ACCEPT",
      "-P FORWARD ACCEPT",
      "-P OUTPUT DROP",
      "-A INPUT -p tcp -m tcp --sport 1000:2000 --dport 22 -j REJECT",
      "-A FORWARD -s 10.0.1.10/32 -d 10.0.2.10/32 -i eth0 -o eth1 -p icmp -m icmp --icmp-type 8 -j DROP",
    ]);
    expect(replies(await reopened.console(PC1).exec("ping -n 1 10.0.2.10"))).toBe(0);
  });

  test("장비를 지우면 모델도 사라지고, 케이블을 떼면 ARP 항목이 비워진다", async () => {
    const { sim, ping } = await lab();
    await ping(PC1, "10.0.2.10");
    expect(sim.dispatch({ type: "link/remove", linkId: LINK2 }).ok).toBe(true);
    const view = sim.getSnapshot().views[FW]!;
    expect(view.kind === "firewall" && view.arpTable.map((entry) => entry.port)).toEqual(["Ethernet0"]);
    expect(sim.dispatch({ type: "device/remove", deviceId: FW }).ok).toBe(true);
    expect(sim.getSnapshot().views[FW]).toBeUndefined();
    expect(replies(await ping(PC1, "10.0.2.10"))).toBe(0);
  });
});

describe("경로가 고리를 이룰 때", () => {
  test("자기가 보낸 ping이 돌아와 TTL이 끝나면 TTL 만료를 받는다", async () => {
    const sim = createSimulator();
    const FW2 = "99999999-9999-4999-8999-999999999999";
    sim.dispatch({ type: "device/add", id: FW, kind: "firewall", position: { x: 0, y: 0 } });
    sim.dispatch({ type: "device/add", id: FW2, kind: "firewall", position: { x: 200, y: 0 } });
    sim.dispatch({ type: "link/add", id: LINK1, ends: [{ deviceId: FW, port: "Ethernet0" }, { deviceId: FW2, port: "Ethernet0" }] });
    for (const [id, own, other] of [[FW, "10.0.0.1", "10.0.0.2"], [FW2, "10.0.0.2", "10.0.0.1"]] as const) {
      for (const line of [`ip addr add ${own}/24 dev eth0`, `ip route add default via ${other}`]) {
        expect((await sim.console(id).exec(line)).lines).toEqual([]);
      }
    }
    const shown = texts(await sim.console(FW).exec("ping -c 1 8.8.8.8")).join("\n");
    expect(shown).toContain("Time to live exceeded");
    const trace = sim.getTrace(sim.getSnapshot().traces[0]!.id)!;
    expect(validateTrace(trace).ok).toBe(true);
    expect(trace.result.status).not.toBe("loop-guard");
  });
});
