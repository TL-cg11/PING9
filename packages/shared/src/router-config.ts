// Router의 기본 인터페이스 구성과 네트워크 겹침 규칙 (T4.1.2, FR-26/27).
import { errorInfo } from "./codes";
import type { ErrorInfo } from "./codes";
import { PORT_NAMES } from "./document";
import type { RouterConfig, RouterInterfaceConfig, StaticRoute } from "./document";
import { checkHostIpv4, checkIpv4, checkMask, networkAddress, networksOverlap } from "./values";

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
  return null;
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
    staticRoutes: config.staticRoutes,
  };
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
