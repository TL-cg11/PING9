// T1.8.2: IPv4 호스트 처리와 ICMP echo (FR-15, FR-47). 장비 종류를 모르는 프로토콜 모듈이다.
// 장비 모델(T1.8.3 PC)이 이 객체와 ArpModule을 함께 들고 있다. 받은 프레임의 입구는 `onFrame`이다.
// `ctx`는 매번 받고 보관하지 않는다 (T1.7.1 kernel 규칙).
// Router의 IPv4 전달(TTL 줄이기, 경로 찾기)은 이 모듈이 하지 않는다 (E4).

import { BROADCAST_MAC, UNKNOWN_MAC, isIcmpError, isSameNetwork } from "@ping9/shared";
import type { DeviceRef, FrameSnapshot, IcmpMessage, Ipv4Header, PcFilter } from "@ping9/shared";

import type { Frame, SimContext } from "../kernel";
import type { ArpModule, PendingSend } from "./arp";
import { evaluateChain, filterPacketOf } from "./filter";

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
  /** 포트가 켜져 있는지 (T0.14). 꺼졌으면 보내기 전에 막는다. 없으면 늘 켜짐 */
  isUp?(port: string): boolean;
  /** 이 장비가 내보내는 패킷의 TTL. 장비 모델이 OS로 고른다 (Windows 128, Linux 64) */
  readonly ttl: number;
  /**
   * 호스트의 필터 규칙 (T0.21, 서버의 iptables). 이 장비로 온 패킷은 INPUT을, 이 장비가 보내는 패킷은 OUTPUT을 지난다.
   * 없으면 모두 지나간다. ARP는 보지 않는다
   */
  filter?(): PcFilter;
}

/** IPv4 위에 실리는 것 가운데 ICMP가 아닌 것 (T0.20) */
export type TransportLayers = Pick<FrameSnapshot, "tcp" | "udp" | "application">;

/** 보냄 이벤트에 공통으로 들어가는 칸. 보내는 쪽이 계층과 설명을 더해 기록한다 */
export interface SentBase {
  readonly outPort: string;
  readonly linkId?: string;
  readonly parentSeq?: number;
}

/** TCP·UDP를 다루는 쪽 (T0.20, protocols/transport.ts). 없으면 그런 패킷은 조용히 버린다 */
export interface TransportHandlers {
  onPacket(ctx: SimContext, port: string, frame: Frame, address: Ipv4Address): void;
  onIcmpError(ctx: SimContext, frame: Frame): void;
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
  #transport: TransportHandlers | undefined;

  constructor(config: Ipv4HostConfig, arp: ArpModule) {
    this.#config = config;
    this.#arp = arp;
  }

  /** TCP·UDP 패킷과 그에 대한 ICMP 오류를 넘겨받을 곳을 정한다 (T0.20) */
  setTransport(handlers: TransportHandlers): void {
    this.#transport = handlers;
  }

