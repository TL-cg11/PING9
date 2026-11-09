// T1.8.3: PC의 ping과 ARP 명령어. 공개 인터페이스(createSimulator)로만 확인한다.
// 완료 조건: 예시 Document에서 ping의 출력과 Trace가 예시 자료와 같다 (FR-38). `arp -a`에 학습한 주소가 나온다 (FR-24).
import type { ConsoleResult, PcConfig, TopologyDocument } from "@ping9/shared";
import {
  TWO_PC,
  TWO_PC_SWITCH,
  twoPcDocument,
  twoPcPingConsoleResult,
  twoPcPingTrace,
  twoPcSnapshot,
  twoPcSwitchDocument,
} from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../../index";

const { pc1, pc2 } = TWO_PC;

function open(document: TopologyDocument = twoPcDocument, deviceId: string = pc1.id) {
  const simulator = createSimulator();
  expect(simulator.load(document)).toEqual({ ok: true });
  return { simulator, port: simulator.console(deviceId) };
}

const texts = (result: ConsoleResult): string[] =>
  result.lines.map((line) => {
    if (line.kind === "text") return line.text;
    if (line.kind === "trace") return `[trace ${line.traceId}]`;
    return `[${line.kind} ${"code" in line ? line.code : ""}]`;
  });

/** 장비 하나의 구성만 바꾼 문서 */
function withConfig(deviceId: string, config: PcConfig, document: TopologyDocument = twoPcDocument): TopologyDocument {
  return {
    ...document,
    devices: document.devices.map((device) =>
      device.id === deviceId ? ({ ...device, config } as typeof device) : device,
    ),
  };
}

const mask = TWO_PC.mask;
const unlinked: TopologyDocument = { ...twoPcDocument, links: [] };
const linuxPc1 = withConfig(pc1.id, { ip: pc1.ip, mask, os: "linux" });

describe("예시 자료와 같다 (완료 조건, FR-38)", () => {
  test("ping 192.168.1.2의 출력이 twoPcPingConsoleResult와 같다", async () => {
    const { port } = open();
    expect(await port.exec("ping 192.168.1.2")).toEqual(twoPcPingConsoleResult);
  });

  test("첫 회차의 추적이 twoPcPingTrace와 같다", async () => {
    const { simulator, port } = open();
    await port.exec("ping 192.168.1.2");
    expect(simulator.getTrace(1)).toEqual(twoPcPingTrace);
  });

  test("ping -n 1 뒤의 스냅샷이 twoPcSnapshot과 같다", async () => {
    const { simulator, port } = open();
    await port.exec("ping -n 1 192.168.1.2");
    expect(simulator.getSnapshot()).toEqual(twoPcSnapshot);
  });

  test("2회차부터는 ARP 없이 바로 ICMP가 간다", async () => {
    const { simulator, port } = open();
    await port.exec("ping 192.168.1.2");
    const second = simulator.getTrace(2);
    expect(second?.result).toEqual({ status: "success" });
    expect(second?.events.map((event) => event.reason.code)).toEqual([
      "ICMP_ECHO_REQUEST_SENT",
      "ICMP_ECHO_REQUEST_RECEIVED",
      "ICMP_ECHO_REPLY_SENT",
      "ICMP_ECHO_REPLY_RECEIVED",
    ]);
  });

  test("같은 문서와 입력이면 두 번 실행해도 같은 추적이 나온다 (AD-5)", async () => {
    const first = open();
    const second = open();
    await first.port.exec("ping 192.168.1.2");
    await second.port.exec("ping 192.168.1.2");
    for (const id of [1, 2, 3, 4]) expect(first.simulator.getTrace(id)).toEqual(second.simulator.getTrace(id));
  });
});

