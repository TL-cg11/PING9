// 계약 확인용 예시 자료 (AD-9). `@ping9/shared/examples`로 가져온다.
// engine 테스트와 web 테스트가 같은 자료를 쓰므로, 화면은 engine이 완성되기 전에도 이 자료로 만들 수 있다.

import type { TopologyDocument } from "../document";
import { thirtyDeviceDocument } from "./thirty-devices";
import { twoPcDocument } from "./two-pc";
import { twoPcSwitchDocument } from "./two-pc-switch";

export * from "./thirty-devices";
export * from "./two-pc";
export * from "./two-pc-switch";

/** 모든 예시 Document. 이름은 테스트 출력에 쓴다 */
export const EXAMPLE_DOCUMENTS: readonly {
  readonly name: string;
  readonly document: TopologyDocument;
}[] = [
  { name: "PC 2대 직접 연결", document: twoPcDocument },
  { name: "PC 2대와 Switch 1대", document: twoPcSwitchDocument },
  { name: "장비 30대", document: thirtyDeviceDocument },
];
