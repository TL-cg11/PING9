// 포트 이름의 줄임 표기. `show` 출력(engine)과 화면(web)이 같은 표기를 쓴다.
// Document와 Command에는 항상 전체 이름을 쓴다 (AD-9).

const SHORT_PREFIXES: readonly (readonly [full: string, short: string])[] = [
  ["FastEthernet", "Fa"],
  ["GigabitEthernet", "Gi"],
  ["Ethernet", "Eth"],
];

/** `FastEthernet0/1` → `Fa0/1`, `GigabitEthernet0/0` → `Gi0/0`, `Ethernet0` → `Eth0`. 모르는 이름은 그대로 */
export function shortPortName(port: string): string {
  for (const [full, short] of SHORT_PREFIXES) {
    if (port.startsWith(full)) return short + port.slice(full.length);
  }
  return port;
}
