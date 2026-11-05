// MAC 주소는 저장하지 않고 장비 ID와 포트 순번에서 계산한다 (AD-5).
// engine에서 MAC 주소를 만드는 곳은 이 함수 하나다.

/**
 * `02:` + 장비 ID(UUID)의 마지막 8자리 + 포트 순번.
 * 예: ID가 `…-000000000001`이고 포트 순번이 0이면 `02:00:00:00:01:00`.
 * 첫 바이트 `02`는 직접 정한 주소(locally administered)라는 표시다.
 *
 * 마지막 8자리가 같은 장비 둘은 같은 MAC 주소를 갖는다. `crypto.randomUUID()`의 그 자리는 무작위라
 * 장비 50대에서 겹칠 확률은 천만 분의 3 정도다.
 */
export function macAddressFor(deviceId: string, portIndex: number): string {
  const tail = deviceId.replaceAll("-", "").slice(-8).padStart(8, "0");
  const port = (portIndex % 256).toString(16).padStart(2, "0");
  return `02:${tail.slice(0, 2)}:${tail.slice(2, 4)}:${tail.slice(4, 6)}:${tail.slice(6, 8)}:${port}`;
}
