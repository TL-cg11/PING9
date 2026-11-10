// T5.2.2: Switch 모델. 전달 규칙(switchForward, T1.7.3)을 kernel에 연결한다.
// 구성(포트 모드, VLAN, 링크)은 복사하지 않고 매번 지금 Document에서 읽는다 (PC 모델과 같은 방식).
// 모델이 들고 있는 것은 Document에 없는 동적 상태(MAC 주소 테이블)뿐이다.
// 이벤트 기록은 설계 6.4절: 받음 → 학습 → 포트마다 전달 하나. 폐기는 프레임이 여기서 끝날 때만 적는다.

import { BROADCAST_MAC } from "@ping9/shared";
import type { Device, DeviceView, DropReason, Reason, SwitchDevice, TopologyDocument } from "@ping9/shared";

import type { Frame, SimContext } from "../../kernel";
import { deviceRef, findDevice, portLink } from "../../topology";
import { portViewsOf } from "../../views";
import { transmit } from "../link";
import type { ConfigChange, DeviceModel } from "../model";
import { EMPTY_MAC_TABLE, macTableView, pruneMacTable, switchForward } from "./forwarding";
import type { MacTable, SwitchDrop } from "./forwarding";

function switchIn(document: TopologyDocument, deviceId: string): SwitchDevice | undefined {
  const device = findDevice(document, deviceId);
  return device?.kind === "switch" ? device : undefined;
}

/** 포트 상태는 화면과 같은 계산으로 읽는다 (AD-7). 이 Switch의 포트만 계산한다 */
function portUpChecker(document: TopologyDocument, device: SwitchDevice): (port: string) => boolean {
  const ports = portViewsOf(document, device);
  return (port) => ports.find((candidate) => candidate.name === port)?.status === "up";
}

/** 전달 규칙이 낸 폐기에 장비 참조를 붙여 Trace의 사유로 만든다 */
function dropReason(device: Device, drop: SwitchDrop): Reason<DropReason> {
  return { code: drop.reason, params: { device: deviceRef(device), ...drop.params } } as Reason<DropReason>;
}

export class SwitchModel implements DeviceModel {
  readonly deviceId: string;
  readonly #getDocument: () => TopologyDocument;
  /** 화면용 목록에서 만료를 판단할 가상 시각. kernel 실행 밖에서도 불려 Runtime이 kernel.now를 넘긴다 */
  readonly #now: () => number;
  #table: MacTable = EMPTY_MAC_TABLE;

  constructor(deviceId: string, getDocument: () => TopologyDocument, now: () => number) {
    this.deviceId = deviceId;
    this.#getDocument = getDocument;
    this.#now = now;
  }

  onFrame(ctx: SimContext, port: string, frame: Frame): void {
    const document = this.#getDocument();
    const device = switchIn(document, this.deviceId);
    if (device === undefined) throw new Error(`SwitchModel: switch ${this.deviceId} is not in the document`);
    const ref = deviceRef(device);

    const result = switchForward({
      config: device.config,
      isPortUp: portUpChecker(document, device),
      macTable: this.#table,
      now: ctx.now(),
      inPort: port,
      frame: frame.snapshot.ethernet,
    });
    this.#table = result.macTable;

    // 들어오다 폐기: 받음을 적지 않고 폐기 하나만 남긴다. 꺼진 포트나 허용되지 않은 VLAN이다
    if (result.ingressDrop !== undefined) {
      ctx.record({
        frame,
        deviceId: this.deviceId,
        inPort: port,
        layer: "L2",
        action: "drop",
        reason: dropReason(device, result.ingressDrop),
      });
      return;
    }
    // 들어오다 폐기되지 않은 프레임은 반드시 VLAN이 정해져 있다 (switchForward의 규칙)
    const vlan = result.vlan;
    if (vlan === undefined) throw new Error("switchForward: a frame that was not dropped has no VLAN");

    const receivedSeq = ctx.record({
      frame,
      deviceId: this.deviceId,
      inPort: port,
      layer: "L2",
      action: "receive",
      reason: { code: "FRAME_RECEIVED", params: { device: ref, port } },
    });
    let causeSeq = receivedSeq;
    if (result.learned !== undefined) {
      causeSeq = ctx.record({
        frame,
        deviceId: this.deviceId,
        inPort: port,
        layer: "L2",
        action: "learn",
        reason: { code: "MAC_LEARNED", params: { device: ref, ...result.learned } },
        parentSeq: receivedSeq,
      });
    }

    // 목적지가 받은 포트 쪽에 있으면 보내지 않는다. 정상 동작이라 폐기로 적지 않는다
    if (result.samePort) return;

    for (const output of result.outputs) {
      const outFrame = this.#retagged(ctx, frame, output.vlanTag);
      const linkId = portLink(document, { deviceId: this.deviceId, port: output.port })?.linkId;
      const seq = ctx.record({
        frame: outFrame,
        deviceId: this.deviceId,
        inPort: port,
        outPort: output.port,
        ...(linkId === undefined ? {} : { linkId }),
        layer: "L2",
        action: "forward",
        reason: output.flooded
          ? {
              code: "FRAME_FLOODED",
              params: { device: ref, port: output.port, vlan, broadcast: isBroadcast(frame) },
            }
          : {
              code: "FRAME_FORWARDED",
              params: { device: ref, mac: frame.snapshot.ethernet.destinationMac.toLowerCase(), port: output.port },
            },
        parentSeq: causeSeq,
      });
      transmit(ctx, document, { deviceId: this.deviceId, port: output.port }, outFrame, seq);
    }

    // 어디로도 나가지 못했을 때만 VLAN 때문에 빠진 포트를 폐기로 적는다.
    // 다른 포트로 나갔으면 통신은 이어지는 것이라, 실패 원인(primaryDropSeq)으로 잡히지 않게 적지 않는다
    if (result.outputs.length === 0) {
      for (const blocked of result.blocked) {
        ctx.record({
          frame,
          deviceId: this.deviceId,
          inPort: port,
          outPort: blocked.params.port,
          layer: "L2",
          action: "drop",
          reason: dropReason(device, blocked),
          parentSeq: causeSeq,
        });
      }
    }
  }

