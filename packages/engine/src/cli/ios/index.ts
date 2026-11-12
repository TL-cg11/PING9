// IOS 방식 CLI의 공통 부분. Switch와 Router의 명령 정의가 이것을 쓴다.

export { BASE_COMMANDS } from "./base-commands";
export { customParam, defineCommand, param } from "./define";
export { INTERFACE_COMMANDS } from "./interface-commands";
export { isPortType, resolvePortName } from "./port-name";
export type {
  CliMode,
  CliSession,
  CommandArgs,
  CommandContext,
  CommandDefinition,
  CommandOutcome,
  ParamToken,
  ParamType,
  ParamValue,
  RuntimeAccess,
  Token,
} from "./define";
export { completeLine, completionLabels, helpFor } from "./assist";
export type { CompletionOption, PathCompleter } from "./assist";
export { iosCandidates, iosComplete, iosExec, iosHelp, iosPrompt } from "./ios-console";
export type { IosConsoleEnv } from "./ios-console";
export { parseLine } from "./parse";
export type { ParseResult } from "./parse";
export { INITIAL_SESSION, effectiveSession, linesFromDispatch, promptFor } from "./session";
