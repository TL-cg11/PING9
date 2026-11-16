// T14.2.1: Firewall 모델. 인터페이스 사이에서 IPv4를 전달하는 Linux 장비이고, 전달 길목마다 iptables의 filter 체인을 건다.
// - INPUT: 이 장비의 주소로 온 패킷
// - FORWARD: 다른 인터페이스로 넘기는 패킷. 경로와 TTL을 본 뒤에 건다 (실제 Linux의 순서)
// - OUTPUT: 이 장비가 만든 패킷 (ping 요청과 응답, ICMP 오류)
// 전달 동작은 Router 모델과 같은 규칙이다. 동적 라우팅은 없다. 구성은 복사하지 않고 매번 Document에서 읽는다.

import { BROADCAST_MAC, PORT_NAMES, UNKNOWN_MAC, checkHostIpv4, checkInterfaceAddress, isIcmpError, isSameNetwork } from "@ping9/shared";
import type {
  DeviceView, FirewallChain, FirewallDevice, FrameSnapshot, IcmpErrorType, IcmpMessage, Ipv4Header, Reason, TopologyDocument,
} from "@ping9/shared";

import type { Frame, SimContext, TimerRef } from "../../kernel";
import { ArpModule } from "../../protocols/arp";
import type { PendingSend } from "../../protocols/arp";
import { deviceRef, findDevice, isAdminUp, portLink, portMac } from "../../topology";
import { portViewsOf } from "../../views";
import { transmit } from "../link";
import type { ConfigChange, DeviceModel } from "../model";
import { lookupRoute } from "../router/routing";
import type { RouteDecision, RoutingEntry } from "../router/routing";
import { evaluateChain, filterPacketOf } from "./filter";
import type { FilterPorts } from "./filter";
import { firewallRoutingTable } from "./routes";

/** Linux의 기본 TTL */
export const FIREWALL_TTL = 64;

function firewallIn(document: TopologyDocument, id: string): FirewallDevice | undefined {
  const device = findDevice(document, id);
  return device?.kind === "firewall" ? device : undefined;
}

export class FirewallModel implements DeviceModel {
  readonly deviceId: string;
  readonly #getDocument: () => TopologyDocument;
  readonly #arps = new Map<string, ArpModule>();
  readonly #replies = new Set<number>();

