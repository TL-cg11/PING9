// 서버로 쓰는 PC의 구성 (T0.20).
import { describe, expect, test } from "vitest";

import { osOf } from "./document";
import type { PcConfig, PcDevice, TopologyDocument } from "./document";
import { pingRoundKind } from "./ping";
import { checkHostName, dnsRecordsOf, isServer, normalizeServices, osChoiceOf, servicesOf } from "./server-config";
import type { Trace, TraceEvent } from "./trace";
import { validateDocument, validateTrace } from "./validate";

const ID = "22222222-2222-4222-8222-222222222222";

function documentWith(config: PcConfig): TopologyDocument {
  const device: PcDevice = { id: ID, name: "SRV1", kind: "pc", position: { x: 0, y: 0 }, config };
  return { schemaVersion: 1, devices: [device], links: [] };
}

const codeOf = (config: unknown) => {
  const result = validateDocument(documentWith(config as PcConfig));
  return result.ok ? "ok" : result.error.code;
};

describe("종류와 서비스 읽기", () => {
  test("서버는 Linux로 동작한다. 고른 종류는 따로 읽는다", () => {
    expect(osOf({ os: "server" })).toBe("linux");
    expect(osChoiceOf({ os: "server" })).toBe("server");
    expect(osOf({})).toBe("windows");
    expect(osChoiceOf({})).toBe("windows");
    expect(isServer({ os: "server" })).toBe(true);
    expect(isServer({ os: "linux" })).toBe(false);
  });

  test("서버는 칸이 없으면 서비스 넷이 다 켜져 있다. 서버가 아니면 켜 둔 것이 있어도 없다", () => {
    expect(servicesOf({ os: "server" })).toEqual(["http", "dns", "ntp", "ftp"]);
    expect(servicesOf({ os: "server", services: ["ntp"] })).toEqual(["ntp"]);
    expect(servicesOf({ os: "server", services: [] })).toEqual([]);
    expect(servicesOf({ os: "linux", services: ["http"] })).toEqual([]);
    expect(servicesOf({})).toEqual([]);
    expect(dnsRecordsOf({ os: "server" })).toEqual([]);
  });

  test("서비스 목록은 정해진 순서로, 겹침 없이 맞춘다", () => {
    expect(normalizeServices(["ftp", "http", "ftp"])).toEqual(["http", "ftp"]);
  });

  test.each([
    ["www.ping9.test", true],
    ["a", true],
    ["a-b.c1", true],
    ["WWW.ping9.test", false],
    ["-a.test", false],
    ["a..test", false],
    ["a_b.test", false],
    ["", false],
    [`${"a".repeat(40)}.test`, true],
    [`${"a".repeat(41)}.test`, false],
  ])("checkHostName(%s)", (name, ok) => {
    expect(checkHostName(name) === null).toBe(ok);
  });
});

describe("문서 검증", () => {
  test("서버 구성을 받는다. 옛 문서(칸이 없는 PC)도 그대로 읽힌다", () => {
    expect(codeOf({})).toBe("ok");
    expect(codeOf({ os: "server" })).toBe("ok");
    expect(codeOf({
      os: "server", ip: "10.0.2.10", mask: "255.255.255.0", services: ["http", "ftp"],
      dnsRecords: [{ name: "www.ping9.test", address: "10.0.2.10" }],
    })).toBe("ok");
    // 서버가 아니어도 서비스 구성은 남아 있을 수 있다 (종류를 바꿨다가 되돌릴 때)
    expect(codeOf({ os: "linux", services: ["http"] })).toBe("ok");
  });

  test.each<[string, unknown, string]>([
    ["없는 종류", { os: "macos" }, "DOCUMENT_INVALID_SHAPE"],
    ["없는 서비스", { os: "server", services: ["ssh"] }, "DOCUMENT_INVALID_SHAPE"],
    ["겹친 서비스", { os: "server", services: ["http", "http"] }, "DOCUMENT_INVALID_SHAPE"],
    ["순서가 다른 서비스", { os: "server", services: ["ftp", "http"] }, "DOCUMENT_INVALID_SHAPE"],
    ["틀린 이름", { os: "server", dnsRecords: [{ name: "Bad_Name", address: "10.0.0.1" }] }, "DNS_NAME_INVALID"],
    ["틀린 주소", { os: "server", dnsRecords: [{ name: "a.test", address: "10.0.0.300" }] }, "INVALID_IPV4"],
    ["겹친 이름", { os: "server", dnsRecords: [{ name: "a.test", address: "10.0.0.1" }, { name: "a.test", address: "10.0.0.2" }] }, "DOCUMENT_INVALID_SHAPE"],
    ["한도를 넘는 이름 수", { os: "server", dnsRecords: Array.from({ length: 33 }, (_value, index) => ({ name: `h${index}.test`, address: "10.0.0.1" })) }, "LIMIT_EXCEEDED"],
  ])("%s을(를) 거부한다", (_name, config, code) => {
    expect(codeOf(config)).toBe(code);
  });
});