describe("Windows ping의 실패", () => {
  test("링크가 없으면 ARP가 실패해 Destination host unreachable이고 받음으로 센다", async () => {
    const { simulator, port } = open(unlinked);
    expect(texts(await port.exec("ping 192.168.1.2"))).toEqual([
      "Pinging 192.168.1.2 with 32 bytes of data:",
      "Reply from 192.168.1.1: Destination host unreachable.",
      "[trace 1]",
      "Reply from 192.168.1.1: Destination host unreachable.",
      "[trace 2]",
      "Reply from 192.168.1.1: Destination host unreachable.",
      "[trace 3]",
      "Reply from 192.168.1.1: Destination host unreachable.",
      "[trace 4]",
      "",
      "Ping statistics for 192.168.1.2:",
      "    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss)",
    ]);
    const trace = simulator.getTrace(1);
    expect(trace?.result.status).toBe("failed");
    const primary = trace?.events[trace.result.status === "failed" ? (trace.result.primaryDropSeq ?? -1) : -1];
    expect(primary?.reason.code).toBe("NO_LINK");
    expect(trace?.events.at(-1)?.reason.code).toBe("ARP_TIMEOUT");
  });

  test("없는 주소로 보내도 ARP가 실패한다", async () => {
    const { port } = open();
    expect(texts(await port.exec("ping -n 1 192.168.1.9"))).toContain(
      "Reply from 192.168.1.1: Destination host unreachable.",
    );
  });

  test("ARP는 됐는데 응답이 돌아오지 않으면 Request timed out이고 잃음으로 센다", async () => {
    // PC2는 /25라 PC1(192.168.1.1)이 다른 네트워크다. 게이트웨이가 없어 응답을 보내지 못한다
    const document = withConfig(pc2.id, { ip: "192.168.1.130", mask: "255.255.255.128" });
    const { simulator, port } = open(document);
    expect(texts(await port.exec("ping -n 2 192.168.1.130"))).toEqual([
      "Pinging 192.168.1.130 with 32 bytes of data:",
      "Request timed out.",
      "[trace 1]",
      "Request timed out.",
      "[trace 2]",
      "",
      "Ping statistics for 192.168.1.130:",
      "    Packets: Sent = 2, Received = 0, Lost = 2 (100% loss)",
    ]);
    expect(simulator.getTrace(1)?.events.some((event) => event.reason.code === "NO_GATEWAY")).toBe(true);
  });

  test("IP가 없으면 회차마다 General failure이고 추적이 남는다", async () => {
    const { simulator, port } = open(withConfig(pc1.id, {}));
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
    expect(simulator.getTrace(1)?.events.map((event) => event.reason.code)).toEqual(["NO_IP"]);
  });

  test("다른 네트워크인데 게이트웨이가 없으면 General failure", async () => {
    const { simulator, port } = open();
    expect(texts(await port.exec("ping -n 1 10.0.0.1"))).toContain("PING: transmit failed. General failure.");
    expect(simulator.getTrace(1)?.events.map((event) => event.reason.code)).toEqual(["NO_GATEWAY"]);
  });
});

describe("Linux ping", () => {
  test("출력 형식과 응답한 쪽의 TTL", async () => {
    const { port } = open(linuxPc1);
    const result = await port.exec("ping -c 2 192.168.1.2");
    expect(result.prompt).toBe("PC1$");
    expect(texts(result)).toEqual([
      "PING 192.168.1.2 (192.168.1.2) 56(84) bytes of data.",
      "64 bytes from 192.168.1.2: icmp_seq=1 ttl=128 time=4.00 ms",
      "[trace 1]",
      "64 bytes from 192.168.1.2: icmp_seq=2 ttl=128 time=2.00 ms",
      "[trace 2]",
      "",
      "--- 192.168.1.2 ping statistics ---",
      "2 packets transmitted, 2 received, 0% packet loss",
    ]);
  });

  test("Linux PC가 보내는 패킷의 TTL은 64다", async () => {
    const { simulator, port } = open(linuxPc1);
    await port.exec("ping -c 1 192.168.1.2");
    const sent = simulator.getTrace(1)?.events.find((event) => event.reason.code === "ICMP_ECHO_REQUEST_SENT");
    expect(sent?.frame.ipv4?.ttl).toBe(64);
  });

  test("옵션 없이도 4회로 끝난다", async () => {
    const { port } = open(linuxPc1);
    expect(texts(await port.exec("ping 192.168.1.2")).at(-1)).toBe(
      "4 packets transmitted, 4 received, 0% packet loss",
    );
  });

  test("ARP가 실패하면 From 줄과 errors", async () => {
    const { port } = open(withConfig(pc1.id, { ip: pc1.ip, mask, os: "linux" }, unlinked));
    expect(texts(await port.exec("ping -c 2 192.168.1.2"))).toEqual([
      "PING 192.168.1.2 (192.168.1.2) 56(84) bytes of data.",
      "From 192.168.1.1 icmp_seq=1 Destination Host Unreachable",
      "[trace 1]",
      "From 192.168.1.1 icmp_seq=2 Destination Host Unreachable",
      "[trace 2]",
      "",
      "--- 192.168.1.2 ping statistics ---",
      "2 packets transmitted, 0 received, +2 errors, 100% packet loss",
    ]);
  });

  test("응답이 없으면 no answer yet 줄", async () => {
    const document = withConfig(pc2.id, { ip: "192.168.1.130", mask: "255.255.255.128" }, linuxPc1);
    const { port } = open(document);
    expect(texts(await port.exec("ping -c 3 192.168.1.130"))).toEqual([
      "PING 192.168.1.130 (192.168.1.130) 56(84) bytes of data.",
      "no answer yet for icmp_seq=1",
      "[trace 1]",
      "no answer yet for icmp_seq=2",
      "[trace 2]",
      "no answer yet for icmp_seq=3",
      "[trace 3]",
      "",
      "--- 192.168.1.130 ping statistics ---",
      "3 packets transmitted, 0 received, 100% packet loss",
    ]);
  });

  test("보내지 못하면 한 줄로 끝나고 첫 회차의 추적만 붙는다 (설계 10절 6)", async () => {
    const { simulator, port } = open(withConfig(pc1.id, { os: "linux" }));
    expect(texts(await port.exec("ping -c 4 192.168.1.2"))).toEqual([
      "ping: connect: Network is unreachable",
      "[trace 1]",
    ]);
    expect(simulator.getSnapshot().traces.map((trace) => trace.id)).toEqual([1]);
  });
});

