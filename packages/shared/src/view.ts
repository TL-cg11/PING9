// 화면에 보일 값. engine이 계산하고 web은 읽기만 한다 (AD-4, AD-7, AD-16).
// 출처: 03 문서 3.4절 "공개 인터페이스"의 Snapshot, "DeviceModel"의 포트 상태 표, 02 문서 FR-43, FR-44.

import type { DeviceRef } from "./codes";
import type { TopologyDocument } from "./document";
import type { TraceSummary } from "./trace";

/**
 * 포트 상태. engine만 계산한다.
 * - `up`: 동작 중
 * - `admin-down`: 사용자가 껐음 (shutdown)
 * - `no-link`: 링크가 연결되지 않음
 * - `peer-down`: 링크는 있으나 상대 포트가 꺼져 있음
 */
export const PORT_STATUSES = ["up", "admin-down", "no-link", "peer-down"] as const;
export type PortStatus = (typeof PORT_STATUSES)[number];

export interface PortView {
  /** 포트의 전체 이름 */
  readonly name: string;
  readonly status: PortStatus;
  /** 연결된 링크. 없으면 생략 */
  readonly linkId?: string;
}

export interface ArpEntryView {
  readonly ip: string;
  readonly mac: string;
  readonly port: string;
}

export interface MacTableEntryView {
  readonly mac: string;
  readonly port: string;
  readonly vlan: number;
}

export interface RouteEntryView {
  readonly source: "connected" | "static" | "rip";
  readonly network: string;
  readonly mask: string;
  /** static 경로일 때 */
  readonly nextHop?: string;
  /** 나가는 인터페이스. static 경로는 직접 연결망으로 다음 홉을 해석한 결과 */
  readonly port?: string;
  /** AD. Connected 0, Static 1(또는 floating static의 값), RIP 120 (T11.1.1) */
  readonly distance: number;
  /** RIP hop 수. Connected·Static은 0 */
  readonly metric: number;
}

/** RIP 경로 하나의 다음 홉, 나가는 인터페이스, metric */
export interface RipRouteHop {
  readonly nextHop: string;
  readonly port: string;
  readonly metric: number;
}

/**
 * 경로 교환 1회로 바뀐 RIP 경로 하나 (T11.3.1). 교환 전과 뒤의 라우팅 테이블을 비교한다.
 * `before`가 없으면 새로 배움, `after`가 없으면 사라짐, 둘 다 있으면 다음 홉·인터페이스·metric이 바뀜
 */
export interface RouteChangeView {
  readonly device: DeviceRef;
  readonly network: string;
  readonly mask: string;
  readonly before?: RipRouteHop;
  readonly after?: RipRouteHop;
}

// 구성 값(IP, VLAN 목록 등)은 Document에 있으므로 여기에 다시 담지 않는다.
// DeviceView에는 engine이 계산한 값과 실행 중 상태만 있다.

export interface PcView {
  readonly kind: "pc";
  readonly ports: readonly PortView[];
  readonly arpTable: readonly ArpEntryView[];
}

export interface SwitchView {
  readonly kind: "switch";
  readonly ports: readonly PortView[];
  readonly macTable: readonly MacTableEntryView[];
}

export interface GreTunnelView {
  readonly name: string;
  readonly status: "up" | "down" | "admin-down";
  readonly sourceIp?: string;
  readonly destination?: string;
}

export interface IpsecSaView {
  readonly name: string;
  readonly status: "disabled" | "incomplete" | "configured" | "active" | "expired" | "down";
  readonly peer?: string;
  readonly inboundSpi?: number;
  readonly outboundSpi?: number;
  readonly txSequence: number;
  readonly rxHighest: number;
  readonly encapsulated: number;
  readonly decapsulated: number;
  readonly rejected: number;
}

export interface RouterView {
  readonly ipsec?: readonly IpsecSaView[];
  readonly tunnels?: readonly GreTunnelView[];
  readonly kind: "router";
  readonly ports: readonly PortView[];
  readonly arpTable: readonly ArpEntryView[];
  readonly routingTable: readonly RouteEntryView[];
}

/** 장비 종류로 구분되는 표시용 값. web은 표현(아이콘, 표의 열)에 한해서만 `kind`로 분기한다 */
export type DeviceView = PcView | SwitchView | RouterView;

/** `Simulator.getSnapshot()`이 돌려주는 값. 변경 불가능한 단순 자료다 */
export interface Snapshot {
  /** Command가 받아들여졌을 때만 새 참조 */
  readonly document: TopologyDocument;
  /** Document가 바뀔 때마다 1 증가 */
  readonly docVersion: number;
  /** Runtime이나 Trace 목록이 바뀔 때마다 증가 */
  readonly runtimeVersion: number;
  /** 장비 ID별 표시용 값 */
  readonly views: Readonly<Record<string, DeviceView>>;
  /** 최근 추적. 가장 최근 것이 앞 */
  readonly traces: readonly TraceSummary[];
}
