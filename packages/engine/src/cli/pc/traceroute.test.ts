// T11.4.1: traceroute. PC1—SW1—R1—R2—SW2—PC2 (정적 경로 실습)에서 OS별 출력, 끝나는 조건, hop마다의 추적을 본다.
import type { ConsoleResult, PcConfig, RouterDevice, TopologyDocument } from "@ping9/shared";
import { LIMITS, validateTrace } from "@ping9/shared";
import { ROUTER_LAB as LAB, switchedStaticRoutingLabDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../../simulator";

/** 글 줄은 글로, 추적 줄은 `[trace]`로 */
const linesOf = (result: ConsoleResult) =>
  result.lines.map((line) => (line.kind === "text" ? line.text : line.kind === "trace" ? "[trace]" : `[${line.kind}]`));

/** PC1의 구성을 바꾼 문서 */
function withPc1(config: Partial<PcConfig>, document = switchedStaticRoutingLabDocument): TopologyDocument {
  return {
    ...document,
    devices: document.devices.map((device) =>
      device.id === LAB.pc1 && device.kind === "pc" ? { ...device, config: { ...device.config, ...config } } : device),
  };
}

/** Router에 정적 경로를 더한 문서 */
function withRoute(routerId: string, network: string, mask: string, nextHop: string, document = switchedStaticRoutingLabDocument): TopologyDocument {
  return {
    ...document,
    devices: document.devices.map((device) => {
      if (device.id !== routerId || device.kind !== "router") return device;
      const router: RouterDevice = device;
      return { ...router, config: { ...router.config, staticRoutes: [...router.config.staticRoutes, { network, mask, nextHop }] } };
    }),
  };
}

async function run(document: TopologyDocument, deviceId: string, command: string) {
  const simulator = createSimulator();
  expect(simulator.load(document).ok).toBe(true);
  if (deviceId === LAB.r1) await simulator.console(deviceId).exec("enable");
  const result = await simulator.console(deviceId).exec(command);
  return { simulator, result, lines: linesOf(result) };
}

describe("Windows tracert", () => {
  test("지나는 Router가 hop마다 한 줄씩, 마지막 줄이 목적지 (E11 완료 모습 4)", async () => {
    const { lines } = await run(switchedStaticRoutingLabDocument, LAB.pc1, "tracert 192.168.2.10");
    expect(lines).toEqual([
      "Tracing route to 192.168.2.10 over a maximum of 30 hops",
      "",
      "  1     8 ms     8 ms     8 ms  192.168.1.1",
      "[trace]",
      "  2     8 ms     8 ms     8 ms  10.0.12.2",
      "[trace]",
      "  3    14 ms    14 ms    14 ms  192.168.2.10",
      "[trace]",
      "",
      "Trace complete.",
    ]);
  });

  test("hop마다 추적 하나. 요약에 hop 번호가 있고 추적은 검증을 통과한다", async () => {
    const { simulator } = await run(switchedStaticRoutingLabDocument, LAB.pc1, "tracert 192.168.2.10");
    const summaries = [...simulator.getSnapshot().traces].reverse();
    expect(summaries.map((summary) => [summary.kind, summary.hop, summary.targetIp, summary.status])).toEqual([
      ["ping", 1, "192.168.2.10", "failed"],
      ["ping", 2, "192.168.2.10", "failed"],
      ["ping", 3, "192.168.2.10", "success"],
    ]);
    for (const summary of summaries) {
      const trace = simulator.getTrace(summary.id)!;
      expect(validateTrace(trace).ok).toBe(true);
      // 탐색 패킷의 TTL = hop 번호
      const sent = trace.events.find((event) => event.deviceId === LAB.pc1 && event.reason.code === "ICMP_ECHO_REQUEST_SENT");
      expect(sent?.frame.ipv4?.ttl).toBe(summary.hop);
    }
  });

  test("ping의 요약에는 hop이 없다", async () => {
    const { simulator } = await run(switchedStaticRoutingLabDocument, LAB.pc1, "ping -n 1 192.168.2.10");
    expect(simulator.getSnapshot().traces[0]!.hop).toBeUndefined();
  });

  test("-d는 같은 출력, -h는 최대 hop", async () => {
    const plain = await run(switchedStaticRoutingLabDocument, LAB.pc1, "tracert 192.168.2.10");
    expect((await run(switchedStaticRoutingLabDocument, LAB.pc1, "tracert -d 192.168.2.10")).lines).toEqual(plain.lines);

    const { lines } = await run(switchedStaticRoutingLabDocument, LAB.pc1, "tracert -h 2 -d 192.168.2.10");
    expect(lines).toEqual([
      "Tracing route to 192.168.2.10 over a maximum of 2 hops",
      "",
      "  1     8 ms     8 ms     8 ms  192.168.1.1",
      "[trace]",
      "  2     8 ms     8 ms     8 ms  10.0.12.2",
      "[trace]",
      "",
      "Trace complete.",
    ]);
  });

  test("최대 hop이 범위 밖이면 오류", async () => {
    for (const value of ["0", "31"]) {
      const { result } = await run(switchedStaticRoutingLabDocument, LAB.pc1, `tracert -h ${value} 192.168.2.10`);
      expect(result.lines[0]).toMatchObject({ kind: "error", code: "TRACEROUTE_HOPS_OUT_OF_RANGE", params: { value, min: 1, max: 30 } });
    }
  });

  test("응답이 없는 hop은 Request timed out. 하고 다음 hop으로", async () => {
    // R2가 192.168.2.99의 ARP에 실패한다. ICMP 오류를 보내지 않는다
    const { lines } = await run(switchedStaticRoutingLabDocument, LAB.pc1, "tracert -h 4 192.168.2.99");
    expect(lines.filter((line) => line !== "[trace]").slice(2, 6)).toEqual([
      "  1     8 ms     8 ms     8 ms  192.168.1.1",
      "  2     8 ms     8 ms     8 ms  10.0.12.2",
      "  3     *        *        *     Request timed out.",
      "  4     *        *        *     Request timed out.",
    ]);
  });

  test("경로가 없으면 그 Router가 알리고 끝난다", async () => {
    const { lines } = await run(switchedStaticRoutingLabDocument, LAB.pc1, "tracert 10.9.9.9");
    expect(lines.slice(2)).toEqual([
      "  1     8 ms     8 ms     8 ms  192.168.1.1",
      "[trace]",
      "  2  192.168.1.1  reports: Destination net unreachable.",
      "[trace]",
      "",
      "Trace complete.",
    ]);
  });

  test("게이트웨이의 ARP가 실패하면 자기 주소가 알리고 끝난다", async () => {
    const { lines } = await run(withPc1({ gateway: "192.168.1.99" }), LAB.pc1, "tracert 192.168.2.10");
    expect(lines.slice(2, 4)).toEqual(["  1  192.168.1.10  reports: Destination host unreachable.", "[trace]"]);
    expect(lines.slice(-2)).toEqual(["", "Trace complete."]);
  });

  test("게이트웨이가 없으면 보내지 못하고 끝난다", async () => {
    const { lines } = await run(withPc1({ gateway: undefined }), LAB.pc1, "tracert 192.168.2.10");
    expect(lines.slice(2)).toEqual(["  1  Transmit error: code 1231.", "[trace]", "", "Trace complete."]);
  });

  test("자기 주소와 127.x는 추적 없이 hop 하나", async () => {
    for (const target of ["192.168.1.10", "127.0.0.1"]) {
      const { lines, simulator } = await run(switchedStaticRoutingLabDocument, LAB.pc1, `tracert ${target}`);
      expect(lines.slice(2)).toEqual([`  1    <1 ms    <1 ms    <1 ms  ${target}`, "", "Trace complete."]);
      expect(simulator.getSnapshot().traces).toEqual([]);
    }
  });

  // R1은 오류를 PC1 쪽 인터페이스 주소로 보낸다 (실제 IOS와 같음). 그래서 R1은 192.168.1.1로 보인다
  test("Static 고리에서는 Router 둘이 번갈아 나오다 30 hop에서 끝난다", async () => {
    const loop = withRoute(LAB.r2, "172.16.0.0", "255.255.0.0", "10.0.12.1",
      withRoute(LAB.r1, "172.16.0.0", "255.255.0.0", "10.0.12.2"));
    const { lines, simulator } = await run(loop, LAB.pc1, "tracert 172.16.0.1");
    const hops = lines.filter((line) => /^ {1,2}\d/.test(line));
    expect(hops).toHaveLength(30);
    expect(hops.slice(0, 4).map((line) => line.split("  ").at(-1))).toEqual(["192.168.1.1", "10.0.12.2", "192.168.1.1", "10.0.12.2"]);
    expect(hops.at(-1)).toMatch(/^ 30 .* 10\.0\.12\.2$/);
    // hop마다 추적이 하나라 보관 한도만큼만 남는다
    expect(simulator.getSnapshot().traces).toHaveLength(LIMITS.maxTraces);
    for (const summary of simulator.getSnapshot().traces) expect(summary.eventCount).toBeLessThan(LIMITS.maxTraceEvents);
  });

  test("두 Simulator에서 같은 줄과 같은 추적 (AD-6)", async () => {
    const first = await run(switchedStaticRoutingLabDocument, LAB.pc1, "tracert 192.168.2.10");
    const second = await run(switchedStaticRoutingLabDocument, LAB.pc1, "tracert 192.168.2.10");
    expect(second.lines).toEqual(first.lines);
    for (const summary of first.simulator.getSnapshot().traces) {
      expect(second.simulator.getTrace(summary.id)).toEqual(first.simulator.getTrace(summary.id));
    }
  });
});

describe("Linux traceroute", () => {
  const linux = withPc1({ os: "linux" });

  test("실제 형식: 주소 (주소), 시간은 %.3f ms", async () => {
    const { lines } = await run(linux, LAB.pc1, "traceroute 192.168.2.10");
    expect(lines).toEqual([
      "traceroute to 192.168.2.10 (192.168.2.10), 30 hops max, 60 byte packets",
      " 1  192.168.1.1 (192.168.1.1)  8.000 ms  8.000 ms  8.000 ms",
      "[trace]",
      " 2  10.0.12.2 (10.0.12.2)  8.000 ms  8.000 ms  8.000 ms",
      "[trace]",
      " 3  192.168.2.10 (192.168.2.10)  14.000 ms  14.000 ms  14.000 ms",
      "[trace]",
    ]);
  });

  test("-n은 주소만, -m은 최대 hop", async () => {
    for (const command of ["traceroute -n -m 2 192.168.2.10", "traceroute -m 2 -n 192.168.2.10"]) {
      const { lines } = await run(linux, LAB.pc1, command);
      expect(lines).toEqual([
        "traceroute to 192.168.2.10 (192.168.2.10), 2 hops max, 60 byte packets",
        " 1  192.168.1.1  8.000 ms  8.000 ms  8.000 ms",
        "[trace]",
        " 2  10.0.12.2  8.000 ms  8.000 ms  8.000 ms",
        "[trace]",
      ]);
    }
  });

  test("응답 없음 * * *, 경로 없음 !N, ARP 실패 !H", async () => {
    expect((await run(linux, LAB.pc1, "traceroute -n -m 3 192.168.2.99")).lines.at(-2)).toBe(" 3  * * *");
    expect((await run(linux, LAB.pc1, "traceroute -n 10.9.9.9")).lines.at(-2))
      .toBe(" 2  192.168.1.1  4.000 ms !N  4.000 ms !N  4.000 ms !N");
    expect((await run(withPc1({ os: "linux", gateway: "192.168.1.99" }), LAB.pc1, "traceroute -n 192.168.2.10")).lines.at(-2))
      .toMatch(/^ 1 {2}192\.168\.1\.10( {2}\d+\.\d{3} ms !H){3}$/);
  });

  test("게이트웨이가 없으면 connect: Network is unreachable", async () => {
    const { lines } = await run(withPc1({ os: "linux", gateway: undefined }), LAB.pc1, "traceroute 192.168.2.10");
    expect(lines).toEqual([
      "traceroute to 192.168.2.10 (192.168.2.10), 30 hops max, 60 byte packets",
      "connect: Network is unreachable",
      "[trace]",
    ]);
  });

  test("Linux는 대소문자를 구분한다", async () => {
    const { result } = await run(linux, LAB.pc1, "TRACEROUTE 192.168.2.10");
    expect(result.lines[0]).toMatchObject({ kind: "text", text: "TRACEROUTE: command not found" });
  });
});

describe("Router traceroute", () => {
  test("IOS 형식. 첫 hop은 이웃 Router", async () => {
    const { lines } = await run(switchedStaticRoutingLabDocument, LAB.r1, "traceroute 192.168.2.10");
    expect(lines).toEqual([
      "Type escape sequence to abort.",
      "Tracing the route to 192.168.2.10",
      "",
      "  1 10.0.12.2 4 msec 4 msec 4 msec",
      "[trace]",
      "  2 192.168.2.10 10 msec 10 msec 10 msec",
      "[trace]",
    ]);
  });

  test("경로가 없으면 * 한 줄로 끝난다. 자기 주소는 추적 없이 hop 하나", async () => {
    expect((await run(switchedStaticRoutingLabDocument, LAB.r1, "traceroute 10.9.9.9")).lines.slice(3))
      .toEqual(["  1  *  *  *", "[trace]"]);
    const own = await run(switchedStaticRoutingLabDocument, LAB.r1, "traceroute 10.0.12.1");
    expect(own.lines.slice(3)).toEqual(["  1 10.0.12.1 0 msec 0 msec 0 msec"]);
    expect(own.simulator.getSnapshot().traces).toEqual([]);
  });

  test("user 모드에서도 쓴다", async () => {
    const simulator = createSimulator();
    simulator.load(switchedStaticRoutingLabDocument);
    const result = await simulator.console(LAB.r1).exec("traceroute 192.168.2.10");
    expect(linesOf(result)[0]).toBe("Type escape sequence to abort.");
  });
});
