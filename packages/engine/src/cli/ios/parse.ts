// 입력 한 줄을 명령 정의와 인자로 해석한다. 틀리면 오류 코드와 틀린 단어의 위치를 돌려준다 (FR-46).
// 지금은 단어가 정확히 일치할 때만 받아들인다. 줄임 입력은 T3.2.1에서 더한다.

import { checkIpv4, checkMask, checkVlanId, errorInfo } from "@ping9/shared";
import type { DeviceKind, ErrorInfo } from "@ping9/shared";

import type { CliMode, CommandArgs, CommandDefinition, ParamToken } from "./define";

export type ParseResult =
  | { readonly ok: true; readonly definition: CommandDefinition; readonly args: CommandArgs }
  | { readonly ok: false; readonly error: ErrorInfo; readonly position?: number };

interface Word {
  readonly text: string;
  /** 줄에서 이 단어가 시작하는 위치 (0부터) */
  readonly position: number;
}

/** 오류에 담을 단어를 잘라 낸다. 긴 입력이 그대로 화면까지 가지 않게 한다 */
function clip(text: string): string {
  return text.length > 64 ? text.slice(0, 64) : text;
}

function splitWords(line: string): Word[] {
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

/** 정의 하나와 줄을 맞춰 본 결과. `matched`는 앞에서부터 일치한 단어 수다 */
type Attempt =
  | { readonly kind: "ok"; readonly args: CommandArgs }
  | { readonly kind: "incomplete"; readonly matched: number }
  | { readonly kind: "invalid"; readonly matched: number; readonly error: ErrorInfo; readonly word: Word }
  | { readonly kind: "extra"; readonly matched: number; readonly word: Word }
  | { readonly kind: "mismatch"; readonly matched: number; readonly word: Word };

type Failure = Exclude<Attempt, { readonly kind: "ok" }>;

function attempt(definition: CommandDefinition, words: readonly Word[]): Attempt {
  const args: Record<string, string | number> = {};

  for (const [index, token] of definition.tokens.entries()) {
    const word = words[index];
    if (word === undefined) return { kind: "incomplete", matched: index };

    if (typeof token === "string") {
      if (token.toLowerCase() !== word.text.toLowerCase()) return { kind: "mismatch", matched: index, word };
      continue;
    }

    const value = readParam(token, word.text);
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

function firstKeywordMatches(definition: CommandDefinition, word: Word): boolean {
  const first = definition.tokens[0];
  return typeof first === "string" && first.toLowerCase() === word.text.toLowerCase();
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

  const forDevice = definitions.filter(
    (definition) => definition.devices === undefined || definition.devices.includes(kind),
  );
  const inMode = (target: CliMode) => forDevice.filter((definition) => definition.modes.includes(target));

  let candidates = inMode(mode);
  // 하위 설정 모드에서 config 모드의 명령을 치면 config 모드의 명령으로 해석한다
  if (
    (mode === "config-if" || mode === "config-vlan") &&
    !candidates.some((definition) => firstKeywordMatches(definition, firstWord))
  ) {
    candidates = inMode("config");
  }

  let best: Failure | undefined;
  for (const definition of candidates) {
    const result = attempt(definition, words);
    if (result.kind === "ok") return { ok: true, definition, args: result.args };

    const better =
      best === undefined ||
      result.matched > best.matched ||
      (result.matched === best.matched && FAILURE_RANK[result.kind] < FAILURE_RANK[best.kind]);
    if (better) best = result;
  }

  // 첫 단어부터 틀렸는데 다른 모드에는 있는 명령어라면 모드가 틀린 것이다
  if (best === undefined || (best.kind === "mismatch" && best.matched === 0)) {
    const elsewhere = forDevice.some(
      (definition) => !candidates.includes(definition) && attempt(definition, words).kind === "ok",
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
