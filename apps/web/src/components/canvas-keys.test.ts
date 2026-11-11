import { describe, expect, test } from "vitest";

import { isRemoveKey, nodeKeyAction, removeKeyAction } from "./canvas-keys";

describe("지우는 키가 지우는 것 (T1.3.3)", () => {
  const nothing = { focusedDeviceId: null, focusedLinkId: null, selectedDeviceId: null, selectedLinkId: null };

  test("고른 것이 없으면 아무것도 하지 않는다", () => {
    expect(removeKeyAction(nothing)).toBeNull();
  });
  test("고른 장비를 지운다", () => {
    expect(removeKeyAction({ ...nothing, selectedDeviceId: "a" })).toEqual({ type: "remove-device", deviceId: "a" });
    expect(removeKeyAction({ ...nothing, selectedDeviceId: "a", focusedDeviceId: "a" }))
      .toEqual({ type: "remove-device", deviceId: "a" });
  });
  test("고른 케이블을 지운다", () => {
    expect(removeKeyAction({ ...nothing, selectedLinkId: "l" })).toEqual({ type: "remove-link", linkId: "l" });
    expect(removeKeyAction({ ...nothing, selectedLinkId: "l", focusedLinkId: "l" }))
      .toEqual({ type: "remove-link", linkId: "l" });
  });
  test("포커스가 고르지 않은 장비에 있으면 지우지 않고 그 장비를 고른다", () => {
    expect(removeKeyAction({ ...nothing, focusedDeviceId: "a", selectedDeviceId: "b" }))
      .toEqual({ type: "select-device", deviceId: "a" });
    expect(removeKeyAction({ ...nothing, focusedDeviceId: "a" })).toEqual({ type: "select-device", deviceId: "a" });
    expect(removeKeyAction({ ...nothing, focusedDeviceId: "a", selectedLinkId: "l" }))
      .toEqual({ type: "select-device", deviceId: "a" });
  });
  test("포커스가 고르지 않은 케이블에 있으면 지우지 않고 그 케이블을 고른다", () => {
    expect(removeKeyAction({ ...nothing, focusedLinkId: "l", selectedDeviceId: "b" }))
      .toEqual({ type: "select-link", linkId: "l" });
    expect(removeKeyAction({ ...nothing, focusedLinkId: "l", selectedLinkId: "m" }))
      .toEqual({ type: "select-link", linkId: "l" });
  });
});

test.each(["Delete", "Backspace"])("%s는 지우는 키다 (T1.3.3)", (key) => {
  expect(isRemoveKey({ key })).toBe(true);
});

test.each([
  { key: "d" }, { key: "Escape" }, { key: "Delete", ctrlKey: true }, { key: "Backspace", metaKey: true },
  { key: "Delete", altKey: true }, { key: "Backspace", isComposing: true }, { key: "Delete", repeat: true },
])("%j는 지우는 키가 아니다", (event) => {
  expect(isRemoveKey(event)).toBe(false);
});

test.each([
  ["Enter", "open"],
  [" ", "select"],
])("%j → %s", (key, action) => {
  expect(nodeKeyAction(key)).toBe(action);
});

test.each(["Tab", "Escape", "a", "ArrowDown"])("%j는 노드가 처리하지 않는다 (Tab은 다음 노드로 감)", (key) => {
  expect(nodeKeyAction(key)).toBeNull();
});
