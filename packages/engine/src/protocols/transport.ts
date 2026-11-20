// T0.20: 호스트의 TCP·UDP와 서비스 요청·응답. 장비 종류를 모르는 프로토콜 모듈이고 Ipv4Host 옆에 붙는다.
// - 클라이언트: `request`가 요청 하나를 시작한다. TCP는 SYN → SYN-ACK → ACK로 연결을 맺고 요청을 보낸다. UDP는 바로 보낸다.
// - 서버: 듣는 서비스가 있는 포트면 답하고, 없으면 TCP는 RST를, UDP는 ICMP 도달 불가를 돌려준다 (폐기 사유 PORT_CLOSED).
// 단순화: 연결을 끊는 FIN은 없다. 순서 번호와 재전송도 없다. 응답이 없으면 그대로 끝난다 (콘솔이 시간 초과로 보인다).

import type { ApplicationData, DeviceRef, FrameSnapshot, ServiceKind, TcpFlags } from "@ping9/shared";

import type { Frame, SimContext } from "../kernel";
import type { Ipv4Address, Ipv4Host, SentBase } from "./ipv4-host";

/** 클라이언트가 쓰는 포트. 요청은 한 번에 하나라 늘 같은 값이다 */
export const CLIENT_PORT = 49152;

/** 서비스 요청 하나 */
export interface ServiceExchange {
  readonly service: ServiceKind;
  readonly protocol: "tcp" | "udp";
  readonly targetIp: string;
  /** 서버 쪽 포트 */
  readonly port: number;
  /** 요청의 첫 줄 (`GET /`, `A www.ping9.test`) */
  readonly message: string;
}

/** 요청의 결과. 없으면 응답이 오지 않은 것이다 */
export type ExchangeResult =
  /** 응답을 받음. 시간은 요청을 시작한 때부터의 가상 µs */
  | { readonly kind: "response"; readonly message: string; readonly data?: string; readonly timeUs: number }
  /** 거절당함: TCP의 RST, 또는 ICMP 도달 불가 */
  | { readonly kind: "refused"; readonly timeUs: number }
  /** 가는 길에서 TTL이 끝남 (경로가 고리를 이룸). ICMP TTL 만료를 받았다 */
  | { readonly kind: "expired"; readonly timeUs: number };

export interface TransportHostConfig {
  readonly device: DeviceRef;
  /** 이 호스트의 포트 (호스트는 포트가 하나다) */
  readonly port: string;
  readonly ipv4: Ipv4Host;
  /** 그 프로토콜과 포트에서 듣는 서비스. 없으면 undefined */
  listening(protocol: "tcp" | "udp", port: number): ServiceKind | undefined;
  /** 서비스가 요청에 내는 응답 */
  respond(service: ServiceKind, message: string): { readonly message: string; readonly data?: string };
}

/** 전달하는 장비(Router)가 프레임을 다시 만들 때 그대로 옮길 계층 */
export function transportLayersOf(snapshot: FrameSnapshot): Pick<FrameSnapshot, "tcp" | "udp" | "application"> {
  const { tcp, udp, application } = snapshot;
  return {
    ...(tcp === undefined ? {} : { tcp }),
    ...(udp === undefined ? {} : { udp }),
    ...(application === undefined ? {} : { application }),
  };
}

export class TransportHost {
  readonly #config: TransportHostConfig;
  #exchange: { readonly request: ServiceExchange; readonly startedAt: number } | undefined;
  #result: ExchangeResult | undefined;

  constructor(config: TransportHostConfig) {
    this.#config = config;
  }

  /** 실행을 시작할 때 지난 요청을 잊는다 */
  startRun(): void {
    this.#exchange = undefined;
    this.#result = undefined;
  }

  result(): ExchangeResult | undefined {
    return this.#result;
  }

