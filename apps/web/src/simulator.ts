// 앱의 Simulator 하나. web이 engine에 대해 아는 것은 Simulator가 전부다 (AD-16).
// 저장과 불러오기가 생기기 전까지는 예시 토폴로지를 불러와 보여 준다.

import { createSimulator } from "@ping9/engine";
import type { Simulator } from "@ping9/engine";
import type { Snapshot } from "@ping9/shared";
import { twoSwitchVlanDocument } from "@ping9/shared/examples";
import { useSyncExternalStore } from "react";

export const simulator: Simulator = createSimulator();
simulator.load(twoSwitchVlanDocument);

/** 지금 보여 주는 토폴로지의 이름. 토폴로지 이름은 Document가 아니라 서버가 가진 값이라 지금은 고정이다 */
export const TOPOLOGY_NAME = "VLAN 실습 1";

/** 현재 스냅샷. engine의 상태가 바뀌면 다시 그린다 */
export function useSnapshot(): Snapshot {
  return useSyncExternalStore(simulator.subscribe, simulator.getSnapshot, simulator.getSnapshot);
}
