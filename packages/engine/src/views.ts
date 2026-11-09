// 화면에 보일 값의 계산 (AD-7). 포트 상태는 engine만 계산한다.
// Document에서 포트 상태와 라우팅 경로를 계산한다. Runtime은 PC 모델의 ARP 테이블을 이 결과 위에 채운다.
// Switch·Router의 동적 상태와 패킷 전달 모델은 후속 작업이다.

import { PORT_NAMES } from "@ping9/shared";
import type { Device, DeviceView, PortStatus, PortView, TopologyDocument } from "@ping9/shared";

import { routingTable } from "./devices/router/routing";
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
        views[device.id] = { kind: "router", ports, arpTable: [], routingTable: routingTable(device.config, ports) };
        break;
    }
  }
  return views;
}
