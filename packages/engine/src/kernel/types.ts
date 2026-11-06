import type {
  DropReason,
  EventCode,
  FrameSnapshot,
  PortRef,
  Reason,
  Trace,
  TraceAction,
  TraceLayer,
} from "@ping9/shared";

/** 통신 1회 안에서 같은 프레임을 식별한다. 전달은 같은 id, 응답은 새 id를 쓴다. */
export interface Frame {
  readonly id: number;
  readonly snapshot: FrameSnapshot;
}

/** 나중에 취소할 수 있는 가상 타이머. 실제 시간의 setTimeout은 쓰지 않는다. */
export interface TimerRef {
  readonly id: number;
  readonly deviceId: string;
  readonly key: string;
}

type RecordAction =
  | { readonly action: Exclude<TraceAction, "drop">; readonly reason: Reason<EventCode> }
  | { readonly action: "drop"; readonly reason: Reason<DropReason> };

/** seq, time, frameId, dropReason은 기록기가 붙인다. */
export type EventRecord = RecordAction & {
  readonly frame: Frame;
  readonly deviceId: string;
  readonly layer: TraceLayer;
  readonly inPort?: string;
  readonly outPort?: string;
  readonly linkId?: string;
  readonly parentSeq?: number;
};

/** 장비 처리기가 실행되는 동안만 쓴다. 큐와 시계를 직접 변경할 수 없다. */
export interface SimContext {
  /** 문서를 연 뒤부터의 절대 가상 시각 (정수 마이크로초) */
  now(): number;
  createFrame(snapshot: FrameSnapshot): Frame;
  /** 같은 frameId를 유지하며 TTL이나 VLAN 태그 등이 바뀐 프레임을 만든다. */
  updateFrame(frame: Frame, snapshot: FrameSnapshot): Frame;
  /**
   * 지정한 수신 포트로 도착 사건을 예약한다. 링크/송신 포트의 유효성 판단은 T1.7.2의 책임이다.
   * delayUs는 링크 계층이 넘긴다. 실제 연결은 여기서 추측하지 않는다.
   */
  sendFrame(target: PortRef, frame: Frame, delayUs: number, parentSeq?: number): void;
  setTimer(deviceId: string, key: string, delayUs: number, parentSeq?: number): TimerRef;
  cancelTimer(timer: TimerRef): void;
  /** 반환된 seq를 다음 기록/예약의 parentSeq로 지정할 수 있다. */
  record(event: EventRecord): number;
}

export interface KernelRun {
  readonly docVersion: number;
  /** ping 등의 시작 처리. 아직 장비 모델이 없어도 가짜 처리기로 검사할 수 있다. */
  readonly start: (ctx: SimContext) => void;
  readonly onFrame: (ctx: SimContext, target: PortRef, frame: Frame) => void;
  readonly onTimer: (ctx: SimContext, timer: TimerRef) => void;
  /** 성공 여부는 프로토콜이 판정한다. 빈 큐만으로 ping 성공이라고 가정하지 않는다. */
  readonly outcome?: () => "success" | "failed";
}

export interface Kernel {
  now(): number;
  run(input: KernelRun): Trace;
  /** Simulator.load에서 호출한다. 시각과 Trace/타이머 번호가 처음으로 돌아간다. */
  reset(): void;
}
