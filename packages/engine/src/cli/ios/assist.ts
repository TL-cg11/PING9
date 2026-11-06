// Tab 완성과 `?` 도움말 (T3.2.2). 해석기(parse.ts)와 같은 일치 결과에서 계산한다 (AD-8):
// 도움말에 나온 단어는 모두 칠 수 있고, 칠 수 있는 단어는 모두 도움말에 나온다.
// 장비 종류를 모른다. 정의 목록만 있으면 Switch, Router, PC가 함께 쓴다.

import type { DeviceKind, HelpEntry } from "@ping9/shared";

import type { CliMode, CommandDefinition } from "./define";
import { candidatesFor, definitionsFor, splitWords, walkWords } from "./parse";
import type { Word } from "./parse";

/** 줄이 여기서 끝나도 될 때 도움말에 나오는 표시. 실제 장비와 같다 */
const END_OF_LINE = "<cr>";

/**
 * 여러 명령어가 이어지는 첫 단어의 설명. 정의의 설명은 명령어 하나의 것이라
 * `show`나 `no`처럼 뒤에 여러 명령어가 오는 단어에는 맞지 않는다.
 */
const KEYWORD_HELP: Readonly<Record<string, string>> = {
  no: "Negate a command or set its defaults",
  show: "Show running system information",
};

interface Cursor {
  /** 볼 자리 앞까지의 단어가 모두 맞은 정의들 */
  readonly alive: readonly CommandDefinition[];
  /** 볼 자리의 토큰 번호 */
  readonly index: number;
  /** 치다 만 단어. 줄이 비었거나 빈칸으로 끝나면 없다 */
  readonly partial: Word | undefined;
}

function cursorAt(
  line: string,
  mode: CliMode,
  kind: DeviceKind,
  definitions: readonly CommandDefinition[],
): Cursor {
  const words = splitWords(line);
  const atNewWord = words.length === 0 || /\s$/.test(line);
  const done = atNewWord ? words : words.slice(0, -1);

  const walk = walkWords(candidatesFor(mode, definitionsFor(kind, definitions)), done);
  return { alive: walk.alive, index: done.length, partial: atNewWord ? undefined : words.at(-1) };
}

/** 이 자리에 올 수 있는 키워드와, 키워드마다 그 키워드를 가진 정의들 (정의 목록의 순서) */
function keywordsAt(cursor: Cursor): Map<string, CommandDefinition[]> {
  const typed = cursor.partial?.text.toLowerCase() ?? "";
  const found = new Map<string, CommandDefinition[]>();

  for (const definition of cursor.alive) {
    const token = definition.tokens[cursor.index];
    if (typeof token !== "string" || !token.toLowerCase().startsWith(typed)) continue;
    found.set(token, [...(found.get(token) ?? []), definition]);
  }
  return found;
}

function describeKeyword(keyword: string, owners: readonly CommandDefinition[], index: number): string {
  // 이 단어에서 끝나는 명령어가 있으면 그 명령어의 설명이 이 단어의 설명이다
  const ending = owners.find((definition) => definition.tokens.length === index + 1);
  return ending?.help ?? KEYWORD_HELP[keyword.toLowerCase()] ?? owners[0]?.help ?? "";
}

/** `?` 도움말: 이 자리에 올 수 있는 단어와 설명. 키워드(가나다순), 매개변수, `<cr>` 순이다 */
export function helpFor(
  line: string,
  mode: CliMode,
  kind: DeviceKind,
  definitions: readonly CommandDefinition[],
): HelpEntry[] {
  const cursor = cursorAt(line, mode, kind, definitions);

  const keywords = [...keywordsAt(cursor)]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([keyword, owners]) => ({
      token: keyword,
      description: describeKeyword(keyword, owners, cursor.index),
    }));

  // 치다 만 값이 맞는지는 다 쳐야 알 수 있으므로, 매개변수 자리는 항상 보인다
  const params = new Map<string, HelpEntry>();
  for (const definition of cursor.alive) {
    const token = definition.tokens[cursor.index];
    if (token === undefined || typeof token === "string") continue;
    const entry = { token: `<${token.param}>`, description: token.help };
    params.set(`${entry.token}\u0000${entry.description}`, entry);
  }

  const ending =
    cursor.partial === undefined
      ? cursor.alive.find((definition) => definition.tokens.length === cursor.index)
      : undefined;
  // 아무것도 치지 않은 줄에는 끝낼 명령어가 없다
  const end = ending !== undefined && cursor.index > 0 ? [{ token: END_OF_LINE, description: ending.help }] : [];

  return [...keywords, ...params.values(), ...end];
}

/**
 * Tab 완성: 치다 만 마지막 단어가 키워드 하나로 정해지면 그 키워드와 빈칸으로 바꾼 줄을 돌려준다.
 * 앞의 단어는 줄여 쓴 그대로 둔다. 후보가 없거나 둘 이상이거나 매개변수 자리면 null이다.
 */
export function completeLine(
  line: string,
  mode: CliMode,
  kind: DeviceKind,
  definitions: readonly CommandDefinition[],
): string | null {
  const cursor = cursorAt(line, mode, kind, definitions);
  if (cursor.partial === undefined) return null;

  const typed = cursor.partial.text.toLowerCase();
  const keywords = [...keywordsAt(cursor).keys()];
  // 해석기와 같은 순서다: 똑같은 키워드가 먼저, 없으면 하나뿐인 접두사 일치
  const keyword =
    keywords.find((candidate) => candidate.toLowerCase() === typed) ??
    (keywords.length === 1 ? keywords[0] : undefined);
  if (keyword === undefined) return null;

  return `${line.slice(0, cursor.partial.position)}${keyword} `;
}
