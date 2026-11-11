// 캔버스 노드에서 받는 키 (T1.6.2, NFR-12). DOM 없이 테스트할 수 있게 판단만 따로 둔다.
// 노드는 role="button"이라 버튼과 같은 키를 쓴다: Enter는 기본 동작(콘솔 열기), Space는 선택.

/**
 * 고른 장비나 케이블을 지우는 키인가 (T1.3.3). Mac의 delete는 Backspace다.
 * 조합 키와 함께 누른 것, 한글 조합 중인 것, 누르고 있어 반복된 것은 아니다
 */
export function isRemoveKey(event: {
  readonly key: string;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
  readonly isComposing?: boolean;
  readonly repeat?: boolean;
}): boolean {
  if (event.key !== "Delete" && event.key !== "Backspace") return false;
  return !(event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.repeat);
}

/** 지우는 키를 눌렀을 때 할 일 */
export type RemoveKeyAction =
  | { readonly type: "select-device" | "remove-device"; readonly deviceId: string }
  | { readonly type: "select-link" | "remove-link"; readonly linkId: string };

/**
 * 지우는 키가 무엇을 지우는지 정한다 (T1.3.3). 지우는 것은 언제나 지금 고른 것, 곧 속성 패널에 보이는 것이다.
 * 키보드 포커스가 고르지 않은 장비나 케이블에 있으면 지우지 않고 그것을 먼저 고른다.
 * 포커스가 있는 것과 속성 패널에 보이는 것이 다를 때 엉뚱한 쪽이 지워지지 않게 한다
 */
export function removeKeyAction(state: {
  readonly focusedDeviceId: string | null;
  readonly focusedLinkId: string | null;
  readonly selectedDeviceId: string | null;
  readonly selectedLinkId: string | null;
}): RemoveKeyAction | null {
  const { focusedDeviceId, focusedLinkId, selectedDeviceId, selectedLinkId } = state;
  if (focusedLinkId !== null) {
    return { type: focusedLinkId === selectedLinkId ? "remove-link" : "select-link", linkId: focusedLinkId };
  }
  if (focusedDeviceId !== null && focusedDeviceId !== selectedDeviceId) {
    return { type: "select-device", deviceId: focusedDeviceId };
  }
  if (selectedLinkId !== null) return { type: "remove-link", linkId: selectedLinkId };
  if (selectedDeviceId !== null) return { type: "remove-device", deviceId: selectedDeviceId };
  return null;
}

export type NodeKeyAction = "open" | "select";

/** 이 키가 노드의 동작이면 그 동작을, 아니면 null을 돌려준다 */
export function nodeKeyAction(key: string): NodeKeyAction | null {
  switch (key) {
    case "Enter":
      return "open";
    case " ":
      return "select";
    default:
      return null;
  }
}