  /**
   * TCP·UDP 패킷을 보낸다 (T0.20). 다음 홉을 정하고 ARP를 거치는 것은 ping과 같다.
   * 보냄 이벤트는 `record`가 남긴다. 보낼 수 없으면(포트 꺼짐, IP 없음, 게이트웨이 없음) 폐기를 기록한다
   */
  sendTransport(
    ctx: SimContext, port: string, targetIp: string, layers: TransportLayers,
    record: (ctx: SimContext, frame: Frame, sent: SentBase, ipv4: Ipv4Header) => void, parentSeq?: number,
    options: { readonly ttl?: number; readonly protocol?: Ipv4Header["protocol"] } = {},
  ): void {
    const { device, macOf, linkOf } = this.#config;
    const ttl = options.ttl ?? this.#config.ttl;
    const address = this.#config.addressOf(port);
    if (this.#config.isUp?.(port) === false) {
      this.#dropUnsent(ctx, port, { sourceIp: address?.ip ?? "", destinationIp: targetIp, ttl }, layers,
        { code: "IF_DOWN", params: { device, port } }, parentSeq);
      return;
    }
    if (address === undefined) {
      this.#dropUnsent(ctx, port, { sourceIp: "", destinationIp: targetIp, ttl }, layers, { code: "NO_IP", params: { device } }, parentSeq);
      return;
    }
    const ipv4: Ipv4Header = { sourceIp: address.ip, destinationIp: targetIp, ttl, ...(options.protocol === undefined ? {} : { protocol: options.protocol }) };
    const hop = nextHop(address, targetIp);
    if (hop === undefined) {
      this.#dropUnsent(ctx, port, ipv4, layers, { code: "NO_GATEWAY", params: { device, targetIp } }, parentSeq);
      return;
    }
    if (this.#blockedOut(ctx, port, ipv4, layers, parentSeq)) return;
    this.#arp.send(ctx, port, hop, {
      build: (destinationMac): FrameSnapshot => ({ ethernet: { sourceMac: macOf(port), destinationMac }, ipv4, ...layers }),
      onSend(context, frame, cause) {
        const linkId = linkOf(port);
        record(context, frame, {
          outPort: port, ...(linkId === undefined ? {} : { linkId }), ...(cause === undefined ? {} : { parentSeq: cause }),
        }, ipv4);
      },
    }, parentSeq);
  }

  /** ICMP 오류를 보낸다 (T0.20: 닫힌 UDP 포트). 보낼 길이 없으면 조용히 그만둔다 */
  sendIcmpError(ctx: SimContext, port: string, targetIp: string, icmp: IcmpMessage, parentSeq?: number): void {
    const { device, macOf, linkOf, ttl } = this.#config;
    const address = this.#config.addressOf(port);
    if (address === undefined || this.#config.isUp?.(port) === false || !isIcmpError(icmp)) return;
    const hop = nextHop(address, targetIp);
    if (hop === undefined) return;
    const ipv4: Ipv4Header = { sourceIp: address.ip, destinationIp: targetIp, ttl };
    if (this.#blockedOut(ctx, port, ipv4, { icmp }, parentSeq)) return;
    this.#arp.send(ctx, port, hop, {
      build: (destinationMac): FrameSnapshot => ({ ethernet: { sourceMac: macOf(port), destinationMac }, ipv4, icmp }),
      onSend(context, frame, cause) {
        const linkId = linkOf(port);
        context.record({
          frame, deviceId: device.deviceId, outPort: port, ...(linkId === undefined ? {} : { linkId }),
          layer: "ICMP", action: "reply", ...(cause === undefined ? {} : { parentSeq: cause }),
          reason: { code: "ICMP_ERROR_SENT", params: { device, sourceIp: ipv4.sourceIp, targetIp, error: icmp.type } },
        });
      },
    }, parentSeq);
  }

  /**
   * echo 요청을 보낸다 (ping 한 회차). 보낼 수 없으면 폐기를 기록한다.
   * `ttl`은 traceroute가 hop마다 정한다 (T11.4.1). 없으면 OS의 값
   */
  sendEcho(ctx: SimContext, port: string, targetIp: string, sequence: number, ttl = this.#config.ttl): void {
    const { device } = this.#config;
    const address = this.#config.addressOf(port);
    const icmp: IcmpMessage = { type: "echo-request", sequence };

    // 꺼진 포트로는 보내지 않는다 (T0.14 결정 5). 실제 OS도 패킷을 만들기 전에 막는다. 펭귄이 출발하지 않는다
    if (this.#config.isUp?.(port) === false) {
      this.#dropUnsent(ctx, port, { sourceIp: address?.ip ?? "", destinationIp: targetIp, ttl }, { icmp }, {
        code: "IF_DOWN", params: { device, port },
      });
      return;
    }

    if (address === undefined) {
      // 실제 OS는 패킷을 만들지 않는다. record에 프레임이 필요해서 "보내려던 패킷"을 만든다 (설계 결정 7)
      this.#dropUnsent(ctx, port, { sourceIp: "", destinationIp: targetIp, ttl }, { icmp }, {
        code: "NO_IP", params: { device },
      });
      return;
    }

    const ipv4: Ipv4Header = { sourceIp: address.ip, destinationIp: targetIp, ttl };
    const hop = nextHop(address, targetIp);
    if (hop === undefined) {
      this.#dropUnsent(ctx, port, ipv4, { icmp }, { code: "NO_GATEWAY", params: { device, targetIp } });
      return;
    }

    if (this.#blockedOut(ctx, port, ipv4, { icmp })) return;
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

    // 이 장비로 온 패킷이다. 필터의 INPUT 체인을 먼저 지난다 (T0.21)
    if (this.#blockedIn(ctx, port, frame)) return;

    // TCP·UDP는 전송 계층이 다룬다 (T0.20). RIP는 멀티캐스트라 여기까지 오지 않는다
    if (frame.snapshot.tcp !== undefined || frame.snapshot.udp !== undefined) {
      this.#transport?.onPacket(ctx, port, frame, address);
      return;
    }

    if (isIcmpError(icmp)) {
      if (icmp.original.sourceIp !== address.ip || icmp.original.sequence !== icmp.sequence) return;
      ctx.record({ frame, deviceId, inPort: port, layer: "ICMP", action: "receive",
        reason: { code: "ICMP_ERROR_RECEIVED", params: { device, sourceIp: ipv4.sourceIp, targetIp: ipv4.destinationIp, error: icmp.type } } });
      // 막힌 것이 TCP·UDP 패킷이었으면 기다리던 요청에 알린다 (T0.20)
      if (icmp.original.protocol !== undefined) this.#transport?.onIcmpError(ctx, frame);
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

  /**
   * 받은 패킷이 INPUT 체인에서 막히는지 (T0.21). 막히면 폐기를 기록하고 true.
   * 어느 규칙이 막았는지는 폐기 사유의 `rule`에 남는다. REJECT면 보낸 쪽에 ICMP 도달 불가를 돌려준다
   */
  #blockedIn(ctx: SimContext, port: string, frame: Frame): boolean {
    const filter = this.#config.filter?.();
    const packet = filterPacketOf(frame.snapshot);
    if (filter === undefined || packet === undefined) return false;
    const verdict = evaluateChain(filter.INPUT, packet, { inPort: port });
    if (verdict.target === "ACCEPT") return false;
    const { device } = this.#config;
    const dropped = ctx.record({
      frame, deviceId: device.deviceId, inPort: port, layer: "L3", action: "drop",
      reason: { code: "FIREWALL_BLOCKED", params: {
        device, chain: "INPUT", target: verdict.target, ...(verdict.rule === undefined ? {} : { rule: verdict.rule }),
      } },
    });
    if (verdict.target === "REJECT") this.#reject(ctx, port, frame, dropped);
    return true;
  }

  /** REJECT한 패킷의 출발지에 ICMP 도달 불가를 보낸다. ICMP 오류, ping 응답, TCP의 RST에는 답하지 않는다 */
  #reject(ctx: SimContext, port: string, frame: Frame, parentSeq: number): void {
    const { ipv4, icmp, tcp, udp } = frame.snapshot;
    if (ipv4 === undefined) return;
    const base = { sourceIp: ipv4.sourceIp, destinationIp: ipv4.destinationIp };
    if (icmp !== undefined) {
      if (icmp.type !== "echo-request") return;
      this.sendIcmpError(ctx, port, ipv4.sourceIp, {
        type: "destination-unreachable", sequence: icmp.sequence, original: { ...base, sequence: icmp.sequence },
      }, parentSeq);
      return;
    }
    const transport = tcp ?? udp;
    if (transport === undefined || tcp?.flags === "RST" || Array.isArray(tcp?.flags) && tcp.flags.includes("RST")) return;
    this.sendIcmpError(ctx, port, ipv4.sourceIp, { type: "destination-unreachable", sequence: 0, original: {
      ...base, sequence: 0, protocol: tcp === undefined ? "udp" : "tcp", destinationPort: transport.destinationPort,
    } }, parentSeq);
  }

  /**
   * 보내려는 패킷이 OUTPUT 체인에서 막히는지 (T0.21). 막히면 링크로 나가지 않고 폐기만 기록한다
   * (REJECT도 같다. 실제로는 보낸 프로그램에 오류가 돌아간다)
   */
  #blockedOut(
    ctx: SimContext, port: string, ipv4: Ipv4Header, layers: Pick<FrameSnapshot, "icmp" | "tcp" | "udp" | "application">, parentSeq?: number,
  ): boolean {
    const filter = this.#config.filter?.();
    const packet = filterPacketOf({ ipv4, ...layers });
    if (filter === undefined || packet === undefined) return false;
    const verdict = evaluateChain(filter.OUTPUT, packet, { outPort: port });
    if (verdict.target === "ACCEPT") return false;
    const { device } = this.#config;
    const frame = ctx.createFrame({ ethernet: { sourceMac: this.#config.macOf(port), destinationMac: UNKNOWN_MAC }, ipv4, ...layers });
    ctx.record({
      frame, deviceId: device.deviceId, outPort: port, layer: "L3", action: "drop", ...(parentSeq === undefined ? {} : { parentSeq }),
      reason: { code: "FIREWALL_BLOCKED", params: {
        device, chain: "OUTPUT", target: verdict.target, ...(verdict.rule === undefined ? {} : { rule: verdict.rule }),
      } },
    });
    return true;
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
      this.#dropUnsent(ctx, port, ipv4, { icmp: reply }, {
        code: "NO_GATEWAY", params: { device, targetIp: request.sourceIp },
      }, received);
      return;
    }
    // 응답의 부모는 받음 이벤트다 (예시 seq 8의 부모 7). ARP를 거치면 ARP 요청의 부모가 된다
    if (this.#blockedOut(ctx, port, ipv4, { icmp: reply }, received)) return;
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
    layers: Pick<FrameSnapshot, "icmp" | "tcp" | "udp" | "application">,
    reason: { readonly code: "NO_IP"; readonly params: { readonly device: DeviceRef } }
      | { readonly code: "NO_GATEWAY"; readonly params: { readonly device: DeviceRef; readonly targetIp: string } }
      | { readonly code: "IF_DOWN"; readonly params: { readonly device: DeviceRef; readonly port: string } },
    parentSeq?: number,
  ): void {
    const frame = ctx.createFrame({
      ethernet: { sourceMac: this.#config.macOf(port), destinationMac: UNKNOWN_MAC },
      ipv4,
      ...layers,
    });
    ctx.record({
      frame, deviceId: this.#config.device.deviceId, layer: "L3", action: "drop",
      ...(parentSeq === undefined ? {} : { parentSeq }),
      reason,
    });
  }
}
