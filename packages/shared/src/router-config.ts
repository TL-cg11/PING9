// Router의 기본 인터페이스 구성과 네트워크 겹침 규칙 (T4.1.2, FR-26/27).
import { errorInfo } from "./codes";
import type { ErrorInfo } from "./codes";
import { PORT_NAMES } from "./document";
import type { RipConfig, RouterConfig, RouterInterfaceConfig, StaticRoute } from "./document";
import { LIMITS } from "./limits";
import { checkHostIpv4, checkIpv4, checkMask, formatIpv4, networkAddress, networksOverlap, parseIpv4 } from "./values";

/** CLI/dispatch와 문서 불러오기에 같은 규칙을 쓴다. 도달 불가는 설정 자체를 거부하지 않는다. */
export function checkStaticRoute(deviceId: string, route: StaticRoute, interfaces: RouterConfig["interfaces"]): ErrorInfo | null {
  const invalid = checkIpv4(route.network) ?? checkMask(route.mask) ?? checkHostIpv4(route.nextHop);
  if (invalid !== null) return invalid;
  if (networkAddress(route.network, route.mask) !== route.network) {
    return errorInfo("ROUTE_NETWORK_NOT_ALIGNED", { network: route.network, mask: route.mask });
  }
  if (Object.values(interfaces).some(iface => iface.ip === route.nextHop)) {
    return errorInfo("ROUTE_NEXT_HOP_IS_SELF", { deviceId, nextHop: route.nextHop });
  }
  return checkRouteDistance(route.distance);
}

/** 출처별 AD 기본값 (T11.1.1). 같은 목적지의 경로가 여럿이면 작은 쪽을 쓴다 */
export const DEFAULT_DISTANCE = { connected: 0, static: 1, rip: 120 } as const;

/** Static route의 AD. 없으면 통과(1). 1~255의 정수만 */
export function checkRouteDistance(distance: unknown): ErrorInfo | null {
  if (distance === undefined) return null;
  return Number.isInteger(distance) && (distance as number) >= 1 && (distance as number) <= 255
    ? null
    : errorInfo("ROUTE_DISTANCE_INVALID", { value: String(distance).slice(0, 64) });
}

/** AD 1은 기본값이라 저장하지 않는다. 옛 문서와 같은 모양이 된다 */
export function normalizeStaticRoute(route: StaticRoute): StaticRoute {
  const { network, mask, nextHop, distance } = route;
  return distance === undefined || distance === DEFAULT_DISTANCE.static ? { network, mask, nextHop } : { network, mask, nextHop, distance };
}

/** 생략된 포트도 기본 꺼짐으로 채우고 전체 포트 순서대로 정규화한다. */
export function normalizeRouterConfig(config: RouterConfig): RouterConfig {
  return {
    interfaces: Object.fromEntries(PORT_NAMES.router.map(port => {
      const iface = config.interfaces[port];
      return [port, {
        adminUp: iface?.adminUp ?? false,
        ...(iface?.ip !== undefined && iface.mask !== undefined ? { ip: iface.ip, mask: iface.mask } : {}),
      }];
    })),
    staticRoutes: config.staticRoutes.map(normalizeStaticRoute),
    ...(config.rip === undefined ? {} : { rip: normalizeRipConfig(config.rip) }),
  };
}

/**
 * RIP `network`에 넣은 주소의 클래스풀 네트워크 (T11.2.1). 실제 IOS처럼 A는 /8, B는 /16, C는 /24로 맞춘다.
 * 0.x, 127.x(loopback), D·E 클래스(224 이상)와 IPv4가 아닌 글은 null
 */
export function classfulNetwork(value: string): string | null {
  const address = parseIpv4(value);
  if (address === null) return null;
  const first = Math.floor(address / 0x1000000);
  if (first === 0 || first === 127 || first >= 224) return null;
  const size = first < 128 ? 0x1000000 : first < 192 ? 0x10000 : 0x100;
  return formatIpv4(address - (address % size));
}

/** 네트워크는 작은 주소부터, passive 인터페이스는 포트 순서대로. 겹침은 하나로 */
export function normalizeRipConfig(rip: RipConfig): RipConfig {
  const networks = [...new Set(rip.networks)].sort((a, b) => (parseIpv4(a) ?? 0) - (parseIpv4(b) ?? 0));
  const passiveInterfaces = PORT_NAMES.router.filter(port => rip.passiveInterfaces.includes(port));
  return { networks, passiveInterfaces };
}

/** 문서 불러오기와 reducer가 같은 규칙을 쓴다. 클래스풀 네트워크만, 겹침 없이, 한도까지. passive는 Router 포트만 */
export function checkRipConfig(deviceId: string, rip: RipConfig): ErrorInfo | null {
  if (rip.networks.length > LIMITS.maxRipNetworks) {
    return errorInfo("LIMIT_EXCEEDED", { limit: "ripNetworks", max: LIMITS.maxRipNetworks });
  }
  for (const network of rip.networks) {
    if (classfulNetwork(network) !== network) return errorInfo("RIP_NETWORK_INVALID", { network });
  }
  for (const port of rip.passiveInterfaces) {
    if (!(PORT_NAMES.router as readonly string[]).includes(port)) {
      return errorInfo("UNKNOWN_PORT", { deviceId, kind: "router", port });
    }
  }
  return null;
}

/** 주소 자체의 검증 뒤 사용한다. 꺼진 인터페이스도 겹침 검사 대상이다. */
export function checkRouterInterfaceOverlap(
  deviceId: string,
  port: string,
  ip: string,
  mask: string,
  interfaces: Readonly<Record<string, RouterInterfaceConfig>>,
): ErrorInfo<"INTERFACE_NETWORK_OVERLAP"> | null {
  for (const otherPort of PORT_NAMES.router) {
    const other = interfaces[otherPort];
    if (otherPort === port || other?.ip === undefined || other.mask === undefined) continue;
    if (networksOverlap(ip, mask, other.ip, other.mask)) {
      return errorInfo("INTERFACE_NETWORK_OVERLAP", { deviceId, port, otherPort, ip, mask });
    }
  }
  return null;
}
