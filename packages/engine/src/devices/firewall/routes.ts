// Firewall의 라우팅 테이블 (T14.2.1). 직접 연결과 Static route뿐이다. 동적 라우팅과 AD는 없다.
// 목적지 조회는 Router와 같은 `lookupRoute`를 쓴다.

import { checkInterfaceAddress, DEFAULT_DISTANCE, isSameNetwork, networkAddress, PORT_NAMES } from "@ping9/shared";
import type { FirewallConfig, PortView } from "@ping9/shared";

import type { RoutingEntry } from "../router/routing";

/**
 * 직접 연결은 켜져 있고 신호가 있는 인터페이스만. Static route의 다음 홉은 그 직접 연결망으로만 해석한다.
 * 같은 목적지에 직접 연결과 Static이 함께 있으면 직접 연결만 남긴다 (Router의 AD 0과 1)
 */
export function firewallRoutingTable(config: FirewallConfig, ports: readonly PortView[]): readonly RoutingEntry[] {
  const connected = PORT_NAMES.firewall.flatMap((port): RoutingEntry[] => {
    const iface = config.interfaces[port];
    if (iface?.adminUp === false || iface?.ip === undefined || iface.mask === undefined ||
      !ports.some((view) => view.name === port && view.status === "up")) return [];
    const network = networkAddress(iface.ip, iface.mask);
    return network === null ? [] : [{
      source: "connected", network, mask: iface.mask, port, distance: DEFAULT_DISTANCE.connected, metric: 0,
    }];
  });
  const ownIps = new Set(Object.values(config.interfaces).map((iface) => iface.ip));
  const reachable = config.staticRoutes.flatMap((route): RoutingEntry[] => {
    if (ownIps.has(route.nextHop)) return [];
    if (connected.some((candidate) => candidate.network === route.network && candidate.mask === route.mask)) return [];
    const exit = connected.find((candidate) => isSameNetwork(route.nextHop, candidate.network, candidate.mask) &&
      checkInterfaceAddress(route.nextHop, candidate.mask) === null);
    return exit === undefined ? [] : [{
      source: "static", network: route.network, mask: route.mask, nextHop: route.nextHop, port: exit.port,
      distance: DEFAULT_DISTANCE.static, metric: 0,
    }];
  });
  return [...connected, ...reachable];
}
