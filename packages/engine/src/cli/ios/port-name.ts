// 인터페이스 이름 해석 (T3.3.1). `FastEthernet0/1`, `fastethernet0/1`, `fa0/1`, `f0/1`을
// 모두 전체 이름 `FastEthernet0/1`로 읽는다. 대소문자를 가리지 않는다.
// 장비 종류별 포트 이름은 shared의 PORT_NAMES가 정한다. Switch와 Router가 함께 쓴다.

import { PORT_NAMES, TUNNEL_NAMES } from "@ping9/shared";
import type { DeviceKind } from "@ping9/shared";

/** 포트 이름을 종류(글자)와 번호로 나눈다. `FastEthernet0/1` → [`fastethernet`, `0/1`] */
function splitName(name: string): readonly [type: string, number: string] | undefined {
  const match = /^([a-z]+)\s*(\d+(?:\/\d+)*)$/i.exec(name.trim());
  return match === null ? undefined : [match[1]!.toLowerCase(), match[2]!];
}

const namesOf = (kind: DeviceKind): readonly string[] => kind === "router" ? [...PORT_NAMES.router, ...TUNNEL_NAMES] : PORT_NAMES[kind];

/** 이 장비의 포트 종류를 줄여 쓴 글인가 (`f`, `fa`, `fastethernet`) */
export function isPortType(kind: DeviceKind, text: string): boolean {
  const typed = text.toLowerCase();
  return /^[a-z]+$/.test(typed) && namesOf(kind).some((name) => splitName(name)?.[0].startsWith(typed));
}

/** 입력한 글이 가리키는 포트의 전체 이름. 그런 포트가 없거나 둘 이상이면 undefined */
export function resolvePortName(kind: DeviceKind, text: string): string | undefined {
  const typed = splitName(text);
  if (typed === undefined) return undefined;

  const found = namesOf(kind).filter((name) => {
    const full = splitName(name);
    return full !== undefined && full[0].startsWith(typed[0]) && full[1] === typed[1];
  });
  return found.length === 1 ? found[0] : undefined;
}
