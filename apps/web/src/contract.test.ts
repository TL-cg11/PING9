// 화면 쪽 계약 테스트: engine 없이 shared의 예시 자료만으로 화면이 쓸 값을 만들 수 있다 (Story 1.2).
// 이 파일은 @ping9/engine을 가져오지 않는다.
import type { ConsoleLine, Reason, TraceEvent } from "@ping9/shared";
import {
  twoPcDocument,
  twoPcPingConsoleResult,
  twoPcPingTrace,
  twoPcSnapshot,
} from "@ping9/shared/examples";
import { expect, test } from "vitest";

/** 이벤트 목록의 한 줄에 필요한 값 (T1.9.2가 그릴 내용) */
function toRow(event: TraceEvent, deviceName: string): string {
  const port = event.outPort ?? event.inPort ?? "-";
  return `${event.seq} ${event.time} ${deviceName} ${port} ${event.layer} ${event.action} ${event.reason.code}`;
}

test("예시 Trace만으로 이벤트 목록의 줄을 만든다", () => {
  const names = new Map(twoPcDocument.devices.map((device) => [device.id, device.name]));

  const rows = twoPcPingTrace.events.map((event) => toRow(event, names.get(event.deviceId) ?? "?"));

  expect(rows).toEqual([
    "0 0 PC1 Ethernet0 ARP create ARP_REQUEST_SENT",
    "1 1000 PC2 Ethernet0 ARP receive ARP_REQUEST_RECEIVED",
    "2 1000 PC2 Ethernet0 ARP learn ARP_ENTRY_LEARNED",
    "3 1000 PC2 Ethernet0 ARP reply ARP_REPLY_SENT",
    "4 2000 PC1 Ethernet0 ARP receive ARP_REPLY_RECEIVED",
    "5 2000 PC1 Ethernet0 ARP learn ARP_ENTRY_LEARNED",
    "6 2000 PC1 Ethernet0 ICMP create ICMP_ECHO_REQUEST_SENT",
    "7 3000 PC2 Ethernet0 ICMP receive ICMP_ECHO_REQUEST_RECEIVED",
    "8 3000 PC2 Ethernet0 ICMP reply ICMP_ECHO_REPLY_SENT",
    "9 4000 PC1 Ethernet0 ICMP receive ICMP_ECHO_REPLY_RECEIVED",
  ]);
});

test("같은 time의 이벤트를 묶으면 재생의 단계가 된다 (AD-6)", () => {
  const steps = new Map<number, number[]>();
  for (const event of twoPcPingTrace.events) {
    steps.set(event.time, [...(steps.get(event.time) ?? []), event.seq]);
  }

  expect([...steps.values()]).toEqual([[0], [1, 2, 3], [4, 5, 6], [7, 8], [9]]);
});

test("설명 코드로 좁히면 문구에 넣을 값의 타입이 정해진다 (AD-14)", () => {
  // 메시지 카탈로그(T1.9.1)가 할 일의 축소판
  const describe = (reason: Reason): string => {
    switch (reason.code) {
      case "ARP_REQUEST_SENT":
        return `${reason.params.device.deviceName}이 ${reason.params.targetIp}의 MAC 주소를 물음`;
      case "ICMP_ECHO_REPLY_RECEIVED":
        return `${reason.params.device.deviceName}이 ${reason.params.sourceIp}의 응답을 받음`;
      default:
        return reason.code;
    }
  };

  expect(describe(twoPcPingTrace.events[0]!.reason)).toBe("PC1이 192.168.1.2의 MAC 주소를 물음");
  expect(describe(twoPcPingTrace.events[9]!.reason)).toBe("PC1이 192.168.1.2의 응답을 받음");
});

test("예시 Snapshot에서 캔버스에 그릴 장비, 링크, 포트 상태를 읽는다", () => {
  const nodes = twoPcSnapshot.document.devices.map((device) => ({
    id: device.id,
    label: device.name,
    x: device.position.x,
    ports: twoPcSnapshot.views[device.id]!.ports.map((port) => `${port.name}:${port.status}`),
  }));

  expect(nodes.map((node) => node.label)).toEqual(["PC1", "PC2"]);
  expect(nodes.map((node) => node.ports)).toEqual([["Ethernet0:up"], ["Ethernet0:up"]]);
  expect(twoPcSnapshot.document.links[0]!.ends.map((end) => end.port)).toEqual(["Ethernet0", "Ethernet0"]);
});

test("예시 ConsoleResult의 줄을 종류별로 그릴 수 있다", () => {
  const render = (line: ConsoleLine): string => {
    switch (line.kind) {
      case "text":
        return line.text;
      case "trace":
        return `[추적 ${line.traceId}]`;
      case "error":
        return `오류 ${line.code}`;
      case "notice":
        return `알림 ${line.code}`;
    }
  };

  const output = twoPcPingConsoleResult.lines.map(render);

  expect(output[0]).toBe("Pinging 192.168.1.2 with 32 bytes of data:");
  expect(output.filter((text) => text.startsWith("[추적 "))).toEqual(["[추적 1]", "[추적 2]", "[추적 3]", "[추적 4]"]);
});
