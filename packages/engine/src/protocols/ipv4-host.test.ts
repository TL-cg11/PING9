// T1.8.2 IPv4 호스트와 ICMP echo. T1.8.1처럼 진짜 kernel로 돌리고, 링크 전달(T1.7.2)만 가짜 `transmit`으로 둔다.

import { BROADCAST_MAC, LINK_DELAY_MICROSECONDS, UNKNOWN_MAC, validateTrace } from "@ping9/shared";
import type { DeviceRef, FrameSnapshot, PortRef, Trace } from "@ping9/shared";
import { TWO_PC, twoPcPingTrace } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { createKernel } from "../kernel";
import type { SimContext } from "../kernel";
import { ArpModule } from "./arp";
import { Ipv4Host } from "./ipv4-host";

const { pc1, pc2, mask, port, linkId, ttl } = TWO_PC;

interface Host {
  readonly id: string;
  readonly name: string;
  readonly mac: string;
  readonly ip?: string;
  readonly gateway?: string;
  readonly ttl?: number;
}

const PC1: Host = pc1;
const PC2: Host = pc2;
const GATEWAY: Host = { id: "00000000-0000-4000-8000-0000000000fe", name: "R1", ip: "192.168.1.254", mac: "02:00:00:00:fe:00" };
const FAR_IP = "10.0.0.5";

const ref = (host: Host): DeviceRef => ({ deviceId: host.id, deviceName: host.name });

/**
 * 가짜 세상. 장비마다 포트 하나(Ethernet0)이고, 보낸 프레임을 1000 µs 뒤에 건넨다.
 * 이미 배운 Switch처럼 브로드캐스트는 모두에게, 나머지는 그 MAC의 장비에게만 간다 (T1.8.1 테스트와 같은 규칙)
 */
function world(hosts: readonly Host[]) {
  const ipv4 = new Map<string, Ipv4Host>();
  const arps = new Map<string, ArpModule>();
  for (const host of hosts) {
    const address = host.ip === undefined
      ? undefined
      : { ip: host.ip, mask, ...(host.gateway === undefined ? {} : { gateway: host.gateway }) };
    const arp = new ArpModule({
      device: ref(host),
      ipOf: () => host.ip,
      macOf: () => host.mac,
      linkOf: () => linkId,
      transmit(ctx, _port, frame) {
        const to = frame.snapshot.ethernet.destinationMac;
        for (const other of hosts) {
          if (other.id === host.id || (to !== BROADCAST_MAC && to !== other.mac)) continue;
          const target: PortRef = { deviceId: other.id, port };
          ctx.sendFrame(target, frame, LINK_DELAY_MICROSECONDS);
        }
      },
    });
    arps.set(host.id, arp);
    ipv4.set(host.id, new Ipv4Host({
      device: ref(host),
      addressOf: () => address,
      macOf: () => host.mac,
      linkOf: () => linkId,
      ttl: host.ttl ?? ttl,
    }, arp));
  }
  const ip = (host: Host) => ipv4.get(host.id)!;
  const kernel = createKernel();

  /** 한 회차. `source`가 응답을 하나라도 받았으면 성공이다 (판정은 원래 T1.8.3의 일) */
  const run = (start: (ctx: SimContext) => void, source: Host = PC1): Trace =>
    kernel.run({
      docVersion: 1,
      start,
      onFrame: (ctx, target, frame) => ipv4.get(target.deviceId)!.onFrame(ctx, target.port, frame),
      onTimer(ctx, timer) {
        for (const arp of arps.values()) if (arp.onTimer(ctx, timer)) return;
      },
      outcome: () => (ip(source).repliesReceived().length > 0 ? "success" : "failed"),
    });

  return { ip, arp: (host: Host) => arps.get(host.id)!, run };
}

const codes = (trace: Trace) => trace.events.map((event) => event.reason.code);

const echoRequest = (from: Host, to: Host, sequence = 1): FrameSnapshot => ({
  ethernet: { sourceMac: from.mac, destinationMac: to.mac },
  ipv4: { sourceIp: from.ip!, destinationIp: to.ip!, ttl },
  icmp: { type: "echo-request", sequence },
});

