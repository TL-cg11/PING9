// 터미널 창 하나의 상태: 화면 기록, 현재 프롬프트, 이전 명령어 (FR-19).
// 프롬프트, CLI 모드, 명령어 해석은 모두 engine에 있다. 여기는 입력과 기록만 다룬다.
// 순수 함수라 DOM 없이 테스트한다.

import type { ConsolePort } from "@ping9/engine";
import { LIMITS } from "@ping9/shared";
import type { ConsoleResult } from "@ping9/shared";

import { formatError } from "../messages/errors";
import { formatNotice } from "../messages/notices";

export type TerminalLine =
  /** 사용자가 입력한 줄. 그때의 프롬프트와 함께 남긴다 */
  | { readonly kind: "input"; readonly prompt: string; readonly text: string }
  /** `marker`는 바로 위의 입력 줄에서 틀린 위치를 가리키는 `^` 줄이다 (T3.5.2) */
  | { readonly kind: "text" | "error" | "notice" | "marker"; readonly text: string };

export interface TerminalState {
  readonly lines: readonly TerminalLine[];
  readonly prompt: string;
  /** 실행한 줄. 가장 최근 것이 뒤 */
  readonly history: readonly string[];
  /** 위·아래 화살표로 보고 있는 이력의 위치. null이면 새 줄을 쓰는 중 */
  readonly historyIndex: number | null;
}

/** 화면 기록의 한도. 넘으면 오래된 줄부터 버린다 (SEC-15) */
const MAX_LINES = 5000;

const keepRecent = (lines: readonly TerminalLine[]): readonly TerminalLine[] =>
  lines.length > MAX_LINES ? lines.slice(lines.length - MAX_LINES) : lines;

export function initialTerminal(prompt: string): TerminalState {
  return { lines: [], prompt, history: [], historyIndex: null };
}

/** 탭은 공백으로 바꾸고, 그 밖의 제어 문자는 지우고, 한 줄의 한도로 자른다 (SEC-11, SEC-15) */
export function cleanInput(text: string): string {
  let clean = "";
  for (const character of text) {
    // 붙여 넣은 줄의 탭은 단어 사이의 공백이다. 지우면 단어가 붙어 버린다
    if (character === "	") {
      clean += " ";
      continue;
    }
    const code = character.codePointAt(0)!;
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) continue;
    clean += character;
  }
  return clean.slice(0, LIMITS.maxConsoleLineLength);
}

/** 입력한 줄을 기록한다. 빈 줄과 바로 앞과 같은 줄은 이력에 넣지 않는다 */
export function submitted(state: TerminalState, input: string): TerminalState {
  const remember = input.trim() !== "" && state.history.at(-1) !== input;
  return {
    ...state,
    lines: keepRecent([...state.lines, { kind: "input", prompt: state.prompt, text: input }]),
    history: remember ? [...state.history, input] : state.history,
    historyIndex: null,
  };
}

/** engine이 돌려준 결과를 기록한다. 오류와 알림은 한국어 문구로 바꾼다 */
export function received(state: TerminalState, result: ConsoleResult): TerminalState {
  const lines: TerminalLine[] = [];
  // 이 결과를 낸 입력 줄. 실행하면 입력 줄이 먼저 기록되므로 화면 기록의 마지막 줄이다
  const last = state.lines.at(-1);
  const echoed = last?.kind === "input" ? last : undefined;
  for (const line of result.lines) {
    switch (line.kind) {
      case "text":
        lines.push({ kind: "text", text: line.text });
        break;
      case "error":
        // 틀린 단어 밑에 ^를 찍는다. 화면의 입력 줄은 "프롬프트 + 공백 + 입력한 글"이다
        if (line.position !== undefined && echoed !== undefined) {
          lines.push({ kind: "marker", text: `${" ".repeat(echoed.prompt.length + 1 + line.position)}^` });
        }
        lines.push({ kind: "error", text: formatError(line) });
        break;
      case "notice":
        lines.push({ kind: "notice", text: formatNotice(line) });
        break;
      case "trace":
        // 추적 링크는 이벤트 목록이 생길 때 그린다 (T1.9.4)
        break;
    }
  }
  return { ...state, lines: keepRecent([...state.lines, ...lines]), prompt: result.prompt };
}

/** 위·아래 화살표. 돌려주는 `input`을 입력란에 넣는다 */
export function historyStep(
  state: TerminalState,
  direction: "up" | "down",
): { readonly state: TerminalState; readonly input: string } {
  const last = state.history.length - 1;
  if (last < 0) return { state, input: "" };

  if (direction === "up") {
    const index = state.historyIndex === null ? last : Math.max(0, state.historyIndex - 1);
    return { state: { ...state, historyIndex: index }, input: state.history[index]! };
  }

  if (state.historyIndex === null) return { state, input: "" };
  if (state.historyIndex >= last) return { state: { ...state, historyIndex: null }, input: "" };
  const index = state.historyIndex + 1;
  return { state: { ...state, historyIndex: index }, input: state.history[index]! };
}

/** Tab: 완성한 줄을 돌려준다. 완성할 것이 없으면 입력 중인 줄 그대로다 (T3.2.3) */
export function completed(port: ConsolePort, input: string): string {
  return port.complete(cleanInput(input)) ?? input;
}

/**
 * `?`: 입력 중인 줄에 `?`를 붙여 남기고, 그 자리에 올 수 있는 단어와 설명을 열을 맞춰 보인다 (T3.2.3).
 * 실행한 줄이 아니므로 이전 명령어에는 넣지 않는다. 입력란의 글은 부르는 쪽이 그대로 둔다.
 */
export function showHelp(port: ConsolePort, state: TerminalState, input: string): TerminalState {
  const line = cleanInput(input);
  const entries = port.help(line);
  const width = Math.max(0, ...entries.map((entry) => entry.token.length));

  const lines: TerminalLine[] =
    entries.length === 0
      ? [{ kind: "notice", text: "여기에 올 수 있는 명령어가 없어요" }]
      : entries.map((entry) => ({
          kind: "text",
          text: `  ${entry.token.padEnd(width)}  ${entry.description}`,
        }));

  return {
    ...state,
    lines: keepRecent([...state.lines, { kind: "input", prompt: state.prompt, text: `${line}?` }, ...lines]),
  };
}

/** 한 줄을 실행한다: 입력을 기록하고, engine에 넘기고, 결과를 기록한다 */
export async function runLine(port: ConsolePort, state: TerminalState, input: string): Promise<TerminalState> {
  const line = cleanInput(input);
  const echoed = submitted(state, line);
  return received(echoed, await port.exec(line));
}
