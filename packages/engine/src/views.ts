// 화면에 보일 값의 계산 (AD-7). 포트 상태는 engine만 계산한다.
// Document에서 포트·라우팅 경로를 계산하고 Runtime이 ARP·MAC 테이블을 채운다.

import { PORT_NAMES } from "@ping9/shared";
import type { Device, DeviceView, PortStatus, PortView, TopologyDocument } from "@ping9/shared";

import { routingTable } from "./devices/router/routing";
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
        views[device.id] = { kind: "router", ports, arpTable: [], routingTable: routingTable(device.config, ports) };
        break;
    }
  }
  return views;
}