  /** Switch는 타이머를 쓰지 않는다. 만료는 프레임을 받을 때와 view()에서 시각으로 판단한다 */
  onTimer(): void {}

  /** 포트 모드·VLAN·링크·shutdown이 바뀌어 쓸 수 없게 된 항목을 지운다 (설계 6.3절) */
  onConfigChanged(change: ConfigChange): void {
    const before = switchIn(change.previous, this.deviceId);
    const after = switchIn(change.document, this.deviceId);
    if (after === undefined) return;
    this.#table = pruneMacTable(this.#table, {
      config: after.config,
      isPortUp: portUpChecker(change.document, after),
      ...(before === undefined ? {} : { previousConfig: before.config }),
    });
  }

  /**
   * 지금 테이블로 되돌리는 함수. 실행이 중간에 멈췄을 때(아직 모델이 없는 장비에 닿음) Runtime이 부른다.
   * 테이블은 변경 불가능한 값이라 참조만 들고 있으면 된다
   */
  checkpoint(): () => void {
    const table = this.#table;
    return () => {
      this.#table = table;
    };
  }

  /** 화면과 `show mac address-table`에 보일 목록 */
  macTable() {
    return macTableView(this.#table, this.#now());
  }

  /** 문서에 이 Switch가 있는 동안만 부른다 (PC 모델과 같다). Runtime은 `macTable()`로 채운다 */
  view(): DeviceView {
    const device = switchIn(this.#getDocument(), this.deviceId);
    if (device === undefined) throw new Error(`SwitchModel: switch ${this.deviceId} is not in the document`);
    return { kind: "switch", ports: portViewsOf(this.#getDocument(), device), macTable: this.macTable() };
  }

  /** 나갈 포트의 태그에 맞춘 프레임. 태그가 같으면 그 프레임 그대로다 (frameId 유지) */
  #retagged(ctx: SimContext, frame: Frame, vlanTag: number | undefined): Frame {
    const { ethernet } = frame.snapshot;
    if (ethernet.vlanTag === vlanTag) return frame;
    // 태그를 뗄 때는 키 자체를 뺀다. 스냅샷 스키마는 없는 값을 키가 없는 것으로만 받는다
    // (lint가 안 쓰는 나머지 구조 분해를 막아 필드를 이름으로 옮긴다. EthernetHeader에 필드가 늘면 여기도 늘린다)
    const untagged = { sourceMac: ethernet.sourceMac, destinationMac: ethernet.destinationMac };
    return ctx.updateFrame(frame, {
      ...frame.snapshot,
      ethernet: vlanTag === undefined ? untagged : { ...untagged, vlanTag },
    });
  }
}

const isBroadcast = (frame: Frame): boolean =>
  frame.snapshot.ethernet.destinationMac.toLowerCase() === BROADCAST_MAC;
