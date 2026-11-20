// TLS/암호화가 없는 PING9 교육용 원격 접속 계약. authId/caId는 공개 실습 식별자다.
import type { TopologyDocument } from "./document";
import { checkHostIpv4, checkInterfaceAddress, maskToPrefixLength, networkAddress, networksOverlap, isSameNetwork } from "./values";
import { errorInfo } from "./codes";
import type { ErrorInfo } from "./codes";

export interface SslVpnServerConfig {
  readonly enabled: boolean;
  readonly listenAddress: string;
  readonly listenPort: number;
  readonly serverName: string;
  readonly caId: string;
  /** 커널 reset 이후의 절대 가상 초. 실제 인증서 만료일이 아니다. */
  readonly certificateExpiresAtSeconds: number;
  readonly poolNetwork: string;
  readonly poolMask: string;
  readonly tunnelIp: string;
  readonly allowedNetworks: readonly { readonly network: string; readonly mask: string }[];
  readonly users: readonly { readonly name: string; readonly authId: string }[];
  readonly lifetimeSeconds: number;
  readonly maxClients: number;
}
export interface SslVpnClientConfig {
  readonly enabled: boolean;
  readonly name: string;
  readonly serverIp: string;
  readonly serverPort: number;
  readonly expectedServerName: string;
  readonly trustCaId: string;
  readonly username: string;
  readonly authId: string;
}
export type SslVpnState = "disconnected" | "connecting" | "validating" | "connected" | "failed";
export interface SslVpnSessionView {
  readonly state: SslVpnState;
  readonly detail: string;
  readonly serverIp?: string;
  readonly virtualIp?: string;
  readonly sessionId?: string;
  readonly expiresAtUs?: number;
}
export type SslVpnAction = "connect" | "disconnect" | "status";
export interface SslVpnRun { readonly session: SslVpnSessionView; readonly traceId?: number }
export const SSL_VPN_TIMEOUT_US = 2_000_000;
export const SSL_VPN_CLIENT_PORT = 50000;

/** 완성된 설정만 저장한다. 아직 설정되지 않은 경우에는 필드 자체를 생략한다. */
export function checkSslVpn(document: TopologyDocument): ErrorInfo | null {
  const invalid = (detail: string) => errorInfo("SSL_VPN_INVALID_CONFIG", { detail });
  const label = (value: string) => /^[A-Za-z0-9_.-]{1,32}$/.test(value);
  for (const device of document.devices) {
    if (device.kind === "pc" && device.config.sslVpn !== undefined) {
      const c = device.config.sslVpn;
      if (checkHostIpv4(c.serverIp) !== null || c.serverIp === device.config.ip) return invalid("서버는 유효한 상대 물리 IP여야 합니다");
      if (![c.name,c.expectedServerName,c.trustCaId,c.username,c.authId].every(label)) return invalid("프로필·신뢰·사용자 식별자는 영문/숫자/._- 1~32자입니다");
    }
    if (device.kind !== "router" || device.config.sslVpn === undefined) continue;
    const c = device.config.sslVpn;
    if (![c.serverName,c.caId,...c.users.flatMap(user => [user.name,user.authId])].every(label)) return invalid("서버·CA·사용자 식별자는 영문/숫자/._- 1~32자입니다");
    if (checkHostIpv4(c.listenAddress) !== null || !Object.values(device.config.interfaces).some(iface => iface.ip === c.listenAddress)) return invalid("listenAddress는 자신의 물리 인터페이스 IP여야 합니다");
    const prefix = maskToPrefixLength(c.poolMask);
    if (prefix === null || prefix < 24 || prefix > 30 || networkAddress(c.poolNetwork,c.poolMask) !== c.poolNetwork || checkInterfaceAddress(c.tunnelIp,c.poolMask) !== null || !isSameNetwork(c.tunnelIp,c.poolNetwork,c.poolMask)) return invalid("IP 풀은 /24~/30 네트워크이며 서버 가상 IP는 풀 안의 호스트여야 합니다");
    if (new Set(c.users.map(user => user.name)).size !== c.users.length) return invalid("사용자 이름이 중복됩니다");
    for (const net of c.allowedNetworks) {
      if (networkAddress(net.network,net.mask) !== net.network || checkHostIpv4(c.listenAddress) !== null || maskToPrefixLength(net.mask) === null) return invalid("허용 대역은 올바른 네트워크 주소/마스크여야 합니다");
      if (isSameNetwork(c.listenAddress,net.network,net.mask) || networksOverlap(net.network,net.mask,c.poolNetwork,c.poolMask)) return invalid("서버 endpoint/IP 풀을 허용 대역에 넣을 수 없습니다");
    }
    for (const other of document.devices) {
      const interfaces = other.kind === "pc" ? [other.config] : other.kind === "switch" ? [] : Object.values(other.config.interfaces);
      for (const iface of interfaces) if (iface.ip !== undefined && iface.mask !== undefined && networksOverlap(c.poolNetwork,c.poolMask,iface.ip,iface.mask)) return invalid("VPN IP 풀은 물리 네트워크와 겹칠 수 없습니다");
      if (other.kind === "router") {
        for (const tunnel of Object.values(other.config.tunnels ?? {})) if (tunnel.ip && tunnel.mask && networksOverlap(c.poolNetwork,c.poolMask,tunnel.ip,tunnel.mask)) return invalid("VPN 풀은 GRE 네트워크와 겹칠 수 없습니다");
        const pool = other.config.sslVpn;
        if (other.id !== device.id && pool && networksOverlap(c.poolNetwork,c.poolMask,pool.poolNetwork,pool.poolMask)) return invalid("VPN 서버들의 IP 풀이 겹칩니다");
      }
    }
  }
  return null;
}
