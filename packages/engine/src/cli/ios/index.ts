// IOS 방식 CLI의 공통 부분. Switch와 Router의 명령 정의가 이것을 쓴다.

export { defineCommand, param } from "./define";
export type {
  CliMode,
  CliSession,
  CommandArgs,
  CommandContext,
  CommandDefinition,
  CommandOutcome,
  ParamToken,
  ParamType,
  Token,
} from "./define";
export { iosExec, iosPrompt } from "./ios-console";
export type { IosConsoleEnv } from "./ios-console";
export { parseLine } from "./parse";
export type { ParseResult } from "./parse";
export { INITIAL_SESSION, effectiveSession, linesFromDispatch, promptFor } from "./session";
