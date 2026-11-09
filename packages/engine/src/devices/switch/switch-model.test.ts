// Switch 모델 (T5.2.2): switchForward를 kernel에 연결한다. 진짜 kernel 위에서 가짜 PC 둘과 돈다.
import { BROADCAST_MAC, validateTrace } from "@ping9/shared";
import type { DeviceView, FrameSnapshot, SwitchDevice, TopologyDocument, Trace, TraceEvent } from "@ping9/shared";
import { TWO_PC_SWITCH, TWO_SWITCH_VLAN, twoPcSwitchDocument, twoSwitchVlanDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { createKernel } from "../../kernel";
import type { Frame, SimContext } from "../../kernel";
import { findDevice, portMac } from "../../topology";
import { deviceRun, transmit } from "../link";
import type { DeviceModel } from "../model";
import { SwitchModel } from "./switch-model";

const FA = (n: number) => `FastEthernet0/${n}`;
const PC_PORT = "Ethernet0";
const EMPTY_VIEW: DeviceView = { kind: "pc", ports: [], arpTable: [] };

/** 받은 것을 적어 두기만 하는 가짜 PC */
class FakePc implements DeviceModel {
  readonly arrivals: { readonly port: string; readonly frame: Frame; readonly time: number }[] = [];
  constructor(readonly deviceId: string) {}
  onFrame(ctx: SimContext, port: string, frame: Frame): void {
    this.arrivals.push({ port, frame, time: ctx.now() });
  }
  onTimer(): void {}
  onConfigChanged(): void {}
  view(): DeviceView {
    return EMPTY_VIEW;
  }
}

function macOf(document: TopologyDocument, deviceId: string): string {
  return portMac(findDevice(document, deviceId)!, PC_PORT);
}

/** `from` PC가 `to` MAC으로 보내는 프레임의 내용. ARP 요청 모양이다 */
function frameTo(document: TopologyDocument, from: string, to: string): FrameSnapshot {
  return {
    ethernet: { sourceMac: macOf(document, from), destinationMac: to },
    arp: {
      operation: "request",
      senderMac: macOf(document, from),
      senderIp: "0.0.0.0",
      targetMac: "00:00:00:00:00:00",
      targetIp: "0.0.0.0",
    },
  };
}

interface World {
  readonly document: TopologyDocument;
  readonly pcs: Map<string, FakePc>;
  readonly switches: Map<string, SwitchModel>;
  readonly models: Map<string, DeviceModel>;
  readonly setNow: (value: number) => void;
}

function world(document: TopologyDocument): World {
  let clock = 0;
  const pcs = new Map<string, FakePc>();
  const switches = new Map<string, SwitchModel>();
  const models = new Map<string, DeviceModel>();
  for (const device of document.devices) {
    if (device.kind === "pc") {
      const pc = new FakePc(device.id);
      pcs.set(device.id, pc);
      models.set(device.id, pc);
    } else if (device.kind === "switch") {
      const model = new SwitchModel(device.id, () => document, () => clock);
      switches.set(device.id, model);
      models.set(device.id, model);
    }
  }
  return {
    document,
    pcs,
    switches,
    models,
    setNow: (value) => {
      clock = value;
    },
  };
}

/** `from` PC가 `to`로 프레임 하나를 보내는 회차 */
function send(w: World, from: string, to: string, outcome?: () => "success" | "failed"): Trace {
  return createKernel().run(
    deviceRun({
      docVersion: 1,
      models: w.models,
      start: (ctx) => {
        transmit(ctx, w.document, { deviceId: from, port: PC_PORT }, ctx.createFrame(frameTo(w.document, from, to)));
      },
      ...(outcome === undefined ? {} : { outcome }),
    }),
  );
}

const codes = (trace: Trace, deviceId: string) =>
  trace.events.filter((event) => event.deviceId === deviceId).map((event) => event.reason.code);
const eventOf = (trace: Trace, code: string): TraceEvent => {
  const found = trace.events.find((event) => event.reason.code === code);
  if (found === undefined) throw new Error(`no event ${code}`);
  return found;
};
const drops = (trace: Trace, deviceId?: string) =>
  trace.events.filter((event) => event.action === "drop" && (deviceId === undefined || event.deviceId === deviceId));

describe("SwitchModel: PC 2대와 Switch 1대", () => {
  const { pc1, pc2, sw1 } = TWO_PC_SWITCH;

  test("브로드캐스트: 받음 → 학습 → 켜진 다른 포트로 flooding. 1,000µs씩 늦게 도착한다", () => {
    const w = world(twoPcSwitchDocument);

    const trace = send(w, pc1.id, BROADCAST_MAC);

    expect(codes(trace, sw1.id)).toEqual(["FRAME_RECEIVED", "MAC_LEARNED", "FRAME_FLOODED"]);
    const received = eventOf(trace, "FRAME_RECEIVED");
    const learned = eventOf(trace, "MAC_LEARNED");
    const flooded = eventOf(trace, "FRAME_FLOODED");
    expect(received).toMatchObject({ deviceId: sw1.id, inPort: FA(1), layer: "L2", action: "receive", time: 1_000 });
    expect(received.reason.params).toEqual({ device: { deviceId: sw1.id, deviceName: "SW1" }, port: FA(1) });
    expect(learned).toMatchObject({ action: "learn", parentSeq: received.seq });
    expect(learned.reason.params).toMatchObject({ mac: macOf(w.document, pc1.id), port: FA(1), vlan: 1 });
    expect(flooded).toMatchObject({ action: "forward", inPort: FA(1), outPort: FA(2), parentSeq: learned.seq });
    expect(flooded.linkId).toBeDefined();
    expect(flooded.reason.params).toMatchObject({ port: FA(2), vlan: 1, broadcast: true });
    // 링크가 없는 Fa0/3~8로는 나가지 않고, 그것을 폐기로 적지도 않는다
    expect(drops(trace)).toEqual([]);

    const pc2Model = w.pcs.get(pc2.id)!;
    expect(pc2Model.arrivals).toHaveLength(1);
    expect(pc2Model.arrivals[0]).toMatchObject({ port: PC_PORT, time: 2_000 });
    expect(pc2Model.arrivals[0]!.frame.id).toBe(flooded.frameId);
    expect(validateTrace(trace).ok).toBe(true);
  });

  test("배운 목적지로는 그 포트 하나로만 보낸다 (FRAME_FORWARDED)", () => {
    const w = world(twoPcSwitchDocument);
    send(w, pc1.id, BROADCAST_MAC);

    const trace = send(w, pc2.id, macOf(w.document, pc1.id));

    expect(codes(trace, sw1.id)).toEqual(["FRAME_RECEIVED", "MAC_LEARNED", "FRAME_FORWARDED"]);
    const forwarded = eventOf(trace, "FRAME_FORWARDED");
    expect(forwarded).toMatchObject({ inPort: FA(2), outPort: FA(1), action: "forward" });
    expect(forwarded.reason.params).toMatchObject({ mac: macOf(w.document, pc1.id), port: FA(1) });
    expect(w.pcs.get(pc1.id)!.arrivals).toHaveLength(1);
    // PC2에 닿은 것은 앞의 브로드캐스트 하나뿐이다
    expect(w.pcs.get(pc2.id)!.arrivals).toHaveLength(1);
  });

  test("모르는 유니캐스트도 flooding이고 broadcast는 false다", () => {
    const w = world(twoPcSwitchDocument);

    const trace = send(w, pc1.id, "02:00:00:00:99:00");

    expect(eventOf(trace, "FRAME_FLOODED").reason.params).toMatchObject({ broadcast: false });
  });

  test("목적지가 받은 포트에 있으면 받음만 남기고 아무 데로도 보내지 않는다", () => {
    const w = world(twoPcSwitchDocument);
    send(w, pc1.id, BROADCAST_MAC);

    const trace = send(w, pc1.id, macOf(w.document, pc1.id));

    expect(codes(trace, sw1.id)).toEqual(["FRAME_RECEIVED"]);
    expect(drops(trace)).toEqual([]);
    // PC2에 닿은 것은 앞의 브로드캐스트 하나뿐이다
    expect(w.pcs.get(pc2.id)!.arrivals).toHaveLength(1);
  });

  test("같은 포트에서 다시 보면 MAC_LEARNED를 다시 적지 않는다", () => {
    const w = world(twoPcSwitchDocument);
    send(w, pc1.id, BROADCAST_MAC);

    const trace = send(w, pc1.id, BROADCAST_MAC);

    expect(codes(trace, sw1.id)).toEqual(["FRAME_RECEIVED", "FRAME_FLOODED"]);
  });

  test("꺼진 포트로 들어온 프레임은 IF_DOWN으로 폐기하고 받음도 적지 않는다", () => {
    const document: TopologyDocument = {
      ...twoPcSwitchDocument,
      devices: twoPcSwitchDocument.devices.map((device) =>
        device.id === sw1.id && device.kind === "switch"
          ? { ...device, config: { ...device.config, ports: { [FA(1)]: { adminUp: false, mode: "access" } } } }
          : device,
      ),
    };
    const w = world(document);

    const trace = send(w, pc1.id, BROADCAST_MAC, () => "failed");

    expect(codes(trace, sw1.id)).toEqual(["IF_DOWN"]);
    const drop = eventOf(trace, "IF_DOWN");
    expect(drop).toMatchObject({ action: "drop", inPort: FA(1), dropReason: "IF_DOWN" });
    expect(trace.result).toEqual({ status: "failed", primaryDropSeq: drop.seq });
  });

  test("view(): 배운 주소가 화면용 목록으로 나오고, 300초가 지나면 빠진다", () => {
    const w = world(twoPcSwitchDocument);
    send(w, pc1.id, BROADCAST_MAC);
    const model = w.switches.get(sw1.id)!;

    expect(model.view()).toMatchObject({
      kind: "switch",
      macTable: [{ mac: macOf(w.document, pc1.id), port: FA(1), vlan: 1 }],
    });
    expect(model.view().ports).toHaveLength(8);

    // 주소를 본 시각은 1,000µs다. 그로부터 300초가 지나야 빠진다
    w.setNow(1_000 + 300_000_000 - 1);
    expect(model.macTable()).toHaveLength(1);
    w.setNow(1_000 + 300_000_000);
    expect(model.macTable()).toEqual([]);
  });

  test("onConfigChanged: 포트의 VLAN이 바뀌면 그 포트의 항목을 지운다", () => {
    const w = world(twoPcSwitchDocument);
    send(w, pc1.id, BROADCAST_MAC);
    const model = w.switches.get(sw1.id)!;
    const changed: TopologyDocument = {
      ...twoPcSwitchDocument,
      devices: twoPcSwitchDocument.devices.map((device) =>
        device.id === sw1.id && device.kind === "switch"
          ? {
              ...device,
              config: {
                vlans: [
                  { id: 1, name: "default" },
                  { id: 10, name: "VLAN0010" },
                ],
                ports: { [FA(1)]: { adminUp: true, mode: "access", accessVlan: 10 } },
              },
            }
          : device,
      ),
    };

    model.onConfigChanged({ previous: twoPcSwitchDocument, document: changed });

    expect(model.macTable()).toEqual([]);
  });

  test("onConfigChanged: 관계없는 변경에는 테이블이 그대로다", () => {
    const w = world(twoPcSwitchDocument);
    send(w, pc1.id, BROADCAST_MAC);
    const model = w.switches.get(sw1.id)!;
    const renamed: TopologyDocument = {
      ...twoPcSwitchDocument,
      devices: twoPcSwitchDocument.devices.map((device) =>
        device.id === sw1.id ? { ...device, name: "CORE" } : device,
      ),
    };

    model.onConfigChanged({ previous: twoPcSwitchDocument, document: renamed });

    expect(model.macTable()).toHaveLength(1);
  });
});

describe("SwitchModel: VLAN과 trunk (예시 문서: SW1 trunk 10·20, SW2 trunk 20)", () => {
  const { pc1, pc2, pc3, pc4, sw1, sw2 } = TWO_SWITCH_VLAN;
  const switchIds: readonly string[] = [sw1.id, sw2.id];

  test("VLAN 10의 브로드캐스트는 trunk로 태그 10을 달고 나가고, SW2가 TRUNK_NOT_ALLOWED로 버린다", () => {
    const w = world(twoSwitchVlanDocument);

    const trace = send(w, pc1.id, BROADCAST_MAC, () => "failed");

    expect(codes(trace, sw1.id)).toEqual(["FRAME_RECEIVED", "MAC_LEARNED", "FRAME_FLOODED"]);
    const flooded = eventOf(trace, "FRAME_FLOODED");
    expect(flooded).toMatchObject({ outPort: FA(8) });
    expect(flooded.frame.ethernet.vlanTag).toBe(10);
    expect(flooded.reason.params).toMatchObject({ vlan: 10 });

    expect(codes(trace, sw2.id)).toEqual(["TRUNK_NOT_ALLOWED"]);
    const drop = eventOf(trace, "TRUNK_NOT_ALLOWED");
    expect(drop).toMatchObject({ deviceId: sw2.id, inPort: FA(8), action: "drop", dropReason: "TRUNK_NOT_ALLOWED" });
    expect(drop.reason.params).toEqual({ device: { deviceId: sw2.id, deviceName: "SW2" }, port: FA(8), vlan: 10 });
    expect(drop.frame.ethernet.vlanTag).toBe(10);
    expect(trace.result).toEqual({ status: "failed", primaryDropSeq: drop.seq });
    // PC3에는 닿지 않는다
    expect(w.pcs.get(pc3.id)!.arrivals).toHaveLength(0);
    expect(validateTrace(trace).ok).toBe(true);
  });

  test("VLAN 20의 브로드캐스트는 trunk를 건너 SW2의 VLAN 20 포트로만 태그 없이 나간다", () => {
    const w = world(twoSwitchVlanDocument);

    const trace = send(w, pc2.id, BROADCAST_MAC);

    expect(codes(trace, sw2.id)).toEqual(["FRAME_RECEIVED", "MAC_LEARNED", "FRAME_FLOODED"]);
    const arrivals = w.pcs.get(pc4.id)!.arrivals;
    expect(arrivals).toHaveLength(1);
    expect(arrivals[0]!.frame.snapshot.ethernet.vlanTag).toBeUndefined();
    // PC2 → SW1 → SW2 → PC4: 링크 셋
    expect(arrivals[0]!.time).toBe(3_000);
    expect(w.pcs.get(pc3.id)!.arrivals).toHaveLength(0);
    // 같은 프레임이 태그만 바뀌며 지나간다 (frameId 유지)
    expect(new Set(trace.events.map((event) => event.frameId)).size).toBe(1);
    expect(w.switches.get(sw2.id)!.macTable()).toEqual([{ mac: macOf(w.document, pc2.id), port: FA(8), vlan: 20 }]);
  });

  test("한 스위치 안에서 다른 VLAN의 포트로만 갈 수 있으면 VLAN_BLOCKED 폐기를 남긴다", () => {
    // trunk 선을 빼면 PC1(VLAN 10)이 PC2(VLAN 20)의 MAC으로 보낸 프레임은 SW1에서 갈 곳이 없다
    const trunkless: TopologyDocument = {
      ...twoSwitchVlanDocument,
      links: twoSwitchVlanDocument.links.filter((link) => !link.ends.every((end) => switchIds.includes(end.deviceId))),
    };
    const w = world(trunkless);

    const trace = send(w, pc1.id, macOf(w.document, pc2.id), () => "failed");

    expect(codes(trace, sw1.id)).toEqual(["FRAME_RECEIVED", "MAC_LEARNED", "VLAN_BLOCKED"]);
    const drop = eventOf(trace, "VLAN_BLOCKED");
    expect(drop).toMatchObject({ action: "drop", inPort: FA(1), outPort: FA(2) });
    expect(drop.reason.params).toEqual({
      device: { deviceId: sw1.id, deviceName: "SW1" },
      frameVlan: 10,
      port: FA(2),
      portVlan: 20,
    });
    expect(trace.result).toEqual({ status: "failed", primaryDropSeq: drop.seq });
    expect(w.pcs.get(pc2.id)!.arrivals).toHaveLength(0);
  });

  test("다른 포트로 나갔으면 VLAN 때문에 빠진 포트를 폐기로 적지 않는다", () => {
    const w = world(twoSwitchVlanDocument);

    const trace = send(w, pc1.id, BROADCAST_MAC, () => "failed");

    // Fa0/2(VLAN 20)는 빠졌지만 trunk Fa0/8로는 나갔다
    expect(codes(trace, sw1.id)).toEqual(["FRAME_RECEIVED", "MAC_LEARNED", "FRAME_FLOODED"]);
    expect(drops(trace, sw1.id)).toEqual([]);
  });

  test("SW2의 trunk가 10을 허용하면 VLAN 10도 건너간다", () => {
    const allowed: TopologyDocument = {
      ...twoSwitchVlanDocument,
      devices: twoSwitchVlanDocument.devices.map((device) =>
        device.id === sw2.id && device.kind === "switch"
          ? ({
              ...device,
              config: {
                ...device.config,
                ports: { ...device.config.ports, [FA(8)]: { adminUp: true, mode: "trunk", allowedVlans: [[10, 20]] } },
              },
            } satisfies SwitchDevice)
          : device,
      ),
    };
    const w = world(allowed);

    send(w, pc1.id, BROADCAST_MAC);

    expect(w.pcs.get(pc3.id)!.arrivals).toHaveLength(1);
    expect(w.pcs.get(pc4.id)!.arrivals).toHaveLength(0);
  });
});
