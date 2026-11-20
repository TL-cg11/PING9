import type { Trace, TraceEvent } from "@ping9/shared";
import { validateTrace } from "@ping9/shared";
import { expect, test } from "vitest";
import { renderToString } from "react-dom/server";
import { EventPanel } from "../components/event-panel";
import { causeOf, eventText } from "../messages/events";
import { frameKind, replaySteps } from "./steps";

const frame = {
  ethernet: { sourceMac: "02:00:00:00:00:01", destinationMac: "02:00:00:00:00:02" },
  ipv4: { sourceIp: "192.0.2.10", destinationIp: "198.51.100.10", ttl: 64, protocol: 6 as const },
  tcp: { sourcePort: 50000, destinationPort: 443, sequence: 1, flags: ["SYN"] as const, payload: "EDUCATIONAL_CONTROL" },
};
const event: TraceEvent = { seq: 0, time: 0, frameId: 1, deviceId: "pc", outPort: "Ethernet0", linkId: "link",
  layer: "TCP", action: "create", frame, reason: { code: "TCP_SIM_SEGMENT_SENT", params: {
    device: { deviceId: "pc", deviceName: "PC_A" }, sourceIp: frame.ipv4.sourceIp, targetIp: frame.ipv4.destinationIp,
    sourcePort: 50000, destinationPort: 443,
  } } };
const trace: Trace = { id: 1, docVersion: 1, events: [event, { ...event, seq: 1, time: 1000, parentSeq: 0,
  deviceId: "fw", layer: "L3", action: "drop", dropReason: "FIREWALL_BLOCKED", reason: {
    code: "FIREWALL_BLOCKED", params: { device: { deviceId: "fw", deviceName: "FW1" }, chain: "FORWARD", rule: 1, target: "DROP" },
  } }], result: { status: "failed", primaryDropSeq: 1 } };

test("TCP를 ping으로 오인하지 않고 재생·방화벽 차단과 포트 상세를 표시한다", () => {
  expect(validateTrace(trace).ok).toBe(true);
  expect(frameKind(event)).toBe("tcp");
  expect(replaySteps(trace).flatMap(step => step.hops)[0]?.kind).toBe("tcp");
  expect(eventText(event.reason)).toContain("198.51.100.10:443");
  expect(causeOf(trace.events[1]!.reason)?.text).toContain("FW1");
  const html = renderToString(<EventPanel header={<span>이벤트</span>} document={{schemaVersion:1,devices:[],links:[]}}
    traces={[]} getTrace={() => trace} traceId={1} onPickTrace={() => {}} replay={undefined}
    time={() => 0} paused={false} selectedSeq={0} onSelectSeq={() => {}} />);
  // 빈 trace 목록이면 패널은 안내만 표시하므로 아래에서는 summary도 함께 준다.
  expect(html).toContain("아직 기록이 없어요");
  const shown = renderToString(<EventPanel header={<span>이벤트</span>} document={{schemaVersion:1,devices:[],links:[]}}
    traces={[{id:1,docVersion:1,kind:"ping",status:"failed",eventCount:2,source:{deviceId:"pc",deviceName:"PC_A"},targetIp:"198.51.100.10"}]}
    getTrace={() => trace} traceId={1} onPickTrace={() => {}} replay={undefined}
    time={() => 0} paused={false} selectedSeq={0} onSelectSeq={() => {}} />).replaceAll("<!-- -->", "");
  expect(shown).toContain("교육용 TCP"); expect(shown).toContain("50000 → 443"); expect(shown).toContain("실패한 이유");
});
