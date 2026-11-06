// 입력 한 줄을 명령 정의와 인자로 해석한다. 틀리면 오류 코드와 틀린 단어의 위치를 돌려준다 (FR-46).
// 키워드는 그 자리에서 하나로 정해지는 만큼만 쳐도 된다 (줄임 입력, T3.2.1).

import { checkIpv4, checkMask, checkVlanId, errorInfo } from "@ping9/shared";
import type { DeviceKind, ErrorInfo } from "@ping9/shared";

import type { CliMode, CommandArgs, CommandDefinition, ParamToken } from "./define";

export type ParseResult =
  | { readonly ok: true; readonly definition: CommandDefinition; readonly args: CommandArgs }
  | { readonly ok: false; readonly error: ErrorInfo; readonly position?: number };

export interface Word {
  readonly text: string;
  /** 줄에서 이 단어가 시작하는 위치 (0부터) */
  readonly position: number;
}

/** 오류에 담을 단어를 잘라 낸다. 긴 입력이 그대로 화면까지 가지 않게 한다 */
function clip(text: string): string {
  return text.length > 64 ? text.slice(0, 64) : text;
}

export function splitWords(line: string): Word[] {
  return [...line.matchAll(/\S+/g)].map((match) => ({ text: match[0], position: match.index }));
}

type ParamResult =
  | { readonly ok: true; readonly value: string | number }
  | { readonly ok: false; readonly error: ErrorInfo };

function readParam(token: ParamToken, text: string): ParamResult {
  switch (token.type) {
    case "word":
      return { ok: true, value: text };
    case "vlan-id": {
      // 십진수 숫자만 받는다. 1e1, 0x10, 10.0, -1 같은 표기는 수로 읽지 않는다
      if (!/^[0-9]{1,9}$/.test(text)) {
        return { ok: false, error: errorInfo("CLI_INVALID_VALUE", { token: clip(text) }) };
      }
      const value = Number(text);
      const error = checkVlanId(value);
      return error === null ? { ok: true, value } : { ok: false, error };
    }
    // 검사 함수는 받은 글을 오류에 그대로 담으므로, 오류는 자른 글로 다시 만든다
    case "ipv4":
      return checkIpv4(text) === null
        ? { ok: true, value: text }
        : { ok: false, error: errorInfo("INVALID_IPV4", { value: clip(text) }) };
    case "mask":
      return checkMask(text) === null
        ? { ok: true, value: text }
        : { ok: false, error: errorInfo("INVALID_MASK", { value: clip(text) }) };
  }
}

/** 매개변수 자리의 글을 읽는다. 정의가 읽는 함수를 따로 주었으면 그것을 쓴다 (T3.3.1) */
function readToken(token: ParamToken, text: string, kind: DeviceKind): ParamResult {
  return token.read === undefined ? readParam(token, text) : token.read(text, kind);
}

/**
 * 줄임 입력 (T3.2.1). 단어를 앞에서부터 읽으며 자리마다 어느 키워드인지 정한다.
 * 그 자리에 올 수 있는 키워드 가운데 단어와 똑같은 것이 있으면 그것이고,
 * 없으면 단어로 시작하는 키워드가 하나뿐일 때 그것이다. 둘 이상이면 모호하다.
 * 매개변수 자리의 글은 줄임으로 읽지 않는다.
 */
export interface Walk {
  /** 자리마다 정해진 키워드(소문자). 키워드로 읽지 못한 자리는 undefined */
  readonly keywords: readonly (string | undefined)[];
  /** 여러 키워드로 읽히는 단어 */
  readonly ambiguous?: Word;
  /** 모든 단어가 맞은 정의들. 뒤에 토큰이 더 남은 정의도 들어 있다. 완성과 도움말이 쓴다 (T3.2.2) */
  readonly alive: readonly CommandDefinition[];
}

export function walkWords(
  definitions: readonly CommandDefinition[],
  words: readonly Word[],
  kind: DeviceKind,
): Walk {
  const keywords: (string | undefined)[] = [];
  // 앞의 단어가 모두 맞은 정의들
  let alive = definitions;

  for (const [index, word] of words.entries()) {
    if (alive.length === 0) break;
    const text = word.text.toLowerCase();

    const here = new Set<string>();
    let paramAccepts = false;
    for (const definition of alive) {
      const token = definition.tokens[index];
      if (token === undefined) continue;
      if (typeof token === "string") here.add(token.toLowerCase());
      else if (readToken(token, word.text, kind).ok) paramAccepts = true;
    }

    let keyword: string | undefined;
    if (here.has(text)) {
      keyword = text;
    } else {
      const prefixed = [...here].filter((candidate) => candidate.startsWith(text));
      if (prefixed.length === 1) keyword = prefixed[0];
      // 같은 자리의 매개변수가 이 글을 받으면 값으로 읽는다
      else if (prefixed.length > 1 && !paramAccepts) return { keywords, ambiguous: word, alive: [] };
    }
    keywords.push(keyword);

    alive = alive.filter((definition) => {
      const token = definition.tokens[index];
      if (token === undefined) return false;
      return typeof token === "string" ? token.toLowerCase() === keyword : readToken(token, word.text, kind).ok;
    });
  }

  return { keywords, alive };
}

