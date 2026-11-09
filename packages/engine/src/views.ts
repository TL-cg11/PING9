// 화면에 보일 값의 계산 (AD-7). 포트 상태는 engine만 계산한다.
// Document만으로 알 수 있는 값(포트 상태)을 채운다. 테이블(ARP, MAC, 라우팅)은
// 장비 모델이 가진 동적 상태라 Runtime이 이 결과 위에 채운다 (PC의 ARP는 T1.8.3, Switch의 MAC은 T5.2.2, Router는 E4).

import { PORT_NAMES } from "@ping9/shared";
import type { Device, DeviceView, PortStatus, PortView, TopologyDocument } from "@ping9/shared";

import { findDevice, isAdminUp, portLink } from "./topology";
import type { PortLink } from "./topology";

function statusOf(document: TopologyDocument, device: Device, port: string, link: PortLink | undefined): PortStatus {
  if (!isAdminUp(device, port)) return "admin-down";
  if (link === undefined) return "no-link";
  const peer = findDevice(document, link.peer.deviceId);
  if (peer === undefined || !isAdminUp(peer, link.peer.port)) return "peer-down";
  return "up";
}

/**
 * 장비 하나의 포트 상태. 화면(`computeViews`)과 Switch 모델이 같은 규칙을 쓴다 (AD-7).
 * Switch 모델은 프레임마다 부르므로 문서 전체가 아니라 그 장비의 포트만 계산한다.
 */
export function portViewsOf(document: TopologyDocument, device: Device): PortView[] {
  const portNames: readonly string[] = PORT_NAMES[device.kind];
  return portNames.map((name) => {
    const link = portLink(document, { deviceId: device.id, port: name });
    const status = statusOf(document, device, name, link);
    return link === undefined ? { name, status } : { name, status, linkId: link.linkId };
  });
}

export function computeViews(document: TopologyDocument): Record<string, DeviceView> {
  const views: Record<string, DeviceView> = {};
  for (const device of document.devices) {
    const ports = portViewsOf(document, device);
    switch (device.kind) {
      case "pc":
        views[device.id] = { kind: "pc", ports, arpTable: [] };
        break;
      case "switch":
        views[device.id] = { kind: "switch", ports, macTable: [] };
        break;
      case "router":
        views[device.id] = { kind: "router", ports, arpTable: [], routingTable: [] };
        break;
    }
  }
  return views;
}
