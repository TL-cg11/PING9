// 콘솔 경계에서 오가는 값 (AD-8). 출처: 03 문서 3.4절 "공개 인터페이스".
// ConsolePort 인터페이스 자체는 packages/engine에 있다.

import type { ErrorInfo, Notice } from "./codes";

/** show, ping 결과 등 engine이 만든 영어 출력 */
export interface ConsoleTextLine {
  readonly kind: "text";
  readonly text: string;
}

/** 오류. `position`은 입력 줄에서 틀린 단어가 시작하는 위치 (0부터). 콘솔이 오류에 더하는 것은 이것뿐이다 */
export type ConsoleErrorLine = ErrorInfo & {
  readonly kind: "error";
  readonly position?: number;
};

export type ConsoleNoticeLine = Notice & { readonly kind: "notice" };

/** ping 회차의 추적을 여는 링크 */
export interface ConsoleTraceLine {
  readonly kind: "trace";
  readonly traceId: number;
}

export type ConsoleLine =
  | ConsoleTextLine
  | ConsoleErrorLine
  | ConsoleNoticeLine
  | ConsoleTraceLine;

export interface ConsoleResult {
  readonly lines: readonly ConsoleLine[];
  /** 실행 뒤의 프롬프트 (예: `R1(config-if)#`) */
  readonly prompt: string;
}

/** `?` 도움말의 한 줄 */
export interface HelpEntry {
  /** 다음에 올 수 있는 단어 또는 매개변수 표시 (예: `address`, `<ip>`) */
  readonly token: string;
  /** 영어 설명. engine이 만든다 */
  readonly description: string;
}
