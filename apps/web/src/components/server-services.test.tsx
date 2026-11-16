// 서버로 쓰는 PC의 화면 (T0.20): OS 고르기, 서비스 구역, 아이콘, 문구, 재생 그림.
import { createSimulator } from "@ping9/engine";
import type { Reason, TraceEvent, TraceSummary } from "@ping9/shared";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { formatError } from "../messages/errors";
import { causeOf, eventText } from "../messages/events";
import { frameKind } from "../replay/steps";
import { Canvas } from "./canvas";
import { DeviceIcon } from "./device-icons";
import { Inspector } from "./inspector";
import { serviceCommand } from "./server-services";

const ID = "00000000-0000-4000-8000-000000000300";
const noop = () => {};

function open(os: "windows" | "linux" | "server") {
  const simulator = createSimulator();
  expect(simulator.dispatch({ type: "device/add", id: ID, kind: "pc", position: { x: 320, y: 200 }, os }).ok).toBe(true);
  return simulator;
}

const inspector = (simulator: ReturnType<typeof open>) =>
  renderToString(<Inspector snapshot={simulator.getSnapshot()} deviceId={ID} onOpenTerminal={noop}
    onDispatch={() => ({ ok: true, notices: [] })} />).replaceAll("<!-- -->", "");

describe("Server를 고른 PC", () => {
  test("속성 패널: Server가 골라져 있고 서비스 넷이 켜져 있다", () => {
    const html = inspector(open("server"));
    expect(html).toMatch(/checked="" value="server"/);
    expect(html).toContain("<h4>서비스</h4>");
    for (const [label, port] of [["HTTP", "tcp/80"], ["DNS", "udp/53"], ["NTP", "udp/123"], ["FTP", "tcp/21"]]) {
      expect(html).toContain(`<span class="port-name">${label}</span><span class="key">${port}</span>`);
      expect(html).toContain(`aria-checked="true" aria-label="${label} 서비스"`);
    }
    expect(html).toContain("<h4>DNS 이름</h4>");
    expect(html).toContain("아직 넣은 이름이 없어요");
    // 포트 이름은 Linux처럼 eth0이다
    expect(html).toContain('<span class="port-name">eth0</span>');
  });

  test("끈 서비스는 꺼짐으로, 넣은 DNS 이름은 줄로 보인다", () => {
    const simulator = open("server");
    expect(simulator.dispatch(serviceCommand(ID, "ftp", false)).ok).toBe(true);
    expect(simulator.dispatch({ type: "pc/add-dns-record", deviceId: ID, name: "www.ping9.test", address: "10.0.2.10" }).ok).toBe(true);
    const html = inspector(simulator);
    expect(html).toContain('aria-checked="false" aria-label="FTP 서비스"');
    expect(html).toContain('aria-checked="true" aria-label="HTTP 서비스"');
    expect(html).toContain('www.ping9.test<span class="ip">10.0.2.10</span>');
    expect(html).toContain('aria-label="www.ping9.test 삭제"');
    expect(html).not.toContain("아직 넣은 이름이 없어요");
  });

  test.each(["windows", "linux"] as const)("%s PC에는 서비스 구역이 없다", (os) => {
    const html = inspector(open(os));
    expect(html).not.toContain("<h4>서비스</h4>");
    expect(html).not.toContain("DNS 이름");
  });

  test("캔버스와 아이콘: Server 그림과 이름", () => {
    const simulator = open("server");
    const html = renderToString(<Canvas document={simulator.getSnapshot().document} selectedDeviceId={null} onSelect={noop} onOpenTerminal={noop} />);
    expect(html).toContain('class="icon icon-pc icon-os-server"');
    expect(html).toContain("PC1, PC, Server, 콘솔 열기");
    const icon = renderToString(<DeviceIcon kind="pc" os="server" />);
    expect(icon).toContain('class="igloo-server"');
    expect(icon).not.toMatch(/igloo-(linux|windows)/);
  });
});

