// 오류·알림·이벤트 설명·폐기 사유의 코드와 코드별 params 타입 (AD-14).
// engine과 api는 `{ code, params }`만 만들고, 사용자에게 보일 문장은 web의 메시지 카탈로그가 만든다.
// 코드를 추가할 때는 아래 인터페이스에 한 줄, 같은 파일의 목록 객체에 한 줄을 넣는다.
// 목록 객체에서 빠뜨리면 타입 오류가 난다.

import type { DeviceKind } from "./document";
import type { LimitName } from "./limits";

/** 장비를 가리키는 params. ID와 그 시점의 이름을 함께 담는다 (AD-14) */
export interface DeviceRef {
  readonly deviceId: string;
  readonly deviceName: string;
}

// ---------------------------------------------------------------------------
// 오류 코드
// ---------------------------------------------------------------------------

export interface ErrorParamsByCode {
  // 값 하나의 형식 (shared의 값 검증 함수. CLI 해석기와 reducer가 함께 씀)
  INVALID_IPV4: { readonly value: string };
  /** 0.0.0.0, 255.255.255.255, 127.x, 224.x 이상 (MAL-5) */
  RESERVED_IPV4: { readonly value: string };
  /** 1이 연속되지 않은 마스크, 또는 인터페이스에 쓸 수 없는 길이(/0, /31, /32) */
  INVALID_MASK: { readonly value: string };
  IP_IS_NETWORK_ADDRESS: { readonly ip: string; readonly mask: string };
  IP_IS_BROADCAST_ADDRESS: { readonly ip: string; readonly mask: string };
  GATEWAY_NOT_IN_NETWORK: {
    readonly gateway: string;
    readonly ip: string;
    readonly mask: string;
  };
  INVALID_VLAN_ID: { readonly value: number };
  INVALID_VLAN_NAME: { readonly value: string };
  INVALID_DEVICE_NAME: { readonly value: string };
  INVALID_TOPOLOGY_NAME: { readonly length: number };
  /** 장비나 링크의 ID가 UUID 형식이 아님 (SEC-7) */
  INVALID_ID: { readonly id: string };

  // 문서 전체 (validateDocument, 가져오기 절차)
  DOCUMENT_TOO_LARGE: { readonly size: number; readonly limit: number };
  DOCUMENT_INVALID_JSON: Record<string, never>;
  /** `__proto__`, `constructor`, `prototype` (SEC-8) */
  DOCUMENT_FORBIDDEN_KEY: { readonly key: string };
  DOCUMENT_TOO_DEEP: { readonly limit: number };
  DOCUMENT_UNSUPPORTED_VERSION: { readonly current: number };
  /** 형태가 스키마와 다름. `path`는 문제가 있는 위치 (예: `devices.0.config.ip`) */
  DOCUMENT_INVALID_SHAPE: { readonly path: string };
  DUPLICATE_ID: { readonly id: string };
  DUPLICATE_DEVICE_NAME: { readonly name: string };
  DUPLICATE_VLAN: { readonly deviceId: string; readonly vlanId: number };
  /** 그 장비 종류에 없는 포트 이름 */
  UNKNOWN_PORT: {
    readonly deviceId: string;
    readonly kind: DeviceKind;
    readonly port: string;
  };
  LINK_DEVICE_NOT_FOUND: { readonly linkId: string; readonly deviceId: string };
  LINK_PORT_NOT_FOUND: {
    readonly linkId: string;
    readonly deviceId: string;
    readonly port: string;
  };
  /** 링크의 양 끝이 같은 장비 */
  LINK_SAME_DEVICE: { readonly linkId: string; readonly deviceId: string };
  /** 포트에 이미 링크가 있음 */
  PORT_IN_USE: { readonly deviceId: string; readonly port: string };
  LIMIT_EXCEEDED: { readonly limit: LimitName; readonly max: number };
  /** Trace의 형태나 이벤트 사이의 관계가 틀림. 예시 자료와 engine 테스트에서 씀 */
  TRACE_INVALID: { readonly path: string };

