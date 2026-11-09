// T1.8.1: ARP 모듈 (FR-29). 장비 종류를 모르는 프로토콜 모듈이다. PC는 포트 하나, Router는 여러 개에 쓴다.
// 장비 모델(T1.7.2·T1.8.3)이 이 객체를 들고 있다. 테이블은 ping 회차가 바뀌어도 남는다.
// `ctx`는 매번 받고 보관하지 않는다 (T1.7.1 kernel 규칙).

import { BROADCAST_MAC, UNKNOWN_MAC, parseIpv4 } from "@ping9/shared";
import type { ArpEntryView, ArpPacket, DeviceRef, FrameSnapshot } from "@ping9/shared";

import type { Frame, SimContext, TimerRef } from "../kernel";

/** 요청 한 번을 기다리는 시간 (가상 µs) */
export const ARP_RETRY_INTERVAL_US = 1_000_000;
/** 요청을 보내는 횟수. 마지막 요청도 응답이 없으면 버린다: 1초 + 1초 = 계획의 "2초 뒤 폐기" (02 문서 A5) */
export const ARP_REQUEST_ATTEMPTS = 2;

const TIMER_PREFIX = "arp:";

/** 이 모듈이 장비에게서 받는 것. 장비 모델이 채워 준다 */
export interface ArpHost {
  readonly device: DeviceRef;
  /** 포트의 자기 IP. IP가 없는 포트면 undefined */
  ipOf(port: string): string | undefined;
  macOf(port: string): string;
  /** 포트에 연결된 링크. 보냄 이벤트의 `linkId`에 쓴다. 없으면 undefined */
  linkOf(port: string): string | undefined;
  /** 포트로 프레임을 내보낸다. 링크 상대 찾기, 지연, 링크 없음 폐기는 T1.7.2가 한다 */
  transmit(ctx: SimContext, port: string, frame: Frame): void;
}

/**
 * 대기열에 둘 것. 프레임이 아니라 "만드는 법"이다.
 * 프레임은 MAC을 알게 된 뒤에 만든다 (예시 `twoPcPingTrace`의 ICMP frameId가 3이다)
 */
export interface PendingSend {
  /** 목적지 MAC을 받아 보낼 프레임 내용을 만든다 */
  build(destinationMac: string): FrameSnapshot;
  /**
   * 만든 프레임을 보내며 이벤트를 기록한다 (예: ICMP_ECHO_REQUEST_SENT. T1.8.2가 채운다).
   * `parentSeq`가 있으면 그 이벤트의 부모로 쓴다. 이 뒤에 ARP가 `transmit`을 부른다
   */
  onSend(ctx: SimContext, frame: Frame, parentSeq: number | undefined): void;
}

interface Entry {
  readonly mac: string;
  readonly port: string;
}

interface Waiting {
  readonly port: string;
  readonly sends: PendingSend[];
  /** 보낸 요청 수 */
  attempts: number;
  /** 마지막으로 보낸 요청 프레임. 무응답 폐기를 이 프레임으로 기록한다 */
  request: Frame;
  timer: TimerRef;
}

/** IP를 숫자 순으로. 형식이 틀린 값은 뒤로 (테이블에는 들어오지 않는다) */
function compareIp(a: string, b: string): number {
  return (parseIpv4(a) ?? Number.MAX_SAFE_INTEGER) - (parseIpv4(b) ?? Number.MAX_SAFE_INTEGER);
}

export class ArpModule {
  readonly #host: ArpHost;
  readonly #table = new Map<string, Entry>();
  /** 응답을 기다리는 다음 홉 IP별 대기열 */
  readonly #waiting = new Map<string, Waiting>();

  constructor(host: ArpHost) {
    this.#host = host;
  }

