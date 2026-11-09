// 라우팅 계산은 패킷 전송과 분리한다. 이후 Router DeviceModel.view()에서도 재사용한다.
import { checkInterfaceAddress, isSameNetwork, networkAddress, PORT_NAMES } from "@ping9/shared";
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

/** 정적 경로의 다음 홉은 켜진 직접 연결망으로만 해석한다. 재귀 경로는 사용하지 않는다. */
export function routingTable(config: RouterConfig, ports: readonly PortView[]): readonly RoutingEntry[] {
  const connected = connectedRoutes(config, ports);
  const ownIps = new Set(Object.values(config.interfaces).map(iface => iface.ip));
  const active = config.staticRoutes.flatMap(route => {
    if (ownIps.has(route.nextHop)) return [];
    const exit = connected.find(candidate => isSameNetwork(route.nextHop, candidate.network, candidate.mask) &&
      checkInterfaceAddress(route.nextHop, candidate.mask) === null);
    return exit === undefined ? [] : [{ ...route, source: "static" as const, port: exit.port }];
  });
  return [...connected, ...active];
}
