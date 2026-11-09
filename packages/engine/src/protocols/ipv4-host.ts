// T1.8.2: IPv4 호스트 처리와 ICMP echo (FR-15, FR-47). 장비 종류를 모르는 프로토콜 모듈이다.
// 장비 모델(T1.8.3 PC)이 이 객체와 ArpModule을 함께 들고 있다. 받은 프레임의 입구는 `onFrame`이다.
// `ctx`는 매번 받고 보관하지 않는다 (T1.7.1 kernel 규칙).
// Router의 IPv4 전달(TTL 줄이기, 경로 찾기)은 이 모듈이 하지 않는다 (E4).

import { BROADCAST_MAC, UNKNOWN_MAC, isIcmpError, isSameNetwork } from "@ping9/shared";
import type { DeviceRef, FrameSnapshot, IcmpMessage, Ipv4Header } from "@ping9/shared";

import type { Frame, SimContext } from "../kernel";
import type { ArpModule, PendingSend } from "./arp";

/** 포트 하나의 IP 구성 */
export interface Ipv4Address {
  readonly ip: string;
  readonly mask: string;
  readonly gateway?: string;
}

/** 이 모듈이 장비에게서 받는 것. 장비 모델이 채워 준다 */
export interface Ipv4HostConfig {
  readonly device: DeviceRef;
  /** 포트의 IP 구성. IP가 없으면 undefined */
  addressOf(port: string): Ipv4Address | undefined;
  macOf(port: string): string;
  /** 포트에 연결된 링크. 보냄 이벤트의 `linkId`에 쓴다. 없으면 undefined */
  linkOf(port: string): string | undefined;
  /** 이 장비가 내보내는 패킷의 TTL. 장비 모델이 OS로 고른다 (Windows 128, Linux 64) */
  readonly ttl: number;
}

/** 다음 홉: 같은 네트워크면 목적지, 아니면 게이트웨이. 게이트웨이도 없으면 undefined */
function nextHop(address: Ipv4Address, targetIp: string): string | undefined {
  if (isSameNetwork(address.ip, targetIp, address.mask)) return targetIp;
  return address.gateway;
}

export class Ipv4Host {
  readonly #config: Ipv4HostConfig;
  readonly #arp: ArpModule;
  #replies: number[] = [];

  constructor(config: Ipv4HostConfig, arp: ArpModule) {
    this.#config = config;
    this.#arp = arp;
  }

