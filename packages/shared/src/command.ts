import type { SslVpnClientConfig, SslVpnServerConfig } from "./ssl-vpn";
// Document를 바꾸는 요청 (AD-3). 출처: 03 문서 3.4절 "Command 목록 (MVP)".
// ping, show처럼 실행 중 상태만 다루는 동작은 Command가 아니라 ConsolePort.exec로 한다.
// 장비와 링크의 ID는 web이 crypto.randomUUID()로 만들어 Command에 담는다 (AD-5).

import type { ErrorInfo, Notice } from "./codes";
import type {
  DeviceKind, FirewallChain, FirewallPolicy, FirewallRule, GreTunnelConfig, IpsecProfileConfig, PcOsChoice, PortRef, Position,
  RouterConfig, ServiceKind, SwitchportMode, VlanRange, VpnMode,
} from "./document";

export type Command =
  | { readonly type: "ssl-vpn/set-client"; readonly deviceId: string; readonly config: SslVpnClientConfig | null }
  | { readonly type: "ssl-vpn/set-server"; readonly deviceId: string; readonly config: SslVpnServerConfig | null }
  | { readonly type: "router/set-cli-style"; readonly deviceId: string; readonly style: "ios" | "vyos" }
  | { readonly type: "router/commit-vyos"; readonly deviceId: string; readonly config: RouterConfig }
  | { readonly type: "router/set-vpn-mode"; readonly deviceId: string; readonly mode: VpnMode | null }
  | { readonly type: "ipsec/set"; readonly deviceId: string; readonly name: string; readonly config: IpsecProfileConfig }
  | { readonly type: "ipsec/remove"; readonly deviceId: string; readonly name: string }
  | { readonly type: "tunnel/set"; readonly deviceId: string; readonly name: string; readonly config: GreTunnelConfig }
  | { readonly type: "tunnel/remove"; readonly deviceId: string; readonly name: string }
  // 장비 (FR-9 ~ FR-11). 기본 이름(PC1, SW1, R1)과 기본 구성은 reducer가 붙인다.
  // `os`는 PC에만 쓴다 (T0.7). 없으면 DEFAULT_OS
  | { readonly type: "device/add"; readonly id: string; readonly kind: DeviceKind; readonly position: Position; readonly os?: PcOsChoice }
  | { readonly type: "device/move"; readonly deviceId: string; readonly position: Position }
  | { readonly type: "device/rename"; readonly deviceId: string; readonly name: string }
  | { readonly type: "device/remove"; readonly deviceId: string }
  // 링크 (FR-12, FR-13)
  | { readonly type: "link/add"; readonly id: string; readonly ends: readonly [PortRef, PortRef] }
  | { readonly type: "link/remove"; readonly linkId: string }
  // 포트 켜고 끄기 (FR-18)
  | { readonly type: "interface/set-admin"; readonly deviceId: string; readonly port: string; readonly adminUp: boolean }
  // Router 인터페이스의 IP (FR-26)
  | { readonly type: "interface/set-ip"; readonly deviceId: string; readonly port: string; readonly ip: string; readonly mask: string }
  | { readonly type: "interface/clear-ip"; readonly deviceId: string; readonly port: string }
  // PC의 IP (FR-25). `ip`가 null이면 IP를 지운다. 이때 `mask`와 `gateway`도 null이어야 한다
  | { readonly type: "pc/set-ip"; readonly deviceId: string; readonly ip: string | null; readonly mask: string | null; readonly gateway: string | null }
  // PC의 OS (T0.7). IP 구성은 그대로 둔다
  | { readonly type: "pc/set-os"; readonly deviceId: string; readonly os: PcOsChoice }
  // 서버로 쓰는 PC의 서비스 (T0.20). `os`가 `server`인 PC에만 쓴다
  | { readonly type: "pc/set-service"; readonly deviceId: string; readonly service: ServiceKind; readonly enabled: boolean }
  // 같은 이름이 있으면 주소를 바꾼다
  | { readonly type: "pc/add-dns-record"; readonly deviceId: string; readonly name: string; readonly address: string }
  | { readonly type: "pc/remove-dns-record"; readonly deviceId: string; readonly name: string }
  // Static route (FR-35)
  // distance (T11.1.1): add는 없으면 1. remove는 없으면 AD와 상관없이, 있으면 같은 AD일 때만 지운다
  | { readonly type: "route/add"; readonly deviceId: string; readonly network: string; readonly mask: string; readonly nextHop: string; readonly distance?: number }
  | { readonly type: "route/remove"; readonly deviceId: string; readonly network: string; readonly mask: string; readonly nextHop: string; readonly distance?: number }
  // RIP 구성 (T11.2.1). `network`는 reducer가 클래스풀로 맞춘다
  | { readonly type: "rip/enable"; readonly deviceId: string }
  | { readonly type: "rip/disable"; readonly deviceId: string }
  | { readonly type: "rip/add-network"; readonly deviceId: string; readonly network: string }
  | { readonly type: "rip/remove-network"; readonly deviceId: string; readonly network: string }
  | { readonly type: "rip/set-passive"; readonly deviceId: string; readonly port: string; readonly passive: boolean }
  // 서버로 쓰는 PC의 필터 규칙 (T14.2.1, T0.21에서 Firewall 장비 대신 서버로). `os`가 `server`인 PC에만 쓴다.
  // `index`는 1부터 세는 규칙 번호다 (`iptables --line-numbers`)
  // add-rule: index가 없으면 끝에 붙이고(`-A`), 있으면 그 자리에 끼운다(`-I`)
  | { readonly type: "firewall/add-rule"; readonly deviceId: string; readonly chain: FirewallChain; readonly rule: FirewallRule; readonly index?: number }
  | { readonly type: "firewall/remove-rule"; readonly deviceId: string; readonly chain: FirewallChain; readonly index: number }
  // flush-rules: chain이 없으면 세 체인 모두. 정책은 그대로 둔다 (`-F`)
  | { readonly type: "firewall/flush-rules"; readonly deviceId: string; readonly chain?: FirewallChain }
  | { readonly type: "firewall/set-policy"; readonly deviceId: string; readonly chain: FirewallChain; readonly policy: FirewallPolicy }
  // VLAN (FR-31)
  | { readonly type: "vlan/create"; readonly deviceId: string; readonly vlanId: number; readonly name?: string }
  | { readonly type: "vlan/rename"; readonly deviceId: string; readonly vlanId: number; readonly name: string }
  | { readonly type: "vlan/remove"; readonly deviceId: string; readonly vlanId: number }
  // Switch 포트 (FR-32, FR-33)
  | { readonly type: "switchport/set-mode"; readonly deviceId: string; readonly port: string; readonly mode: SwitchportMode }
  | { readonly type: "switchport/set-access-vlan"; readonly deviceId: string; readonly port: string; readonly vlanId: number }
  | { readonly type: "switchport/set-allowed-vlans"; readonly deviceId: string; readonly port: string; readonly allowedVlans: readonly VlanRange[] };

