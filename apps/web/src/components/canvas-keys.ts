// 캔버스 노드에서 받는 키 (T1.6.2, NFR-12). DOM 없이 테스트할 수 있게 판단만 따로 둔다.
// 노드는 role="button"이라 버튼과 같은 키를 쓴다: Enter는 기본 동작(콘솔 열기), Space는 선택.

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
