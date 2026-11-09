// 화면에 보일 값의 계산 (AD-7). 포트 상태는 engine만 계산한다.
// 지금은 Document만으로 알 수 있는 값(포트 상태)만 채운다. 테이블(ARP, MAC, 라우팅)은
// 장비 모델이 생기면 DeviceModel.view()가 채운다 (T1.7.3, T1.8.3, T4.x).

import { PORT_NAMES } from "@ping9/shared";
import type { Device, DeviceView, PortStatus, PortView, TopologyDocument } from "@ping9/shared";

import { isAdminUp, portLink } from "./topology";
import type { PortLink } from "./topology";

export function computeViews(document: TopologyDocument): Record<string, DeviceView> {
  const devices = new Map(document.devices.map((device) => [device.id, device]));

  const statusOf = (device: Device, port: string, link: PortLink | undefined): PortStatus => {
    if (!isAdminUp(device, port)) return "admin-down";
    if (link === undefined) return "no-link";
    const peer = devices.get(link.peer.deviceId);
    if (peer === undefined || !isAdminUp(peer, link.peer.port)) return "peer-down";
    return "up";
  };

  const views: Record<string, DeviceView> = {};
  for (const device of document.devices) {
    const portNames: readonly string[] = PORT_NAMES[device.kind];
    const ports: PortView[] = portNames.map((name) => {
      const link = portLink(document, { deviceId: device.id, port: name });
      const status = statusOf(device, name, link);
      return link === undefined ? { name, status } : { name, status, linkId: link.linkId };
    });

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
