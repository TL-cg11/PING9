/**
 * 값과 그 안의 모든 객체·배열을 얼린다. 경계를 오가는 값은 변경 불가능한 단순 자료여야 한다 (AD-16).
 * 얼린 값을 고치려 하면 예외가 나므로, 화면이 스냅샷을 제자리에서 고치는 실수가 바로 드러난다.
 */
export function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;

  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
