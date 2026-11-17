// 터널 양 끝 사이에 놓인 Firewall (T14.2.2). PC_A — R1 — eth0 [FW1] eth1 — R2 — PC_B.
// VPN 실습 예제(T15)의 가운데 Router를 Firewall로 바꾼 토폴로지다. 공개 인터페이스(createSimulator)로만 확인한다.
import { PORT_NAMES, validateDocument, validateTrace } from "@ping9/shared";
import type { ConsoleResult, FirewallDevice, TopologyDocument, Trace } from "@ping9/shared";
import { greLabDocument, ipsecLabDocument, VPN_LAB as LAB } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../../simulator";

const [GI0, GI1] = PORT_NAMES.router;
const [ETH0, ETH1, ETH2, ETH3] = PORT_NAMES.firewall;
const WAN = "255.255.255.252";
const ACCEPT_ALL = { policy: "ACCEPT", rules: [] } as const;

/** 실습 예제의 가운데 Router(ISP)를 같은 주소의 Firewall로 바꾼다. Firewall에는 양쪽 사설 LAN의 경로가 없다 */
function withFirewall(document: TopologyDocument): TopologyDocument {
  const firewall: FirewallDevice = {
    id: LAB.isp, name: "FW1", kind: "firewall", position: { x: 520, y: 240 },
    config: {
      interfaces: {
        [ETH0]: { adminUp: true, ip: "10.0.13.2", mask: WAN }, [ETH1]: { adminUp: true, ip: "10.0.23.1", mask: WAN },
        [ETH2]: { adminUp: true }, [ETH3]: { adminUp: true },
      },
      staticRoutes: [],
      filter: { INPUT: ACCEPT_ALL, FORWARD: ACCEPT_ALL, OUTPUT: ACCEPT_ALL },
    },
  };
  const port = (name: string) => (name === GI0 ? ETH0 : name === GI1 ? ETH1 : name);
  return {
    ...document,
    devices: document.devices.map((device) => (device.id === LAB.isp ? firewall : device)),
    links: document.links.map((link) => ({ ...link, ends: [
      link.ends[0].deviceId === LAB.isp ? { ...link.ends[0], port: port(link.ends[0].port) } : link.ends[0],
      link.ends[1].deviceId === LAB.isp ? { ...link.ends[1], port: port(link.ends[1].port) } : link.ends[1],
    ] })),
  };
}

const LABS = [
  { name: "GRE", document: withFirewall(greLabDocument), protocol: 47, layer: "gre" },
  { name: "IPsec", document: withFirewall(ipsecLabDocument), protocol: 50, layer: "esp" },
] as const;

const replies = (result: ConsoleResult): number =>
  result.lines.filter((line) => line.kind === "text" && line.text.includes("bytes=32")).length;

function open(document: TopologyDocument) {
  expect(validateDocument(document).ok).toBe(true);
  const sim = createSimulator();
  expect(sim.load(document)).toMatchObject({ ok: true });
  const ping = () => sim.console(LAB.pcA).exec("ping -n 1 192.168.2.10");
  const lastTrace = (): Trace => sim.getTrace(sim.getSnapshot().traces[0]!.id)!;
  const iptables = async (line: string) => {
    expect((await sim.console(LAB.isp).exec(line)).lines.filter((entry) => entry.kind === "error")).toEqual([]);
  };
  return { ping, lastTrace, iptables };
}

describe("터널 양 끝 사이의 Firewall은 감싼 패킷을 내용 그대로 넘긴다", () => {
  test.each(LABS)("$name: 규칙이 없으면 PC 사이의 ping이 성공하고, Firewall이 넘긴 프레임에 감싼 내용이 남아 있다", async ({ document, protocol, layer }) => {
    const { ping, lastTrace } = open(document);
    expect(replies(await ping())).toBe(1);
    const trace = lastTrace();
    expect(validateTrace(trace).ok).toBe(true);
    const forwarded = trace.events.filter((event) => event.deviceId === LAB.isp && event.reason.code === "IPV4_FORWARDED");
    // 요청과 응답 한 번씩
    expect(forwarded).toHaveLength(2);
    for (const event of forwarded) {
      expect(event.frame.ipv4?.protocol).toBe(protocol);
      expect(event.frame[layer]).toBeDefined();
      // 안쪽 ping은 감싼 내용 안에만 있다
      expect(event.frame.icmp).toBeUndefined();
    }
  });

  test.each(LABS)("$name: FORWARD의 `-p icmp` 규칙은 감싼 ping에 맞지 않는다 (바깥 패킷은 ICMP가 아니다)", async ({ document }) => {
    const { ping, iptables } = open(document);
    await iptables("iptables -A FORWARD -p icmp -j DROP");
    expect(replies(await ping())).toBe(1);
  });

  test.each(LABS)("$name: 프로토콜을 정하지 않은 규칙은 감싼 패킷도 막고, 막은 규칙을 사유에 남긴다", async ({ document }) => {
    const { ping, lastTrace, iptables } = open(document);
    await iptables("iptables -A FORWARD -s 10.0.13.1 -j DROP");
    expect(replies(await ping())).toBe(0);
    const trace = lastTrace();
    expect(validateTrace(trace).ok).toBe(true);
    const drop = trace.events[trace.result.primaryDropSeq!]!;
    expect(drop.deviceId).toBe(LAB.isp);
    expect(drop.reason).toMatchObject({ code: "FIREWALL_BLOCKED", params: { chain: "FORWARD", target: "DROP", rule: 1 } });
  });
});
