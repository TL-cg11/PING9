// 통신 1회의 완성된 기록 (AD-6). 출처: 03 문서 3.4절 "Trace와 이벤트", 02 문서 FR-38, FR-42.

import type { DeviceRef, DropReason, Reason } from "./codes";

export const TRACE_LAYERS = ["L2", "ARP", "L3", "ICMP"] as const;
export type TraceLayer = (typeof TRACE_LAYERS)[number];

export const TRACE_ACTIONS = ["create", "receive", "learn", "forward", "reply", "drop"] as const;
export type TraceAction = (typeof TRACE_ACTIONS)[number];

export const TRACE_STATUSES = ["success", "failed", "loop-guard"] as const;
export type TraceStatus = (typeof TRACE_STATUSES)[number];

/** 브로드캐스트 MAC 주소 */
export const BROADCAST_MAC = "ff:ff:ff:ff:ff:ff";

/** 아직 모르는 MAC 주소 자리에 쓰는 값 (ARP 요청의 대상 MAC) */
export const UNKNOWN_MAC = "00:00:00:00:00:00";

export interface EthernetHeader {
  /** `02:00:00:00:01:00` 형태의 소문자 */
  readonly sourceMac: string;
  readonly destinationMac: string;
  /** 802.1Q 태그가 붙어 있을 때만 */
  readonly vlanTag?: number;
}

export interface ArpPacket {
  readonly operation: "request" | "reply";
  readonly senderMac: string;
  readonly senderIp: string;
  readonly targetMac: string;
  readonly targetIp: string;
}

export interface Ipv4Header {
  readonly sourceIp: string;
  readonly destinationIp: string;
  readonly ttl: number;
}

export const ICMP_TYPES = ["echo-request", "echo-reply", "destination-unreachable", "time-exceeded"] as const;
export type IcmpType = (typeof ICMP_TYPES)[number];

export type IcmpErrorType = "destination-unreachable" | "time-exceeded";
export type IcmpMessage = { readonly type: "echo-request" | "echo-reply"; readonly sequence: number }
  | { readonly type: IcmpErrorType; readonly sequence: number; readonly original: {
    readonly sourceIp: string; readonly destinationIp: string; readonly sequence: number;
  } };

export function isIcmpError(icmp: IcmpMessage | undefined): icmp is Extract<IcmpMessage, { type: IcmpErrorType }> {
  return icmp?.type === "destination-unreachable" || icmp?.type === "time-exceeded";
}

/**
 * 한 시점의 프레임 내용. 계층별로 나뉜다 (FR-42).
 * ARP 프레임이면 `arp`만, ICMP 프레임이면 `ipv4`와 `icmp`가 있다.
 */
export interface FrameSnapshot {
  readonly ethernet: EthernetHeader;
  readonly arp?: ArpPacket;
  readonly ipv4?: Ipv4Header;
  readonly icmp?: IcmpMessage;
}

/** 이벤트 하나는 프레임 하나가 한 곳에 있는 순간이다. flooding으로 N개 포트에 나가면 이벤트도 N개다 */
export interface TraceEvent {
  /** Trace 안에서의 순번 (0부터) */
  readonly seq: number;
  /** Trace 시작부터의 가상 시간 (마이크로초). 같은 `time`의 이벤트 묶음이 재생의 한 단계다 */
  readonly time: number;
  /** 같은 프레임을 따라가기 위한 번호. Trace 안에서 1부터 */
  readonly frameId: number;
  /** 이 이벤트를 일으킨 이벤트의 `seq` */
  readonly parentSeq?: number;
  readonly deviceId: string;
  readonly inPort?: string;
  readonly outPort?: string;
  /** 프레임을 내보낼 때 그 프레임이 지나는 링크 */
  readonly linkId?: string;
  readonly layer: TraceLayer;
  readonly action: TraceAction;
  /** 설명. 문구는 web의 메시지 카탈로그가 만든다 */
  readonly reason: Reason;
  readonly frame: FrameSnapshot;
  /** `action`이 `drop`일 때만. `reason.code`와 같은 값이다 */
  readonly dropReason?: DropReason;
}

export interface TraceResult {
  readonly status: TraceStatus;
  /** 실패의 원인이 된 폐기 이벤트의 `seq`. 정상 폐기(NOT_FOR_ME)는 가리키지 않는다 */
  readonly primaryDropSeq?: number;
}

export interface Trace {
  /** engine의 증가 번호 */
  readonly id: number;
  /** 계산 당시의 Document 버전 */
  readonly docVersion: number;
  readonly events: readonly TraceEvent[];
  readonly result: TraceResult;
}

/** 추적 선택 목록에 보일 요약. Snapshot에 최근 20개가 담긴다 */
export interface TraceSummary {
  readonly id: number;
  readonly docVersion: number;
  readonly kind: "ping";
  readonly status: TraceStatus;
  readonly eventCount: number;
  /** 통신을 시작한 장비 */
  readonly source: DeviceRef;
  /** 목적지 IP */
  readonly targetIp: string;
  /** traceroute의 탐색이면 그 hop 번호 (= 보낸 TTL). ping이면 없다 (T11.4.1) */
  readonly hop?: number;
}