  /** 요청 하나를 시작한다. 보낼 수 없으면(IP 없음, 게이트웨이 없음, 포트 꺼짐) Ipv4Host가 폐기를 기록한다 */
  request(ctx: SimContext, exchange: ServiceExchange): void {
    this.#exchange = { request: exchange, startedAt: ctx.now() };
    this.#result = undefined;
    if (exchange.protocol === "tcp") {
      this.#segment(ctx, exchange.targetIp, CLIENT_PORT, exchange.port, exchange.port, "SYN", "create");
    } else {
      this.#message(ctx, exchange.targetIp, "udp", CLIENT_PORT, exchange.port, exchange.port,
        { service: exchange.service, message: exchange.message }, "request");
    }
  }

  /** 이 호스트의 주소로 온 TCP·UDP 패킷. Ipv4Host가 넘긴다 */
  onPacket(ctx: SimContext, port: string, frame: Frame, address: Ipv4Address): void {
    const { ipv4, tcp, udp } = frame.snapshot;
    const header = tcp ?? udp;
    if (ipv4 === undefined || header === undefined) return;
    const pending = this.#exchange?.request;
    const mine = pending !== undefined && this.#result === undefined && ipv4.sourceIp === pending.targetIp &&
      header.sourcePort === pending.port && header.destinationPort === CLIENT_PORT;
    if (mine) this.#asClient(ctx, port, frame, pending);
    // 클라이언트 포트로 온 것은 응답이다. 기다리는 요청이 없으면(이미 끝났거나 주소가 겹친 다른 장비의 것) 버린다
    else if (header.destinationPort !== CLIENT_PORT) this.#asServer(ctx, port, frame, address);
  }

  /** TCP·UDP 패킷에 대한 ICMP 오류를 받았다. 받음 이벤트는 Ipv4Host가 이미 남겼다 */
  onIcmpError(ctx: SimContext, frame: Frame): void {
    const { icmp } = frame.snapshot;
    const pending = this.#exchange;
    if (pending === undefined || this.#result !== undefined || icmp === undefined || !("original" in icmp)) return;
    if (icmp.original.destinationIp !== pending.request.targetIp || icmp.original.destinationPort !== pending.request.port) return;
    this.#result = { kind: icmp.type === "time-exceeded" ? "expired" : "refused", timeUs: ctx.now() - pending.startedAt };
  }

  #asClient(ctx: SimContext, port: string, frame: Frame, request: ServiceExchange): void {
    const { device } = this.#config;
    const { ipv4, tcp, application } = frame.snapshot;
    if (tcp !== undefined && typeof tcp.flags !== "string") return;
    if (ipv4 === undefined) return;
    const elapsed = () => ctx.now() - this.#exchange!.startedAt;
    const base = { frame, deviceId: device.deviceId, inPort: port, action: "receive" as const };

    if (tcp !== undefined && application === undefined) {
      const received = ctx.record({ ...base, layer: "TCP", reason: { code: "TCP_SEGMENT_RECEIVED", params: {
        device, sourceIp: ipv4.sourceIp, targetIp: ipv4.destinationIp, port: request.port, flags: tcp.flags,
      } } });
      if (tcp.flags === "RST") {
        this.#result = { kind: "refused", timeUs: elapsed() };
      } else if (tcp.flags === "SYN-ACK") {
        // 연결이 맺어졌다: ACK를 보내고 바로 요청을 보낸다
        this.#segment(ctx, request.targetIp, CLIENT_PORT, request.port, request.port, "ACK", "create", received);
        this.#message(ctx, request.targetIp, "tcp", CLIENT_PORT, request.port, request.port,
          { service: request.service, message: request.message }, "request", received);
      }
      return;
    }
    if (application === undefined) return;
    ctx.record({ ...base, layer: "APP", reason: { code: "SERVICE_RESPONSE_RECEIVED", params: {
      device, service: application.service, sourceIp: ipv4.sourceIp, targetIp: ipv4.destinationIp, port: request.port,
      message: application.message,
    } } });
    this.#result = {
      kind: "response", message: application.message, timeUs: elapsed(),
      ...(application.data === undefined ? {} : { data: application.data }),
    };
  }

  #asServer(ctx: SimContext, port: string, frame: Frame, address: Ipv4Address): void {
    const { device, ipv4: host } = this.#config;
    const { ipv4, tcp, udp, application } = frame.snapshot;
    if (tcp !== undefined && typeof tcp.flags !== "string") return; // SSL 선행 세그먼트는 별도 호스트가 처리한다.
    if (ipv4 === undefined) return;
    const base = { frame, deviceId: device.deviceId, inPort: port };
    const peer = ipv4.sourceIp;

    if (tcp !== undefined) {
      const service = this.#config.listening("tcp", tcp.destinationPort);
      // 서버가 받을 것은 SYN, ACK, 요청(PSH-ACK)뿐이다. 그 밖의 것은 이미 끝난 요청의 것이다
      if (tcp.flags === "SYN-ACK" || tcp.flags === "RST") return;
      let received: number;
      if (application === undefined) {
        received = ctx.record({ ...base, layer: "TCP", action: "receive", reason: { code: "TCP_SEGMENT_RECEIVED", params: {
          device, sourceIp: peer, targetIp: ipv4.destinationIp, port: tcp.destinationPort, flags: tcp.flags,
        } } });
        if (tcp.flags === "ACK") return;
      } else {
        received = ctx.record({ ...base, layer: "APP", action: "receive", reason: { code: "SERVICE_REQUEST_RECEIVED", params: {
          device, service: application.service, sourceIp: peer, targetIp: ipv4.destinationIp, port: tcp.destinationPort,
          message: application.message,
        } } });
      }
      if (service === undefined) {
        const closed = ctx.record({ ...base, layer: "TCP", action: "drop", parentSeq: received,
          reason: { code: "PORT_CLOSED", params: { device, protocol: "tcp", port: tcp.destinationPort } } });
        this.#segment(ctx, peer, tcp.destinationPort, tcp.sourcePort, tcp.destinationPort, "RST", "reply", closed);
        return;
      }
      if (application === undefined) {
        this.#segment(ctx, peer, tcp.destinationPort, tcp.sourcePort, tcp.destinationPort, "SYN-ACK", "reply", received);
        return;
      }
      this.#message(ctx, peer, "tcp", tcp.destinationPort, tcp.sourcePort, tcp.destinationPort,
        { service, ...this.#config.respond(service, application.message) }, "response", received);
      return;
    }

    if (udp === undefined || application === undefined) return;
    const service = this.#config.listening("udp", udp.destinationPort);
    const received = ctx.record({ ...base, layer: "APP", action: "receive", reason: { code: "SERVICE_REQUEST_RECEIVED", params: {
      device, service: application.service, sourceIp: peer, targetIp: ipv4.destinationIp, port: udp.destinationPort,
      message: application.message,
    } } });
    if (service === undefined) {
      const closed = ctx.record({ ...base, layer: "UDP", action: "drop", parentSeq: received,
        reason: { code: "PORT_CLOSED", params: { device, protocol: "udp", port: udp.destinationPort } } });
      // 닫힌 UDP 포트에는 ICMP 도달 불가(port unreachable)로 답한다
      host.sendIcmpError(ctx, port, peer, { type: "destination-unreachable", sequence: 0, original: {
        sourceIp: peer, destinationIp: address.ip, sequence: 0, protocol: "udp", destinationPort: udp.destinationPort,
      } }, closed);
      return;
    }
    this.#message(ctx, peer, "udp", udp.destinationPort, udp.sourcePort, udp.destinationPort,
      { service, ...this.#config.respond(service, application.message) }, "response", received);
  }

  /** 내용 없는 TCP 세그먼트를 보낸다. `servicePort`는 이벤트에 적을 서버 쪽 포트다 */
  #segment(
    ctx: SimContext, targetIp: string, sourcePort: number, destinationPort: number, servicePort: number,
    flags: TcpFlags, action: "create" | "reply", parentSeq?: number,
  ): void {
    const { device, port, ipv4 } = this.#config;
    ipv4.sendTransport(ctx, port, targetIp, { tcp: { sourcePort, destinationPort, flags } }, (context, frame, sent: SentBase, header) => {
      context.record({ ...sent, frame, deviceId: device.deviceId, layer: "TCP", action,
        reason: { code: "TCP_SEGMENT_SENT", params: {
          device, sourceIp: header.sourceIp, targetIp: header.destinationIp, port: servicePort, flags,
        } } });
    }, parentSeq);
  }

  /** 서비스의 요청이나 응답을 보낸다. TCP면 PSH-ACK에 싣는다 */
  #message(
    ctx: SimContext, targetIp: string, protocol: "tcp" | "udp", sourcePort: number, destinationPort: number, servicePort: number,
    application: ApplicationData, direction: "request" | "response", parentSeq?: number,
  ): void {
    const { device, port, ipv4 } = this.#config;
    const layers = protocol === "tcp"
      ? { tcp: { sourcePort, destinationPort, flags: "PSH-ACK" as const }, application }
      : { udp: { sourcePort, destinationPort }, application };
    ipv4.sendTransport(ctx, port, targetIp, layers, (context, frame, sent: SentBase, header) => {
      context.record({ ...sent, frame, deviceId: device.deviceId, layer: "APP", action: direction === "request" ? "create" : "reply",
        reason: { code: direction === "request" ? "SERVICE_REQUEST_SENT" : "SERVICE_RESPONSE_SENT", params: {
          device, service: application.service, sourceIp: header.sourceIp, targetIp: header.destinationIp, port: servicePort,
          message: application.message,
        } } });
    }, parentSeq);
  }
}
