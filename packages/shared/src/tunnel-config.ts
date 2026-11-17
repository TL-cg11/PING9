import { errorInfo } from "./codes";
import type { ErrorInfo } from "./codes";
import { PORT_NAMES } from "./document";
import type { RouterConfig } from "./document";
import { checkHostIpv4, checkInterfaceAddress } from "./values";
import { checkRouterInterfaceOverlap } from "./router-config";

/** 첫 버전의 논리 인터페이스 한도. 물리 PORT_NAMES에는 넣지 않는다. */
export const TUNNEL_NAMES = ["Tunnel0", "Tunnel1", "Tunnel2", "Tunnel3"] as const;
export const isTunnelName = (name: string): boolean => (TUNNEL_NAMES as readonly string[]).includes(name);

export function routerInterfaces(config: RouterConfig) {
  return { ...config.interfaces, ...config.tunnels };
}

export function checkTunnels(deviceId: string, config: RouterConfig): ErrorInfo | null {
  const interfaces = routerInterfaces(config);
  for (const [name, tunnel] of Object.entries(config.tunnels ?? {})) {
    const invalid = (detail: string) => errorInfo("TUNNEL_INVALID_CONFIG", { detail: `${name}: ${detail}` });
    if (!isTunnelName(name)) return invalid("Tunnel0~Tunnel3만 지원합니다");
    if (tunnel.source !== undefined && !(PORT_NAMES.router as readonly string[]).includes(tunnel.source)) {
      return invalid("source는 물리 Router 인터페이스여야 합니다");
    }
    if ((tunnel.ip === undefined) !== (tunnel.mask === undefined)) return invalid("IP와 mask를 함께 입력하세요");
    if (tunnel.ip !== undefined && tunnel.mask !== undefined) {
      const error = checkInterfaceAddress(tunnel.ip, tunnel.mask) ??
        checkRouterInterfaceOverlap(deviceId, name, tunnel.ip, tunnel.mask, interfaces);
      if (error !== null) return error;
    }
    if (tunnel.destination !== undefined) {
      const error = checkHostIpv4(tunnel.destination);
      if (error !== null) return error;
      if (Object.values(interfaces).some(iface => iface.ip === tunnel.destination)) return invalid("destination은 자기 IP일 수 없습니다");
    }
    for (const [otherName, other] of Object.entries(config.tunnels ?? {})) {
      if (otherName !== name && tunnel.source !== undefined && tunnel.destination !== undefined &&
        tunnel.source === other.source && tunnel.destination === other.destination) return invalid("같은 source/destination의 터널이 이미 있습니다");
    }
  }
  return null;
}
