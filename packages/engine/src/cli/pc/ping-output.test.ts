// T1.8.3: OS별 ping 출력의 세부 규칙 (시간 표기, 손실률). 순수 함수 단위 테스트.
import { describe, expect, test } from "vitest";

import type { PingRound } from "../../runtime";
import { linuxPingLines, linuxTime, windowsPingLines } from "./ping-output";

const reply = (sequence: number, timeUs = 2000): PingRound => ({ kind: "reply", traceId: sequence, sequence, timeUs, ttl: 128 });
const timeout = (sequence: number): PingRound => ({ kind: "timeout", traceId: sequence, sequence });

const textOf = (lines: ReturnType<typeof windowsPingLines>) =>
  lines.flatMap((line) => (line.kind === "text" ? [line.text] : []));

describe("linuxTime: iputils처럼 유효 숫자 세 자리를 버림으로", () => {
  test.each([
    [30, "0.030"],
    [999, "0.999"],
    [1000, "1.00"],
    [4000, "4.00"],
    [4567, "4.56"],
    [12_345, "12.3"],
    [123_456, "123"],
  ])("%i µs → %s", (timeUs, expected) => {
    expect(linuxTime(timeUs)).toBe(expected);
  });
});

describe("손실률", () => {
  const rounds = [reply(1), timeout(2), timeout(3)];

  test("Windows는 정수로 버린다: 2/3 → 66%", () => {
    expect(textOf(windowsPingLines("10.0.0.2", "10.0.0.1", rounds)).at(-1)).toBe(
      "    Packets: Sent = 3, Received = 1, Lost = 2 (66% loss)",
    );
  });

  test("Linux는 %g: 2/3 → 66.6667%", () => {
    expect(textOf(linuxPingLines("10.0.0.2", "10.0.0.1", rounds)).at(-1)).toBe(
      "3 packets transmitted, 1 received, 66.6667% packet loss",
    );
  });
});

describe("Windows 시간", () => {
  test("1ms보다 짧으면 time<1ms", () => {
    expect(textOf(windowsPingLines("10.0.0.2", "10.0.0.1", [reply(1, 999)]))[1]).toBe(
      "Reply from 10.0.0.2: bytes=32 time<1ms TTL=128",
    );
  });
});
