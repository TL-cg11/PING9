import { LIMITS, validateDocument } from "@ping9/shared";
import type { Command } from "@ping9/shared";
import { TWO_SWITCH_VLAN, twoSwitchVlanDocument } from "@ping9/shared/examples";
import { expect, test } from "vitest";

import { createSimulator } from "../index";

test("장비 이동은 위치만 바꾸고 구성과 케이블을 유지한다", () => {
  const simulator = createSimulator();
  simulator.load(twoSwitchVlanDocument);
  const before = simulator.getSnapshot();
  const position = { x: 481.5, y: 290.25 };
  expect(simulator.dispatch({ type: "device/move", deviceId: TWO_SWITCH_VLAN.sw1.id, position })).toEqual({ ok: true, notices: [] });
  const after = simulator.getSnapshot();
  expect(after.document.devices.find(device => device.id === TWO_SWITCH_VLAN.sw1.id)!.position).toEqual(position);
  expect(after.document.links).toEqual(before.document.links);
  expect(after.views).toEqual(before.views);
  expect(after.docVersion).toBe(before.docVersion + 1);
  position.x = 999;
  expect(after.document.devices.find(device => device.id === TWO_SWITCH_VLAN.sw1.id)!.position.x).toBe(481.5);
  expect(validateDocument(after.document).ok).toBe(true);
});

test.each([
  { x: Number.NaN, y: 0 }, { x: LIMITS.maxPosition + 1, y: 0 }, { x: 0 }, null, "position",
])("잘못된 좌표 %j는 상태를 바꾸지 않는다", position => {
  const simulator = createSimulator();
  simulator.load(twoSwitchVlanDocument);
  const before = simulator.getSnapshot();
  expect(simulator.dispatch({ type: "device/move", deviceId: TWO_SWITCH_VLAN.sw1.id, position } as Command).ok).toBe(false);
  expect(simulator.getSnapshot()).toBe(before);
});

test("없는 장비 이동은 오류를 반환한다", () => {
  expect(createSimulator().dispatch({ type: "device/move", deviceId: "missing", position: { x: 0, y: 0 } }))
    .toMatchObject({ ok: false, error: { code: "DEVICE_NOT_FOUND" } });
});
