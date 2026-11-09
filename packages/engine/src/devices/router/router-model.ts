import { BROADCAST_MAC, PORT_NAMES, UNKNOWN_MAC } from "@ping9/shared";
import type { DeviceView, FrameSnapshot, IcmpMessage, Ipv4Header, Reason, RouterDevice, TopologyDocument } from "@ping9/shared";

import type { Frame, SimContext, TimerRef } from "../../kernel";
import { ArpModule } from "../../protocols/arp";
import type { PendingSend } from "../../protocols/arp";
import { deviceRef, findDevice, isAdminUp, portLink, portMac } from "../../topology";
import { computeViews } from "../../views";
import { transmit } from "../link";
import type { ConfigChange, DeviceModel } from "../model";
import { lookupRoute, routingTable } from "./routing";
import type { RouteDecision } from "./routing";

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

  constructor(deviceId: string, getDocument: () => TopologyDocument) {
    this.deviceId = deviceId;
    this.#getDocument = getDocument;
    const current = () => this.#device();
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
    return lookupRoute(routingTable(device.config, ports), destination);
  }

  onFrame(ctx: SimContext, port: string, frame: Frame): void {
    const device = this.#device();
    const ref = deviceRef(device);
    const drop = (reason: Reason<"IF_DOWN" | "NO_IP" | "NOT_FOR_ME">) => ctx.record({
      frame, deviceId: device.id, inPort: port, layer: "L3", action: "drop", reason,
    });
    if (!isAdminUp(device, port)) { drop({ code: "IF_DOWN", params: { device: ref, port } }); return; }
    if (device.config.interfaces[port]?.ip === undefined) { drop({ code: "NO_IP", params: { device: ref } }); return; }
    const mac = frame.snapshot.ethernet.destinationMac;
    if (mac !== portMac(device, port) && mac !== BROADCAST_MAC) { drop({ code: "NOT_FOR_ME", params: { device: ref } }); return; }
    const arp = this.#arps.get(port);
    if (frame.snapshot.arp !== undefined) { arp?.onArp(ctx, port, frame); return; }
    const { ipv4, icmp } = frame.snapshot;
    if (ipv4 === undefined) return;
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
      } else if (icmp?.type === "echo-reply") {
        ctx.record({ frame, deviceId: device.id, inPort: port, layer: "ICMP", action: "receive", parentSeq: received,
          reason: { code: "ICMP_ECHO_REPLY_RECEIVED", params: { device: ref, sourceIp: ipv4.sourceIp, targetIp: ipv4.destinationIp } } });
        this.#replies.add(icmp.sequence);
      }
      return;
    }
    const decision = this.#decision(ipv4.destinationIp);
    if (ipv4.ttl <= 1 || decision === null) {
      ctx.record({ frame, deviceId: device.id, inPort: port, layer: "L3", action: "drop", parentSeq: received,
        reason: ipv4.ttl <= 1 ? { code: "TTL_EXPIRED", params: { device: ref } }
          : { code: "NO_ROUTE", params: { device: ref, targetIp: ipv4.destinationIp } } });
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
            : action === "create" ? { code: "ICMP_ECHO_REQUEST_SENT", params } : { code: "ICMP_ECHO_REPLY_SENT", params },
        });
      },
    };
    this.#arps.get(port)!.send(ctx, port, nextHop, pending, parentSeq);
  }

  onTimer(ctx: SimContext, timer: TimerRef): void {
    for (const arp of this.#arps.values()) arp.onTimer(ctx, timer);
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
    return { ...base, arpTable: this.arpTable() };
  }
}
