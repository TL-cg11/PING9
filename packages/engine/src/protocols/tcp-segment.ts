// SSL VPN의 선행 전송 기반. 세그먼트 송수신만 담당하며 TCP 연결·TLS는 아직 없다.
import { BROADCAST_MAC, checkHostIpv4 } from "@ping9/shared";
import type { TcpSegment } from "@ping9/shared";
import type { Frame, SimContext } from "../kernel";

import type { Ipv4Host, Ipv4HostConfig } from "./ipv4-host";

export interface ReceivedSegment {
  readonly sourceIp: string;
  readonly destinationIp: string;
  readonly segment: TcpSegment;
}

export class TcpSegmentHost {
  readonly #config: Ipv4HostConfig;
  readonly #ipv4: Ipv4Host;
  #received: ReceivedSegment[] = [];
  #receiver?: (ctx: SimContext, frame: Frame) => void;
  setReceiver(receiver: (ctx: SimContext, frame: Frame) => void): void { this.#receiver = receiver; }

  constructor(config: Ipv4HostConfig, ipv4: Ipv4Host) {
    this.#config = config;
    this.#ipv4 = ipv4;
  }

  /** 이번 실행의 받은 세그먼트. 세션 상태나 TCP 연결 성공을 뜻하지 않는다. */
  received(): readonly ReceivedSegment[] { return [...this.#received]; }
  startRun(): void { this.#received = []; }

  send(ctx: SimContext, port: string, targetIp: string, segment: TcpSegment, ttl = this.#config.ttl): boolean {
    const address = this.#config.addressOf(port);
    if (address === undefined || this.#config.isUp?.(port) === false || checkHostIpv4(targetIp) !== null) return false;
    const validInteger = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;
    if (!validInteger(ttl, 1, 255) || ![segment.sourcePort, segment.destinationPort].every(n => validInteger(n, 1, 65535)) ||
      !validInteger(segment.sequence, 0, 0xffffffff) || segment.acknowledgement !== undefined && !validInteger(segment.acknowledgement, 0, 0xffffffff) ||
      segment.flags.length > 5 || new Set(segment.flags).size !== segment.flags.length ||
      segment.flags.some(flag => !["SYN", "ACK", "FIN", "RST", "PSH"].includes(flag)) || (segment.payload?.length ?? 0) > 512) return false;
    const config = this.#config;
    this.#ipv4.sendTransport(ctx, port, targetIp, { tcp: segment }, (context, frame, sent) => {
      context.record({ frame, deviceId: config.device.deviceId, ...sent,
        layer: "TCP", action: "create", reason: { code: "TCP_SIM_SEGMENT_SENT", params: {
          device: config.device, sourceIp: address.ip, targetIp, sourcePort: segment.sourcePort, destinationPort: segment.destinationPort,
        } } });
    }, undefined, { ttl, protocol: 6 });
    return true;
  }

  /** 대상 MAC·자기 물리 IP에 도착한 TCP만 소비한다. ARP/다른 프로토콜은 기존 호스트에 맡긴다. */
  onFrame(ctx: SimContext, port: string, frame: Frame): boolean {
    const { ipv4, tcp, ethernet } = frame.snapshot;
    if (ipv4?.protocol !== 6 || tcp === undefined || !("sequence" in tcp) || frame.snapshot.icmp !== undefined || frame.snapshot.udp !== undefined || frame.snapshot.arp !== undefined || frame.snapshot.gre !== undefined || frame.snapshot.esp !== undefined || frame.snapshot.rip !== undefined ||
      this.#config.addressOf(port)?.ip !== ipv4.destinationIp || this.#config.isUp?.(port) === false ||
      ethernet.destinationMac === BROADCAST_MAC || ethernet.destinationMac !== this.#config.macOf(port)) return false;
    ctx.record({ frame, deviceId: this.#config.device.deviceId, inPort: port, layer: "TCP", action: "receive",
      reason: { code: "TCP_SIM_SEGMENT_RECEIVED", params: {
        device: this.#config.device, sourceIp: ipv4.sourceIp, targetIp: ipv4.destinationIp,
        sourcePort: tcp.sourcePort, destinationPort: tcp.destinationPort,
      } } });
    this.#received = [...this.#received.slice(-255), { sourceIp: ipv4.sourceIp, destinationIp: ipv4.destinationIp, segment: tcp }];
    this.#receiver?.(ctx, frame);
    return true;
  }
}
