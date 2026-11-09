// 라우팅 계산은 패킷 전송과 분리한다. 이후 Router DeviceModel.view()에서도 재사용한다.
import { networkAddress, PORT_NAMES } from "@ping9/shared";
import type { PortView, RouteEntryView, RouterConfig } from "@ping9/shared";

/** 실제 나가는 포트를 포함한 사용 가능한 경로. */
export interface RoutingEntry extends RouteEntryView {
  readonly port: string;
}

export function connectedRoutes(config: RouterConfig, ports: readonly PortView[]): readonly RoutingEntry[] {
  return PORT_NAMES.router.flatMap(port => {
    const iface = config.interfaces[port];
    if (!iface?.adminUp || iface.ip === undefined || iface.mask === undefined ||
      !ports.some(view => view.name === port && view.status === "up")) return [];
    const network = networkAddress(iface.ip, iface.mask);
    return network === null ? [] : [{ source: "connected" as const, network, mask: iface.mask, port }];
  });
}
