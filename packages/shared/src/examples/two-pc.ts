// 예시: PC 2대를 링크 하나로 직접 연결하고 PC1에서 PC2로 ping.
// engine 테스트와 web 테스트가 같은 자료를 쓴다 (AD-9).
// engine의 결과가 이 자료와 달라지면 둘 중 하나를 고치되, 반드시 같은 Pull Request에서 함께 고친다.

import type { ConsoleResult } from "../console";
import type { TopologyDocument } from "../document";
import { LINK_DELAY_MICROSECONDS } from "../limits";
import type { Trace } from "../trace";
import { BROADCAST_MAC, UNKNOWN_MAC } from "../trace";
import type { Snapshot } from "../view";

export const TWO_PC = {
  pc1: {
    id: "00000000-0000-4000-8000-000000000001",
    name: "PC1",
    ip: "192.168.1.1",
    // MAC 주소는 저장하지 않는다. engine이 장비 ID의 마지막 8자리와 포트 순번에서 계산한 값이다
    mac: "02:00:00:00:01:00",
  },
  pc2: {
    id: "00000000-0000-4000-8000-000000000002",
    name: "PC2",
    ip: "192.168.1.2",
    mac: "02:00:00:00:02:00",
  },
  mask: "255.255.255.0",
  port: "Ethernet0",
  linkId: "00000000-0000-4000-8000-0000000000a1",
  /** PC가 내보내는 IPv4 패킷의 TTL */
  ttl: 128,
} as const;

const { pc1, pc2, mask, port, linkId, ttl } = TWO_PC;
const pc1Ref = { deviceId: pc1.id, deviceName: pc1.name };
const pc2Ref = { deviceId: pc2.id, deviceName: pc2.name };
const hop = LINK_DELAY_MICROSECONDS;

export const twoPcDocument: TopologyDocument = {
  schemaVersion: 1,
  devices: [
    {
      id: pc1.id,
      kind: "pc",
      name: pc1.name,
      position: { x: 200, y: 200 },
      config: { ip: pc1.ip, mask },
    },
    {
      id: pc2.id,
      kind: "pc",
      name: pc2.name,
      position: { x: 500, y: 200 },
      config: { ip: pc2.ip, mask },
    },
  ],
  links: [
    {
      id: linkId,
      ends: [
        { deviceId: pc1.id, port },
        { deviceId: pc2.id, port },
      ],
    },
  ],
};

// 프레임 네 개: ARP 요청, ARP 응답, ICMP echo 요청, ICMP echo 응답
const arpRequest = {
  ethernet: { sourceMac: pc1.mac, destinationMac: BROADCAST_MAC },
  arp: {
    operation: "request",
    senderMac: pc1.mac,
    senderIp: pc1.ip,
    targetMac: UNKNOWN_MAC,
    targetIp: pc2.ip,
  },
} as const;

const arpReply = {
  ethernet: { sourceMac: pc2.mac, destinationMac: pc1.mac },
  arp: {
    operation: "reply",
    senderMac: pc2.mac,
    senderIp: pc2.ip,
    targetMac: pc1.mac,
    targetIp: pc1.ip,
  },
} as const;

const echoRequest = {
  ethernet: { sourceMac: pc1.mac, destinationMac: pc2.mac },
  ipv4: { sourceIp: pc1.ip, destinationIp: pc2.ip, ttl },
  icmp: { type: "echo-request", sequence: 1 },
} as const;

const echoReply = {
  ethernet: { sourceMac: pc2.mac, destinationMac: pc1.mac },
  ipv4: { sourceIp: pc2.ip, destinationIp: pc1.ip, ttl },
  icmp: { type: "echo-reply", sequence: 1 },
} as const;

/**
 * `ping 192.168.1.2`의 첫 회차. 두 PC의 ARP 테이블이 비어 있는 상태에서 시작한다.
 * ARP 요청과 응답이 먼저 오가고, 그 뒤에 ICMP echo 요청과 응답이 오간다.
 */