describe("서비스의 문구", () => {
  const device = { deviceId: ID, deviceName: "SRV1" };
  const reason = (code: string, params: Record<string, unknown>) => ({ code, params: { device, ...params } }) as unknown as Reason;

  test("TCP 연결과 서비스 요청·응답", () => {
    expect(eventText(reason("TCP_SEGMENT_SENT", { sourceIp: "10.0.1.10", targetIp: "10.0.2.10", port: 80, flags: "SYN" })))
      .toBe("TCP 연결 요청(SYN)을 10.0.2.10로 보냄 (포트 80)");
    expect(eventText(reason("TCP_SEGMENT_RECEIVED", { sourceIp: "10.0.2.10", targetIp: "10.0.1.10", port: 80, flags: "RST" })))
      .toBe("10.0.2.10의 TCP 연결 거절(RST)을 받음 (포트 80)");
    const message = { service: "http", sourceIp: "10.0.1.10", targetIp: "10.0.2.10", port: 80, message: "GET /" };
    expect(eventText(reason("SERVICE_REQUEST_SENT", message))).toBe("HTTP 요청을 10.0.2.10로 보냄: GET /");
    expect(eventText(reason("SERVICE_RESPONSE_RECEIVED", { ...message, sourceIp: "10.0.2.10", message: "200 OK" })))
      .toBe("10.0.2.10의 HTTP 응답을 받음: 200 OK");
  });

  test("닫힌 포트는 무엇을 확인할지 알려 준다", () => {
    const closed = reason("PORT_CLOSED", { protocol: "tcp", port: 80 });
    expect(eventText(closed)).toBe("TCP 80번 포트에서 듣는 서비스가 없어 거절");
    expect(causeOf(closed)).toEqual({
      text: "SRV1의 TCP 80번 포트에서 듣는 서비스가 없어요",
      fix: "서비스는 OS가 Server인 PC가 돌려요. 주소가 그 PC의 것인지, 그 서비스가 켜져 있는지 확인하세요",
    });
  });

  test("오류 문구", () => {
    expect(formatError({ code: "PC_NOT_SERVER", params: { deviceId: ID } })).toContain("Server를 골라 주세요");
    expect(formatError({ code: "SERVICE_URL_INVALID", params: { value: "http://www/" } })).toContain("http://www/");
    expect(formatError({ code: "DNS_RECORD_NOT_FOUND", params: { deviceId: ID, name: "a.test" } })).toBe("이 서버에는 a.test 이름이 없어요");
    expect(formatError({ code: "LIMIT_EXCEEDED", params: { limit: "dnsRecords", max: 32 } })).toBe("DNS 이름은 서버 하나에 32개까지 넣을 수 있어요");
  });
});

describe("재생 그림", () => {
  const ethernet = { sourceMac: "02:00:00:00:01:00", destinationMac: "02:00:00:00:02:00" };
  const event = (frame: Partial<TraceEvent["frame"]>) => ({ frame: { ethernet, ...frame } }) as TraceEvent;

  test("서버 쪽 포트로 가는 것이 요청, 돌아오는 것이 응답이다", () => {
    expect(frameKind(event({ tcp: { sourcePort: 49152, destinationPort: 80, flags: "SYN" } }))).toBe("tcp-request");
    expect(frameKind(event({ tcp: { sourcePort: 80, destinationPort: 49152, flags: "SYN-ACK" } }))).toBe("tcp-response");
    expect(frameKind(event({ udp: { sourcePort: 49152, destinationPort: 53 } }))).toBe("udp-request");
    expect(frameKind(event({ udp: { sourcePort: 53, destinationPort: 49152 } }))).toBe("udp-response");
    // 서버 포트가 1024 이상이어도 방향은 같다
    expect(frameKind(event({ tcp: { sourcePort: 49152, destinationPort: 8080, flags: "SYN" } }))).toBe("tcp-request");
    expect(frameKind(event({ tcp: { sourcePort: 8080, destinationPort: 49152, flags: "RST" } }))).toBe("tcp-response");
    // RIP는 UDP지만 RIP 그림을 쓴다
    expect(frameKind(event({ udp: { sourcePort: 520, destinationPort: 520 }, rip: { command: "request", entries: [] } }))).toBe("rip-request");
  });

  test("추적 목록의 이름에 서비스가 붙는다", async () => {
    const { EventPanel } = await import("./event-panel");
    // 케이블이 없는 PC에서 요청해 추적 하나를 만든다
    const simulator = open("linux");
    expect(simulator.dispatch({ type: "pc/set-ip", deviceId: ID, ip: "10.0.2.5", mask: "255.255.255.0", gateway: null }).ok).toBe(true);
    await simulator.console(ID).exec("curl http://10.0.2.10/");
    const { document, traces } = simulator.getSnapshot();
    const [summary] = traces as readonly [TraceSummary];
    expect(summary).toMatchObject({ kind: "ping", service: "http" });
    const html = renderToString(<EventPanel header={null} document={document} traces={traces}
      getTrace={(id) => simulator.getTrace(id)} traceId={summary.id} onPickTrace={noop} replay={undefined} time={() => 0} paused={false}
      selectedSeq={null} onSelectSeq={noop} />).replaceAll("<!-- -->", "");
    expect(html).toContain("PC1 → 10.0.2.10 (HTTP)");
  });
});
