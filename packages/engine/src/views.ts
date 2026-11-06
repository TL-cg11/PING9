// 화면에 보일 값의 계산 (AD-7). 포트 상태는 engine만 계산한다.
// 지금은 Document만으로 알 수 있는 값(포트 상태)만 채운다. 테이블(ARP, MAC, 라우팅)은
// 장비 모델이 생기면 DeviceModel.view()가 채운다 (T1.7.3, T1.8.3, T4.x).

import { PORT_NAMES } from "@ping9/shared";
import type {
  Device,
  DeviceView,
  PortRef,
  PortStatus,
  PortView,
  TopologyDocument,
} from "@ping9/shared";

/** 사용자가 켜 둔 포트인지. PC의 포트는 끌 수 없다 */
function isAdminUp(device: Device, port: string): boolean {
  switch (device.kind) {
    case "pc":
      return true;
    case "switch":
      // 구성에 없는 포트는 기본값(켜짐)이다
      return device.config.ports[port]?.adminUp ?? true;
    case "router":
      // Router 인터페이스는 기본적으로 꺼져 있다 (T4.1.1, FR-17).
      return device.config.interfaces[port]?.adminUp ?? false;
  }
}

interface PortLink {
  readonly linkId: string;
  readonly peer: PortRef;
}

function portKey(ref: PortRef): string {
  return `${ref.deviceId} ${ref.port}`;
}

export function computeViews(document: TopologyDocument): Record<string, DeviceView> {
  const devices = new Map(document.devices.map((device) => [device.id, device]));

  const linkByPort = new Map<string, PortLink>();
  for (const link of document.links) {
    const [first, second] = link.ends;
    linkByPort.set(portKey(first), { linkId: link.id, peer: second });
    linkByPort.set(portKey(second), { linkId: link.id, peer: first });
  }

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
      const link = linkByPort.get(portKey({ deviceId: device.id, port: name }));
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
