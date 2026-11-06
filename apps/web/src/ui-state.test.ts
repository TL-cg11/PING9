import { describe, expect, test } from "vitest";

import { INITIAL_UI_STATE, uiReducer } from "./ui-state";
import type { UiAction, UiState } from "./ui-state";

const apply = (...actions: UiAction[]): UiState => actions.reduce(uiReducer, INITIAL_UI_STATE);

describe("선택", () => {
  test("장비를 고르고 비운다", () => {
    expect(apply({ type: "select", deviceId: "a" }).selectedDeviceId).toBe("a");
    expect(apply({ type: "select", deviceId: "a" }, { type: "select", deviceId: null }).selectedDeviceId).toBeNull();
  });
});

describe("터미널", () => {
  test("열면 뒤에 붙고, 다시 열면 숨김이 풀리며 맨 위로 온다", () => {
    let state = apply({ type: "open-terminal", deviceId: "a" }, { type: "open-terminal", deviceId: "b" });
    expect(state.terminals).toEqual([
      { deviceId: "a", x: 120, y: 40, hidden: false },
      { deviceId: "b", x: 150, y: 70, hidden: false },
    ]);

    state = uiReducer(state, { type: "close-terminal", deviceId: "a" });
    expect(state.terminals[0]).toEqual({ deviceId: "a", x: 120, y: 40, hidden: true });

    state = uiReducer(state, { type: "open-terminal", deviceId: "a" });
    expect(state.terminals.map((terminal) => [terminal.deviceId, terminal.hidden])).toEqual([
      ["b", false],
      ["a", false],
    ]);
  });

  test("옮기기와 맨 위로 올리기", () => {
    const state = apply(
      { type: "open-terminal", deviceId: "a" },
      { type: "open-terminal", deviceId: "b" },
      { type: "move-terminal", deviceId: "a", x: 5, y: 6 },
      { type: "focus-terminal", deviceId: "a" },
    );

    expect(state.terminals).toEqual([
      { deviceId: "b", x: 150, y: 70, hidden: false },
      { deviceId: "a", x: 5, y: 6, hidden: false },
    ]);
  });

  test("이미 맨 위에 있는 터미널을 올려도 상태가 그대로다", () => {
    const state = apply({ type: "open-terminal", deviceId: "a" });

    expect(uiReducer(state, { type: "focus-terminal", deviceId: "a" })).toBe(state);
  });

  test("없는 터미널을 가리키는 동작은 상태를 그대로 돌려준다", () => {
    for (const action of [
      { type: "close-terminal", deviceId: "x" },
      { type: "focus-terminal", deviceId: "x" },
      { type: "move-terminal", deviceId: "x", x: 1, y: 2 },
    ] as const) {
      expect(uiReducer(INITIAL_UI_STATE, action)).toBe(INITIAL_UI_STATE);
    }
  });
});

describe("sync", () => {
  test("문서에서 사라진 장비의 선택과 터미널을 지운다", () => {
    const state = apply(
      { type: "select", deviceId: "a" },
      { type: "open-terminal", deviceId: "a" },
      { type: "open-terminal", deviceId: "b" },
    );

    expect(uiReducer(state, { type: "sync", deviceIds: ["b"] })).toEqual({
      selectedDeviceId: null,
      terminals: [{ deviceId: "b", x: 150, y: 70, hidden: false }],
    });
  });

  test("바뀔 것이 없으면 상태가 그대로다", () => {
    const state = apply({ type: "select", deviceId: "a" }, { type: "open-terminal", deviceId: "a" });

    expect(uiReducer(state, { type: "sync", deviceIds: ["a", "b"] })).toBe(state);
  });
});
