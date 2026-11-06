/**
 * 경계 밖에서 온 값을 오류 params에 담을 짧은 글로 바꾼다. 어떤 값에도 예외를 던지지 않는다 (AD-16).
 * `String(value)`는 `{ toString: 1 }` 같은 객체에서 예외를 던지므로 쓰지 않는다.
 * 문자열은 64자로 자르고, 수·불리언·null·undefined는 그 값의 표기, 그 밖은 타입 이름이다.
 */
export function describeValue(value: unknown): string {
  switch (typeof value) {
    case "string":
      return value.slice(0, 64);
    case "number":
    case "boolean":
    case "bigint":
    case "undefined":
      return String(value);
    default:
      return value === null ? "null" : typeof value;
  }
}
