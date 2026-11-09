import { TWO_SWITCH_VLAN, twoSwitchVlanDocument } from "@ping9/shared/examples";
import { expect, test } from "vitest";

import { CABLE_OFF, CABLE_READY, syncCableState } from "./cable-state";
import type { CableState } from "./cable-state";

const first = { deviceId: TWO_SWITCH_VLAN.sw1.id, port: "FastEthernet0/3" };
const pending: CableState = { active: true, first, pickerDeviceId: TWO_SWITCH_VLAN.sw2.id };

test("편집과 관계없는 변경은 선택 중인 연결점을 유지한다", () => {
  expect(syncCableState(pending, twoSwitchVlanDocument)).toBe(pending);
  expect(syncCableState(CABLE_OFF, twoSwitchVlanDocument)).toBe(CABLE_OFF);
});
test("첫 포트가 외부 편집으로 점유되면 첫 장비 선택 단계로 돌아간다", () => {
  expect(syncCableState({ ...pending, first: { ...first, port: "FastEthernet0/1" } }, twoSwitchVlanDocument)).toBe(CABLE_READY);
});
test("삭제된 첫 장비나 포트 목록을 안전하게 정리한다", () => {
  expect(syncCableState({ ...pending, first: { ...first, deviceId: "missing" } }, twoSwitchVlanDocument)).toBe(CABLE_READY);
  expect(syncCableState({ ...pending, pickerDeviceId: "missing" }, twoSwitchVlanDocument)).toEqual({ ...pending, pickerDeviceId: null });
});