  // Command 처리 (reducer)
  UNKNOWN_COMMAND: { readonly type: string };
  DEVICE_NOT_FOUND: { readonly deviceId: string };
  LINK_NOT_FOUND: { readonly linkId: string };
  /** 그 종류의 장비에는 쓸 수 없는 Command (예: Switch에 `pc/set-ip`) */
  DEVICE_KIND_MISMATCH: {
    readonly deviceId: string;
    readonly expected: DeviceKind;
    readonly actual: DeviceKind;
  };
  /**
   * PC의 IP 구성에서 함께 있어야 할 값이 빠짐 (`pc/set-ip`).
   * IP 없이 마스크나 게이트웨이만 있으면 `ip`, IP는 있는데 마스크가 없으면 `mask`
   */
  PC_ADDRESS_INCOMPLETE: { readonly deviceId: string; readonly missing: "ip" | "mask" };
  /** 그 Switch에 없는 VLAN의 이름을 바꾸거나 지우려 함 */
  VLAN_NOT_FOUND: { readonly deviceId: string; readonly vlanId: number };
  /** VLAN 1은 지우거나 이름을 바꿀 수 없음 (FR-31) */
  DEFAULT_VLAN_READONLY: { readonly deviceId: string };

  // CLI 해석 (FR-46). `position`은 ConsoleLine에 따로 담는다
  CLI_UNKNOWN_COMMAND: { readonly token: string };
  CLI_INCOMPLETE_COMMAND: Record<string, never>;
  CLI_AMBIGUOUS_COMMAND: { readonly token: string };
  CLI_INVALID_VALUE: { readonly token: string };
  CLI_WRONG_MODE: { readonly token: string };
  CLI_LINE_TOO_LONG: { readonly limit: number };
}

export type ErrorCode = keyof ErrorParamsByCode;

/** `{ code, params }` 한 쌍. `code`로 좁히면 `params`의 타입이 정해진다 */
export type ErrorInfo<C extends ErrorCode = ErrorCode> = {
  [K in C]: { readonly code: K; readonly params: ErrorParamsByCode[K] };
}[C];

export function errorInfo<C extends ErrorCode>(
  code: C,
  params: ErrorParamsByCode[C],
): ErrorInfo<C> {
  return { code, params } as ErrorInfo<C>;
}

const ERROR_CODE_SET = {
  INVALID_IPV4: true,
  RESERVED_IPV4: true,
  INVALID_MASK: true,
  IP_IS_NETWORK_ADDRESS: true,
  IP_IS_BROADCAST_ADDRESS: true,
  GATEWAY_NOT_IN_NETWORK: true,
  INVALID_VLAN_ID: true,
  INVALID_VLAN_NAME: true,
  INVALID_DEVICE_NAME: true,
  INVALID_TOPOLOGY_NAME: true,
  INVALID_ID: true,
  DOCUMENT_TOO_LARGE: true,
  DOCUMENT_INVALID_JSON: true,
  DOCUMENT_FORBIDDEN_KEY: true,
  DOCUMENT_TOO_DEEP: true,
  DOCUMENT_UNSUPPORTED_VERSION: true,
  DOCUMENT_INVALID_SHAPE: true,
  DUPLICATE_ID: true,
  DUPLICATE_DEVICE_NAME: true,
  DUPLICATE_VLAN: true,
  UNKNOWN_PORT: true,
  LINK_DEVICE_NOT_FOUND: true,
  LINK_PORT_NOT_FOUND: true,
  LINK_SAME_DEVICE: true,
  PORT_IN_USE: true,
  LIMIT_EXCEEDED: true,
  TRACE_INVALID: true,
  UNKNOWN_COMMAND: true,
  DEVICE_NOT_FOUND: true,
  LINK_NOT_FOUND: true,
  DEVICE_KIND_MISMATCH: true,
  PC_ADDRESS_INCOMPLETE: true,
  VLAN_NOT_FOUND: true,
  DEFAULT_VLAN_READONLY: true,
  CLI_UNKNOWN_COMMAND: true,
  CLI_INCOMPLETE_COMMAND: true,
  CLI_AMBIGUOUS_COMMAND: true,
  CLI_INVALID_VALUE: true,
  CLI_WRONG_MODE: true,
  CLI_LINE_TOO_LONG: true,
} satisfies Record<ErrorCode, true>;

