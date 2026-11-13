import { BROADCAST_MAC, PORT_NAMES, RIP_MULTICAST_MAC, UNKNOWN_MAC, checkHostIpv4, checkInterfaceAddress, isIcmpError, isSameNetwork, isTunnelName, routerInterfaces, greEnabled } from "@ping9/shared";
import type { FrameSnapshot, IcmpErrorType, IcmpMessage, Ipv4Header, Reason, RouterDevice, RouterView, TopologyDocument } from "@ping9/shared";

import type { Frame, SimContext, TimerRef } from "../../kernel";
import { ArpModule } from "../../protocols/arp";
import type { PendingSend } from "../../protocols/arp";
import { deviceRef, findDevice, isAdminUp, portLink, portMac } from "../../topology";
import { portViewsOf } from "../../views";
import { transmit } from "../link";
import type { ConfigChange, DeviceModel } from "../model";
import { RipModule } from "./rip";
import { lookupRoute, routingTable, tunnelStates } from "./routing";
import type { RouteDecision, RoutingEntry } from "./routing";
import { IpsecModule } from "./ipsec";

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
  readonly #ipsec: IpsecModule;
  readonly #now: () => number;

  constructor(deviceId: string, getDocument: () => TopologyDocument, now: () => number = () => 0) {
    this.deviceId = deviceId;
    this.#getDocument = getDocument;
    const current = () => this.#device();
    this.#now = now;
    this.#ipsec = new IpsecModule(current);
    this.#rip = new RipModule({
      device: current,
      document: getDocument,
      ports: () => portViewsOf(getDocument(), current()),
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
    const ports = portViewsOf(this.#getDocument(), device);
    return lookupRoute(routingTable(device.config, ports, this.#rip.routes()), destination);
  }

  /** 지금 쓰는 라우팅 테이블. 배운 RIP 경로를 포함한다 (T11.2.2) */
  routingTable(): readonly RoutingEntry[] {
    return routingTable(this.#device().config, portViewsOf(this.#getDocument(), this.#device()), this.#rip.routes());
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
    this.#receiveIp(ctx, port, frame);
  }

  #receiveIp(ctx: SimContext, port: string, frame: Frame, parentSeq?: number, protectedBy?: string): void {
    const device = this.#device(); const ref = deviceRef(device);
    const { ipv4, icmp } = frame.snapshot;
    if (ipv4 === undefined) return;
    if (ipv4.protocol === undefined && protectedBy === undefined) {
      const required = this.#ipsec.requiredInbound(ipv4);
      if (required !== undefined) { this.#rejectIpsec(ctx, frame, required, "보호 필수 트래픽이 평문으로 도착했습니다", parentSeq); return; }
    }
    if (!this.#unicast(ipv4.destinationIp)) {
      ctx.record({ frame, deviceId: device.id, inPort: port, layer: "L3", action: "drop", reason: { code: "NOT_FOR_ME", params: { device: ref } } }); return;
    }
    const received = ctx.record({ frame, deviceId: device.id, inPort: port, layer: "L3", action: "receive", ...(parentSeq === undefined ? {} : { parentSeq }),
      reason: { code: "IPV4_RECEIVED", params: { device: ref, sourceIp: ipv4.sourceIp, targetIp: ipv4.destinationIp } } });
    const local = Object.entries(routerInterfaces(device.config)).some(([name, iface]) =>
      (!isTunnelName(name) || greEnabled(device.config)) && iface.adminUp && iface.ip === ipv4.destinationIp);
    if (local) {
      if (frame.snapshot.esp !== undefined || ipv4.protocol === 50) { this.#unprotect(ctx, port, frame, received); return; }
      if (frame.snapshot.gre !== undefined || ipv4.protocol === 47) { this.#decapsulate(ctx, port, frame, received); return; }
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
    if (ipv4.protocol !== 50) {
      const profile = this.#ipsec.outbound(ipv4);
      if (profile !== undefined) { this.#protect(ctx, profile, decision, ipv4, icmp, parentSeq, originalFrame); return; }
    }
    if (isTunnelName(port)) { this.#encapsulate(ctx, port, ipv4, icmp, parentSeq, originalFrame); return; }
    const gre = ipv4.protocol === 47 ? originalFrame?.snapshot.gre : undefined;
    const esp = ipv4.protocol === 50 ? originalFrame?.snapshot.esp : undefined;
    const pending: PendingSend = {
      ...(originalFrame === undefined ? {} : { originalFrame }),
      build: (destinationMac): FrameSnapshot => ({
        ethernet: { sourceMac: portMac(device, port), destinationMac }, ipv4,
        ...(icmp === undefined ? {} : { icmp }), ...(gre === undefined ? {} : { gre }), ...(esp === undefined ? {} : { esp }),
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

  #rejectIpsec(ctx: SimContext, frame: Frame, profile: string, detail: string, parentSeq?: number): void {
    this.#ipsec.reject(profile, ctx.now());
    ctx.record({ frame, deviceId: this.deviceId, layer: "IPSEC", action: "drop", reason: {
      code: "IPSEC_REJECTED", params: { device: deviceRef(this.#device()), profile, detail },
    }, ...(parentSeq === undefined ? {} : { parentSeq }) });
  }

  #protect(ctx: SimContext, name: string, decision: RouteDecision, ipv4: Ipv4Header, icmp: IcmpMessage | undefined,
    parentSeq?: number, original?: Frame): void {
    const device = this.#device(); const profile = device.config.ipsec![name]!;
    const inner = original ?? ctx.createFrame({ ethernet: { sourceMac: UNKNOWN_MAC, destinationMac: UNKNOWN_MAC }, ipv4,
      ...(icmp === undefined ? {} : { icmp }) });
    const outerRoute = profile.peer === undefined ? null : this.#decision(profile.peer);
    const source = profile.interface === undefined ? undefined : device.config.interfaces[profile.interface];
    if (outerRoute === null || source?.ip === undefined || !source.adminUp || decision.port !== profile.interface ||
      outerRoute.port !== profile.interface || isTunnelName(outerRoute.port)) {
      this.#rejectIpsec(ctx, inner, name, "출구/peer 물리 경로가 없거나 정책 인터페이스와 다릅니다", parentSeq); return;
    }
    const result = this.#ipsec.protect(name, ipv4, icmp, ctx.now());
    if (!result.ok) { this.#rejectIpsec(ctx, inner, name, result.detail, parentSeq); return; }
    const outer = ctx.updateFrame(inner, { ethernet: inner.snapshot.ethernet,
      ipv4: { sourceIp: source.ip, destinationIp: profile.peer!, ttl: ROUTER_TTL, protocol: 50 }, esp: result.value });
    const protectedSeq = ctx.record({ frame: outer, deviceId: device.id, layer: "IPSEC", action: "create", reason: {
      code: "IPSEC_PROTECTED", params: { device: deviceRef(device), profile: name, peer: profile.peer!, spi: result.value.spi, sequence: result.value.sequence },
    }, ...(parentSeq === undefined ? {} : { parentSeq }) });
    this.#send(ctx, outerRoute, outer.snapshot.ipv4!, undefined, "forward", protectedSeq, outer);
  }

  #unprotect(ctx: SimContext, port: string, frame: Frame, parentSeq: number): void {
    const { esp, ipv4 } = frame.snapshot;
    const name = esp === undefined || ipv4 === undefined ? undefined : this.#ipsec.inbound(ipv4, esp, port);
    if (esp === undefined || ipv4 === undefined || name === undefined) {
      this.#rejectIpsec(ctx, frame, "", "수신 SA가 없습니다 (peer/바깥 IP/port/SPI 불일치)", parentSeq); return;
    }
    const result = this.#ipsec.unprotect(name, ipv4, esp, port, ctx.now());
    if (!result.ok) { this.#rejectIpsec(ctx, frame, name, result.detail, parentSeq); return; }
    const restored = ctx.updateFrame(frame, { ethernet: frame.snapshot.ethernet, ipv4: result.value.ipv4, icmp: result.value.icmp });
    const received = ctx.record({ frame: restored, deviceId: this.deviceId, inPort: port, layer: "IPSEC", action: "receive", parentSeq,
      reason: { code: "IPSEC_UNPROTECTED", params: { device: deviceRef(this.#device()), profile: name, peer: ipv4.sourceIp, spi: esp.spi, sequence: esp.sequence } } });
    this.#receiveIp(ctx, port, restored, received, name);
  }

  #rejectGre(ctx: SimContext, frame: Frame, detail: string, parentSeq?: number): void {
    ctx.record({ frame, deviceId: this.deviceId, layer: "GRE", action: "drop", reason: {
      code: "GRE_REJECTED", params: { device: deviceRef(this.#device()), detail },
    }, ...(parentSeq === undefined ? {} : { parentSeq }) });
  }

  #encapsulate(ctx: SimContext, name: string, ipv4: Ipv4Header, icmp: IcmpMessage | undefined, parentSeq?: number, original?: Frame): void {
    const device = this.#device(); const tunnel = device.config.tunnels?.[name];
    const source = tunnel?.source === undefined ? undefined : device.config.interfaces[tunnel.source];
    const inner = original === undefined ? ctx.createFrame({ ethernet: { sourceMac: UNKNOWN_MAC, destinationMac: UNKNOWN_MAC }, ipv4,
      ...(icmp === undefined ? {} : { icmp }) }) : original;
    const outerRoute = tunnel?.destination === undefined ? null : this.#decision(tunnel.destination);
    if (tunnel === undefined || !tunnel.adminUp || source?.ip === undefined || outerRoute === null ||
      isTunnelName(outerRoute.port) || ipv4.protocol === 47 || icmp === undefined) {
      this.#rejectGre(ctx, inner, "터널 미설정, underlay 재귀 경로 또는 중첩/미지원 payload", parentSeq); return;
    }
    const outer = ctx.updateFrame(inner, { ethernet: inner.snapshot.ethernet,
      ipv4: { sourceIp: source.ip, destinationIp: tunnel.destination!, ttl: ROUTER_TTL, protocol: 47 },
      gre: { version: 0, protocolType: 2048, payload: { ipv4, icmp } },
    });
    const wrapped = ctx.record({ frame: outer, deviceId: device.id, layer: "GRE", action: "create", reason: {
      code: "GRE_ENCAPSULATED", params: { device: deviceRef(device), tunnel: name, peer: tunnel.destination! },
    }, ...(parentSeq === undefined ? {} : { parentSeq }) });
    this.#send(ctx, outerRoute, outer.snapshot.ipv4!, undefined, "forward", wrapped, outer);
  }

  #decapsulate(ctx: SimContext, port: string, frame: Frame, parentSeq: number): void {
    const { gre, ipv4 } = frame.snapshot; const device = this.#device();
    const ports = portViewsOf(this.#getDocument(), device);
    const state = tunnelStates(device.config, ports, this.#rip.routes()).find(state => state.status === "up" &&
      state.sourceIp === ipv4?.destinationIp && state.destination === ipv4?.sourceIp);
    if (gre === undefined || ipv4?.protocol !== 47 || gre.version !== 0 || gre.protocolType !== 2048 || state === undefined ||
      gre.payload.ipv4.protocol !== undefined || gre.payload.ipv4.destinationIp === ipv4.sourceIp) {
      this.#rejectGre(ctx, frame, "수신 GRE 형식/상대/터널 상태가 일치하지 않습니다", parentSeq); return;
    }
    const restored = ctx.updateFrame(frame, { ethernet: frame.snapshot.ethernet, ipv4: gre.payload.ipv4, icmp: gre.payload.icmp });
    const received = ctx.record({ frame: restored, deviceId: device.id, inPort: port, layer: "GRE", action: "receive", parentSeq,
      reason: { code: "GRE_DECAPSULATED", params: { device: deviceRef(device), tunnel: state.name, peer: ipv4.sourceIp } } });
    // 논리 인터페이스 수신부터 기존 로컬 응답/경로 조회/TTL/오류 처리를 재사용한다.
    this.#receiveIp(ctx, state.name, restored, received);
  }

  #unicast(ip: string): boolean {
    if (checkHostIpv4(ip) !== null) return false;
    return !Object.values(routerInterfaces(this.#device().config)).some(iface => iface.ip !== undefined && iface.mask !== undefined &&
      isSameNetwork(ip, iface.ip, iface.mask) && checkInterfaceAddress(ip, iface.mask) !== null);
  }

  #error(ctx: SimContext, original: Frame, type: IcmpErrorType, parentSeq: number): void {
    const { ipv4, icmp, ethernet } = original.snapshot;
    // ICMP 오류에 다시 오류를 만들지 않는다. 브로드캐스트·잘못된 주소에도 응답하지 않는다.
    if (ipv4 === undefined || icmp === undefined || isIcmpError(icmp) || ethernet.destinationMac === BROADCAST_MAC ||
      !this.#unicast(ipv4.sourceIp) || !this.#unicast(ipv4.destinationIp)) return;
    const device = this.#device();
    const localInterface = Object.entries(routerInterfaces(device.config)).find(([name, iface]) =>
      (!isTunnelName(name) || greEnabled(device.config)) && iface.adminUp && iface.ip === ipv4.sourceIp)?.[0];
    const localPort = localInterface === undefined ? undefined : isTunnelName(localInterface)
      ? device.config.tunnels?.[localInterface]?.source : localInterface;
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
      sourceIp: this.#ipsec.sourceFor(ipv4.sourceIp) ?? routerInterfaces(this.#device().config)[decision.port]!.ip!, destinationIp: ipv4.sourceIp, ttl: ROUTER_TTL,
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

  /** echo 요청을 보낸다. `ttl`은 traceroute가 hop마다 정한다 (T11.4.1) */
  sendEcho(ctx: SimContext, targetIp: string, sequence: number, ttl = ROUTER_TTL): void {
    const device = this.#device(); const decision = this.#decision(targetIp);
    if (decision === null) {
      const port = PORT_NAMES.router[0];
      const frame = ctx.createFrame({ ethernet: { sourceMac: portMac(device, port), destinationMac: UNKNOWN_MAC },
        ipv4: { sourceIp: device.config.interfaces[port]?.ip ?? "", destinationIp: targetIp, ttl },
        icmp: { type: "echo-request", sequence } });
      ctx.record({ frame, deviceId: device.id, layer: "L3", action: "drop",
        reason: { code: "NO_ROUTE", params: { device: deviceRef(device), targetIp } } });
      return;
    }
    this.#send(ctx, decision, { sourceIp: this.#ipsec.sourceFor(targetIp) ?? routerInterfaces(device.config)[decision.port]!.ip!, destinationIp: targetIp, ttl },
      { type: "echo-request", sequence }, "create");
  }

  arpTable() { return [...this.#arps.values()].flatMap(arp => arp.view()); }

  clearArp(ip?: string): void { for (const arp of this.#arps.values()) arp.clear(ip); }

  onConfigChanged(change: ConfigChange): void {
    const before = routerIn(change.previous, this.deviceId);
    const after = routerIn(change.document, this.deviceId);
    if (before === undefined || after === undefined) return;
    this.#ipsec.configChanged(before.config);
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

  ipsecSa() { return this.#ipsec.view(portViewsOf(this.#getDocument(), this.#device()), this.#now()); }

  view(): RouterView {
    const device = this.#device(); const ports = portViewsOf(this.#getDocument(), device);
    return { kind: "router", ports, arpTable: this.arpTable(), routingTable: routingTable(device.config, ports, this.#rip.routes()),
      ...(device.config.ipsec === undefined ? {} : { ipsec: this.#ipsec.view(ports, this.#now()) }),
      ...(device.config.tunnels === undefined ? {} : { tunnels: tunnelStates(device.config, ports, this.#rip.routes()) }) };
  }
}
