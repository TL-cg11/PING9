// 경로 교환을 다시 돌려야 하는지 판단하는 값 (T11.2.3).
// RIP 결과는 Router 설정, Router 사이의 L2 연결(Switch 설정, 링크), 장비 목록, PC 포트의 켜짐·꺼짐으로 정해진다.
// PC의 포트가 꺼지면 맞은편 Router 인터페이스에 신호가 없어 그 연결 경로가 빠진다 (T0.14).
// 장비 위치·이름, PC의 주소와 OS는 넣지 않는다. 끌어서 옮길 때마다 교환이 돌지 않게 한다.

import type { TopologyDocument } from "@ping9/shared";

/** RIP를 켠 Router가 있는가 */
export function hasRipRouter(document: TopologyDocument): boolean {
  return document.devices.some(device => device.kind === "router" && device.config.rip !== undefined);
}

/** 두 문서에서 이 값이 다르면 경로 교환 결과가 달라질 수 있다 */
export function routingInputs(document: TopologyDocument): string {
  return JSON.stringify({
    devices: document.devices.map(device => device.kind === "pc"
      // 값이 없는 것과 true는 같은 켜짐이다. 달라진 것이 없으면 교환하지 않는다
      ? { id: device.id, kind: device.kind, up: device.config.adminUp ?? true }
      : { id: device.id, kind: device.kind, config: device.config }),
    links: document.links,
  });
}

/** `dispatch` 뒤에 경로 교환을 돌릴지. 앞뒤 어디에도 RIP Router가 없으면 돌리지 않는다 */
export function needsRouteExchange(previous: TopologyDocument, document: TopologyDocument): boolean {
  if (!hasRipRouter(previous) && !hasRipRouter(document)) return false;
  return routingInputs(previous) !== routingInputs(document);
}
