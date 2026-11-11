import { BROADCAST_MAC, PORT_NAMES, RIP_MULTICAST_MAC, UNKNOWN_MAC, checkHostIpv4, checkInterfaceAddress, isIcmpError, isSameNetwork } from "@ping9/shared";
import type { DeviceView, FrameSnapshot, IcmpErrorType, IcmpMessage, Ipv4Header, Reason, RouterDevice, TopologyDocument } from "@ping9/shared";

import type { Frame, SimContext, TimerRef } from "../../kernel";
import { ArpModule } from "../../protocols/arp";
import type { PendingSend } from "../../protocols/arp";
import { deviceRef, findDevice, isAdminUp, portLink, portMac } from "../../topology";
import { computeViews } from "../../views";
import { transmit } from "../link";
import type { ConfigChange, DeviceModel } from "../model";
import { RipModule } from "./rip";
import { lookupRoute, routingTable } from "./routing";
import type { RouteDecision, RoutingEntry } from "./routing";

export const ROUTER_TTL = 64;

function routerIn(document: TopologyDocument, id: string): RouterDevice | undefined {
  const device = findDevice(document, id);
  return device?.kind === "router" ? device : undefined;
}

export class RouterModel implements DeviceModel {
  readonly deviceId: string;
  readonly #getDocument: () => TopologyDocument;
  readonly #arps = new Map<string, ArpModule>();
  readonly #replies = new Set<number>();
  readonly #rip: RipModule;