describe("거부와 자기 주소", () => {
  test.each(["192.168.1.255", "255.255.255.255"])("브로드캐스트 주소 %s는 거부하고 회차를 돌리지 않는다 (MAL-6)", async (ip) => {
    const { simulator, port } = open();
    const before = simulator.getSnapshot().runtimeVersion;
    const result = await port.exec(`ping ${ip}`);
    expect(result.lines).toEqual([{ kind: "error", code: "PING_BROADCAST_UNSUPPORTED", params: { ip } }]);
    expect(simulator.getSnapshot().traces).toEqual([]);
    expect(simulator.getSnapshot().runtimeVersion).toBe(before);
  });

  test("IP 형식이 틀리면 INVALID_IPV4", async () => {
    const { port } = open();
    const [line] = (await port.exec("ping 192.168.1")).lines;
    expect(line).toMatchObject({ kind: "error", code: "INVALID_IPV4", position: 5 });
  });

  test.each(["0", "11"])("횟수 %s는 범위 밖", async (count) => {
    const { port } = open();
    const [line] = (await port.exec(`ping -n ${count} 192.168.1.2`)).lines;
    expect(line).toMatchObject({
      kind: "error",
      code: "PING_COUNT_OUT_OF_RANGE",
      params: { value: count, min: 1, max: 10 },
      position: 8,
    });
  });

  test("횟수는 주소 뒤에도 쓸 수 있다", async () => {
    const { port } = open();
    expect(texts(await port.exec("ping 192.168.1.2 -n 2")).filter((line) => line.startsWith("Reply"))).toHaveLength(2);
  });

  test("Windows의 -t 같은 다른 옵션은 받지 않는다", async () => {
    const { port } = open();
    const [line] = (await port.exec("ping -t 192.168.1.2")).lines;
    expect(line).toMatchObject({ kind: "error" });
  });

  test("자기 IP는 링크 없이 바로 성공하고 추적이 없다 (설계 10절 2)", async () => {
    const { simulator, port } = open(unlinked);
    const before = simulator.getSnapshot();
    expect(texts(await port.exec("ping -n 2 192.168.1.1"))).toEqual([
      "Pinging 192.168.1.1 with 32 bytes of data:",
      "Reply from 192.168.1.1: bytes=32 time<1ms TTL=128",
      "Reply from 192.168.1.1: bytes=32 time<1ms TTL=128",
      "",
      "Ping statistics for 192.168.1.1:",
      "    Packets: Sent = 2, Received = 2, Lost = 0 (0% loss)",
    ]);
    expect(simulator.getSnapshot()).toBe(before);
  });

  test("Linux의 127.0.0.1", async () => {
    const { port } = open(linuxPc1);
    expect(texts(await port.exec("ping -c 1 127.0.0.1")).slice(0, 2)).toEqual([
      "PING 127.0.0.1 (127.0.0.1) 56(84) bytes of data.",
      "64 bytes from 127.0.0.1: icmp_seq=1 ttl=64 time=0.030 ms",
    ]);
  });
});