export const twoPcPingTrace: Trace = {
  id: 1,
  docVersion: 1,
  result: { status: "success" },
  events: [
    {
      seq: 0,
      time: 0,
      frameId: 1,
      deviceId: pc1.id,
      outPort: port,
      linkId,
      layer: "ARP",
      action: "create",
      reason: {
        code: "ARP_REQUEST_SENT",
        params: { device: pc1Ref, senderIp: pc1.ip, targetIp: pc2.ip },
      },
      frame: arpRequest,
    },
    {
      seq: 1,
      time: hop,
      frameId: 1,
      parentSeq: 0,
      deviceId: pc2.id,
      inPort: port,
      layer: "ARP",
      action: "receive",
      reason: {
        code: "ARP_REQUEST_RECEIVED",
        params: { device: pc2Ref, senderIp: pc1.ip, targetIp: pc2.ip, forMe: true },
      },
      frame: arpRequest,
    },
    {
      seq: 2,
      time: hop,
      frameId: 1,
      parentSeq: 1,
      deviceId: pc2.id,
      inPort: port,
      layer: "ARP",
      action: "learn",
      reason: {
        code: "ARP_ENTRY_LEARNED",
        params: { device: pc2Ref, ip: pc1.ip, mac: pc1.mac },
      },
      frame: arpRequest,
    },
    {
      seq: 3,
      time: hop,
      frameId: 2,
      parentSeq: 1,
      deviceId: pc2.id,
      outPort: port,
      linkId,
      layer: "ARP",
      action: "reply",
      reason: {
        code: "ARP_REPLY_SENT",
        params: { device: pc2Ref, ip: pc2.ip, mac: pc2.mac },
      },
      frame: arpReply,
    },
    {
      seq: 4,
      time: hop * 2,
      frameId: 2,
      parentSeq: 3,
      deviceId: pc1.id,
      inPort: port,
      layer: "ARP",
      action: "receive",
      reason: {
        code: "ARP_REPLY_RECEIVED",
        params: { device: pc1Ref, ip: pc2.ip, mac: pc2.mac },
      },
      frame: arpReply,
    },
    {
      seq: 5,
      time: hop * 2,
      frameId: 2,
      parentSeq: 4,
      deviceId: pc1.id,
      inPort: port,
      layer: "ARP",
      action: "learn",
      reason: {
        code: "ARP_ENTRY_LEARNED",
        params: { device: pc1Ref, ip: pc2.ip, mac: pc2.mac },
      },
      frame: arpReply,
    },
    {
      seq: 6,
      time: hop * 2,
      frameId: 3,
      parentSeq: 5,
      deviceId: pc1.id,
      outPort: port,
      linkId,
      layer: "ICMP",
      action: "create",
      reason: {
        code: "ICMP_ECHO_REQUEST_SENT",
        params: { device: pc1Ref, sourceIp: pc1.ip, targetIp: pc2.ip },
      },
      frame: echoRequest,
    },
    {
      seq: 7,
      time: hop * 3,
      frameId: 3,
      parentSeq: 6,
      deviceId: pc2.id,
      inPort: port,
      layer: "ICMP",
      action: "receive",
      reason: {
        code: "ICMP_ECHO_REQUEST_RECEIVED",
        params: { device: pc2Ref, sourceIp: pc1.ip, targetIp: pc2.ip },
      },
      frame: echoRequest,
    },
    {
      seq: 8,
      time: hop * 3,
      frameId: 4,
      parentSeq: 7,
      deviceId: pc2.id,
      outPort: port,
      linkId,
      layer: "ICMP",
      action: "reply",
      reason: {
        code: "ICMP_ECHO_REPLY_SENT",
        params: { device: pc2Ref, sourceIp: pc2.ip, targetIp: pc1.ip },
      },
      frame: echoReply,
    },
    {
      seq: 9,
      time: hop * 4,
      frameId: 4,
      parentSeq: 8,
      deviceId: pc1.id,
      inPort: port,
      layer: "ICMP",
      action: "receive",
      reason: {
        code: "ICMP_ECHO_REPLY_RECEIVED",
        params: { device: pc1Ref, sourceIp: pc2.ip, targetIp: pc1.ip },
      },
      frame: echoReply,
    },
  ],
};

/** 위 문서를 불러오고 ping의 첫 회차가 끝난 직후의 스냅샷 */
export const twoPcSnapshot: Snapshot = {
  document: twoPcDocument,
  docVersion: 1,
  runtimeVersion: 2,
  views: {
    [pc1.id]: {
      kind: "pc",
      ports: [{ name: port, status: "up", linkId }],
      arpTable: [{ ip: pc2.ip, mac: pc2.mac, port }],
    },
    [pc2.id]: {
      kind: "pc",
      ports: [{ name: port, status: "up", linkId }],
      arpTable: [{ ip: pc1.ip, mac: pc1.mac, port }],
    },
  },
  traces: [
    {
      id: 1,
      docVersion: 1,
      kind: "ping",
      status: "success",
      eventCount: 10,
      source: pc1Ref,
      targetIp: pc2.ip,
    },
  ],
};

/**
 * PC1의 콘솔에서 `ping 192.168.1.2`를 실행한 결과. 회차마다 결과 줄과 그 회차의 추적을 여는 줄이 짝을 이룬다.
 * 왕복 시간은 가상 시간이다: 첫 회차는 ARP가 먼저 오가서 4ms, 나머지는 2ms.
 */
export const twoPcPingConsoleResult: ConsoleResult = {
  prompt: "PC1 User>",
  lines: [
    { kind: "text", text: "Pinging 192.168.1.2 with 32 bytes of data:" },
    { kind: "text", text: "Reply from 192.168.1.2: bytes=32 time=4ms TTL=128" },
    { kind: "trace", traceId: 1 },
    { kind: "text", text: "Reply from 192.168.1.2: bytes=32 time=2ms TTL=128" },
    { kind: "trace", traceId: 2 },
    { kind: "text", text: "Reply from 192.168.1.2: bytes=32 time=2ms TTL=128" },
    { kind: "trace", traceId: 3 },
    { kind: "text", text: "Reply from 192.168.1.2: bytes=32 time=2ms TTL=128" },
    { kind: "trace", traceId: 4 },
    { kind: "text", text: "" },
    { kind: "text", text: "Ping statistics for 192.168.1.2:" },
    { kind: "text", text: "    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss)" },
  ],
};