  constructor(deviceId: string, getDocument: () => TopologyDocument) {
    this.deviceId = deviceId;
    this.#getDocument = getDocument;
    const current = () => this.#device();
    this.#rip = new RipModule({
      device: current,
      document: getDocument,
      ports: () => computeViews(getDocument())[deviceId]!.ports,
    });
    for (const port of PORT_NAMES.router) {
      this.#arps.set(port, new ArpModule({
        get device() { return deviceRef(current()); },
        ipOf: () => current().config.interfaces[port]?.ip,
        macOf: () => portMac(current(), port),
        linkOf: () => portLink(getDocument(), { deviceId, port })?.linkId,
        transmit: (ctx, _port, frame) => { transmit(ctx, getDocument(), { deviceId, port }, frame); },
      }));
    }
  }

  #device(): RouterDevice {
    const device = routerIn(this.#getDocument(), this.deviceId);
    if (device === undefined) throw new Error(`Router ${this.deviceId} is not in the document`);
    return device;
  }

  #decision(destination: string): RouteDecision | null {
    const device = this.#device();
    const ports = computeViews(this.#getDocument())[this.deviceId]!.ports;
    return lookupRoute(routingTable(device.config, ports, this.#rip.routes()), destination);
  }

  /** 지금 쓰는 라우팅 테이블. 배운 RIP 경로를 포함한다 (T11.2.2) */
  routingTable(): readonly RoutingEntry[] {
    return routingTable(this.#device().config, computeViews(this.#getDocument())[this.deviceId]!.ports, this.#rip.routes());
  }

  /** 경로 교환 1회의 시작 (T11.2.2). RIP를 켠 Router만 보낸다 */
  startRipExchange(ctx: SimContext): void {
    this.#rip.startExchange(ctx);
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
    // RIP v2 멀티캐스트와 요청에 대한 응답 (T11.2.2)
    if (frame.snapshot.rip !== undefined && (mac === RIP_MULTICAST_MAC || mac === portMac(device, port))) {
      this.#rip.onFrame(ctx, port, frame);
      return;
    }
    if (mac !== portMac(device, port) && mac !== BROADCAST_MAC) { drop({ code: "NOT_FOR_ME", params: { device: ref } }); return; }
    const arp = this.#arps.get(port);
    if (frame.snapshot.arp !== undefined) { arp?.onArp(ctx, port, frame); return; }
    const { ipv4, icmp } = frame.snapshot;
    if (ipv4 === undefined) return;
    if (!this.#unicast(ipv4.destinationIp)) { drop({ code: "NOT_FOR_ME", params: { device: ref } }); return; }
    const received = ctx.record({ frame, deviceId: device.id, inPort: port, layer: "L3", action: "receive",
      reason: { code: "IPV4_RECEIVED", params: { device: ref, sourceIp: ipv4.sourceIp, targetIp: ipv4.destinationIp } } });
    const local = PORT_NAMES.router.some(name => isAdminUp(device, name) && device.config.interfaces[name]?.ip === ipv4.destinationIp);
    if (local) {
      if (icmp?.type === "echo-request") {
        const request = ctx.record({ frame, deviceId: device.id, inPort: port, layer: "ICMP", action: "receive", parentSeq: received,
          reason: { code: "ICMP_ECHO_REQUEST_RECEIVED", params: { device: ref, sourceIp: ipv4.sourceIp, targetIp: ipv4.destinationIp } } });
        const decision = this.#decision(ipv4.sourceIp);
        if (decision !== null) this.#send(ctx, decision, {
          sourceIp: ipv4.destinationIp, destinationIp: ipv4.sourceIp, ttl: ROUTER_TTL,
        }, { type: "echo-reply", sequence: icmp.sequence }, "reply", request);
      } else if (isIcmpError(icmp)) {
        if (icmp.original.sourceIp !== ipv4.destinationIp || icmp.original.sequence !== icmp.sequence) return;
        ctx.record({ frame, deviceId: device.id, inPort: port, layer: "ICMP", action: "receive", parentSeq: received,
          reason: { code: "ICMP_ERROR_RECEIVED", params: { device: ref, sourceIp: ipv4.sourceIp, targetIp: ipv4.destinationIp, error: icmp.type } } });
      } else if (icmp?.type === "echo-reply") {
        ctx.record({ frame, deviceId: device.id, inPort: port, layer: "ICMP", action: "receive", parentSeq: received,
          reason: { code: "ICMP_ECHO_REPLY_RECEIVED", params: { device: ref, sourceIp: ipv4.sourceIp, targetIp: ipv4.destinationIp } } });
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
    this.#send(ctx, decision, { ...ipv4, ttl: ipv4.ttl - 1 }, icmp, "forward", received, frame, port);
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

  #unicast(ip: string): boolean {
    if (checkHostIpv4(ip) !== null) return false;
    return !Object.values(this.#device().config.interfaces).some(iface => iface.ip !== undefined && iface.mask !== undefined &&
      isSameNetwork(ip, iface.ip, iface.mask) && checkInterfaceAddress(ip, iface.mask) !== null);
  }

  #error(ctx: SimContext, original: Frame, type: IcmpErrorType, parentSeq: number): void {
    const { ipv4, icmp, ethernet } = original.snapshot;
    // ICMP 오류에 다시 오류를 만들지 않는다. 브로드캐스트·잘못된 주소에도 응답하지 않는다.
    if (ipv4 === undefined || icmp === undefined || isIcmpError(icmp) || ethernet.destinationMac === BROADCAST_MAC ||
      !this.#unicast(ipv4.sourceIp) || !this.#unicast(ipv4.destinationIp)) return;
    const device = this.#device();
    const localPort = PORT_NAMES.router.find(port =>
      isAdminUp(device, port) && device.config.interfaces[port]?.ip === ipv4.sourceIp);
    const message: IcmpMessage = { type, sequence: icmp.sequence, original: {
      sourceIp: ipv4.sourceIp, destinationIp: ipv4.destinationIp, sequence: icmp.sequence,
    } };
    if (localPort !== undefined) {
      // 원래 출발지가 자신이면 ICMP 오류를 로컬 전달한다. 자기 주소를 ARP로 조회하거나 링크로 내보내지 않는다.
      const frame = ctx.createFrame({
        ethernet: { sourceMac: portMac(device, localPort), destinationMac: portMac(device, localPort) },
        ipv4: { sourceIp: ipv4.sourceIp, destinationIp: ipv4.sourceIp, ttl: ROUTER_TTL }, icmp: message,
      });
      const params = { device: deviceRef(device), sourceIp: ipv4.sourceIp, targetIp: ipv4.sourceIp, error: type };
      const sent = ctx.record({ frame, deviceId: device.id, layer: "ICMP", action: "reply", parentSeq,
        reason: { code: "ICMP_ERROR_SENT", params } });
      ctx.record({ frame, deviceId: device.id, layer: "ICMP", action: "receive", parentSeq: sent,
        reason: { code: "ICMP_ERROR_RECEIVED", params } });
      return;
    }
    const decision = this.#decision(ipv4.sourceIp);
    if (decision === null) return;
    this.#send(ctx, decision, {
      sourceIp: this.#device().config.interfaces[decision.port]!.ip!, destinationIp: ipv4.sourceIp, ttl: ROUTER_TTL,
    }, message, "reply", parentSeq);
  }

  onTimer(ctx: SimContext, timer: TimerRef): void {
    for (const arp of this.#arps.values()) arp.onTimer(ctx, timer);
    this.#rip.onTimer(ctx, timer);
  }

  startRun(): void {
    for (const arp of this.#arps.values()) arp.discardPending();
    this.#replies.clear();
  }

  repliesReceived(): readonly number[] { return [...this.#replies]; }

  sendEcho(ctx: SimContext, targetIp: string, sequence: number): void {
    const device = this.#device(); const decision = this.#decision(targetIp);
    if (decision === null) {
      const port = PORT_NAMES.router[0];
      const frame = ctx.createFrame({ ethernet: { sourceMac: portMac(device, port), destinationMac: UNKNOWN_MAC },
        ipv4: { sourceIp: device.config.interfaces[port]?.ip ?? "", destinationIp: targetIp, ttl: ROUTER_TTL },
        icmp: { type: "echo-request", sequence } });
      ctx.record({ frame, deviceId: device.id, layer: "L3", action: "drop",
        reason: { code: "NO_ROUTE", params: { device: deviceRef(device), targetIp } } });
      return;
    }
    this.#send(ctx, decision, { sourceIp: device.config.interfaces[decision.port]!.ip!, destinationIp: targetIp, ttl: ROUTER_TTL },
      { type: "echo-request", sequence }, "create");
  }

  arpTable() { return [...this.#arps.values()].flatMap(arp => arp.view()); }

  clearArp(ip?: string): void { for (const arp of this.#arps.values()) arp.clear(ip); }

  onConfigChanged(change: ConfigChange): void {
    const before = routerIn(change.previous, this.deviceId);
    const after = routerIn(change.document, this.deviceId);
    if (before === undefined || after === undefined) return;
    // RIP 구성이 바뀌면 다음 경로 교환까지 배운 경로를 쓰지 않는다 (T11.2.2 결정 7)
    if (JSON.stringify(before.config.rip) !== JSON.stringify(after.config.rip)) this.#rip.clear();
    for (const port of PORT_NAMES.router) {
      const old = before.config.interfaces[port]; const now = after.config.interfaces[port];
      const ref = { deviceId: this.deviceId, port };
      const linkBefore = portLink(change.previous, ref); const linkNow = portLink(change.document, ref);
      if (old?.ip !== now?.ip || old?.mask !== now?.mask || old?.adminUp !== now?.adminUp ||
        linkBefore?.linkId !== linkNow?.linkId || linkBefore?.peer.deviceId !== linkNow?.peer.deviceId ||
        linkBefore?.peer.port !== linkNow?.peer.port ||
        (linkNow !== undefined && findDevice(change.document, linkNow.peer.deviceId) !== undefined &&
          !isAdminUp(findDevice(change.document, linkNow.peer.deviceId)!, linkNow.peer.port))) {
        this.#arps.get(port)!.onPortChanged(port);
      }
    }
    this.startRun();
  }

  view(): DeviceView {
    const base = computeViews(this.#getDocument())[this.deviceId];
    if (base?.kind !== "router") throw new Error("Router view is missing");
    return { ...base, arpTable: this.arpTable(), routingTable: this.routingTable() };
  }
}