describe("모델이 아직 없는 장비 (설계 10절 12)", () => {
  test("Switch를 지나면 오류 한 줄이고 추적을 남기지 않는다", async () => {
    const { simulator, port } = open(twoPcSwitchDocument, TWO_PC_SWITCH.pc1.id);
    const result = await port.exec("ping 192.168.1.2");
    expect(result.lines).toEqual([
      {
        kind: "error",
        code: "PING_DEVICE_UNSUPPORTED",
        params: { kind: "switch", deviceName: TWO_PC_SWITCH.sw1.name },
      },
    ]);
    expect(simulator.getSnapshot().traces).toEqual([]);
  });

  test("그 뒤에도 다른 ping은 된다", async () => {
    const { simulator, port } = open(twoPcSwitchDocument, TWO_PC_SWITCH.pc1.id);
    await port.exec("ping 192.168.1.2");
    // 같은 PC에서 자기 주소, IP가 없는 경우처럼 Switch에 닿지 않는 ping
    expect(texts(await port.exec("ping -n 1 10.0.0.1"))).toContain("PING: transmit failed. General failure.");
    expect(simulator.getSnapshot().traces).toHaveLength(1);
  });
});

describe("ARP 명령어 (FR-24)", () => {
  test("Windows arp -a: 비어 있으면 No ARP Entries Found, ping 뒤에는 상대가 나온다", async () => {
    const { port } = open();
    expect(texts(await port.exec("arp -a"))).toEqual(["No ARP Entries Found."]);
    await port.exec("ping -n 1 192.168.1.2");
    expect(texts(await port.exec("arp -a"))).toEqual([
      "Interface: 192.168.1.1 --- 0x1",
      "  Internet Address      Physical Address      Type",
      "  192.168.1.2           02-00-00-00-02-00     dynamic",
    ]);
  });

  test("arp -d 뒤에는 비고, 다음 ping의 1회차에 다시 ARP가 오간다", async () => {
    const { simulator, port } = open();
    await port.exec("ping -n 1 192.168.1.2");
    const before = simulator.getSnapshot().runtimeVersion;
    expect(texts(await port.exec("arp -d"))).toEqual([]);
    expect(simulator.getSnapshot().runtimeVersion).toBe(before + 1);
    expect(simulator.getSnapshot().views[pc1.id]).toMatchObject({ arpTable: [] });
    await port.exec("ping -n 1 192.168.1.2");
    expect(simulator.getTrace(2)?.events[0]?.reason.code).toBe("ARP_REQUEST_SENT");
  });

  test("arp -d <IP>는 그 항목만, 없으면 문구", async () => {
    const { port } = open();
    await port.exec("ping -n 1 192.168.1.2");
    expect(texts(await port.exec("arp -d 192.168.1.9"))).toEqual(["The specified entry was not found."]);
    expect(texts(await port.exec("arp -d 192.168.1.2"))).toEqual([]);
    expect(texts(await port.exec("arp -a"))).toEqual(["No ARP Entries Found."]);
  });

  test("arp -d *", async () => {
    const { port } = open();
    await port.exec("ping -n 1 192.168.1.2");
    await port.exec("arp -d *");
    expect(texts(await port.exec("arp -a"))).toEqual(["No ARP Entries Found."]);
  });

  test("상대 PC의 ARP 테이블과 속성 패널의 값도 채워진다", async () => {
    const { simulator, port } = open();
    await port.exec("ping -n 1 192.168.1.2");
    expect(texts(await simulator.console(pc2.id).exec("arp -a"))).toContain(
      "  192.168.1.1           02-00-00-00-01-00     dynamic",
    );
    expect(simulator.getSnapshot().views[pc2.id]).toMatchObject({
      arpTable: [{ ip: pc1.ip, mac: pc1.mac, port: "Ethernet0" }],
    });
  });

  test("Linux ip neigh, ip neigh flush all, arp -a, arp -d", async () => {
    const { port } = open(linuxPc1);
    expect(texts(await port.exec("ip neigh"))).toEqual([]);
    await port.exec("ping -c 1 192.168.1.2");
    expect(texts(await port.exec("ip neigh show"))).toEqual([
      "192.168.1.2 dev eth0 lladdr 02:00:00:00:02:00 REACHABLE",
    ]);
    expect(texts(await port.exec("arp -a"))).toEqual(["? (192.168.1.2) at 02:00:00:00:02:00 [ether] on eth0"]);
    expect(texts(await port.exec("arp -d 192.168.1.9"))).toEqual(["No ARP entry for 192.168.1.9"]);
    await port.exec("ip neigh flush all");
    expect(texts(await port.exec("ip neigh"))).toEqual([]);
  });

  test("IP를 바꾸면 그 PC의 ARP 테이블이 비고 runtimeVersion이 오른다", async () => {
    const { simulator, port } = open();
    await port.exec("ping -n 1 192.168.1.2");
    const before = simulator.getSnapshot().runtimeVersion;
    await port.exec("ipconfig 192.168.1.5 255.255.255.0");
    expect(simulator.getSnapshot().views[pc1.id]).toMatchObject({ arpTable: [] });
    expect(simulator.getSnapshot().runtimeVersion).toBe(before + 1);
  });

  test("링크를 지우면 양쪽 PC의 ARP 테이블이 빈다", async () => {
    const { simulator, port } = open();
    await port.exec("ping -n 1 192.168.1.2");
    expect(simulator.dispatch({ type: "link/remove", linkId: TWO_PC.linkId })).toMatchObject({ ok: true });
    expect(simulator.getSnapshot().views[pc1.id]).toMatchObject({ arpTable: [] });
    expect(simulator.getSnapshot().views[pc2.id]).toMatchObject({ arpTable: [] });
  });

  test("PC를 지우면 그 PC의 화면 값도 사라진다", async () => {
    const { simulator, port } = open();
    await port.exec("ping -n 1 192.168.1.2");
    expect(simulator.dispatch({ type: "device/remove", deviceId: pc2.id })).toMatchObject({ ok: true });
    expect(simulator.getSnapshot().views[pc2.id]).toBeUndefined();
  });

  test("위치만 옮기면 ARP 테이블이 남고 runtimeVersion은 그대로다", async () => {
    const { simulator, port } = open();
    await port.exec("ping -n 1 192.168.1.2");
    const before = simulator.getSnapshot().runtimeVersion;
    expect(simulator.dispatch({ type: "device/move", deviceId: pc1.id, position: { x: 10, y: 10 } })).toMatchObject({
      ok: true,
    });
    expect(simulator.getSnapshot().views[pc1.id]).toMatchObject({ arpTable: [{ ip: pc2.ip }] });
    expect(simulator.getSnapshot().runtimeVersion).toBe(before);
  });

  test("load는 ARP 테이블과 추적을 비운다", async () => {
    const { simulator, port } = open();
    await port.exec("ping -n 1 192.168.1.2");
    simulator.load(twoPcDocument);
    expect(simulator.getSnapshot().views[pc1.id]).toMatchObject({ arpTable: [] });
    expect(simulator.getSnapshot().traces).toEqual([]);
    expect(simulator.getTrace(1)).toBeUndefined();
  });
});

describe("추적 보관", () => {
  test("최근 20개만 남는다", async () => {
    const { simulator, port } = open();
    for (let index = 0; index < 3; index += 1) await port.exec("ping -n 10 192.168.1.2");
    const traces = simulator.getSnapshot().traces;
    expect(traces).toHaveLength(20);
    expect(traces[0]?.id).toBe(30);
    expect(traces.at(-1)?.id).toBe(11);
    expect(simulator.getTrace(10)).toBeUndefined();
    expect(simulator.getTrace(11)).toBeDefined();
  });

  test("요약에 출발 장비와 목적지, 결과가 있다", async () => {
    const { simulator, port } = open(unlinked);
    await port.exec("ping -n 1 192.168.1.2");
    expect(simulator.getSnapshot().traces).toEqual([
      {
        id: 1,
        docVersion: 1,
        kind: "ping",
        status: "failed",
        eventCount: simulator.getTrace(1)?.events.length,
        source: { deviceId: pc1.id, deviceName: pc1.name },
        targetIp: pc2.ip,
      },
    ]);
  });
});