export type CommandType = Command["type"];

/** `type`으로 고른 Command 하나 */
export type CommandOf<T extends CommandType> = Extract<Command, { readonly type: T }>;

// Command를 추가하고 여기에 빠뜨리면 타입 오류가 난다
const COMMAND_TYPE_SET = {
  "ssl-vpn/set-client": true,
  "ssl-vpn/set-server": true,
  "router/set-cli-style": true,
  "router/commit-vyos": true,
  "router/set-vpn-mode": true,
  "ipsec/set": true,
  "ipsec/remove": true,
  "tunnel/set": true,
  "tunnel/remove": true,
  "device/add": true,
  "device/move": true,
  "device/rename": true,
  "device/remove": true,
  "link/add": true,
  "link/remove": true,
  "interface/set-admin": true,
  "interface/set-ip": true,
  "interface/clear-ip": true,
  "pc/set-ip": true,
  "pc/set-os": true,
  "pc/set-service": true,
  "pc/add-dns-record": true,
  "pc/remove-dns-record": true,
  "route/add": true,
  "route/remove": true,
  "rip/enable": true,
  "rip/disable": true,
  "rip/add-network": true,
  "rip/remove-network": true,
  "rip/set-passive": true,
  "firewall/add-rule": true,
  "firewall/remove-rule": true,
  "firewall/flush-rules": true,
  "firewall/set-policy": true,
  "vlan/create": true,
  "vlan/rename": true,
  "vlan/remove": true,
  "switchport/set-mode": true,
  "switchport/set-access-vlan": true,
  "switchport/set-allowed-vlans": true,
} satisfies Record<CommandType, true>;

export const COMMAND_TYPES = Object.keys(COMMAND_TYPE_SET) as readonly CommandType[];

/** `dispatch`의 결과. 거부되면 Document는 바뀌지 않는다 */
export type DispatchResult =
  | { readonly ok: true; readonly notices: readonly Notice[] }
  | { readonly ok: false; readonly error: ErrorInfo };
