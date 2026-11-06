// T1.8.1 ARP 모듈. 진짜 kernel로 돌리고, 링크 전달(T1.7.2)만 가짜 `transmit`으로 둔다.

import { BROADCAST_MAC, LINK_DELAY_MICROSECONDS, validateTrace } from "@ping9/shared";
import type { DeviceRef, FrameSnapshot, PortRef, Trace } from "@ping9/shared";
import { TWO_PC, twoPcPingTrace } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { createKernel } from "../kernel";
import type { Frame, SimContext } from "../kernel";
import { ARP_REQUEST_ATTEMPTS, ARP_RETRY_INTERVAL_US, ArpModule } from "./arp";
import type { ArpHost, PendingSend } from "./arp";

const { pc1, pc2, port, linkId } = TWO_PC;
const PC3 = { id: "00000000-0000-4000-8000-000000000003", name: "PC3", ip: "192.168.1.3", mac: "02:00:00:00:03:00" };

interface Host {
  readonly id: string;
  readonly name: string;
  readonly ip?: string;
  readonly mac: string;
}

/**
 * 가짜 세상. 장비마다 포트 하나(Ethernet0)이고, 보낸 프레임을 1000 µs 뒤에 건넨다.
 * 2대면 직접 연결, 3대면 다 배운 Switch를 지난 것처럼 보인다. `linked: false`면 링크가 없다
 */
function world(hosts: readonly Host[], options: { readonly linked?: boolean } = {}) {
  const linked = options.linked ?? true;
  const modules = new Map<string, ArpModule>();
  for (const host of hosts) {
    const arpHost: ArpHost = {
      device: { deviceId: host.id, deviceName: host.name },
      ipOf: () => host.ip,
      macOf: () => host.mac,
      linkOf: () => (linked ? linkId : undefined),
      transmit(ctx, _port, frame) {
        if (!linked) return;
        const to = frame.snapshot.ethernet.destinationMac;
        for (const other of hosts) {
          // 이미 배운 Switch처럼 브로드캐스트는 모두에게, 나머지는 그 MAC의 장비에게만
          if (other.id === host.id || (to !== BROADCAST_MAC && to !== other.mac)) continue;
          const target: PortRef = { deviceId: other.id, port };
          ctx.sendFrame(target, frame, LINK_DELAY_MICROSECONDS);
        }
      },
    };
    modules.set(host.id, new ArpModule(arpHost));
  }
  const kernel = createKernel();
  const arp = (id: string) => modules.get(id)!;

  const run = (start: (ctx: SimContext) => void): Trace =>
    kernel.run({
      docVersion: 1,
      start,
      onFrame(ctx, target, frame) {
        if (frame.snapshot.arp !== undefined) arp(target.deviceId).onArp(ctx, target.port, frame);
      },
      onTimer(ctx, timer) {
        for (const module of modules.values()) if (module.onTimer(ctx, timer)) return;
      },
    });

  return { kernel, arp, run };
}

const ref = (host: Host): DeviceRef => ({ deviceId: host.id, deviceName: host.name });

/** 예시의 ICMP echo 요청을 만드는 보관 패킷. 보낼 때 예시 seq 6과 같은 이벤트를 남긴다 */
function echo(from: Host, to: Host, sent: Frame[] = []): PendingSend {
  return {
    build: (destinationMac): FrameSnapshot => ({
      ethernet: { sourceMac: from.mac, destinationMac },
      ipv4: { sourceIp: from.ip!, destinationIp: to.ip!, ttl: TWO_PC.ttl },
      icmp: { type: "echo-request", sequence: sent.length + 1 },
    }),
    onSend(ctx, frame, parentSeq) {
      sent.push(frame);
      ctx.record({
        frame, deviceId: from.id, outPort: port, linkId, layer: "ICMP", action: "create",
        ...(parentSeq === undefined ? {} : { parentSeq }),
        reason: { code: "ICMP_ECHO_REQUEST_SENT", params: { device: ref(from), sourceIp: from.ip!, targetIp: to.ip! } },
      });
    },
  };
}

const codes = (trace: Trace) => trace.events.map(event => event.reason.code);

