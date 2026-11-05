// 포트 여러 개를 좁은 자리에 보이기 위한 표기. 이어진 포트는 시안처럼 범위로 줄인다 (Fa0/3~7).
// 어느 포트를 보일지는 받은 목록 그대로다. 여기는 표기만 정한다.

import { shortPortName } from "@ping9/shared";

interface Run {
  /** 끝의 수를 뺀 앞부분 (예: `Fa0/`) */
  readonly prefix: string;
  readonly first: number;
  last: number;
}

/** `Fa0/3` → `["Fa0/", 3]`. 수로 끝나지 않으면 null */
function split(name: string): readonly [prefix: string, number: number] | null {
  const match = /^(.*?)(\d+)$/.exec(name);
  return match === null ? null : [match[1]!, Number(match[2])];
}

/** 전체 이름의 목록 → `Fa0/1~2, Fa0/4~6, Fa0/8`. 빈 목록은 `-` */
export function formatPortList(ports: readonly string[]): string {
  if (ports.length === 0) return "-";

  const parts: (Run | string)[] = [];
  for (const port of ports) {
    const name = shortPortName(port);
    const parsed = split(name);
    if (parsed === null) {
      parts.push(name);
      continue;
    }

    const [prefix, number] = parsed;
    const previous = parts.at(-1);
    if (typeof previous === "object" && previous.prefix === prefix && previous.last + 1 === number) {
      previous.last = number;
    } else {
      parts.push({ prefix, first: number, last: number });
    }
  }

  return parts
    .map((part) => {
      if (typeof part === "string") return part;
      return part.first === part.last ? `${part.prefix}${part.first}` : `${part.prefix}${part.first}~${part.last}`;
    })
    .join(", ");
}
