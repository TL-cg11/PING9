// 통신 1회의 완성된 기록 (AD-6). 출처: 03 문서 3.4절 "Trace와 이벤트", 02 문서 FR-38, FR-42.

import type { DeviceRef, DropReason, Reason } from "./codes";

export const TRACE_LAYERS = ["L2", "ARP", "L3", "ICMP", "RIP", "GRE", "IPSEC"] as const;
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
  /** GRE/ESP 전달 IPv4 헤더에는 각각 프로토콜 47/50을 명시한다. 옛 ICMP/RIP 자료는 생략 가능 */
  readonly protocol?: 47 | 50;
}

/** UDP 헤더. 지금은 RIP(520)만 쓴다 (T11.2.2, E11 결정 2). 포트별 처리는 E8.1이 넓힌다 */
export interface UdpHeader {
  readonly sourcePort: number;
  readonly destinationPort: number;
}

/** RIP v2 경로 항목. metric은 1~16 (16은 닿지 않음) */
export interface RipEntry {
  readonly network: string;
  readonly mask: string;
  readonly metric: number;
}

/** RIP v2 패킷. request는 항목 없이 "전체 경로를 보내 달라"는 뜻이다 */
export interface RipPacket {
  readonly command: "request" | "response";
  readonly entries: readonly RipEntry[];
}

/** RIP v2 멀티캐스트 목적지 */
export const RIP_MULTICAST_IP = "224.0.0.9";
export const RIP_MULTICAST_MAC = "01:00:5e:00:00:09";
export const RIP_UDP_PORT = 520;
/** 닿지 않음을 뜻하는 metric */
export const RIP_INFINITY = 16;
/** 한 패킷에 담는 경로 수 (실제 RIP와 같음) */
export const RIP_MAX_ENTRIES = 25;

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
/** 첫 GRE 범위는 IPv4 ICMP, 1단 캡슐화다. 내부에 Ethernet/ARP는 넣지 않는다. */
export interface GrePacket {
  readonly version: 0;
  readonly protocolType: 2048;
  readonly payload: { readonly ipv4: Ipv4Header; readonly icmp: IcmpMessage };
}

/** 교육용 ESP tunnel 모델. payload/keyId는 추적을 위한 평문 자료이며 실제 ESP wire format/암호문이 아니다. */
export interface EspPacket {
  readonly spi: number;
  readonly sequence: number;
  readonly simulation: { readonly kind: "educational-no-encryption"; readonly keyId: string; readonly policy?: string; readonly senderId?: string; readonly receiverId?: string };
  readonly payload: { readonly ipv4: Ipv4Header; readonly icmp: IcmpMessage };
}

export interface FrameSnapshot {
  readonly ethernet: EthernetHeader;
  readonly gre?: GrePacket;
  readonly esp?: EspPacket;
  readonly arp?: ArpPacket;
  readonly ipv4?: Ipv4Header;
  readonly icmp?: IcmpMessage;
  /** RIP 프레임일 때 (T11.2.2) */
  readonly udp?: UdpHeader;
  readonly rip?: RipPacket;
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
interface TraceSummaryBase {
  readonly id: number;
  readonly docVersion: number;
  readonly status: TraceStatus;
  readonly eventCount: number;
}

/** 추적 목록의 한 줄. ping 회차 또는 경로 교환 (T11.2.3) */
export type TraceSummary =
  | (TraceSummaryBase & {
      readonly kind: "ping";
      /** 통신을 시작한 장비 */
      readonly source: DeviceRef;
      /** 목적지 IP */
      readonly targetIp: string;
      /** traceroute의 탐색이면 그 hop 번호 (= 보낸 TTL). ping이면 없다 (T11.4.1) */
      readonly hop?: number;
    })
  | (TraceSummaryBase & {
      /** RIP 경로 교환 1회. 목록에는 가장 최근 것 하나만 있다 */
      readonly kind: "rip";
      /** 교환에 참여한 RIP Router 수 */
      readonly routers: number;
      /** 교환 뒤 모든 Router가 배운 RIP 경로 수의 합 */
      readonly learned: number;
      /** 앞의 교환과 비교해 새로 배운·사라진·바뀐 RIP 경로 수 (T11.3.1). 목록은 `Simulator.getRouteChanges` */
      readonly added: number;
      readonly removed: number;
      readonly changed: number;
    });