  /**
   * 다음 홉 IP로 보내고 싶다. 알면 바로 보내고, 모르면 보관하고 요청한다.
   * `parentSeq`는 부른 쪽이 원인으로 삼는 이벤트다 (예: ICMP_ECHO_REQUEST_RECEIVED). 바로 보내면 `onSend`에,
   * 요청하면 ARP_REQUEST_SENT에 넘긴다. 없으면 kernel의 기본값(이 콜백의 원인)이다
   */
  send(ctx: SimContext, port: string, nextHopIp: string, pending: PendingSend, parentSeq?: number): void {
    const known = this.#table.get(nextHopIp);
    if (known !== undefined) {
      this.#sendNow(ctx, known.port, known.mac, pending, parentSeq);
      return;
    }

    const waiting = this.#waiting.get(nextHopIp);
    if (waiting !== undefined) {
      // 같은 IP를 이미 기다리는 중이면 대기열에만 더한다. 요청은 다시 보내지 않는다
      waiting.sends.push(pending);
      return;
    }

    const request = this.#request(ctx, port, nextHopIp, parentSeq);
    this.#waiting.set(nextHopIp, {
      port,
      sends: [pending],
      attempts: 1,
      request,
      timer: ctx.setTimer(this.#host.device.deviceId, timerKey(port, nextHopIp), ARP_RETRY_INTERVAL_US),
    });
  }

  /** ARP 프레임을 받았다 */
  onArp(ctx: SimContext, port: string, frame: Frame): void {
    const arp = frame.snapshot.arp;
    if (arp === undefined) return;
    if (arp.operation === "request") this.#onRequest(ctx, port, frame, arp);
    else this.#onReply(ctx, port, frame, arp);
  }

  /** 타이머가 만료됐다. 이 모듈의 타이머가 아니면 false */
  onTimer(ctx: SimContext, timer: TimerRef): boolean {
    if (timer.deviceId !== this.#host.device.deviceId || !timer.key.startsWith(TIMER_PREFIX)) return false;

    const found = [...this.#waiting].find(([, waiting]) => waiting.timer.id === timer.id);
    if (found === undefined) return true;
    const [ip, waiting] = found;

    if (waiting.attempts < ARP_REQUEST_ATTEMPTS) {
      // 다시 묻는다. 부모는 기본값(타이머를 건 앞 요청)이다
      waiting.request = this.#request(ctx, waiting.port, ip);
      waiting.attempts += 1;
      waiting.timer = ctx.setTimer(this.#host.device.deviceId, timer.key, ARP_RETRY_INTERVAL_US);
      return true;
    }

    // 대기열마다 폐기 하나. 보관한 패킷은 아직 프레임이 아니라 마지막 요청 프레임으로 기록한다
    ctx.record({
      frame: waiting.request,
      deviceId: this.#host.device.deviceId,
      layer: "ARP",
      action: "drop",
      reason: { code: "ARP_TIMEOUT", params: { device: this.#host.device, targetIp: ip } },
    });
    this.#waiting.delete(ip);
    return true;
  }

  /**
   * 회차가 시작될 때 장비 모델이 부른다. 보통은 비어 있다. 회차가 LOOP_GUARD로 중간에 멈추면
   * 타이머가 사라져 대기열이 남는데, 그 프레임은 다음 Trace에서 쓸 수 없다
   */
  discardPending(): void {
    this.#waiting.clear();
  }

  /** `arp -d`. IP를 주면 그 항목만, 없으면 모두 */
  clear(ip?: string): void {
    if (ip === undefined) this.#table.clear();
    else this.#table.delete(ip);
  }

  /** 구성이 바뀌었다 (포트의 IP가 바뀜, 링크가 지워짐). 그 포트의 항목을 지운다 */
  onPortChanged(port: string): void {
    for (const [ip, entry] of this.#table) {
      if (entry.port === port) this.#table.delete(ip);
    }
  }

  /** `arp -a`와 패널에 보일 목록. IP 순으로 정렬 */
  view(): readonly ArpEntryView[] {
    return [...this.#table]
      .map(([ip, entry]) => ({ ip, mac: entry.mac, port: entry.port }))
      .sort((a, b) => compareIp(a.ip, b.ip));
  }

  #request(ctx: SimContext, port: string, targetIp: string, parentSeq?: number): Frame {
    const senderMac = this.#host.macOf(port);
    const senderIp = this.#host.ipOf(port) ?? "";
    const frame = ctx.createFrame({
      ethernet: { sourceMac: senderMac, destinationMac: BROADCAST_MAC },
      arp: { operation: "request", senderMac, senderIp, targetMac: UNKNOWN_MAC, targetIp },
    });
    ctx.record({
      frame,
      deviceId: this.#host.device.deviceId,
      outPort: port,
      ...this.#link(port),
      layer: "ARP",
      action: "create",
      ...(parentSeq === undefined ? {} : { parentSeq }),
      reason: { code: "ARP_REQUEST_SENT", params: { device: this.#host.device, senderIp, targetIp } },
    });
    // transmit과 setTimer의 부모는 기본값(마지막 기록 = ARP_REQUEST_SENT)이다
    this.#host.transmit(ctx, port, frame);
    return frame;
  }

  #onRequest(ctx: SimContext, port: string, frame: Frame, arp: ArpPacket): void {
    const { device, deviceId } = this.#hostRef();
    const ownIp = this.#host.ipOf(port);
    const forMe = ownIp !== undefined && arp.targetIp === ownIp;
    const received = ctx.record({
      frame, deviceId, inPort: port, layer: "ARP", action: "receive",
      reason: {
        code: "ARP_REQUEST_RECEIVED",
        params: { device, senderIp: arp.senderIp, targetIp: arp.targetIp, forMe },
      },
    });

    if (!forMe || ownIp === undefined) {
      // RFC 826: 이미 아는 IP면 MAC과 포트를 고친다. 이벤트는 남기지 않고, 없던 항목은 만들지 않는다
      if (this.#table.has(arp.senderIp)) this.#table.set(arp.senderIp, { mac: arp.senderMac, port });
      ctx.record({
        frame, deviceId, inPort: port, layer: "ARP", action: "drop", parentSeq: received,
        reason: { code: "NOT_FOR_ME", params: { device } },
      });
      return;
    }

    this.#learn(ctx, port, frame, arp, received);
    const ownMac = this.#host.macOf(port);
    const reply = ctx.createFrame({
      ethernet: { sourceMac: ownMac, destinationMac: arp.senderMac },
      arp: { operation: "reply", senderMac: ownMac, senderIp: ownIp, targetMac: arp.senderMac, targetIp: arp.senderIp },
    });
    // LEARNED와 REPLY_SENT의 부모는 둘 다 RECEIVED다 (예시 seq 2·3)
    ctx.record({
      frame: reply, deviceId, outPort: port, ...this.#link(port), layer: "ARP", action: "reply", parentSeq: received,
      reason: { code: "ARP_REPLY_SENT", params: { device, ip: ownIp, mac: ownMac } },
    });
    this.#host.transmit(ctx, port, reply);
  }

  #onReply(ctx: SimContext, port: string, frame: Frame, arp: ArpPacket): void {
    const { device, deviceId } = this.#hostRef();
    const received = ctx.record({
      frame, deviceId, inPort: port, layer: "ARP", action: "receive",
      reason: { code: "ARP_REPLY_RECEIVED", params: { device, ip: arp.senderIp, mac: arp.senderMac } },
    });

    // RFC 826: 이미 아는 IP면 고치고, 대상 IP가 자기일 때만 새로 넣는다
    const forMe = arp.targetIp === this.#host.ipOf(port);
    if (!forMe && !this.#table.has(arp.senderIp)) {
      ctx.record({
        frame, deviceId, inPort: port, layer: "ARP", action: "drop", parentSeq: received,
        reason: { code: "NOT_FOR_ME", params: { device } },
      });
      return;
    }
    const learned = this.#learn(ctx, port, frame, arp, received);

    const waiting = this.#waiting.get(arp.senderIp);
    if (waiting === undefined) return;
    ctx.cancelTimer(waiting.timer);
    this.#waiting.delete(arp.senderIp);
    // 보관한 패킷의 첫 이벤트의 부모는 LEARNED다 (예시 seq 6)
    for (const pending of waiting.sends) this.#sendNow(ctx, port, arp.senderMac, pending, learned);
  }

  #learn(ctx: SimContext, port: string, frame: Frame, arp: ArpPacket, parentSeq: number): number {
    const { device, deviceId } = this.#hostRef();
    this.#table.set(arp.senderIp, { mac: arp.senderMac, port });
    return ctx.record({
      frame, deviceId, inPort: port, layer: "ARP", action: "learn", parentSeq,
      reason: { code: "ARP_ENTRY_LEARNED", params: { device, ip: arp.senderIp, mac: arp.senderMac } },
    });
  }

  #sendNow(ctx: SimContext, port: string, mac: string, pending: PendingSend, parentSeq: number | undefined): void {
    const frame = ctx.createFrame(pending.build(mac));
    pending.onSend(ctx, frame, parentSeq);
    this.#host.transmit(ctx, port, frame);
  }

  #link(port: string): { readonly linkId?: string } {
    const linkId = this.#host.linkOf(port);
    return linkId === undefined ? {} : { linkId };
  }

  #hostRef(): { readonly device: DeviceRef; readonly deviceId: string } {
    return { device: this.#host.device, deviceId: this.#host.device.deviceId };
  }
}

function timerKey(port: string, ip: string): string {
  return `${TIMER_PREFIX}${port}:${ip}`;
}
