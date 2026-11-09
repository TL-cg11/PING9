// T1.7.2: Ethernet 포트와 링크 전달. 장비 모델이 포트로 내보낸 프레임을 링크 반대쪽 포트에 1,000µs 뒤 도착하게 한다.
// 장비 종류를 모른다. 보냄·받음 이벤트는 장비 모델이 기록하고, 여기서는 보낼 수 없을 때의 폐기만 기록한다.

import { LINK_DELAY_MICROSECONDS } from "@ping9/shared";
import type { PortRef } from "@ping9/shared";
import type { TopologyDocument } from "@ping9/shared";

import type { Frame, KernelRun, SimContext } from "../kernel";
import { deviceRef, findDevice, isAdminUp, portLink } from "../topology";
import type { DeviceModel } from "./model";

/**
 * `from` 포트로 프레임을 내보낸다. 보냈으면 true.
 * - 포트가 꺼져 있으면(shutdown, 설정 전 Router 인터페이스) `IF_DOWN`으로 폐기한다.
 * - 링크가 없으면 `NO_LINK`로 폐기한다.
 * - 상대 포트가 꺼져 있는지는 보지 않는다. 받은 장비가 자기 포트 상태로 판단한다 (Switch는 `switchForward`의 `IF_DOWN`).
 *
 * `parentSeq`는 폐기 이벤트와 도착 사건의 원인이다. 없으면 kernel의 기본값이다:
 * 도착 사건은 이 처리에서 마지막으로 기록한 이벤트, 폐기 이벤트는 이 처리를 일으킨 사건.
 */
export function transmit(
  ctx: SimContext,
  document: TopologyDocument,
  from: PortRef,
  frame: Frame,
  parentSeq?: number,
): boolean {
  const device = findDevice(document, from.deviceId);
  if (device === undefined) throw new Error(`transmit: device ${from.deviceId} is not in the document`);

  const drop = (code: "IF_DOWN" | "NO_LINK"): false => {
    ctx.record({
      frame,
      deviceId: device.id,
      outPort: from.port,
      layer: "L2",
      action: "drop",
      reason: { code, params: { device: deviceRef(device), port: from.port } },
      ...(parentSeq === undefined ? {} : { parentSeq }),
    });
    return false;
  };

  if (!isAdminUp(device, from.port)) return drop("IF_DOWN");
  const link = portLink(document, from);
  if (link === undefined) return drop("NO_LINK");

  ctx.sendFrame(link.peer, frame, LINK_DELAY_MICROSECONDS, parentSeq);
  return true;
}

export interface DeviceRunInput {
  readonly docVersion: number;
  /** 장비 ID별 모델. 문서의 모든 장비가 있어야 한다 */
  readonly models: ReadonlyMap<string, DeviceModel>;
  readonly start: (ctx: SimContext) => void;
  readonly outcome?: () => "success" | "failed";
}

/** kernel의 프레임 도착·타이머 만료 사건을 해당 장비 모델에 넘기는 `KernelRun`을 만든다 */
export function deviceRun(input: DeviceRunInput): KernelRun {
  const modelOf = (deviceId: string): DeviceModel => {
    const model = input.models.get(deviceId);
    if (model === undefined) throw new Error(`No device model for ${deviceId}`);
    return model;
  };

  return {
    docVersion: input.docVersion,
    start: input.start,
    onFrame: (ctx, target, frame) => modelOf(target.deviceId).onFrame(ctx, target.port, frame),
    onTimer: (ctx, timer) => modelOf(timer.deviceId).onTimer(ctx, timer),
    ...(input.outcome === undefined ? {} : { outcome: input.outcome }),
  };
}