  constructor(deviceId: string, getDocument: () => TopologyDocument) {
    this.deviceId = deviceId;
    this.#getDocument = getDocument;
    const current = () => this.#device();
    for (const port of PORT_NAMES.firewall) {
      this.#arps.set(port, new ArpModule({
        get device() { return deviceRef(current()); },
        ipOf: () => current().config.interfaces[port]?.ip,
        macOf: () => portMac(current(), port),
        linkOf: () => portLink(getDocument(), { deviceId, port })?.linkId,
        transmit: (ctx, _port, frame) => { transmit(ctx, getDocument(), { deviceId, port }, frame); },
      }));
    }
  }

  #device(): FirewallDevice {
    const device = firewallIn(this.#getDocument(), this.deviceId);
    if (device === undefined) throw new Error(`Firewall ${this.deviceId} is not in the document`);
    return device;
  }

  routingTable(): readonly RoutingEntry[] {
    const device = this.#device();
    return firewallRoutingTable(device.config, portViewsOf(this.#getDocument(), device));
  }

  #decision(destination: string): RouteDecision | null {
    return lookupRoute(this.routingTable(), destination);
  }

  /**
   * 체인을 지나게 한다. 지나가면 undefined. 막히면 `FIREWALL_BLOCKED` 폐기를 기록하고 그 seq와 대상을 돌려준다.
   * 어느 규칙이 막았는지는 폐기 사유의 `rule`에 남는다 (Story 14.3)
   */
  #blocked(ctx: SimContext, chain: FirewallChain, frame: Frame, ports: FilterPorts, parentSeq?: number):
    { readonly seq: number; readonly target: "DROP" | "REJECT" } | undefined {
    const packet = filterPacketOf(frame.snapshot);
    if (packet === undefined) return undefined;
    const device = this.#device();
    const verdict = evaluateChain(device.config.filter[chain], packet, ports);
    if (verdict.target === "ACCEPT") return undefined;
    const seq = ctx.record({
      frame, deviceId: device.id, layer: "L3", action: "drop",
      ...(ports.inPort === undefined ? {} : { inPort: ports.inPort }),
      ...(ports.outPort === undefined ? {} : { outPort: ports.outPort }),
      ...(parentSeq === undefined ? {} : { parentSeq }),
      reason: { code: "FIREWALL_BLOCKED", params: {
        device: deviceRef(device), chain, target: verdict.target,
        ...(verdict.rule === undefined ? {} : { rule: verdict.rule }),
      } },
    });
    return { seq, target: verdict.target };
  }

  onFrame(ctx: SimContext, port: string, frame: Frame): void {
    const device = this.#device();
    const ref = deviceRef(device);
    const drop = (reason: Reason<"IF_DOWN" | "NO_IP" | "NOT_FOR_ME">) => ctx.record({
      frame, deviceId: device.id, inPort: port, layer: reason.code === "NO_IP" ? "L3" : "L2", action: "drop", reason,
    });
    if (!isAdminUp(device, port)) { drop({ code: "IF_DOWN", params: { device: ref, port } }); return; }
    if (device.config.interfaces[port]?.ip === undefined) { drop({ code: "NO_IP", params: { device: ref } }); return; }
    const mac = frame.snapshot.ethernet.destinationMac;
    // RIP 멀티캐스트도 여기서 걸린다. Firewall은 동적 라우팅을 하지 않는다
    if (mac !== portMac(device, port) && mac !== BROADCAST_MAC) { drop({ code: "NOT_FOR_ME", params: { device: ref } }); return; }
    // ARP는 iptables가 보지 않는다
    if (frame.snapshot.arp !== undefined) { this.#arps.get(port)?.onArp(ctx, port, frame); return; }
    const { ipv4, icmp } = frame.snapshot;
    if (ipv4 === undefined) return;
    if (!this.#unicast(ipv4.destinationIp)) { drop({ code: "NOT_FOR_ME", params: { device: ref } }); return; }
    const received = ctx.record({ frame, deviceId: device.id, inPort: port, layer: "L3", action: "receive",
      reason: { code: "IPV4_RECEIVED", params: { device: ref, sourceIp: ipv4.sourceIp, targetIp: ipv4.destinationIp } } });

    const local = PORT_NAMES.firewall.some((name) => isAdminUp(device, name) && device.config.interfaces[name]?.ip === ipv4.destinationIp);
    if (local) {
      const blocked = this.#blocked(ctx, "INPUT", frame, { inPort: port }, received);
      if (blocked !== undefined) {
        // REJECT면 보낸 쪽에 ICMP 도달 불가를 돌려준다. DROP은 아무것도 보내지 않는다
        if (blocked.target === "REJECT") this.#error(ctx, frame, "destination-unreachable", blocked.seq);
        return;
      }
      const params = { device: ref, sourceIp: ipv4.sourceIp, targetIp: ipv4.destinationIp };
      if (icmp?.type === "echo-request") {
        const request = ctx.record({ frame, deviceId: device.id, inPort: port, layer: "ICMP", action: "receive", parentSeq: received,
          reason: { code: "ICMP_ECHO_REQUEST_RECEIVED", params } });
        this.#originate(ctx, ipv4.sourceIp, { type: "echo-reply", sequence: icmp.sequence }, "reply", {
          sourceIp: ipv4.destinationIp, parentSeq: request,
        });
      } else if (isIcmpError(icmp)) {
        if (icmp.original.sourceIp !== ipv4.destinationIp || icmp.original.sequence !== icmp.sequence) return;
        ctx.record({ frame, deviceId: device.id, inPort: port, layer: "ICMP", action: "receive", parentSeq: received,
          reason: { code: "ICMP_ERROR_RECEIVED", params: { ...params, error: icmp.type } } });
      } else if (icmp?.type === "echo-reply") {
        ctx.record({ frame, deviceId: device.id, inPort: port, layer: "ICMP", action: "receive", parentSeq: received,
          reason: { code: "ICMP_ECHO_REPLY_RECEIVED", params } });
        this.#replies.add(icmp.sequence);
      }
      return;
    }

    const decision = this.#decision(ipv4.destinationIp);
    if (ipv4.ttl <= 1 || decision === null) {
      const droppedFrame = ipv4.ttl <= 1 ? ctx.updateFrame(frame, { ...frame.snapshot, ipv4: { ...ipv4, ttl: 0 } }) : frame;
      const dropped = ctx.record({ frame: droppedFrame, deviceId: device.id, inPort: port, layer: "L3", action: "drop", parentSeq: received,
        reason: ipv4.ttl <= 1 ? { code: "TTL_EXPIRED", params: { device: ref } }
          : { code: "NO_ROUTE", params: { device: ref, targetIp: ipv4.destinationIp } } });
      this.#error(ctx, frame, ipv4.ttl <= 1 ? "time-exceeded" : "destination-unreachable", dropped);
      return;
    }
    const ports = { inPort: port, outPort: decision.port };
    const blocked = this.#blocked(ctx, "FORWARD", frame, ports, received);
    if (blocked !== undefined) {
      if (blocked.target === "REJECT") this.#error(ctx, frame, "destination-unreachable", blocked.seq);
      return;
    }
    this.#send(ctx, decision, { ...ipv4, ttl: ipv4.ttl - 1 }, icmp, "forward", received, frame, port);
  }

  /**
   * 이 장비가 만든 패킷을 보낸다. 경로를 정한 뒤 OUTPUT 체인을 지난다.
   * 출발지 주소를 주지 않으면 나가는 인터페이스의 주소다. TTL은 Linux의 기본값이고 ping만 따로 줄 수 있다.
   * OUTPUT에서 막히면 링크로 나가지 않고 폐기만 기록한다 (REJECT도 같다. 실제로는 보낸 프로그램에 오류가 돌아간다)
   */
  #originate(ctx: SimContext, destinationIp: string, icmp: IcmpMessage, action: "reply" | "create", options: {
    readonly sourceIp?: string; readonly ttl?: number; readonly parentSeq?: number;
  } = {}): void {
    const device = this.#device();
    const ttl = options.ttl ?? FIREWALL_TTL;
    const decision = this.#decision(destinationIp);
    if (decision === null) {
      // 응답과 ICMP 오류는 보낼 길이 없으면 조용히 버린다. 직접 친 ping만 사유를 남긴다
      if (action !== "create") return;
      const port = PORT_NAMES.firewall[0];
      const frame = ctx.createFrame({
        ethernet: { sourceMac: portMac(device, port), destinationMac: UNKNOWN_MAC },
        ipv4: { sourceIp: options.sourceIp ?? device.config.interfaces[port]?.ip ?? "", destinationIp, ttl }, icmp,
      });
      ctx.record({ frame, deviceId: device.id, layer: "L3", action: "drop",
        reason: { code: "NO_ROUTE", params: { device: deviceRef(device), targetIp: destinationIp } } });
      return;
    }
    const ipv4: Ipv4Header = { sourceIp: options.sourceIp ?? device.config.interfaces[decision.port]!.ip!, destinationIp, ttl };
    const out = { outPort: decision.port };
    if (evaluateChain(device.config.filter.OUTPUT, filterPacketOf({ ipv4, icmp })!, out).target !== "ACCEPT") {
      const frame = ctx.createFrame({
        ethernet: { sourceMac: portMac(device, decision.port), destinationMac: UNKNOWN_MAC }, ipv4, icmp,
      });
      this.#blocked(ctx, "OUTPUT", frame, out, options.parentSeq);
      return;
    }
    this.#send(ctx, decision, ipv4, icmp, action, options.parentSeq);
  }

  #send(ctx: SimContext, decision: RouteDecision, ipv4: Ipv4Header, icmp: IcmpMessage | undefined,
    action: "forward" | "reply" | "create", parentSeq?: number, originalFrame?: Frame, inPort?: string): void {
    const device = this.#device();
    const { port, nextHop } = decision;
    const pending: PendingSend = {
      ...(originalFrame === undefined ? {} : { originalFrame }),
      build: (destinationMac): FrameSnapshot => ({
        ethernet: { sourceMac: portMac(device, port), destinationMac }, ipv4,
        ...(icmp === undefined ? {} : { icmp }),
      }),
      onSend: (context, frame, cause) => {
        const linkId = portLink(this.#getDocument(), { deviceId: device.id, port })?.linkId;
        const params = { device: deviceRef(device), sourceIp: ipv4.sourceIp, targetIp: ipv4.destinationIp };
        context.record({ frame, deviceId: device.id, outPort: port, ...(inPort === undefined ? {} : { inPort }),
          ...(linkId === undefined ? {} : { linkId }), ...(cause === undefined ? {} : { parentSeq: cause }),
          layer: action === "forward" ? "L3" : "ICMP", action,
          reason: action === "forward" ? { code: "IPV4_FORWARDED", params: { ...params, port, nextHop, ttl: ipv4.ttl } }
            : isIcmpError(icmp) ? { code: "ICMP_ERROR_SENT", params: { ...params, error: icmp.type } }
            : action === "create" ? { code: "ICMP_ECHO_REQUEST_SENT", params } : { code: "ICMP_ECHO_REPLY_SENT", params },
        });
      },
    };
    this.#arps.get(port)!.send(ctx, port, nextHop, pending, parentSeq);
  }

  /** 장비 하나를 가리키는 주소인지. 자기 네트워크의 네트워크·브로드캐스트 주소는 아니다 */
  #unicast(ip: string): boolean {
    if (checkHostIpv4(ip) !== null) return false;
    return !Object.values(this.#device().config.interfaces).some((iface) => iface.ip !== undefined && iface.mask !== undefined &&
      isSameNetwork(ip, iface.ip, iface.mask) && checkInterfaceAddress(ip, iface.mask) !== null);
  }

  /** 받은 패킷의 출발지에 ICMP 오류를 보낸다. ICMP 오류에 다시 오류를 만들지 않는다 */
  #error(ctx: SimContext, original: Frame, type: IcmpErrorType, parentSeq: number): void {
    const { ipv4, icmp, ethernet } = original.snapshot;
    if (ipv4 === undefined || icmp === undefined || isIcmpError(icmp) || ethernet.destinationMac === BROADCAST_MAC ||
      !this.#unicast(ipv4.sourceIp) || !this.#unicast(ipv4.destinationIp)) return;
    const device = this.#device();
    const message: IcmpMessage = {
      type, sequence: icmp.sequence,
      original: { sourceIp: ipv4.sourceIp, destinationIp: ipv4.destinationIp, sequence: icmp.sequence },
    };
    const localPort = PORT_NAMES.firewall.find((port) => isAdminUp(device, port) && device.config.interfaces[port]?.ip === ipv4.sourceIp);
    if (localPort !== undefined) {
      // 원래 출발지가 자신이면(경로가 고리를 이뤄 자기 패킷이 돌아옴) ICMP 오류를 자신에게 전달한다.
      // 자기 주소를 ARP로 묻거나 링크로 내보내지 않는다. 링크를 지나지 않아 필터도 보지 않는다 (Router와 같다)
      const frame = ctx.createFrame({
        ethernet: { sourceMac: portMac(device, localPort), destinationMac: portMac(device, localPort) },
        ipv4: { sourceIp: ipv4.sourceIp, destinationIp: ipv4.sourceIp, ttl: FIREWALL_TTL }, icmp: message,
      });
      const params = { device: deviceRef(device), sourceIp: ipv4.sourceIp, targetIp: ipv4.sourceIp, error: type };
      const sent = ctx.record({ frame, deviceId: device.id, layer: "ICMP", action: "reply", parentSeq, reason: { code: "ICMP_ERROR_SENT", params } });
      ctx.record({ frame, deviceId: device.id, layer: "ICMP", action: "receive", parentSeq: sent, reason: { code: "ICMP_ERROR_RECEIVED", params } });
      return;
    }
    this.#originate(ctx, ipv4.sourceIp, message, "reply", { parentSeq });
  }

  onTimer(ctx: SimContext, timer: TimerRef): void {
    for (const arp of this.#arps.values()) arp.onTimer(ctx, timer);
  }

  startRun(): void {
    for (const arp of this.#arps.values()) arp.discardPending();
    this.#replies.clear();
  }

  repliesReceived(): readonly number[] { return [...this.#replies]; }

  /** echo 요청을 보낸다 (콘솔의 `ping`). OUTPUT 체인을 지난다 */
  sendEcho(ctx: SimContext, targetIp: string, sequence: number, ttl = FIREWALL_TTL): void {
    this.#originate(ctx, targetIp, { type: "echo-request", sequence }, "create", { ttl });
  }

  arpTable() { return [...this.#arps.values()].flatMap((arp) => arp.view()); }

  clearArp(ip?: string): void { for (const arp of this.#arps.values()) arp.clear(ip); }

  onConfigChanged(change: ConfigChange): void {
    const before = firewallIn(change.previous, this.deviceId);
    const after = firewallIn(change.document, this.deviceId);
    if (before === undefined || after === undefined) return;
    for (const port of PORT_NAMES.firewall) {
      const old = before.config.interfaces[port]; const now = after.config.interfaces[port];
      const ref = { deviceId: this.deviceId, port };
      const linkBefore = portLink(change.previous, ref); const linkNow = portLink(change.document, ref);
      const peer = linkNow === undefined ? undefined : findDevice(change.document, linkNow.peer.deviceId);
      if (old?.ip !== now?.ip || old?.mask !== now?.mask || old?.adminUp !== now?.adminUp ||
        linkBefore?.linkId !== linkNow?.linkId || linkBefore?.peer.deviceId !== linkNow?.peer.deviceId ||
        linkBefore?.peer.port !== linkNow?.peer.port ||
        (linkNow !== undefined && peer !== undefined && !isAdminUp(peer, linkNow.peer.port))) {
        this.#arps.get(port)!.onPortChanged(port);
      }
    }
    this.startRun();
  }

  view(): DeviceView {
    const device = this.#device();
    return {
      kind: "firewall", ports: portViewsOf(this.#getDocument(), device),
      arpTable: this.arpTable(), routingTable: this.routingTable(),
    };
  }
}