describe("ARP 모듈", () => {
  test("PC 2대, 빈 테이블: seq 0~6이 예시 twoPcPingTrace와 같다", () => {
    const { arp, run } = world([pc1, pc2]);
    const trace = run(ctx => arp(pc1.id).send(ctx, port, pc2.ip, echo(pc1, pc2)));
    expect(trace.events).toEqual(twoPcPingTrace.events.slice(0, 7));
    expect(validateTrace(trace).ok).toBe(true);
  });

  test("이미 알면 요청 없이 바로 나간다. 회차가 바뀌어도 테이블이 남는다", () => {
    const { arp, run } = world([pc1, pc2]);
    run(ctx => arp(pc1.id).send(ctx, port, pc2.ip, echo(pc1, pc2)));
    const second = run(ctx => arp(pc1.id).send(ctx, port, pc2.ip, echo(pc1, pc2)));
    expect(codes(second)).toEqual(["ICMP_ECHO_REQUEST_SENT"]);
    expect(second.events[0]!.frameId).toBe(1);
    expect(second.events[0]!.parentSeq).toBeUndefined();
  });

  test(`무응답: 1초 간격으로 요청을 ${ARP_REQUEST_ATTEMPTS}번 보내고 2초에 ARP_TIMEOUT 폐기 하나`, () => {
    const { arp, run } = world([pc1, { ...pc2, ip: "192.168.1.99" }]);
    const sent: Frame[] = [];
    const trace = run(ctx => arp(pc1.id).send(ctx, port, pc2.ip, echo(pc1, pc2, sent)));

    const ours = trace.events.filter(event => event.deviceId === pc1.id);
    expect(ours.map(event => [event.time, event.reason.code])).toEqual([
      [0, "ARP_REQUEST_SENT"],
      [ARP_RETRY_INTERVAL_US, "ARP_REQUEST_SENT"],
      [ARP_RETRY_INTERVAL_US * 2, "ARP_TIMEOUT"],
    ]);
    const [first, retry, drop] = ours;
    expect(retry!.parentSeq).toBe(first!.seq);
    expect(retry!.frameId).not.toBe(first!.frameId);
    expect(drop).toMatchObject({
      action: "drop", dropReason: "ARP_TIMEOUT", parentSeq: retry!.seq, frameId: retry!.frameId,
      reason: { params: { device: ref(pc1), targetIp: pc2.ip } },
    });
    expect(trace.result).toEqual({ status: "failed", primaryDropSeq: drop!.seq });
    expect(sent).toEqual([]);
    expect(validateTrace(trace).ok).toBe(true);
  });

  test("링크가 없으면 요청만 남고 2초에 폐기된다 (링크 없음 폐기는 T1.7.2)", () => {
    const { arp, run } = world([pc1, pc2], { linked: false });
    const trace = run(ctx => arp(pc1.id).send(ctx, port, pc2.ip, echo(pc1, pc2)));
    expect(codes(trace)).toEqual(["ARP_REQUEST_SENT", "ARP_REQUEST_SENT", "ARP_TIMEOUT"]);
    expect(trace.events[0]!.linkId).toBeUndefined();
  });

  test("자기 것이 아닌 요청: forMe false, NOT_FOR_ME, 응답 없음, 테이블 그대로. 실패 원인이 아니다", () => {
    const { arp, run } = world([pc1, pc2, PC3]);
    const trace = run(ctx => arp(pc1.id).send(ctx, port, pc2.ip, echo(pc1, pc2)));
    const atPc3 = trace.events.filter(event => event.deviceId === PC3.id);
    expect(atPc3.map(event => event.reason.code)).toEqual(["ARP_REQUEST_RECEIVED", "NOT_FOR_ME"]);
    expect(atPc3[0]!.reason.params).toMatchObject({ forMe: false });
    expect(atPc3[1]!.parentSeq).toBe(atPc3[0]!.seq);
    expect(arp(PC3.id).view()).toEqual([]);
    expect(trace.result.primaryDropSeq).toBeUndefined();
  });

  test("자기 것이 아닌 요청이라도 이미 아는 IP면 항목을 고친다 (RFC 826). 이벤트는 더 없다", () => {
    const { arp, run } = world([pc1, pc2, PC3]);
    run(ctx => arp(PC3.id).send(ctx, port, pc1.ip, echo(PC3, pc1)));
    expect(arp(PC3.id).view()).toEqual([{ ip: pc1.ip, mac: pc1.mac, port }]);

    // PC1이 새 카드로 바뀐 것처럼 MAC이 달라진 요청
    const moved = { ...pc1, mac: "02:00:00:00:0a:00" };
    const changed = world([moved, pc2, PC3]);
    changed.run(ctx => changed.arp(PC3.id).send(ctx, port, pc1.ip, echo(PC3, pc1)));
    const trace = changed.run(ctx => changed.arp(moved.id).send(ctx, port, pc2.ip, echo(moved, pc2)));
    expect(trace.events.filter(event => event.deviceId === PC3.id).map(event => event.reason.code))
      .toEqual(["ARP_REQUEST_RECEIVED", "NOT_FOR_ME"]);
    expect(changed.arp(PC3.id).view()).toEqual([{ ip: pc1.ip, mac: moved.mac, port }]);
  });

  test("send의 parentSeq: 바로 보내면 onSend에, 요청하면 ARP_REQUEST_SENT에 넘긴다", () => {
    const { arp, run } = world([pc1, pc2]);
    const parents: (number | undefined)[] = [];
    const watch = (pending: PendingSend): PendingSend => ({
      build: pending.build,
      onSend(ctx, frame, parentSeq) {
        parents.push(parentSeq);
        pending.onSend(ctx, frame, parentSeq);
      },
    });
    const cause = (ctx: SimContext) => ctx.record({
      frame: ctx.createFrame({ ethernet: { sourceMac: pc1.mac, destinationMac: pc1.mac } }),
      deviceId: pc1.id, layer: "L3", action: "receive",
      reason: { code: "ICMP_ECHO_REQUEST_RECEIVED", params: { device: ref(pc1), sourceIp: pc2.ip, targetIp: pc1.ip } },
    });

    // 모를 때: 요청의 부모가 넘긴 값
    const first = run(ctx => arp(pc1.id).send(ctx, port, pc2.ip, echo(pc1, pc2), cause(ctx)));
    expect(first.events[1]).toMatchObject({ reason: { code: "ARP_REQUEST_SENT" }, parentSeq: 0 });

    // 알 때: onSend가 넘긴 값을 받는다 (kernel 기본값이 아님)
    const second = run(ctx => {
      cause(ctx);
      const seq = cause(ctx);
      arp(pc1.id).send(ctx, port, pc2.ip, watch(echo(pc1, pc2)), seq);
    });
    expect(parents).toEqual([1]);
    expect(second.events[2]).toMatchObject({ reason: { code: "ICMP_ECHO_REQUEST_SENT" }, parentSeq: 1 });
  });

  test("같은 IP로 여러 패킷이 기다리면 요청은 한 번, 응답 뒤 넣은 순서대로 모두 나간다", () => {
    const { arp, run } = world([pc1, pc2]);
    const sent: Frame[] = [];
    const trace = run(ctx => {
      arp(pc1.id).send(ctx, port, pc2.ip, echo(pc1, pc2, sent));
      arp(pc1.id).send(ctx, port, pc2.ip, echo(pc1, pc2, sent));
    });
    expect(codes(trace).filter(code => code === "ARP_REQUEST_SENT")).toHaveLength(1);
    expect(sent.map(frame => frame.snapshot.icmp?.sequence)).toEqual([1, 2]);
    const learned = trace.events.find(event => event.deviceId === pc1.id && event.reason.code === "ARP_ENTRY_LEARNED")!;
    const echoes = trace.events.filter(event => event.reason.code === "ICMP_ECHO_REQUEST_SENT");
    expect(echoes.map(event => event.parentSeq)).toEqual([learned.seq, learned.seq]);
  });

  test("응답을 받으면 타이머가 취소되어 1초, 2초에 아무 일도 없다", () => {
    const { kernel, arp, run } = world([pc1, pc2]);
    const trace = run(ctx => arp(pc1.id).send(ctx, port, pc2.ip, echo(pc1, pc2)));
    // 마지막 이벤트는 2000 µs의 ICMP 보냄. 시계는 그 프레임이 도착한 3000 µs에서 멈춘다 (1초로 가지 않음)
    expect(trace.events.at(-1)!.time).toBe(LINK_DELAY_MICROSECONDS * 2);
    expect(kernel.now()).toBe(LINK_DELAY_MICROSECONDS * 3);
    expect(trace.events.some(event => event.reason.code === "ARP_TIMEOUT")).toBe(false);
  });

  test("다른 모듈이나 다른 장비의 타이머에는 false", () => {
    const { arp, run } = world([pc1, pc2]);
    const answers: boolean[] = [];
    run(ctx => {
      const other = ctx.setTimer(pc1.id, "icmp:1", 0);
      const elsewhere = ctx.setTimer(pc2.id, "arp:Ethernet0:192.168.1.2", 0);
      answers.push(arp(pc1.id).onTimer(ctx, other), arp(pc1.id).onTimer(ctx, elsewhere));
    });
    expect(answers).toEqual([false, false]);
  });

  test("응답의 대상 IP가 자기가 아니고 모르는 IP면 기록하지 않는다 (RFC 826)", () => {
    const { arp, run } = world([pc1, pc2]);
    const stray = {
      ethernet: { sourceMac: pc2.mac, destinationMac: pc1.mac },
      arp: { operation: "reply", senderMac: pc2.mac, senderIp: pc2.ip, targetMac: pc1.mac, targetIp: "192.168.1.50" },
    } as const;
    const trace = run(ctx => arp(pc1.id).onArp(ctx, port, ctx.createFrame(stray)));
    expect(codes(trace)).toEqual(["ARP_REPLY_RECEIVED", "NOT_FOR_ME"]);
    expect(arp(pc1.id).view()).toEqual([]);
  });

  test("기다리지 않던 IP라도 대상 IP가 자기면 기록한다", () => {
    const { arp, run } = world([pc1, pc2]);
    const reply = {
      ethernet: { sourceMac: pc2.mac, destinationMac: pc1.mac },
      arp: { operation: "reply", senderMac: pc2.mac, senderIp: pc2.ip, targetMac: pc1.mac, targetIp: pc1.ip },
    } as const;
    const trace = run(ctx => arp(pc1.id).onArp(ctx, port, ctx.createFrame(reply)));
    expect(codes(trace)).toEqual(["ARP_REPLY_RECEIVED", "ARP_ENTRY_LEARNED"]);
    expect(arp(pc1.id).view()).toEqual([{ ip: pc2.ip, mac: pc2.mac, port }]);
  });

  test("clear(ip), clear(), onPortChanged(port)", () => {
    const { arp, run } = world([pc1, pc2, PC3]);
    run(ctx => {
      arp(pc1.id).send(ctx, port, PC3.ip, echo(pc1, PC3));
      arp(pc1.id).send(ctx, port, pc2.ip, echo(pc1, pc2));
    });
    // IP 순 정렬 (넣은 순서는 PC3, PC2)
    expect(arp(pc1.id).view().map(entry => entry.ip)).toEqual([pc2.ip, PC3.ip]);
    arp(pc1.id).clear(pc2.ip);
    expect(arp(pc1.id).view().map(entry => entry.ip)).toEqual([PC3.ip]);
    arp(pc1.id).clear();
    expect(arp(pc1.id).view()).toEqual([]);

    expect(arp(pc2.id).view()).toEqual([{ ip: pc1.ip, mac: pc1.mac, port }]);
    arp(pc2.id).onPortChanged("Ethernet9");
    expect(arp(pc2.id).view()).toHaveLength(1);
    arp(pc2.id).onPortChanged(port);
    expect(arp(pc2.id).view()).toEqual([]);
  });

  test("IP는 숫자 순으로 정렬한다 (글자 순이 아님)", () => {
    const hosts = [pc1, { ...PC3, ip: "192.168.1.10" }, { ...pc2, ip: "192.168.1.9" }];
    const { arp, run } = world(hosts);
    run(ctx => {
      arp(pc1.id).send(ctx, port, "192.168.1.10", echo(pc1, hosts[1]!));
      arp(pc1.id).send(ctx, port, "192.168.1.9", echo(pc1, hosts[2]!));
    });
    expect(arp(pc1.id).view().map(entry => entry.ip)).toEqual(["192.168.1.9", "192.168.1.10"]);
  });

  test("회차가 중간에 끊겨 남은 대기열은 discardPending으로 버린다", () => {
    const { arp, run } = world([pc1, { ...pc2, ip: "192.168.1.99" }]);
    // 타이머를 모듈에 건네지 않는 회차: 대기열에 옛 Trace의 프레임이 남는다
    createKernel().run({
      docVersion: 1,
      start: ctx => arp(pc1.id).send(ctx, port, pc2.ip, echo(pc1, pc2)),
      onFrame: () => {},
      onTimer: () => {},
    });
    const stale = run(ctx => arp(pc1.id).send(ctx, port, pc2.ip, echo(pc1, pc2)));
    expect(stale.events).toEqual([]);

    arp(pc1.id).discardPending();
    const trace = run(ctx => arp(pc1.id).send(ctx, port, pc2.ip, echo(pc1, pc2)));
    expect(codes(trace).filter(code => code === "ARP_REQUEST_SENT")).toHaveLength(ARP_REQUEST_ATTEMPTS);
  });

  test("결정성: 같은 입력이면 같은 Trace", () => {
    const once = () => {
      const { arp, run } = world([pc1, pc2, PC3]);
      return run(ctx => arp(pc1.id).send(ctx, port, pc2.ip, echo(pc1, pc2)));
    };
    expect(once()).toEqual(once());
  });
});