describe("추적", () => {
  const device = { deviceId: ID, deviceName: "PC1" };
  const ethernet = { sourceMac: "02:00:00:00:01:00", destinationMac: "02:00:00:00:02:00" };
  const ipv4 = { sourceIp: "10.0.2.10", destinationIp: "10.0.1.10", ttl: 63 };
  const trace = (events: Partial<TraceEvent>[], status: Trace["result"]["status"] = "success"): Trace => ({
    id: 1, docVersion: 1, result: { status },
    events: events.map((event, seq) => ({ seq, time: seq * 1000, frameId: 1, deviceId: ID, layer: "APP", action: "receive", ...event }) as TraceEvent),
  });

  test("TCP, 응용 계층, 포트가 담긴 ICMP 오류를 형태 검사가 받는다", () => {
    const service = { device, service: "http" as const, sourceIp: "10.0.2.10", targetIp: "10.0.1.10", port: 80, message: "200 OK" };
    expect(validateTrace(trace([
      { layer: "TCP", reason: { code: "TCP_SEGMENT_RECEIVED", params: { device, sourceIp: "10.0.2.10", targetIp: "10.0.1.10", port: 80, flags: "SYN-ACK" } },
        frame: { ethernet, ipv4, tcp: { sourcePort: 80, destinationPort: 49152, flags: "SYN-ACK" } } },
      { reason: { code: "SERVICE_RESPONSE_RECEIVED", params: service },
        frame: { ethernet, ipv4, tcp: { sourcePort: 80, destinationPort: 49152, flags: "PSH-ACK" }, application: { service: "http", message: "200 OK", data: "<h1>x</h1>" } } },
      { layer: "ICMP", reason: { code: "ICMP_ERROR_RECEIVED", params: { device, sourceIp: "10.0.1.1", targetIp: "10.0.1.10", error: "destination-unreachable" } },
        frame: { ethernet, ipv4, icmp: { type: "destination-unreachable", sequence: 0,
          original: { sourceIp: "10.0.1.10", destinationIp: "10.0.2.10", sequence: 0, protocol: "tcp", destinationPort: 80 } } } },
    ]))).toMatchObject({ ok: true });
    expect(validateTrace(trace([{ reason: { code: "SERVICE_RESPONSE_RECEIVED", params: service },
      frame: { ethernet, ipv4, tcp: { sourcePort: 80, destinationPort: 49152, flags: "FIN" as never } } }])).ok).toBe(false);
  });

  test("서비스 요청의 결과 종류: 응답을 받으면 reply, RST나 포트가 담긴 ICMP 오류면 icmp-error, 아니면 timeout", () => {
    const response = { code: "SERVICE_RESPONSE_RECEIVED", params: { device, service: "dns", sourceIp: "", targetIp: "", port: 53, message: "NXDOMAIN a" } } as const;
    expect(pingRoundKind(trace([{ reason: response, frame: { ethernet, ipv4, udp: { sourcePort: 53, destinationPort: 49152 } } }]), ID, 1)).toBe("reply");
    expect(pingRoundKind(trace([{ layer: "TCP",
      reason: { code: "TCP_SEGMENT_RECEIVED", params: { device, sourceIp: "", targetIp: "", port: 80, flags: "RST" } },
      frame: { ethernet, ipv4, tcp: { sourcePort: 80, destinationPort: 49152, flags: "RST" } } }], "failed"), ID, 1)).toBe("icmp-error");
    expect(pingRoundKind(trace([{ layer: "ICMP",
      reason: { code: "ICMP_ERROR_RECEIVED", params: { device, sourceIp: "", targetIp: "", error: "destination-unreachable" } },
      frame: { ethernet, ipv4, icmp: { type: "destination-unreachable", sequence: 0,
        original: { sourceIp: "", destinationIp: "", sequence: 0, protocol: "udp", destinationPort: 53 } } } }], "failed"), ID, 1)).toBe("icmp-error");
    expect(pingRoundKind(trace([{ layer: "TCP", action: "create",
      reason: { code: "TCP_SEGMENT_SENT", params: { device, sourceIp: "", targetIp: "", port: 80, flags: "SYN" } },
      frame: { ethernet, ipv4, tcp: { sourcePort: 49152, destinationPort: 80, flags: "SYN" } } }], "failed"), ID, 1)).toBe("timeout");
  });
});
