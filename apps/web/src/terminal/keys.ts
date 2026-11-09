// 터미널 입력란에서 가로채는 키 (T3.2.3). DOM 없이 테스트할 수 있게 판단만 따로 둔다.

/** `leave`는 Esc: 입력란을 떠나 캔버스의 그 장비로 포커스를 옮긴다 (T1.6.2, NFR-12) */
export type KeyAction = "submit" | "history-up" | "history-down" | "complete" | "help" | "leave";

export interface KeyModifiers {
  readonly shift: boolean;
  /** 한글처럼 글자를 조합하는 중인가. 조합을 끝내는 키 입력을 명령으로 읽으면 안 된다 */
  readonly composing: boolean;
}

/**
 * 입력란에 `?`가 들어왔으면 도움말을 볼 줄(`?` 앞까지의 글)을, 아니면 null을 돌려준다.
 * 붙여 넣기나 화면 자판은 키 입력 없이 글을 넣으므로 `keyAction`만으로는 `?`를 잡지 못한다.
 * `?`는 어떤 명령어에도 들어가지 않는 글자다.
 */
export function helpRequest(value: string): string | null {
  const at = value.indexOf("?");
  return at === -1 ? null : value.slice(0, at);
}

/** 이 키가 터미널의 동작이면 그 동작을, 입력란이 그대로 처리할 키면 null을 돌려준다 */
export function keyAction(key: string, modifiers: KeyModifiers): KeyAction | null {
  switch (key) {
    case "ArrowUp":
      return "history-up";
    case "ArrowDown":
      return "history-down";
    case "Enter":
      return modifiers.composing ? null : "submit";
    case "Tab":
      // Shift+Tab은 그대로 둔다. 키보드만 쓰는 사람이 터미널 밖으로 나갈 길이다
      return modifiers.composing || modifiers.shift ? null : "complete";
    case "?":
      return modifiers.composing ? null : "help";
    case "Escape":
      // 한글 조합 중의 Esc는 조합 취소로 둔다
      return modifiers.composing ? null : "leave";
    default:
      return null;
  }
}
