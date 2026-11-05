import { describe, expect, test } from "vitest";

import { DROP_REASONS } from "../codes";
import { isPortName } from "../document";
import { LINK_DELAY_MICROSECONDS } from "../limits";
import { validateDocument, validateTrace } from "../validate";
import {
  EXAMPLE_DOCUMENTS,
  TWO_PC,
  thirtyDeviceDocument,
  twoPcDocument,
  twoPcPingConsoleResult,
  twoPcPingTrace,
  twoPcSnapshot,
} from "./index";

describe("예시 Document", () => {
  test.each(EXAMPLE_DOCUMENTS)("$name: validateDocument를 통과하고 값이 그대로다", ({ document }) => {
    expect(validateDocument(document)).toEqual({ ok: true, document });
  });

  test.each(EXAMPLE_DOCUMENTS)("$name: JSON으로 적었다가 읽어도 같다", ({ document }) => {
    expect(JSON.parse(JSON.stringify(document))).toEqual(document);
  });

  test("PC 2대 직접 연결: 장비 2대와 링크 1개", () => {
    expect(twoPcDocument.devices.map((device) => device.name)).toEqual(["PC1", "PC2"]);
    expect(twoPcDocument.links).toHaveLength(1);
  });

  test("장비 30대: Switch 5대, PC 25대, 링크 29개", () => {
    const kinds = thirtyDeviceDocument.devices.map((device) => device.kind);

    expect(kinds).toHaveLength(30);
    expect(kinds.filter((kind) => kind === "switch")).toHaveLength(5);
    expect(kinds.filter((kind) => kind === "pc")).toHaveLength(25);
    expect(thirtyDeviceDocument.links).toHaveLength(29);
  });
});

describe("예시 Trace: PC1에서 PC2로 ping의 첫 회차", () => {
  test("validateTrace를 통과한다", () => {
    expect(validateTrace(twoPcPingTrace)).toEqual({ ok: true, trace: twoPcPingTrace });
  });

  test("이벤트가 가리키는 장비, 포트, 링크가 예시 Document에 있다", () => {
    const devices = new Map(twoPcDocument.devices.map((device) => [device.id, device]));
    const linkIds = new Set(twoPcDocument.links.map((link) => link.id));

    for (const event of twoPcPingTrace.events) {
      const device = devices.get(event.deviceId);
      expect(device, `seq ${event.seq}`).toBeDefined();
      for (const port of [event.inPort, event.outPort]) {
        if (port !== undefined) expect(isPortName(device!.kind, port)).toBe(true);
      }
      if (event.linkId !== undefined) expect(linkIds.has(event.linkId)).toBe(true);
    }
  });

  test("ARP 요청, ARP 응답, ICMP 요청, ICMP 응답의 순서다", () => {
    const sent = twoPcPingTrace.events
      .filter((event) => event.outPort !== undefined)
      .map((event) => event.reason.code);

    expect(sent).toEqual([
      "ARP_REQUEST_SENT",
      "ARP_REPLY_SENT",
      "ICMP_ECHO_REQUEST_SENT",
      "ICMP_ECHO_REPLY_SENT",
    ]);
  });

  test("프레임은 링크 한 구간에 1,000마이크로초가 걸린다", () => {
    for (const event of twoPcPingTrace.events) {
      if (event.action !== "receive") continue;
      const parent = twoPcPingTrace.events[event.parentSeq!]!;

      expect(parent.frameId).toBe(event.frameId);
      expect(parent.linkId).toBe(TWO_PC.linkId);
      expect(event.time - parent.time).toBe(LINK_DELAY_MICROSECONDS);
    }
  });

  test("내보내는 이벤트에만 outPort와 linkId가 있고, 받는 이벤트에는 inPort가 있다", () => {
    for (const event of twoPcPingTrace.events) {
      const sends = event.action === "create" || event.action === "reply";
      expect(event.outPort !== undefined, `seq ${event.seq}`).toBe(sends);
      expect(event.linkId !== undefined, `seq ${event.seq}`).toBe(sends);
      expect(event.inPort !== undefined, `seq ${event.seq}`).toBe(!sends);
    }
  });

  test("성공한 추적에는 폐기 이벤트가 없다", () => {
    expect(twoPcPingTrace.result).toEqual({ status: "success" });
    expect(twoPcPingTrace.events.some((event) => event.action === "drop")).toBe(false);
  });
});

