// Document에서 장비·포트·링크를 읽는 작은 함수들 (T1.7.2). 값을 계산할 뿐 Document를 바꾸지 않는다.
// 포트 상태 계산(views.ts)과 링크 전달(devices/link.ts)이 같은 규칙을 쓰도록 한곳에 둔다.

import { portIndex } from "@ping9/shared";
import type { Device, DeviceRef, PortRef, TopologyDocument } from "@ping9/shared";

import { macAddressFor } from "./mac";

/** 포트에 걸린 링크와 그 반대쪽 포트 */
export interface PortLink {
  readonly linkId: string;
  readonly peer: PortRef;
}

export function findDevice(document: TopologyDocument, deviceId: string): Device | undefined {
  return document.devices.find((device) => device.id === deviceId);
}

/** Trace 이벤트의 params에 넣을 장비 참조. 이름은 그 시점의 값이다 (AD-14) */
export function deviceRef(device: Device): DeviceRef {
  return { deviceId: device.id, deviceName: device.name };
}

const samePort = (a: PortRef, b: PortRef): boolean => a.deviceId === b.deviceId && a.port === b.port;

/** 포트에 연결된 링크. 없으면 undefined. 링크는 방향이 없어 양쪽 끝 어디서든 찾는다 */
export function portLink(document: TopologyDocument, ref: PortRef): PortLink | undefined {
  for (const link of document.links) {
    const [first, second] = link.ends;
    if (samePort(first, ref)) return { linkId: link.id, peer: second };
    if (samePort(second, ref)) return { linkId: link.id, peer: first };
  }
  return undefined;
}

/** 사용자가 켜 둔 포트인지. PC 포트는 칸이 없으면 켜짐(T0.14), Router 인터페이스는 설정 전에는 꺼져 있다 (FR-17) */
export function isAdminUp(device: Device, port: string): boolean {
  switch (device.kind) {
    case "pc":
      return device.config.adminUp ?? true;
    case "switch":
      // 구성에 없는 포트는 기본값(켜짐)이다
      return device.config.ports[port]?.adminUp ?? true;
    case "router":
      return device.config.interfaces[port]?.adminUp ?? false;
  }
}

/** 포트의 MAC 주소. 장비 ID와 포트 순번에서 계산한다 (AD-5). 그 종류에 없는 포트 이름이면 내부 오류다 */
export function portMac(device: Device, port: string): string {
  const index = portIndex(device.kind, port);
  if (index < 0) throw new RangeError(`Unknown port ${port} for ${device.kind}`);
  return macAddressFor(device.id, index);
}
