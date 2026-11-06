// 수로 끝나는 말 뒤에 붙는 조사를 고른다. 문구가 "VLAN 2이"처럼 어색해지지 않게 한다.

/** 읽었을 때 받침으로 끝나는 숫자: 0(영, 십), 1(일), 3(삼), 6(육), 7(칠), 8(팔) */
const WITH_FINAL_CONSONANT = new Set(["0", "1", "3", "6", "7", "8"]);

function endsWithConsonant(value: string | number): boolean {
  return WITH_FINAL_CONSONANT.has(String(value).slice(-1));
}

/** `10` → `10이`, `2` → `2가` */
export function withSubject(value: string | number): string {
  return `${value}${endsWithConsonant(value) ? "이" : "가"}`;
}

/** `10.0.10.1` → `10.0.10.1은`, `10.0.10.2` → `10.0.10.2는` */
export function withTopic(value: string | number): string {
  return `${value}${endsWithConsonant(value) ? "은" : "는"}`;
}