export const ERROR_CODES = Object.keys(ERROR_CODE_SET) as readonly ErrorCode[];

// ---------------------------------------------------------------------------
// 알림 코드. Command는 받아들여졌지만 사용자에게 알릴 것 (AD-3)
// ---------------------------------------------------------------------------

export interface NoticeParamsByCode {
  /** 같은 IP를 쓰는 다른 장비가 있음. 설정은 반영됨 (FR-27) */
  DUPLICATE_IP: { readonly ip: string; readonly others: readonly DeviceRef[] };
  /** 없는 VLAN을 포트에 지정해 VLAN이 자동으로 만들어짐 */
  VLAN_AUTO_CREATED: { readonly device: DeviceRef; readonly vlanId: number };
}

export type NoticeCode = keyof NoticeParamsByCode;

export type Notice<C extends NoticeCode = NoticeCode> = {
  [K in C]: { readonly code: K; readonly params: NoticeParamsByCode[K] };
}[C];

const NOTICE_CODE_SET = {
  DUPLICATE_IP: true,
  VLAN_AUTO_CREATED: true,
} satisfies Record<NoticeCode, true>;

export const NOTICE_CODES = Object.keys(NOTICE_CODE_SET) as readonly NoticeCode[];

// ---------------------------------------------------------------------------
// 폐기 사유 (02 문서 2.4.13절 FR-47의 표)
// ---------------------------------------------------------------------------

export interface DropParamsByReason {
  /** 보내려는 포트에 링크가 없음 */
  NO_LINK: { readonly device: DeviceRef; readonly port: string };
  /** 포트나 인터페이스가 꺼져 있음 */
  IF_DOWN: { readonly device: DeviceRef; readonly port: string };
  /** 출발 장비에 IP가 없음 */
  NO_IP: { readonly device: DeviceRef };
  /** 다른 네트워크로 보내는데 기본 게이트웨이가 없음 */
  NO_GATEWAY: { readonly device: DeviceRef; readonly targetIp: string };
  /** ARP 응답이 없음 */
  ARP_TIMEOUT: { readonly device: DeviceRef; readonly targetIp: string };
  /** VLAN이 달라 전달하지 않음 */
  VLAN_BLOCKED: {
    readonly device: DeviceRef;
    readonly frameVlan: number;
    readonly port: string;
    readonly portVlan: number;
  };
  /** trunk 허용 목록에 없는 VLAN */
  TRUNK_NOT_ALLOWED: {
    readonly device: DeviceRef;
    readonly port: string;
    readonly vlan: number;
  };
  /** 일치하는 경로가 없음 */
  NO_ROUTE: { readonly device: DeviceRef; readonly targetIp: string };
  /** TTL이 0이 됨 */
  TTL_EXPIRED: { readonly device: DeviceRef };
  /** 받은 장비가 목적지가 아님. 정상 동작이며 실패의 원인이 아니다 */
  NOT_FOR_ME: { readonly device: DeviceRef };
  /** 이벤트 수 한도 초과 (FR-30) */
  LOOP_GUARD: { readonly devices: readonly DeviceRef[] };
}

export type DropReason = keyof DropParamsByReason;

const DROP_REASON_SET = {
  NO_LINK: true,
  IF_DOWN: true,
  NO_IP: true,
  NO_GATEWAY: true,
  ARP_TIMEOUT: true,
  VLAN_BLOCKED: true,
  TRUNK_NOT_ALLOWED: true,
  NO_ROUTE: true,
  TTL_EXPIRED: true,
  NOT_FOR_ME: true,
  LOOP_GUARD: true,
} satisfies Record<DropReason, true>;

export const DROP_REASONS = Object.keys(DROP_REASON_SET) as readonly DropReason[];

// ---------------------------------------------------------------------------
// 이벤트 설명 코드. TraceEvent의 `reason` (AD-6).
// 폐기 이벤트의 `reason.code`는 폐기 사유와 같은 값이다.
// 지금은 E1 범위(PC, Switch의 L2, ARP, ICMP echo)만 있다. Router와 VLAN의 코드는 E4, E5에서 추가한다.
// ---------------------------------------------------------------------------