describe("IPv4 호스트와 ICMP echo", () => {
  test("PC 2대, 빈 테이블: 이벤트 10개와 결과가 예시 twoPcPingTrace와 같다", () => {
    const { ip, run } = world([PC1, PC2]);
    const trace = run((ctx) => ip(PC1).sendEcho(ctx, port, pc2.ip, 1));
    expect(trace.events).toEqual(twoPcPingTrace.events);
    expect(trace.result).toEqual(twoPcPingTrace.result);
    expect(validateTrace(trace).ok).toBe(true);
  });

  test("두 번째 회차: ARP 없이 ICMP 4개, frameId는 1, 1, 2, 2", () => {
    const { ip, run } = world([PC1, PC2]);
    run((ctx) => ip(PC1).sendEcho(ctx, port, pc2.ip, 1));
    const second = run((ctx) => ip(PC1).sendEcho(ctx, port, pc2.ip, 2));
    expect(codes(second)).toEqual([
      "ICMP_ECHO_REQUEST_SENT", "ICMP_ECHO_REQUEST_RECEIVED", "ICMP_ECHO_REPLY_SENT", "ICMP_ECHO_REPLY_RECEIVED",
    ]);
    expect(second.events.map((event) => event.frameId)).toEqual([1, 1, 2, 2]);
    expect(second.events.map((event) => event.frame.icmp?.sequence)).toEqual([2, 2, 2, 2]);
    expect(second.result).toEqual({ status: "success" });
  });

  test("IP가 없는 포트: 보내려던 패킷으로 NO_IP 폐기 하나 (L3), 실패 원인", () => {
    const noIp: Host = { id: pc1.id, name: pc1.name, mac: pc1.mac };
    const { ip, run } = world([noIp, PC2]);
    const trace = run((ctx) => ip(noIp).sendEcho(ctx, port, pc2.ip, 1), noIp);
    expect(trace.events).toHaveLength(1);
    expect(trace.events[0]).toMatchObject({
      layer: "L3", action: "drop", dropReason: "NO_IP", reason: { params: { device: ref(noIp) } },
      frame: { ethernet: { destinationMac: UNKNOWN_MAC }, ipv4: { destinationIp: pc2.ip }, icmp: { type: "echo-request" } },
    });
    expect(trace.events[0]!.outPort).toBeUndefined();
    expect(trace.result).toEqual({ status: "failed", primaryDropSeq: 0 });
    expect(validateTrace(trace).ok).toBe(true);
  });

  test("다른 네트워크인데 게이트웨이가 없음: NO_GATEWAY 폐기 하나", () => {
    const { ip, run } = world([PC1, PC2]);
    const trace = run((ctx) => ip(PC1).sendEcho(ctx, port, FAR_IP, 1));
    expect(codes(trace)).toEqual(["NO_GATEWAY"]);
    expect(trace.events[0]).toMatchObject({
      layer: "L3", reason: { params: { device: ref(PC1), targetIp: FAR_IP } },
      frame: { ipv4: { sourceIp: pc1.ip, destinationIp: FAR_IP } },
    });
    expect(trace.result).toEqual({ status: "failed", primaryDropSeq: 0 });
  });

  test("다른 네트워크, 게이트웨이 있음: ARP는 게이트웨이에게 묻고, IP 목적지는 원래 주소다", () => {
    const withGateway: Host = { ...PC1, gateway: GATEWAY.ip! };
    const { ip, run } = world([withGateway, GATEWAY]);
    const trace = run((ctx) => ip(withGateway).sendEcho(ctx, port, FAR_IP, 1), withGateway);
    expect(trace.events[0]!.frame.arp?.targetIp).toBe(GATEWAY.ip);
    const sent = trace.events.find((event) => event.reason.code === "ICMP_ECHO_REQUEST_SENT")!;
    expect(sent.frame.ethernet.destinationMac).toBe(GATEWAY.mac);
    expect(sent.frame.ipv4).toMatchObject({ sourceIp: pc1.ip, destinationIp: FAR_IP });
    // 이 모듈은 전달하지 않는다. 게이트웨이는 자기 IP가 아니라서 버린다 (Router 전달은 E4)
    expect(trace.events.at(-1)).toMatchObject({ deviceId: GATEWAY.id, layer: "L3", dropReason: "NOT_FOR_ME" });
  });

  test("자기 MAC으로 왔지만 IP가 남의 것: NOT_FOR_ME (L3), 응답 없음, 실패 원인이 아니다", () => {
    const { ip, run } = world([PC1, PC2]);
    const wrongIp: FrameSnapshot = { ...echoRequest(PC1, PC2), ipv4: { sourceIp: pc1.ip, destinationIp: "192.168.1.77", ttl } };
    const trace = run((ctx) => ip(PC2).onFrame(ctx, port, ctx.createFrame(wrongIp)));
    expect(trace.events).toHaveLength(1);
    expect(trace.events[0]).toMatchObject({ layer: "L3", action: "drop", dropReason: "NOT_FOR_ME", inPort: port });
    expect(trace.result.primaryDropSeq).toBeUndefined();
  });

  test("목적지 MAC이 남의 것: NOT_FOR_ME (L2). ARP 프레임도 여기서 걸러진다", () => {
    const { ip, run } = world([PC1, PC2]);
    const toOther: FrameSnapshot = { ...echoRequest(PC1, PC2), ethernet: { sourceMac: pc1.mac, destinationMac: "02:00:00:00:99:00" } };
    const trace = run((ctx) => ip(PC2).onFrame(ctx, port, ctx.createFrame(toOther)));
    expect(trace.events).toHaveLength(1);
    expect(trace.events[0]).toMatchObject({ layer: "L2", action: "drop", dropReason: "NOT_FOR_ME" });
    expect(trace.result.primaryDropSeq).toBeUndefined();
  });

  test("TTL은 보낸 장비의 값이다: Linux(64)의 요청은 64, Windows(128)의 응답은 128", () => {
    const linux: Host = { ...PC1, ttl: 64 };
    const { ip, run } = world([linux, PC2]);
    const trace = run((ctx) => ip(linux).sendEcho(ctx, port, pc2.ip, 1), linux);
    const ttlOf = (code: string) => trace.events.find((event) => event.reason.code === code)!.frame.ipv4?.ttl;
    expect(ttlOf("ICMP_ECHO_REQUEST_SENT")).toBe(64);
    expect(ttlOf("ICMP_ECHO_REPLY_SENT")).toBe(128);
  });

  test("응답 목록: 받은 sequence가 쌓이고 startRun()이 비운다", () => {
    const { ip, run } = world([PC1, PC2]);
    run((ctx) => ip(PC1).sendEcho(ctx, port, pc2.ip, 1));
    run((ctx) => ip(PC1).sendEcho(ctx, port, pc2.ip, 2));
    expect(ip(PC1).repliesReceived()).toEqual([1, 2]);
    expect(ip(PC2).repliesReceived()).toEqual([]);
    ip(PC1).startRun();
    expect(ip(PC1).repliesReceived()).toEqual([]);
  });

  test("응답할 상대의 MAC을 모르면 ARP를 먼저 하고, ARP 요청의 부모는 받음 이벤트다", () => {
    const { ip, run } = world([PC1, PC2]);
    // PC2의 테이블이 빈 채로 요청만 도착한 경우 (예: PC2가 arp -d를 한 뒤)
    const trace = run((ctx) => ip(PC2).onFrame(ctx, port, ctx.createFrame(echoRequest(PC1, PC2))));
    expect(codes(trace).slice(0, 2)).toEqual(["ICMP_ECHO_REQUEST_RECEIVED", "ARP_REQUEST_SENT"]);
    expect(trace.events[1]!.parentSeq).toBe(0);
    const replySent = trace.events.find((event) => event.reason.code === "ICMP_ECHO_REPLY_SENT")!;
    expect(replySent.frame.ethernet.destinationMac).toBe(pc1.mac);
    expect(ip(PC1).repliesReceived()).toEqual([1]);
  });

  test("다른 네트워크에서 온 요청에 게이트웨이 없이는 응답하지 못한다: NO_GATEWAY, 부모는 받음", () => {
    const { ip, run } = world([PC1, PC2]);
    const far: FrameSnapshot = { ...echoRequest(PC1, PC2), ipv4: { sourceIp: FAR_IP, destinationIp: pc2.ip, ttl } };
    const trace = run((ctx) => ip(PC2).onFrame(ctx, port, ctx.createFrame(far)), PC2);
    expect(codes(trace)).toEqual(["ICMP_ECHO_REQUEST_RECEIVED", "NO_GATEWAY"]);
    expect(trace.events[1]).toMatchObject({
      parentSeq: 0, layer: "L3", reason: { params: { targetIp: FAR_IP } },
      frame: { ipv4: { sourceIp: pc2.ip, destinationIp: FAR_IP }, icmp: { type: "echo-reply", sequence: 1 } },
    });
  });

  test("결정성: 같은 입력이면 같은 Trace", () => {
    const once = () => {
      const { ip, run } = world([PC1, PC2]);
      return run((ctx) => ip(PC1).sendEcho(ctx, port, pc2.ip, 1));
    };
    expect(once()).toEqual(once());
  });
});
