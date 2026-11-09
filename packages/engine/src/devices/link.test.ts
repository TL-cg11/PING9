// T1.7.2: 가짜 장비 둘로 링크 전달을 확인한다. 진짜 PC·Switch 모델은 T1.8.3과 T5.2.2에서 만든다.
import { LINK_DELAY_MICROSECONDS, validateTrace } from "@ping9/shared";
import type { DeviceView, FrameSnapshot, PortRef, TopologyDocument, Trace } from "@ping9/shared";
import { TWO_PC, TWO_PC_SWITCH, twoPcDocument, twoPcPingTrace, twoPcSwitchDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { createKernel } from "../kernel";
import type { Frame, SimContext, TimerRef } from "../kernel";
import { deviceRef, findDevice } from "../topology";
import { deviceRun, transmit } from "./link";
import type { DeviceModel } from "./model";

const snapshot = (): FrameSnapshot => JSON.parse(JSON.stringify(twoPcPingTrace.events[0]!.frame)) as FrameSnapshot;
const EMPTY_VIEW: DeviceView = { kind: "pc", ports: [], arpTable: [] };

interface Arrival {
  readonly port: string;
  readonly frame: Frame;
  readonly time: number;
}

/** 받은 것을 적어 두기만 하는 가짜 장비. `react`를 주면 받을 때마다 그것을 실행한다 */
class FakeDevice implements DeviceModel {
  readonly arrivals: Arrival[] = [];
  readonly timers: { readonly timer: TimerRef; readonly time: number }[] = [];
  readonly configChanges: number[] = [];

  constructor(
    readonly deviceId: string,
    private readonly react?: (ctx: SimContext, port: string, frame: Frame) => void,
  ) {}

  onFrame(ctx: SimContext, port: string, frame: Frame): void {
    this.arrivals.push({ port, frame, time: ctx.now() });
    this.react?.(ctx, port, frame);
  }

  onTimer(ctx: SimContext, timer: TimerRef): void {
    this.timers.push({ timer, time: ctx.now() });
  }

  onConfigChanged(): void {
    this.configChanges.push(1);
  }

  view(): DeviceView {
    return EMPTY_VIEW;
  }
}

function models(...devices: FakeDevice[]): ReadonlyMap<string, DeviceModel> {
  return new Map(devices.map((device) => [device.deviceId, device]));
}

/** 문서의 장비들로 한 회차를 돌린다. `start`에서 첫 프레임을 보낸다 */
function runWith(devices: ReadonlyMap<string, DeviceModel>, start: (ctx: SimContext) => void): Trace {
  return createKernel().run(deviceRun({ docVersion: 1, models: devices, start }));
}

const sent = (ctx: SimContext, document: TopologyDocument, from: PortRef, parentSeq?: number): { frame: Frame; ok: boolean } => {
  const frame = ctx.createFrame(snapshot());
  return { frame, ok: transmit(ctx, document, from, frame, parentSeq) };
};

describe("transmit: 링크로 프레임 전달", () => {
  const pc1Port: PortRef = { deviceId: TWO_PC.pc1.id, port: TWO_PC.port };

  test("한 장비가 보낸 프레임이 링크 반대쪽 장비에 1,000 뒤에 도착한다", () => {
    const pc1 = new FakeDevice(TWO_PC.pc1.id);
    const pc2 = new FakeDevice(TWO_PC.pc2.id);
    let frame: Frame | undefined;

    const trace = runWith(models(pc1, pc2), (ctx) => {
      const result = sent(ctx, twoPcDocument, pc1Port);
      frame = result.frame;
      expect(result.ok).toBe(true);
    });

    expect(pc2.arrivals).toHaveLength(1);
    expect(pc2.arrivals[0]!.port).toBe(TWO_PC.port);
    expect(pc2.arrivals[0]!.time).toBe(LINK_DELAY_MICROSECONDS);
    expect(pc2.arrivals[0]!.time).toBe(1_000);
    // 같은 프레임(같은 id, 같은 내용)이 그대로 도착한다
    expect(pc2.arrivals[0]!.frame).toBe(frame);
    expect(pc1.arrivals).toHaveLength(0);
    // 링크 계층은 이벤트를 기록하지 않는다. 보냄·받음 이벤트는 장비 모델이 기록한다
    expect(trace.events).toHaveLength(0);
  });

  test("받은 장비가 다른 포트로 내보내면 다음 장비에 다시 1,000 뒤에 도착한다", () => {
    const { pc1, pc2, sw1 } = TWO_PC_SWITCH;
    const document = twoPcSwitchDocument;
    const pcA = new FakeDevice(pc1.id);
    const pcB = new FakeDevice(pc2.id);
    // 받은 포트가 아닌 다른 포트로 그대로 넘기는 가짜 Switch
    const sw = new FakeDevice(sw1.id, (ctx, port, frame) => {
      const out = port === "FastEthernet0/1" ? "FastEthernet0/2" : "FastEthernet0/1";
      transmit(ctx, document, { deviceId: sw1.id, port: out }, frame);
    });

    runWith(models(pcA, pcB, sw), (ctx) => {
      sent(ctx, document, { deviceId: pc1.id, port: "Ethernet0" });
    });

    expect(sw.arrivals.map((a) => [a.port, a.time])).toEqual([["FastEthernet0/1", 1_000]]);
    expect(pcB.arrivals.map((a) => [a.port, a.time])).toEqual([["Ethernet0", 2_000]]);
    expect(pcA.arrivals).toHaveLength(0);
  });

  test("도착 처리에서 기록한 이벤트의 기본 부모는 보낸 쪽이 마지막으로 기록한 이벤트다", () => {
    const pc1 = new FakeDevice(TWO_PC.pc1.id);
    const pc2Device = findDevice(twoPcDocument, TWO_PC.pc2.id)!;
    const pc2 = new FakeDevice(TWO_PC.pc2.id, (ctx, port, frame) => {
      ctx.record({
        frame, deviceId: TWO_PC.pc2.id, inPort: port, layer: "L2", action: "receive",
        reason: { code: "FRAME_RECEIVED", params: { device: deviceRef(pc2Device), port } },
      });
    });
    const pc1Device = findDevice(twoPcDocument, TWO_PC.pc1.id)!;

    const trace = runWith(models(pc1, pc2), (ctx) => {
      const frame = ctx.createFrame(snapshot());
      ctx.record({
        frame, deviceId: TWO_PC.pc1.id, outPort: TWO_PC.port, linkId: TWO_PC.linkId, layer: "ARP", action: "create",
        reason: { code: "ARP_REQUEST_SENT", params: { device: deviceRef(pc1Device), senderIp: TWO_PC.pc1.ip, targetIp: TWO_PC.pc2.ip } },
      });
      transmit(ctx, twoPcDocument, pc1Port, frame);
    });

    expect(trace.events.map((event) => [event.seq, event.time, event.parentSeq, event.deviceId])).toEqual([
      [0, 0, undefined, TWO_PC.pc1.id],
      [1, 1_000, 0, TWO_PC.pc2.id],
    ]);
    expect(trace.events[1]!.frameId).toBe(trace.events[0]!.frameId);
    expect(validateTrace(trace).ok).toBe(true);
  });

  test("포트에 링크가 없으면 NO_LINK로 폐기하고 아무 데도 도착하지 않는다", () => {
    const unlinked: TopologyDocument = { ...twoPcDocument, links: [] };
    const pc1 = new FakeDevice(TWO_PC.pc1.id);
    const pc2 = new FakeDevice(TWO_PC.pc2.id);
    let ok: boolean | undefined;

    const trace = runWith(models(pc1, pc2), (ctx) => {
      ok = sent(ctx, unlinked, pc1Port).ok;
    });

    expect(ok).toBe(false);
    expect(pc2.arrivals).toHaveLength(0);
    expect(trace.events).toHaveLength(1);
    expect(trace.events[0]).toMatchObject({
      seq: 0,
      time: 0,
      frameId: 1,
      deviceId: TWO_PC.pc1.id,
      outPort: TWO_PC.port,
      layer: "L2",
      action: "drop",
      dropReason: "NO_LINK",
      reason: { code: "NO_LINK", params: { device: { deviceId: TWO_PC.pc1.id, deviceName: TWO_PC.pc1.name }, port: TWO_PC.port } },
    });
    expect(trace.events[0]!.inPort).toBeUndefined();
    expect(trace.events[0]!.linkId).toBeUndefined();
    expect(trace.result).toEqual({ status: "failed", primaryDropSeq: 0 });
  });

  test("폐기 이벤트에 명시한 parentSeq가 붙는다", () => {
    const unlinked: TopologyDocument = { ...twoPcDocument, links: [] };
    const pc1Device = findDevice(twoPcDocument, TWO_PC.pc1.id)!;

    const trace = runWith(models(new FakeDevice(TWO_PC.pc1.id)), (ctx) => {
      const frame = ctx.createFrame(snapshot());
      const seq = ctx.record({
        frame, deviceId: TWO_PC.pc1.id, outPort: TWO_PC.port, layer: "ARP", action: "create",
        reason: { code: "ARP_REQUEST_SENT", params: { device: deviceRef(pc1Device), senderIp: TWO_PC.pc1.ip, targetIp: TWO_PC.pc2.ip } },
      });
      transmit(ctx, unlinked, pc1Port, frame, seq);
    });

    expect(trace.events.map((event) => [event.action, event.parentSeq])).toEqual([["create", undefined], ["drop", 0]]);
  });

  test("shutdown한 Switch 포트로는 IF_DOWN으로 폐기한다", () => {
    const { pc1, sw1 } = TWO_PC_SWITCH;
    const document: TopologyDocument = {
      ...twoPcSwitchDocument,
      devices: twoPcSwitchDocument.devices.map((device) =>
        device.kind === "switch"
          ? { ...device, config: { ...device.config, ports: { "FastEthernet0/1": { adminUp: false, mode: "access" } } } }
          : device,
      ),
    };
    const pcA = new FakeDevice(pc1.id);
    const sw = new FakeDevice(sw1.id);

    const trace = runWith(models(pcA, sw), (ctx) => {
      sent(ctx, document, { deviceId: sw1.id, port: "FastEthernet0/1" });
    });

    expect(pcA.arrivals).toHaveLength(0);
    expect(trace.events).toHaveLength(1);
    expect(trace.events[0]).toMatchObject({
      deviceId: sw1.id,
      outPort: "FastEthernet0/1",
      layer: "L2",
      action: "drop",
      dropReason: "IF_DOWN",
      reason: { code: "IF_DOWN", params: { device: { deviceId: sw1.id, deviceName: sw1.name }, port: "FastEthernet0/1" } },
    });
  });

  test("꺼진 포트에 링크까지 없으면 IF_DOWN이 먼저다", () => {
    const { sw1 } = TWO_PC_SWITCH;
    const document: TopologyDocument = {
      ...twoPcSwitchDocument,
      links: [],
      devices: twoPcSwitchDocument.devices.map((device) =>
        device.kind === "switch"
          ? { ...device, config: { ...device.config, ports: { "FastEthernet0/5": { adminUp: false, mode: "access" } } } }
          : device,
      ),
    };

    const trace = runWith(models(new FakeDevice(sw1.id)), (ctx) => {
      sent(ctx, document, { deviceId: sw1.id, port: "FastEthernet0/5" });
    });

    expect(trace.events.map((event) => event.dropReason)).toEqual(["IF_DOWN"]);
  });

  test("설정한 적 없는 Router 인터페이스는 꺼져 있어 IF_DOWN, 켜면 도착한다", () => {
    const routerId = "00000000-0000-4000-8000-0000000000ee";
    const base: TopologyDocument = {
      schemaVersion: 1,
      devices: [
        twoPcDocument.devices[0]!,
        { id: routerId, kind: "router", name: "R1", position: { x: 0, y: 0 }, config: { interfaces: {}, staticRoutes: [] } },
      ],
      links: [{ id: TWO_PC.linkId, ends: [{ deviceId: routerId, port: "GigabitEthernet0/0" }, { deviceId: TWO_PC.pc1.id, port: TWO_PC.port }] }],
    };
    const from: PortRef = { deviceId: routerId, port: "GigabitEthernet0/0" };

    const pcDown = new FakeDevice(TWO_PC.pc1.id);
    const downTrace = runWith(models(pcDown, new FakeDevice(routerId)), (ctx) => {
      sent(ctx, base, from);
    });
    expect(pcDown.arrivals).toHaveLength(0);
    expect(downTrace.events.map((event) => event.dropReason)).toEqual(["IF_DOWN"]);

    const up: TopologyDocument = {
      ...base,
      devices: base.devices.map((device) =>
        device.kind === "router"
          ? { ...device, config: { ...device.config, interfaces: { "GigabitEthernet0/0": { adminUp: true } } } }
          : device,
      ),
    };
    const pcUp = new FakeDevice(TWO_PC.pc1.id);
    const upTrace = runWith(models(pcUp, new FakeDevice(routerId)), (ctx) => {
      sent(ctx, up, from);
    });
    expect(pcUp.arrivals.map((a) => [a.port, a.time])).toEqual([[TWO_PC.port, 1_000]]);
    expect(upTrace.events).toHaveLength(0);
  });

  test("상대 포트가 꺼져 있어도 보낸다. 받을지는 받는 장비가 정한다", () => {
    // Switch의 포트가 shutdown이면 그 Switch 모델이 IF_DOWN으로 폐기한다 (switchForward). 링크 계층은 모른 척한다
    const { pc1, sw1 } = TWO_PC_SWITCH;
    const document: TopologyDocument = {
      ...twoPcSwitchDocument,
      devices: twoPcSwitchDocument.devices.map((device) =>
        device.kind === "switch"
          ? { ...device, config: { ...device.config, ports: { "FastEthernet0/1": { adminUp: false, mode: "access" } } } }
          : device,
      ),
    };
    const sw = new FakeDevice(sw1.id);

    const trace = runWith(models(new FakeDevice(pc1.id), sw), (ctx) => {
      sent(ctx, document, { deviceId: pc1.id, port: "Ethernet0" });
    });

    expect(sw.arrivals.map((a) => [a.port, a.time])).toEqual([["FastEthernet0/1", 1_000]]);
    expect(trace.events).toHaveLength(0);
  });

  test("문서에 없는 장비에서 보내는 것은 내부 오류다", () => {
    expect(() =>
      runWith(models(), (ctx) => {
        sent(ctx, twoPcDocument, { deviceId: "missing", port: "Ethernet0" });
      }),
    ).toThrow(/device/i);
  });
});

describe("deviceRun: kernel 사건을 장비 모델에 넘기기", () => {
  test("타이머는 그 장비의 onTimer로 간다", () => {
    const pc1 = new FakeDevice(TWO_PC.pc1.id);
    const pc2 = new FakeDevice(TWO_PC.pc2.id);

    runWith(models(pc1, pc2), (ctx) => {
      ctx.setTimer(TWO_PC.pc2.id, "arp:wait", 2_000_000);
      ctx.setTimer(TWO_PC.pc1.id, "x", 5);
    });

    expect(pc1.timers.map((t) => [t.timer.key, t.time])).toEqual([["x", 5]]);
    expect(pc2.timers.map((t) => [t.timer.key, t.time])).toEqual([["arp:wait", 2_000_000]]);
  });

  test("모델이 없는 장비로 가는 프레임이나 타이머는 내부 오류다", () => {
    expect(() =>
      runWith(models(new FakeDevice(TWO_PC.pc1.id)), (ctx) => {
        ctx.sendFrame({ deviceId: TWO_PC.pc2.id, port: TWO_PC.port }, ctx.createFrame(snapshot()), 1);
      }),
    ).toThrow(/model/i);
    expect(() =>
      runWith(models(new FakeDevice(TWO_PC.pc1.id)), (ctx) => {
        ctx.setTimer(TWO_PC.pc2.id, "x", 1);
      }),
    ).toThrow(/model/i);
  });

  test("outcome을 그대로 kernel에 넘긴다", () => {
    const trace = createKernel().run(
      deviceRun({ docVersion: 3, models: models(), start: () => {}, outcome: () => "success" }),
    );
    expect(trace.result.status).toBe("success");
    expect(trace.docVersion).toBe(3);
  });
});
