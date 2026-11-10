import { describe, expect, test } from "vitest";

import { helpRequest, keyAction } from "./keys";

const plain = { shift: false, composing: false };

describe("helpRequest", () => {
  // 붙여 넣기나 화면 자판처럼 키 입력 없이 글이 들어오는 경우
  test.each([
    ["?", ""],
    ["show ?", "show "],
    ["sh?", "sh"],
    ["vlan ? 10", "vlan "],
    ["a?b?c", "a"],
  ])("%j: ? 앞까지가 도움말을 볼 줄이다 (%j)", (value, line) => {
    expect(helpRequest(value)).toBe(line);
  });

  test.each(["", "show vlan", "name LAB"])("%j: ?가 없으면 도움말 요청이 아니다", (value) => {
    expect(helpRequest(value)).toBeNull();
  });
});

describe("keyAction", () => {
  test.each([
    ["Enter", "submit"],
    ["ArrowUp", "history-up"],
    ["ArrowDown", "history-down"],
    ["Tab", "complete"],
    ["?", "help"],
    ["Escape", "leave"],
  ])("%s → %s", (key, action) => {
    expect(keyAction(key, plain)).toBe(action);
  });

  test.each(["a", " ", "/", "Backspace", "ArrowLeft"])("%j는 입력란이 그대로 처리한다", (key) => {
    expect(keyAction(key, plain)).toBeNull();
  });

  test("Shift+Tab은 가로채지 않는다 (키보드로 터미널 밖으로 나갈 수 있게)", () => {
    expect(keyAction("Tab", { shift: true, composing: false })).toBeNull();
  });

  test("?는 Shift와 함께 눌러도 도움말이다 (대부분의 자판에서 Shift+/)", () => {
    expect(keyAction("?", { shift: true, composing: false })).toBe("help");
  });

  test("한글을 조합하는 중에는 Enter, Tab, ?, Esc를 가로채지 않는다", () => {
    for (const key of ["Enter", "Tab", "?", "Escape"]) {
      expect(keyAction(key, { shift: false, composing: true })).toBeNull();
    }
  });

  test("Ctrl+C는 멈춤이다. Ctrl 없는 c와 macOS의 Cmd+C(복사)는 가로채지 않는다 (T1.8.3)", () => {
    expect(keyAction("c", { shift: false, composing: false, ctrl: true })).toBe("interrupt");
    expect(keyAction("C", { shift: true, composing: false, ctrl: true })).toBe("interrupt");
    expect(keyAction("c", { shift: false, composing: false })).toBeNull();
    expect(keyAction("c", { shift: false, composing: true, ctrl: true })).toBeNull();
  });
});
