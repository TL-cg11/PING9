import { LIMITS, validateDocument } from "@ping9/shared";
import type { Command } from "@ping9/shared";
import { TWO_SWITCH_VLAN, twoSwitchVlanDocument } from "@ping9/shared/examples";
import { expect, test } from "vitest";

import { createSimulator } from "../index";

const open = () => {
  const simulator = createSimulator();
  simulator.load(twoSwitchVlanDocument);
  return simulator;
};
const nameOf = (simulator: ReturnType<typeof createSimulator>, deviceId: string) =>
  simulator.getSnapshot().document.devices.find(device => device.id === deviceId)!.name;

test("이름 변경은 이름만 바꾸고 구성, 케이블, 실행 중 상태를 유지한다", () => {
  const simulator = open();
  const before = simulator.getSnapshot();

  expect(simulator.dispatch({ type: "device/rename", deviceId: TWO_SWITCH_VLAN.sw1.id, name: "CORE-1" }))
    .toEqual({ ok: true, notices: [] });

  const after = simulator.getSnapshot();
  expect(nameOf(simulator, TWO_SWITCH_VLAN.sw1.id)).toBe("CORE-1");
  expect(after.document.links).toEqual(before.document.links);
  expect(after.document.devices.map(device => ({ ...device, name: "" })))
    .toEqual(before.document.devices.map(device => ({ ...device, name: "" })));
  expect(after.docVersion).toBe(before.docVersion + 1);
  expect(after.runtimeVersion).toBe(before.runtimeVersion);
  expect(validateDocument(after.document).ok).toBe(true);
});

test("다른 장비가 쓰는 이름은 거부한다", () => {
  const simulator = open();
  const before = simulator.getSnapshot();

  expect(simulator.dispatch({ type: "device/rename", deviceId: TWO_SWITCH_VLAN.sw1.id, name: "SW2" }))
    .toEqual({ ok: false, error: { code: "DUPLICATE_DEVICE_NAME", params: { name: "SW2" } } });
  expect(simulator.getSnapshot()).toBe(before);
});

test("지금 이름과 같은 이름은 받아들인다", () => {
  const simulator = open();

  expect(simulator.dispatch({ type: "device/rename", deviceId: TWO_SWITCH_VLAN.sw1.id, name: "SW1" }).ok).toBe(true);
  expect(nameOf(simulator, TWO_SWITCH_VLAN.sw1.id)).toBe("SW1");
});

test.each(["", " ", "my pc", "스위치", "a".repeat(LIMITS.maxDeviceNameLength + 1), "x;y", 7, null, undefined])(
  "쓸 수 없는 이름 %j는 상태를 바꾸지 않는다", name => {
    const simulator = open();
    const before = simulator.getSnapshot();

    const result = simulator.dispatch({ type: "device/rename", deviceId: TWO_SWITCH_VLAN.sw1.id, name } as Command);

    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_DEVICE_NAME" } });
    expect(simulator.getSnapshot()).toBe(before);
  });

test("없는 장비의 이름 변경은 오류를 반환한다", () => {
  expect(createSimulator().dispatch({ type: "device/rename", deviceId: "missing", name: "A" }))
    .toMatchObject({ ok: false, error: { code: "DEVICE_NOT_FOUND" } });
});
