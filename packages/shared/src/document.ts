// 저장되는 문서(Document)의 형태. 출처: docs/project-plan/03-system-design.md 3.4절 "Document 형태", AD-9.
// 모든 값은 변경 불가능한 단순 JSON 자료다 (AD-16). 바꿀 때는 새 객체를 만든다.

export const DEVICE_KINDS = ["pc", "switch", "router"] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];

/** 장비 종류별 포트의 전체 이름. 배열의 순서가 포트 순번이다 (MAC 주소 계산에 씀) */
export const PORT_NAMES = {
  pc: ["Ethernet0"],
  switch: [
    "FastEthernet0/1",
    "FastEthernet0/2",
    "FastEthernet0/3",
    "FastEthernet0/4",
    "FastEthernet0/5",
    "FastEthernet0/6",
    "FastEthernet0/7",
    "FastEthernet0/8",
  ],
  router: [
    "GigabitEthernet0/0",
    "GigabitEthernet0/1",
    "GigabitEthernet0/2",
    "GigabitEthernet0/3",
  ],
} as const satisfies Record<DeviceKind, readonly string[]>;

/** 그 종류의 장비에 있는 포트 이름인지 */
export function isPortName(kind: DeviceKind, port: string): boolean {
  return (PORT_NAMES[kind] as readonly string[]).includes(port);
}

/** 포트 순번 (0부터). 없는 포트면 -1 */
export function portIndex(kind: DeviceKind, port: string): number {
  return (PORT_NAMES[kind] as readonly string[]).indexOf(port);
}

export interface Position {
  readonly x: number;
  readonly y: number;
}

/** 포트 참조. `port`는 항상 전체 이름이다 (AD-9) */
export interface PortRef {
  readonly deviceId: string;
  readonly port: string;
}

/** PC의 OS (T0.7). 콘솔 명령어와 출력 형식, 아이콘이 달라진다. 네트워크 동작은 같다 */
export const OS_KINDS = ["windows", "linux"] as const;
export type OsKind = (typeof OS_KINDS)[number];

/** `os`가 없는 PC의 OS. 옛 문서와 예시 토폴로지가 그대로 읽힌다 */
export const DEFAULT_OS: OsKind = "windows";

/**
 * PC 구성. IP가 없으면 세 값 모두 없다. `mask`는 `ip`와 함께만, `gateway`는 `ip`가 있을 때만 있다.
 * `os`는 IP와 상관없이 따로 있고, 없으면 `DEFAULT_OS`다
 */
export interface PcConfig {
  readonly ip?: string;
  readonly mask?: string;
  readonly gateway?: string;
  readonly os?: OsKind;
  /** 포트 켜짐 (T0.14). 칸이 없으면 켜짐. 옛 문서는 그대로 읽힌다 */
  readonly adminUp?: boolean;
}

/** PC의 OS. 칸이 없으면 `DEFAULT_OS` */
export function osOf(config: PcConfig): OsKind {
  return config.os ?? DEFAULT_OS;
}

export interface Vlan {
  readonly id: number;
  readonly name: string;
}

/** 허용 VLAN의 범위 [시작, 끝]. 끝을 포함한다 */
export type VlanRange = readonly [start: number, end: number];

export const SWITCHPORT_MODES = ["access", "trunk"] as const;
export type SwitchportMode = (typeof SWITCHPORT_MODES)[number];

export interface SwitchPortConfig {
  readonly adminUp: boolean;
  readonly mode: SwitchportMode;
  /** access 포트의 VLAN. 없으면 VLAN 1 */
  readonly accessVlan?: number;
  /** trunk 포트가 허용하는 VLAN. 없으면 전부 허용 */
  readonly allowedVlans?: readonly VlanRange[];
}

/** Switch 구성. `ports`에 없는 포트는 기본값(켜짐, access, VLAN 1)이다 */
export interface SwitchConfig {
  readonly vlans: readonly Vlan[];
  readonly ports: Readonly<Record<string, SwitchPortConfig>>;
}

export interface RouterInterfaceConfig {
  readonly adminUp: boolean;
  /** `ip`와 `mask`는 함께 있거나 함께 없다 */
  readonly ip?: string;
  readonly mask?: string;
}

export interface StaticRoute {
  readonly network: string;
  readonly mask: string;
  readonly nextHop: string;
  /** AD (T11.1.1). 1~255. 없으면 1. 1은 저장하지 않는다 */
  readonly distance?: number;
}

/** RIP 구성 (T11.2.1). version 2, no auto-summary로 고정이라 저장하지 않는다 */
export interface RipConfig {
  /** `network`로 넣은 주소. 클래스풀 네트워크(A: /8, B: /16, C: /24)로 맞춰 저장. 작은 주소부터 */
  readonly networks: readonly string[];
  /** 보내지 않고 듣기만 하는 인터페이스. 포트 순서대로 */
  readonly passiveInterfaces: readonly string[];
}

/** Router 구성. `interfaces`에 없는 인터페이스는 설정된 적이 없는 것이다 */
export interface RouterConfig {
  readonly interfaces: Readonly<Record<string, RouterInterfaceConfig>>;
  readonly staticRoutes: readonly StaticRoute[];
  /** 없으면 RIP를 쓰지 않음. `router rip`로 생기고 `no router rip`로 사라진다 (T11.2.1) */
  readonly rip?: RipConfig;
}

interface DeviceBase {
  /** web이 `crypto.randomUUID()`로 만든 UUID */
  readonly id: string;
  /** 영문자, 숫자, `-`, `_`. 1~32자. 토폴로지 안에서 겹치지 않는다 */
  readonly name: string;
  readonly position: Position;
}

export interface PcDevice extends DeviceBase {
  readonly kind: "pc";
  readonly config: PcConfig;
}

export interface SwitchDevice extends DeviceBase {
  readonly kind: "switch";
  readonly config: SwitchConfig;
}

export interface RouterDevice extends DeviceBase {
  readonly kind: "router";
  readonly config: RouterConfig;
}

export type Device = PcDevice | SwitchDevice | RouterDevice;

/** 링크. 방향이 없고 서로 다른 두 장비를 잇는다 */
export interface Link {
  readonly id: string;
  readonly ends: readonly [PortRef, PortRef];
}

export interface TopologyDocument {
  readonly schemaVersion: 1;
  readonly devices: readonly Device[];
  readonly links: readonly Link[];
}

/** 장비도 링크도 없는 문서 */
export const EMPTY_DOCUMENT: TopologyDocument = {
  schemaVersion: 1,
  devices: [],
  links: [],
};