describe("validateTrace: 이벤트 사이의 관계", () => {
  // 깨진 Trace를 만들려고 값을 마음대로 고치므로 타입을 풀어 둔다
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const broken = (mutate: (trace: any) => void): string | null => {
    const trace = JSON.parse(JSON.stringify(twoPcPingTrace));
    mutate(trace);
    const result = validateTrace(trace);
    return result.ok ? null : `${result.error.code}:${(result.error.params as { path: string }).path}`;
  };

  test.each([
    ["seq가 순서와 다름", (t: { events: { seq: number }[] }) => void (t.events[3]!.seq = 7), "TRACE_INVALID:events.3.seq"],
    ["time이 줄어듦", (t: { events: { time: number }[] }) => void (t.events[5]!.time = 0), "TRACE_INVALID:events.5.time"],
    ["parentSeq가 뒤의 이벤트", (t: { events: { parentSeq: number }[] }) => void (t.events[2]!.parentSeq = 2), "TRACE_INVALID:events.2.parentSeq"],
    ["폐기가 아닌데 dropReason이 있음", (t: { events: { dropReason: string }[] }) => void (t.events[1]!.dropReason = "NOT_FOR_ME"), "TRACE_INVALID:events.1.dropReason"],
    ["폐기인데 dropReason이 없음", (t: { events: { action: string }[] }) => void (t.events[1]!.action = "drop"), "TRACE_INVALID:events.1.dropReason"],
    ["모르는 설명 코드", (t: { events: { reason: { code: string } }[] }) => void (t.events[0]!.reason.code = "SOMETHING"), "TRACE_INVALID:events.0.reason.code"],
    ["모르는 동작", (t: { events: { action: string }[] }) => void (t.events[0]!.action = "teleport"), "TRACE_INVALID:events.0.action"],
    ["성공인데 primaryDropSeq가 있음", (t: { result: { primaryDropSeq: number } }) => void (t.result.primaryDropSeq = 1), "TRACE_INVALID:result.primaryDropSeq"],
    ["프레임에 Ethernet 머리가 없음", (t: { events: { frame: { ethernet?: unknown } }[] }) => void delete t.events[0]!.frame.ethernet, "TRACE_INVALID:events.0.frame.ethernet"],
  ])("%s", (_name, mutate, expected) => {
    expect(broken(mutate as (trace: unknown) => void)).toBe(expected);
  });

  test("실패한 추적의 primaryDropSeq는 폐기 이벤트를 가리켜야 한다", () => {
    const failed = (primaryDropSeq: number) =>
      broken((trace) => {
        trace.result = { status: "failed", primaryDropSeq };
        trace.events[9].action = "drop";
        trace.events[9].dropReason = "ARP_TIMEOUT";
        trace.events[9].reason = { code: "ARP_TIMEOUT", params: {} };
      });

    expect(failed(9)).toBeNull();
    expect(failed(8)).toBe("TRACE_INVALID:result.primaryDropSeq");
    expect(failed(99)).toBe("TRACE_INVALID:result.primaryDropSeq");
  });

  test("dropReason은 reason.code와 같아야 한다", () => {
    expect(
      broken((trace) => {
        trace.events[9].action = "drop";
        trace.events[9].dropReason = "NO_LINK";
      }),
    ).toBe("TRACE_INVALID:events.9.dropReason");
    expect(DROP_REASONS).toContain("NO_LINK");
  });

  test.each([null, undefined, 1, "trace", [], {}])("Trace가 아닌 %j을 예외 없이 거부한다", (value) => {
    expect(validateTrace(value)).toMatchObject({ ok: false, error: { code: "TRACE_INVALID" } });
  });
});

describe("예시 Snapshot과 ConsoleResult", () => {
  test("Snapshot의 views는 Document의 장비와 같은 ID를 가진다", () => {
    expect(Object.keys(twoPcSnapshot.views).sort()).toEqual(
      twoPcDocument.devices.map((device) => device.id).sort(),
    );
    expect(twoPcSnapshot.document).toBe(twoPcDocument);
  });

  test("Snapshot의 추적 요약은 예시 Trace와 맞는다", () => {
    expect(twoPcSnapshot.traces).toEqual([
      {
        id: twoPcPingTrace.id,
        docVersion: twoPcPingTrace.docVersion,
        kind: "ping",
        status: twoPcPingTrace.result.status,
        eventCount: twoPcPingTrace.events.length,
        source: { deviceId: TWO_PC.pc1.id, deviceName: "PC1" },
        targetIp: TWO_PC.pc2.ip,
      },
    ]);
  });

  test("Snapshot의 ARP 테이블은 Trace에서 배운 값이다", () => {
    const pc1View = twoPcSnapshot.views[TWO_PC.pc1.id]!;

    expect(pc1View.kind === "pc" && pc1View.arpTable).toEqual([
      { ip: TWO_PC.pc2.ip, mac: TWO_PC.pc2.mac, port: TWO_PC.port },
    ]);
  });

  test("ping의 콘솔 결과에는 회차마다 결과 줄과 추적 줄이 있다", () => {
    const { lines, prompt } = twoPcPingConsoleResult;
    const traceIds = lines.flatMap((line) => (line.kind === "trace" ? [line.traceId] : []));
    const replies = lines.filter((line) => line.kind === "text" && line.text.startsWith("Reply from"));

    expect(prompt).toBe("PC1>");
    expect(traceIds).toEqual([1, 2, 3, 4]);
    expect(replies).toHaveLength(4);
    expect(lines.every((line) => line.kind === "text" || line.kind === "trace")).toBe(true);
  });
});
