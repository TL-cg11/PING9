// 장비 모델의 공통 인터페이스 (AD-7, 03 문서 3.4절 "DeviceModel"). kernel과 링크 계층은 장비 종류로 분기하지 않고
// 이 인터페이스만 부른다. PC(T1.8.3), Switch(T5.2.2), Router(E4) 모델이 구현한다.

import type { DeviceView, TopologyDocument } from "@ping9/shared";

import type { Frame, SimContext, TimerRef } from "../kernel";

/**
 * Document가 바뀌었다는 알림. 모델은 두 문서를 비교해 쓸 수 없게 된 동적 상태(ARP·MAC 항목)를 지운다.
 * kernel 실행 밖(dispatch)에서 일어나므로 SimContext가 없다.
 */
export interface ConfigChange {
  readonly previous: TopologyDocument;
  readonly document: TopologyDocument;
}

export interface DeviceModel {
  readonly deviceId: string;
  /** 이 장비의 `port`에 프레임이 도착했다 */
  onFrame(ctx: SimContext, port: string, frame: Frame): void;
  /** 이 장비가 건 타이머가 만료됐다 */
  onTimer(ctx: SimContext, timer: TimerRef): void;
  /** 영향받는 동적 상태 정리 */
  onConfigChanged(change: ConfigChange): void;
  /** 화면에 보일 값. 테이블(ARP, MAC, 라우팅)은 여기서만 나온다 */
  view(): DeviceView;
}
