// T1.8.3: ping 회차의 결과 종류와 통계 줄. engine과 web이 함께 쓴다.
import { describe, expect, test } from "vitest";

import { TWO_PC, twoPcPingTrace } from "./examples";
import { pingRoundKind, pingStatisticsLines } from "./ping";
import type { Trace } from "./trace";

const textOf = (lines: ReturnType<typeof pingStatisticsLines>) =>
  lines.map((line) => (line.kind === "text" ? line.text : `[${line.kind}]`));

describe("pingRoundKind", () => {
  test("예시 추적은 응답을 받은 회차다", () => {
    expect(pingRoundKind(twoPcPingTrace, TWO_PC.pc1.id, 1)).toBe("reply");
  });

  test("다른 회차 번호의 응답은 세지 않는다", () => {
    expect(pingRoundKind(twoPcPingTrace, TWO_PC.pc1.id, 2)).toBe("timeout");
  });

  test("출발 PC의 폐기로 나눈다: NO_IP·NO_GATEWAY·IF_DOWN은 unsent, ARP_TIMEOUT은 unreachable", () => {
    const withDrop = (code: "NO_IP" | "NO_GATEWAY" | "IF_DOWN" | "ARP_TIMEOUT", deviceId: string = TWO_PC.pc1.id): Trace => ({
      ...twoPcPingTrace,
      result: { status: "failed", primaryDropSeq: 0 },
      events: [{ ...twoPcPingTrace.events[0]!, deviceId, action: "drop", dropReason: code, reason: { code, params: { device: { deviceId, deviceName: "PC1" }, targetIp: TWO_PC.pc2.ip } } } as Trace["events"][number]],
    });
    expect(pingRoundKind(withDrop("NO_IP"), TWO_PC.pc1.id, 1)).toBe("unsent");
    expect(pingRoundKind(withDrop("NO_GATEWAY"), TWO_PC.pc1.id, 1)).toBe("unsent");
    // 꺼진 PC 포트 (T0.14). 받는 쪽의 IF_DOWN은 출발 PC에게는 응답이 안 온 것이다
    expect(pingRoundKind(withDrop("IF_DOWN"), TWO_PC.pc1.id, 1)).toBe("unsent");
    expect(pingRoundKind(withDrop("IF_DOWN", TWO_PC.pc2.id), TWO_PC.pc1.id, 1)).toBe("timeout");
    expect(pingRoundKind(withDrop("ARP_TIMEOUT"), TWO_PC.pc1.id, 1)).toBe("unreachable");
    // 다른 장비의 ARP 실패는 출발 PC에게는 응답이 안 온 것이다
    expect(pingRoundKind(withDrop("ARP_TIMEOUT", TWO_PC.pc2.id), TWO_PC.pc1.id, 1)).toBe("timeout");
  });
});

describe("pingStatisticsLines", () => {
  test("Windows: ARP 실패도 받음으로 세고 손실률은 정수로 버린다", () => {
    expect(textOf(pingStatisticsLines("windows", "10.0.0.2", ["reply", "unreachable", "timeout"]))).toEqual([
      "",
      "Ping statistics for 10.0.0.2:",
      "    Packets: Sent = 3, Received = 2, Lost = 1 (33% loss)",
    ]);
  });

  test("Linux: ARP 실패는 errors로 세고 손실률은 %g", () => {
    expect(textOf(pingStatisticsLines("linux", "10.0.0.2", ["reply", "unreachable", "timeout"]))).toEqual([
      "",
      "--- 10.0.0.2 ping statistics ---",
      "3 packets transmitted, 1 received, +1 errors, 66.6667% packet loss",
    ]);
  });
});

test("ICMP 오류의 통계가 Windows와 Linux, Ctrl+C 공통 계산에 반영된다", () => {
  expect(textOf(pingStatisticsLines("windows", "10.0.0.2", ["icmp-error", "timeout"])).at(-1))
    .toContain("Sent = 2, Received = 1, Lost = 1 (50% loss)");
  expect(textOf(pingStatisticsLines("linux", "10.0.0.2", ["icmp-error", "timeout"])).at(-1))
    .toBe("2 packets transmitted, 0 received, +1 errors, 100% packet loss");
});
