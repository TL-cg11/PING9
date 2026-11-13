// Tab 완성과 `?` 도움말 (T3.2.2). 해석기(parse.ts)와 같은 일치 결과에서 계산한다 (AD-8):
// 도움말에 나온 단어는 모두 칠 수 있고, 칠 수 있는 단어는 모두 도움말에 나온다.
// 장비 종류를 모른다. 정의 목록만 있으면 Switch, Router, PC가 함께 쓴다.

import type { DeviceKind, HelpEntry } from "@ping9/shared";

import type { CliMode, CommandDefinition } from "./define";
import { candidatesFor, definitionsFor, sameKeyword, splitWords, startsKeyword, walkWords } from "./parse";
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

  const walk = walkWords(candidatesFor(mode, definitionsFor(kind, definitions)), done, kind);
  return { alive: walk.alive, index: done.length, partial: atNewWord ? undefined : words.at(-1) };
}

/** 이 자리에 올 수 있는 키워드와, 키워드마다 그 키워드를 가진 정의들 (정의 목록의 순서) */
function keywordsAt(cursor: Cursor): Map<string, CommandDefinition[]> {
  const typed = cursor.partial?.text ?? "";
  const found = new Map<string, CommandDefinition[]>();

  for (const definition of cursor.alive) {
    const token = definition.tokens[cursor.index];
    if (typeof token !== "string" || !startsKeyword(token, typed, definition)) continue;
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

/** Tab 후보 하나 (T0.19) */
export interface CompletionOption {
  /** 치다 만 단어 자리에 넣을 글 */
  readonly insert: string;
  /** 후보 목록에 보일 글 (Linux 폴더는 `docs/`) */
  readonly label: string;
  /** 다 채운 뒤 빈칸을 붙인다. 폴더는 붙이지 않고 구분자로 끝난다 */
  readonly final: boolean;
  /** 겹치는 앞부분을 셀 때 대소문자를 구분한다 */
  readonly caseSensitive: boolean;
}

/** 경로 자리의 후보를 찾는 함수. PC 콘솔만 준다 */
export type PathCompleter = (typed: string, dirsOnly: boolean) => readonly CompletionOption[];

interface Completion {
  /** 치다 만 단어가 시작하는 위치. 단어가 없으면 줄 끝 */
  readonly start: number;
  readonly typed: string;
  readonly options: readonly CompletionOption[];
  /** 친 단어와 똑같은 키워드. 다른 후보가 있어도 이것으로 채운다 (해석기와 같은 순서) */
  readonly exact?: CompletionOption;
}

function completionAt(
  line: string,
  mode: CliMode,
  kind: DeviceKind,
  definitions: readonly CommandDefinition[],
  paths?: PathCompleter,
): Completion {
  const cursor = cursorAt(line, mode, kind, definitions);
  const typed = cursor.partial?.text ?? "";
  const start = cursor.partial?.position ?? line.length;
  // IOS 장비는 지금처럼 치다 만 단어가 있어야 채운다. PC는 bash처럼 빈 자리에서도 후보를 보인다
  if (cursor.partial === undefined && paths === undefined) return { start, typed, options: [] };

  const keywordOptions = [...keywordsAt(cursor)].map(([keyword, owners]): CompletionOption => ({
    insert: keyword,
    label: keyword,
    final: true,
    caseSensitive: owners.some((owner) => owner.caseSensitive === true),
  }));
  const exact = keywordOptions.find((option) =>
    keywordsAt(cursor).get(option.insert)?.some((owner) => sameKeyword(option.insert, typed, owner)),
  );

  const pathKinds = new Set<"any" | "dir">();
  for (const definition of cursor.alive) {
    const token = definition.tokens[cursor.index];
    if (token !== undefined && typeof token !== "string" && token.files !== undefined) pathKinds.add(token.files);
  }
  const fileOptions = paths === undefined || pathKinds.size === 0 ? [] : paths(typed, !pathKinds.has("any"));
  // 파일 이름 자리에서는 옵션(`-l`, `/s`)을 친 때만 옵션을 후보로 둔다
  const keywords = fileOptions.length > 0 && !/^[-/]/.test(typed)
    ? keywordOptions.filter((option) => !/^[-/]/.test(option.insert))
    : keywordOptions;

  const seen = new Set<string>();
  const options = [...keywords, ...fileOptions].filter((option) => !seen.has(option.insert) && seen.add(option.insert));
  return { start, typed, options, ...(exact === undefined ? {} : { exact }) };
}

function commonPrefix(options: readonly CompletionOption[]): string {
  const sensitive = options.every((option) => option.caseSensitive);
  let prefix = options[0]?.insert ?? "";
  for (const { insert } of options.slice(1)) {
    let length = 0;
    while (
      length < prefix.length && length < insert.length &&
      (sensitive ? prefix[length] === insert[length] : prefix[length]!.toLowerCase() === insert[length]!.toLowerCase())
    ) length += 1;
    prefix = prefix.slice(0, length);
  }
  return prefix;
}

/**
 * Tab 완성 (T3.2.2, T0.19). 후보가 하나면 채우고 빈칸을 붙인다(폴더는 구분자로 끝남).
 * 여럿이면 겹치는 앞부분까지 채운다. 더 채울 것이 없으면 null이다 (그때 Tab을 한 번 더 누르면 후보 목록).
 * 앞의 단어는 줄여 쓴 그대로 둔다.
 */
export function completeLine(
  line: string,
  mode: CliMode,
  kind: DeviceKind,
  definitions: readonly CommandDefinition[],
  paths?: PathCompleter,
): string | null {
  const completion = completionAt(line, mode, kind, definitions, paths);
  const head = line.slice(0, completion.start);
  const only = completion.exact ?? (completion.options.length === 1 ? completion.options[0] : undefined);
  if (only !== undefined) return `${head}${only.insert}${only.final ? " " : ""}`;
  if (completion.options.length === 0) return null;
  const prefix = commonPrefix(completion.options);
  return prefix.length > completion.typed.length ? `${head}${prefix}` : null;
}

/** Tab 후보 목록 (T0.19). 이름순 */
export function completionLabels(
  line: string,
  mode: CliMode,
  kind: DeviceKind,
  definitions: readonly CommandDefinition[],
  paths?: PathCompleter,
): string[] {
  return completionAt(line, mode, kind, definitions, paths)
    .options.map((option) => option.label)
    .sort((left, right) => (left.toLowerCase() < right.toLowerCase() ? -1 : left.toLowerCase() > right.toLowerCase() ? 1 : 0));
}