export interface EventParamsByCode {
  /** 목적지의 MAC 주소를 몰라 ARP 요청을 브로드캐스트로 보냄 */
  ARP_REQUEST_SENT: {
    readonly device: DeviceRef;
    readonly senderIp: string;
    readonly targetIp: string;
  };
  /** ARP 요청을 받음. `forMe`는 요청이 찾는 IP가 이 장비의 것인지 */
  ARP_REQUEST_RECEIVED: {
    readonly device: DeviceRef;
    readonly senderIp: string;
    readonly targetIp: string;
    readonly forMe: boolean;
  };
  /** 자기 IP를 찾는 요청에 ARP 응답을 보냄 */
  ARP_REPLY_SENT: {
    readonly device: DeviceRef;
    readonly ip: string;
    readonly mac: string;
  };
  ARP_REPLY_RECEIVED: {
    readonly device: DeviceRef;
    readonly ip: string;
    readonly mac: string;
  };
  /** ARP 테이블에 IP와 MAC 주소의 짝을 기록함 */
  ARP_ENTRY_LEARNED: {
    readonly device: DeviceRef;
    readonly ip: string;
    readonly mac: string;
  };
  ICMP_ECHO_REQUEST_SENT: {
    readonly device: DeviceRef;
    readonly sourceIp: string;
    readonly targetIp: string;
  };
  ICMP_ECHO_REQUEST_RECEIVED: {
    readonly device: DeviceRef;
    readonly sourceIp: string;
    readonly targetIp: string;
  };
  ICMP_ECHO_REPLY_SENT: {
    readonly device: DeviceRef;
    readonly sourceIp: string;
    readonly targetIp: string;
  };
  ICMP_ECHO_REPLY_RECEIVED: {
    readonly device: DeviceRef;
    readonly sourceIp: string;
    readonly targetIp: string;
  };
  /** Switch가 포트로 프레임을 받음 */
  FRAME_RECEIVED: { readonly device: DeviceRef; readonly port: string };
  /** Switch가 출발지 MAC 주소와 받은 포트를 MAC 주소 테이블에 기록함 */
  MAC_LEARNED: {
    readonly device: DeviceRef;
    readonly mac: string;
    readonly port: string;
    readonly vlan: number;
  };
  /** 목적지 MAC 주소가 테이블에 있어 그 포트로만 보냄 */
  FRAME_FORWARDED: {
    readonly device: DeviceRef;
    readonly mac: string;
    readonly port: string;
  };
  /** 목적지를 모르거나 브로드캐스트여서 같은 VLAN의 다른 포트 모두로 보냄. 포트마다 이벤트 하나 */
  FRAME_FLOODED: {
    readonly device: DeviceRef;
    readonly port: string;
    readonly vlan: number;
    readonly broadcast: boolean;
  };
}

export type EventCode = keyof EventParamsByCode;

export type ReasonParamsByCode = EventParamsByCode & DropParamsByReason;
export type ReasonCode = keyof ReasonParamsByCode;

/** TraceEvent의 설명. `code`로 좁히면 `params`의 타입이 정해진다 */
export type Reason<C extends ReasonCode = ReasonCode> = {
  [K in C]: { readonly code: K; readonly params: ReasonParamsByCode[K] };
}[C];

const EVENT_CODE_SET = {
  ARP_REQUEST_SENT: true,
  ARP_REQUEST_RECEIVED: true,
  ARP_REPLY_SENT: true,
  ARP_REPLY_RECEIVED: true,
  ARP_ENTRY_LEARNED: true,
  ICMP_ECHO_REQUEST_SENT: true,
  ICMP_ECHO_REQUEST_RECEIVED: true,
  ICMP_ECHO_REPLY_SENT: true,
  ICMP_ECHO_REPLY_RECEIVED: true,
  FRAME_RECEIVED: true,
  MAC_LEARNED: true,
  FRAME_FORWARDED: true,
  FRAME_FLOODED: true,
} satisfies Record<EventCode, true>;

export const EVENT_CODES = Object.keys(EVENT_CODE_SET) as readonly EventCode[];

export const REASON_CODES: readonly ReasonCode[] = [...EVENT_CODES, ...DROP_REASONS];
