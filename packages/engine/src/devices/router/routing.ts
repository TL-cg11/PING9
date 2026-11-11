// 라우팅 계산은 패킷 전송과 분리한다. Router 모델과 스냅샷/CLI에서 재사용한다.
import { checkInterfaceAddress, DEFAULT_DISTANCE, isSameNetwork, maskToPrefixLength, networkAddress, parseIpv4, PORT_NAMES } from "@ping9/shared";
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
    return network === null ? [] : [{
      source: "connected" as const, network, mask: iface.mask, port, distance: DEFAULT_DISTANCE.connected, metric: 0,
    }];
  });
}

/** 실제 IOS처럼 AD 255인 경로는 테이블에 넣지 않는다 */
const UNUSABLE_DISTANCE = 255;

/**
 * 라우팅 테이블. 후보는 직접 연결 + 정적 경로 + 배운 경로(`learned`, T11.2.2의 RIP).
 * 같은 목적지(네트워크/마스크)는 AD가 가장 작은 경로만 남긴다. 같은 AD는 모두 남기고 `lookupRoute`가 고른다 (T11.1.1).
 * 정적 경로의 다음 홉은 켜진 직접 연결망으로만 해석한다. 재귀 경로는 사용하지 않는다.
 */
export function routingTable(
  config: RouterConfig, ports: readonly PortView[], learned: readonly RoutingEntry[] = [],
): readonly RoutingEntry[] {
  const connected = connectedRoutes(config, ports);
  const ownIps = new Set(Object.values(config.interfaces).map(iface => iface.ip));
  const active = config.staticRoutes.flatMap(route => {
    if (ownIps.has(route.nextHop)) return [];
    const exit = connected.find(candidate => isSameNetwork(route.nextHop, candidate.network, candidate.mask) &&
      checkInterfaceAddress(route.nextHop, candidate.mask) === null);
    return exit === undefined ? [] : [{
      source: "static" as const, network: route.network, mask: route.mask, nextHop: route.nextHop, port: exit.port,
      distance: route.distance ?? DEFAULT_DISTANCE.static, metric: 0,
    }];
  });
  const candidates = [...connected, ...active, ...learned].filter(route => route.distance < UNUSABLE_DISTANCE);
  const best = new Map<string, number>();
  for (const route of candidates) {
    const key = `${route.network}/${route.mask}`;
    best.set(key, Math.min(best.get(key) ?? Infinity, route.distance));
  }
  return candidates.filter(route => route.distance === best.get(`${route.network}/${route.mask}`));
}

export interface RouteDecision {
  readonly route: RoutingEntry;
  readonly port: string;
  /** 직접 연결 경로는 최종 목적지, 정적 경로는 설정한 다음 홉으로 ARP한다. */
  readonly nextHop: string;
}

/**
 * 최장 접두사. 같은 길이면 AD → metric → 다음 홉 IP → 포트 순으로 하나를 고른다(ECMP 아님).
 * 같은 목적지의 AD는 `routingTable`이 이미 골랐다. 여기의 AD 비교는 같은 길이의 다른 테이블(테스트 등)을 위해서다.
 */
export function lookupRoute(table: readonly RoutingEntry[], destination: string): RouteDecision | null {
  if (parseIpv4(destination) === null) return null;
  let best: RoutingEntry | null = null;
  let bestLength = -1;
  for (const route of table) {
    const length = maskToPrefixLength(route.mask);
    if (length === null || !isSameNetwork(destination, route.network, route.mask) ||
      (route.source !== "connected" && route.nextHop === undefined)) continue;
    const betterTie = best !== null && ((route.distance - best.distance) || (route.metric - best.metric) ||
      (parseIpv4(route.nextHop ?? "0.0.0.0")! - parseIpv4(best.nextHop ?? "0.0.0.0")!) ||
      (route.port < best.port ? -1 : route.port > best.port ? 1 : 0)) < 0;
    if (length > bestLength || (length === bestLength && betterTie)) { best = route; bestLength = length; }
  }
  return best === null ? null : { route: best, port: best.port, nextHop: best.source === "connected" ? destination : best.nextHop! };
}
