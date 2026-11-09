// T1.8.3: ping 결과를 회차마다 하나씩 보이기. 실제 engine의 결과로 확인한다.
import { createSimulator } from "@ping9/engine";
import { pingRoundKind } from "@ping9/shared";
import type { PingRoundKind, TopologyDocument } from "@ping9/shared";
import { TWO_PC, twoPcDocument, twoPcPingConsoleResult } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { interruptedLines, pacePing, ROUND_INTERVAL_MS, TIMEOUT_WAIT_MS } from "./ping-pacing";
import { initialTerminal, runLinePaced } from "./terminal-state";
import type { PacedRun, TerminalState } from "./terminal-state";

const { pc1, pc2 } = TWO_PC;
const allReplies = () => "reply" as const;
const textOf = (lines: readonly { kind: string; text?: string }[]) => lines.map((line) => line.text ?? `[${line.kind}]`);

describe("pacePing", () => {
  test("예시 결과: 머리 한 줄, 회차 넷(회차 줄과 추적 줄), 통계", () => {
    const paced = pacePing(twoPcPingConsoleResult, allReplies);

    expect(textOf(paced.head)).toEqual(["Pinging 192.168.1.2 with 32 bytes of data:"]);
    expect(paced.rounds.map((round) => textOf(round.lines))).toEqual([
      ["Reply from 192.168.1.2: bytes=32 time=4ms TTL=128", "[trace]"],
      ["Reply from 192.168.1.2: bytes=32 time=2ms TTL=128", "[trace]"],
      ["Reply from 192.168.1.2: bytes=32 time=2ms TTL=128", "[trace]"],
      ["Reply from 192.168.1.2: bytes=32 time=2ms TTL=128", "[trace]"],
    ]);
    expect(textOf(paced.tail)).toEqual(["", "Ping statistics for 192.168.1.2:", "    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss)"]);
  });

  test("첫 회차는 바로, 그 뒤는 1초, 타임아웃은 4초", () => {
    const kinds: PingRoundKind[] = ["reply", "timeout", "unreachable", "reply"];
    const paced = pacePing(twoPcPingConsoleResult, (_traceId, sequence) => kinds[sequence - 1]!);

    expect(paced.rounds.map((round) => round.waitMs)).toEqual([0, TIMEOUT_WAIT_MS, ROUND_INTERVAL_MS, ROUND_INTERVAL_MS]);
  });

  test("추적 줄이 없는 결과는 회차가 없고 모든 줄이 머리다", () => {
    const result = { prompt: "PC1>", lines: [{ kind: "text", text: "a" }, { kind: "text", text: "b" }] } as const;
    expect(pacePing(result, allReplies)).toEqual({ head: result.lines, rounds: [], tail: [] });
  });
});

describe("interruptedLines (Ctrl+C)", () => {
  test("Windows: 보인 회차의 통계 뒤에 Control-C와 ^C", () => {
    expect(textOf(interruptedLines("windows", "10.0.0.2", ["reply", "reply"], "reply"))).toEqual([
      "",
      "Ping statistics for 10.0.0.2:",
      "    Packets: Sent = 2, Received = 2, Lost = 0 (0% loss)",
      "Control-C",
      "^C",
    ]);
  });

  test("Linux: ^C 뒤에 통계. 응답을 기다리던 회차는 보낸 수에 넣는다", () => {
    expect(textOf(interruptedLines("linux", "10.0.0.2", ["reply"], "timeout"))).toEqual([
      "^C",
      "",
      "--- 10.0.0.2 ping statistics ---",
      "2 packets transmitted, 1 received, 50% packet loss",
    ]);
  });

  test("보낸 것이 없으면 ^C만", () => {
    expect(textOf(interruptedLines("windows", "10.0.0.2", [], "reply"))).toEqual(["^C"]);
  });
});

describe("runLinePaced", () => {
  function setup(document: TopologyDocument = twoPcDocument) {
    const simulator = createSimulator();
    simulator.load(document);
    const port = simulator.console(pc1.id);
    const shown: TerminalState[] = [];
    const waits: number[] = [];
    const run = (stopAtWait?: number): PacedRun => ({
      show: (state) => shown.push(state),
      wait: async (ms) => {
        waits.push(ms);
        return waits.length !== stopAtWait;
      },
      kindOf: (traceId, sequence) => pingRoundKind(simulator.getTrace(traceId)!, pc1.id, sequence),
      targetOf: (traceId) => simulator.getSnapshot().traces.find((trace) => trace.id === traceId)?.targetIp ?? "",
      os: "windows",
    });
    return { simulator, port, shown, waits, run };
  }

  const outputOf = (state: TerminalState) => state.lines.filter((line) => line.kind !== "input").map((line) => line.text);

  test("회차마다 화면을 갱신하고, 끝나면 예시와 같은 줄이 모두 보인다", async () => {
    const { port, shown, waits, run } = setup();
    const final = await runLinePaced(port, initialTerminal(port.prompt()), "ping 192.168.1.2", run());

    // 머리 + 회차 넷
    expect(shown.map((state) => outputOf(state).length)).toEqual([1, 2, 3, 4, 5]);
    expect(waits).toEqual([ROUND_INTERVAL_MS, ROUND_INTERVAL_MS, ROUND_INTERVAL_MS]);
    expect(outputOf(final)).toEqual(
      twoPcPingConsoleResult.lines.flatMap((line) => (line.kind === "text" ? [line.text] : [])),
    );
  });

  test("Ctrl+C로 멈추면 남은 회차를 숨기고 그때까지의 통계를 보인다. 추적은 engine에 남는다", async () => {
    const { simulator, port, run } = setup();
    // 둘째 기다림(3회차 앞)에서 멈춘다
    const final = await runLinePaced(port, initialTerminal(port.prompt()), "ping 192.168.1.2", run(2));

    expect(outputOf(final)).toEqual([
      "Pinging 192.168.1.2 with 32 bytes of data:",
      "Reply from 192.168.1.2: bytes=32 time=4ms TTL=128",
      "Reply from 192.168.1.2: bytes=32 time=2ms TTL=128",
      "",
      "Ping statistics for 192.168.1.2:",
      "    Packets: Sent = 2, Received = 2, Lost = 0 (0% loss)",
      "Control-C",
      "^C",
    ]);
    expect(simulator.getSnapshot().traces).toHaveLength(4);
  });

  test("응답이 없는 회차는 4초를 기다린다", async () => {
    // PC2는 /25라 PC1이 다른 네트워크다. 게이트웨이가 없어 응답을 보내지 못한다
    const document: TopologyDocument = {
      ...twoPcDocument,
      devices: twoPcDocument.devices.map((device) =>
        device.id === pc2.id ? ({ ...device, config: { ip: "192.168.1.130", mask: "255.255.255.128" } } as typeof device) : device,
      ),
    };
    const { port, waits, run } = setup(document);
    await runLinePaced(port, initialTerminal(port.prompt()), "ping -n 2 192.168.1.130", run());

    expect(waits).toEqual([TIMEOUT_WAIT_MS, TIMEOUT_WAIT_MS]);
  });

  test("회차가 없는 명령어는 기다리지 않는다", async () => {
    const { port, shown, waits, run } = setup();
    const final = await runLinePaced(port, initialTerminal(port.prompt()), "ipconfig", run());

    expect(waits).toEqual([]);
    expect(shown).toEqual([]);
    expect(outputOf(final)[0]).toBe("Ethernet adapter Ethernet0:");
  });
});