  /** echo 요청을 보낸다 (ping 한 회차). 보낼 수 없으면 폐기를 기록한다 */
  sendEcho(ctx: SimContext, port: string, targetIp: string, sequence: number): void {
    const { device } = this.#config;
    const address = this.#config.addressOf(port);
    const icmp: IcmpMessage = { type: "echo-request", sequence };

    if (address === undefined) {
      // 실제 OS는 패킷을 만들지 않는다. record에 프레임이 필요해서 "보내려던 패킷"을 만든다 (설계 결정 7)
      this.#dropUnsent(ctx, port, { sourceIp: "", destinationIp: targetIp, ttl: this.#config.ttl }, icmp, {
        code: "NO_IP", params: { device },
      });
      return;
    }

    const ipv4: Ipv4Header = { sourceIp: address.ip, destinationIp: targetIp, ttl: this.#config.ttl };
    const hop = nextHop(address, targetIp);
    if (hop === undefined) {
      this.#dropUnsent(ctx, port, ipv4, icmp, { code: "NO_GATEWAY", params: { device, targetIp } });
      return;
    }

    this.#arp.send(ctx, port, hop, this.#pending(port, ipv4, icmp, "create"));
  }

  /** 포트로 받은 프레임. 목적지 MAC을 보고 ARP면 ArpModule로 넘기고, IPv4면 처리한다 */
  onFrame(ctx: SimContext, port: string, frame: Frame): void {
    const { device } = this.#config;
    const deviceId = device.deviceId;
    const destinationMac = frame.snapshot.ethernet.destinationMac;

    if (destinationMac !== this.#config.macOf(port) && destinationMac !== BROADCAST_MAC) {
      ctx.record({
        frame, deviceId, inPort: port, layer: "L2", action: "drop",
        reason: { code: "NOT_FOR_ME", params: { device } },
      });
      return;
    }

    if (frame.snapshot.arp !== undefined) {
      this.#arp.onArp(ctx, port, frame);
      return;
    }

    const { ipv4, icmp } = frame.snapshot;
    if (ipv4 === undefined) return;
    const address = this.#config.addressOf(port);
    if (address === undefined || ipv4.destinationIp !== address.ip) {
      ctx.record({
        frame, deviceId, inPort: port, layer: "L3", action: "drop",
        reason: { code: "NOT_FOR_ME", params: { device } },
      });
      return;
    }

    if (isIcmpError(icmp)) {
      if (icmp.original.sourceIp !== address.ip || icmp.original.sequence !== icmp.sequence) return;
      ctx.record({ frame, deviceId, inPort: port, layer: "ICMP", action: "receive",
        reason: { code: "ICMP_ERROR_RECEIVED", params: { device, sourceIp: ipv4.sourceIp, targetIp: ipv4.destinationIp, error: icmp.type } } });
    } else if (icmp?.type === "echo-request") this.#onEchoRequest(ctx, port, frame, address, ipv4, icmp);
    else if (icmp?.type === "echo-reply") {
      ctx.record({
        frame, deviceId, inPort: port, layer: "ICMP", action: "receive",
        reason: {
          code: "ICMP_ECHO_REPLY_RECEIVED",
          params: { device, sourceIp: ipv4.sourceIp, targetIp: ipv4.destinationIp },
        },
      });
      this.#replies.push(icmp.sequence);
    }
  }

  /** 이번 회차에 받은 echo 응답의 sequence. 회차의 성공 판정은 T1.8.3이 한다 */
  repliesReceived(): readonly number[] {
    return [...this.#replies];
  }

  /** 회차가 시작될 때 장비 모델이 부른다. 지난 회차의 응답 목록을 비운다 */
  startRun(): void {
    this.#replies = [];
  }

  #onEchoRequest(
    ctx: SimContext, port: string, frame: Frame, address: Ipv4Address, request: Ipv4Header, icmp: IcmpMessage,
  ): void {
    const { device } = this.#config;
    const received = ctx.record({
      frame, deviceId: device.deviceId, inPort: port, layer: "ICMP", action: "receive",
      reason: {
        code: "ICMP_ECHO_REQUEST_RECEIVED",
        params: { device, sourceIp: request.sourceIp, targetIp: request.destinationIp },
      },
    });

    const ipv4: Ipv4Header = { sourceIp: address.ip, destinationIp: request.sourceIp, ttl: this.#config.ttl };
    const reply: IcmpMessage = { type: "echo-reply", sequence: icmp.sequence };
    // 응답의 다음 홉도 보낼 때와 같은 규칙이다. 다른 네트워크에서 왔으면 게이트웨이로
    const hop = nextHop(address, request.sourceIp);
    if (hop === undefined) {
      this.#dropUnsent(ctx, port, ipv4, reply, {
        code: "NO_GATEWAY", params: { device, targetIp: request.sourceIp },
      }, received);
      return;
    }
    // 응답의 부모는 받음 이벤트다 (예시 seq 8의 부모 7). ARP를 거치면 ARP 요청의 부모가 된다
    this.#arp.send(ctx, port, hop, this.#pending(port, ipv4, reply, "reply"), received);
  }

  /** MAC을 알게 되면 만들 프레임과 보낼 때 남길 이벤트 */
  #pending(port: string, ipv4: Ipv4Header, icmp: IcmpMessage, action: "create" | "reply"): PendingSend {
    const { device, macOf, linkOf } = this.#config;
    return {
      build: (destinationMac): FrameSnapshot => ({
        ethernet: { sourceMac: macOf(port), destinationMac },
        ipv4,
        icmp,
      }),
      onSend(ctx, frame, parentSeq) {
        const linkId = linkOf(port);
        const params = { device, sourceIp: ipv4.sourceIp, targetIp: ipv4.destinationIp };
        ctx.record({
          frame, deviceId: device.deviceId, outPort: port, ...(linkId === undefined ? {} : { linkId }),
          layer: "ICMP", action, ...(parentSeq === undefined ? {} : { parentSeq }),
          reason: action === "create"
            ? { code: "ICMP_ECHO_REQUEST_SENT", params }
            : { code: "ICMP_ECHO_REPLY_SENT", params },
        });
      },
    };
  }

  /** 보내지 못한 패킷의 폐기. 목적지 MAC을 모르는 프레임을 만들어 그 프레임으로 기록한다 */
  #dropUnsent(
    ctx: SimContext,
    port: string,
    ipv4: Ipv4Header,
    icmp: IcmpMessage,
    reason: { readonly code: "NO_IP"; readonly params: { readonly device: DeviceRef } }
      | { readonly code: "NO_GATEWAY"; readonly params: { readonly device: DeviceRef; readonly targetIp: string } },
    parentSeq?: number,
  ): void {
    const frame = ctx.createFrame({
      ethernet: { sourceMac: this.#config.macOf(port), destinationMac: UNKNOWN_MAC },
      ipv4,
      icmp,
    });
    ctx.record({
      frame, deviceId: this.#config.device.deviceId, layer: "L3", action: "drop",
      ...(parentSeq === undefined ? {} : { parentSeq }),
      reason,
    });
  }
}