/** 정의 하나와 줄을 맞춰 본 결과. `matched`는 앞에서부터 일치한 단어 수다 */
type Attempt =
  | { readonly kind: "ok"; readonly args: CommandArgs }
  | { readonly kind: "incomplete"; readonly matched: number }
  | { readonly kind: "invalid"; readonly matched: number; readonly error: ErrorInfo; readonly word: Word }
  | { readonly kind: "extra"; readonly matched: number; readonly word: Word }
  | { readonly kind: "mismatch"; readonly matched: number; readonly word: Word };

type Failure = Exclude<Attempt, { readonly kind: "ok" }>;

function attempt(
  definition: CommandDefinition,
  words: readonly Word[],
  keywords: readonly (string | undefined)[],
  kind: DeviceKind,
): Attempt {
  const args: Record<string, string | number> = {};

  for (const [index, token] of definition.tokens.entries()) {
    const word = words[index];
    if (word === undefined) return { kind: "incomplete", matched: index };

    if (typeof token === "string") {
      // 줄여 쓴 단어는 walkWords가 정한 키워드로 본다
      const typed = keywords[index] ?? word.text.toLowerCase();
      if (token.toLowerCase() !== typed) return { kind: "mismatch", matched: index, word };
      continue;
    }

    const value = readToken(token, word.text, kind);
    if (!value.ok) return { kind: "invalid", matched: index, error: value.error, word };
    args[token.param] = value.value;
  }

  const extra = words[definition.tokens.length];
  if (extra !== undefined) return { kind: "extra", matched: definition.tokens.length, word: extra };
  return { kind: "ok", args };
}

/** 같은 수의 단어가 일치했을 때 어느 실패를 사용자에게 보일지의 순서 */
const FAILURE_RANK: Readonly<Record<Failure["kind"], number>> = {
  incomplete: 0,
  invalid: 1,
  extra: 2,
  mismatch: 3,
};

/** 이 장비에 있는 정의 */
export function definitionsFor(kind: DeviceKind, definitions: readonly CommandDefinition[]): CommandDefinition[] {
  return definitions.filter((definition) => definition.devices === undefined || definition.devices.includes(kind));
}

/**
 * 이 모드에서 칠 수 있는 정의. 하위 설정 모드에서는 config 모드의 명령도 칠 수 있다 (IOS와 같음).
 * 그 모드의 정의가 앞에 오므로, 같은 줄이 둘 다에 맞으면 그 모드의 정의로 읽는다.
 */
export function candidatesFor(mode: CliMode, forDevice: readonly CommandDefinition[]): CommandDefinition[] {
  const own = forDevice.filter((definition) => definition.modes.includes(mode));
  if (mode !== "config-if" && mode !== "config-vlan") return own;
  return [...own, ...forDevice.filter((definition) => definition.modes.includes("config") && !own.includes(definition))];
}

/** 이 정의들 가운데 첫 단어가 이 글로 시작하는 것이 있는가. 줄여 쓴 글도 같은 명령어로 본다 */
function startsAny(definitions: readonly CommandDefinition[], word: Word): boolean {
  const typed = word.text.toLowerCase();
  return definitions.some((definition) => {
    const first = definition.tokens[0];
    return typeof first === "string" && first.toLowerCase().startsWith(typed);
  });
}

export function parseLine(
  line: string,
  mode: CliMode,
  kind: DeviceKind,
  definitions: readonly CommandDefinition[],
): ParseResult {
  const words = splitWords(line);
  const firstWord = words[0];
  if (firstWord === undefined) return { ok: false, error: errorInfo("CLI_INCOMPLETE_COMMAND", {}) };

  const forDevice = definitionsFor(kind, definitions);
  const candidates = candidatesFor(mode, forDevice);

  const walk = walkWords(candidates, words, kind);
  if (walk.ambiguous !== undefined) {
    return {
      ok: false,
      error: errorInfo("CLI_AMBIGUOUS_COMMAND", { token: clip(walk.ambiguous.text) }),
      position: walk.ambiguous.position,
    };
  }

  let best: Failure | undefined;
  for (const definition of candidates) {
    const result = attempt(definition, words, walk.keywords, kind);
    if (result.kind === "ok") return { ok: true, definition, args: result.args };

    const better =
      best === undefined ||
      result.matched > best.matched ||
      (result.matched === best.matched && FAILURE_RANK[result.kind] < FAILURE_RANK[best.kind]);
    if (better) best = result;
  }

  // 첫 단어부터 틀렸는데 다른 모드에는 있는 명령어라면 모드가 틀린 것이다
  if (best === undefined || (best.kind === "mismatch" && best.matched === 0)) {
    // 뒤의 단어가 맞는지는 보지 않는다. 다른 모드의 명령어를 쳤으면 값이 틀렸어도 모드부터 알린다 (T3.5.1)
    const elsewhere = startsAny(
      forDevice.filter((definition) => !candidates.includes(definition)),
      firstWord,
    );
    const code = elsewhere ? "CLI_WRONG_MODE" : "CLI_UNKNOWN_COMMAND";
    return {
      ok: false,
      error: errorInfo(code, { token: clip(firstWord.text) }),
      position: firstWord.position,
    };
  }

  switch (best.kind) {
    case "incomplete":
      return { ok: false, error: errorInfo("CLI_INCOMPLETE_COMMAND", {}) };
    case "invalid":
      return { ok: false, error: best.error, position: best.word.position };
    case "extra":
    case "mismatch":
      return {
        ok: false,
        error: errorInfo("CLI_UNKNOWN_COMMAND", { token: clip(best.word.text) }),
        position: best.word.position,
      };
  }
}
