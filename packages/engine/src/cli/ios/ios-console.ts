// 명령 정의 목록으로 콘솔의 한 줄 실행과 프롬프트를 만든다 (AD-8).
// 장비 종류를 모른다. 어떤 정의 목록을 쓸지는 부르는 쪽(console.ts)이 정한다.

import type {
  Command,
  ConsoleLine,
  ConsoleResult,
  Device,
  DispatchResult,
  HelpEntry,
  TopologyDocument,
} from "@ping9/shared";

import { completeLine, helpFor } from "./assist";
import type { CliSession, CommandDefinition, RuntimeAccess } from "./define";
import { parseLine } from "./parse";
import { effectiveSession, promptFor } from "./session";

/** IOS 콘솔이 Simulator에서 받아 쓰는 것 */
export interface IosConsoleEnv {
  getDocument(): TopologyDocument;
  /** Simulator의 공개 dispatch와 같은 경로다 */
  dispatch(command: Command): DispatchResult;
  /** 보관된 세션. 없으면 처음 세션 */
  getSession(deviceId: string): CliSession;
  setSession(deviceId: string, session: CliSession): void;
  /** ping과 ARP 명령어가 쓰는 Runtime (T1.8.3) */
  readonly runtime?: RuntimeAccess;
}

export function iosPrompt(device: Device, env: IosConsoleEnv): string {
  return promptFor(device.name, effectiveSession(env.getSession(device.id), device));
}

/** Tab 완성. 지금 세션의 모드에서 계산하고, 세션과 문서는 바꾸지 않는다 */
export function iosComplete(
  line: string,
  device: Device,
  definitions: readonly CommandDefinition[],
  env: IosConsoleEnv,
): string | null {
  const session = effectiveSession(env.getSession(device.id), device);
  return completeLine(line, session.mode, device.kind, definitions);
}

/** `?` 도움말. 지금 세션의 모드에서 계산하고, 세션과 문서는 바꾸지 않는다 */
export function iosHelp(
  line: string,
  device: Device,
  definitions: readonly CommandDefinition[],
  env: IosConsoleEnv,
): HelpEntry[] {
  const session = effectiveSession(env.getSession(device.id), device);
  return helpFor(line, session.mode, device.kind, definitions);
}

export function iosExec(
  line: string,
  device: Device,
  definitions: readonly CommandDefinition[],
  env: IosConsoleEnv,
): ConsoleResult {
  // 명령이 장비 이름이나 구성을 바꿀 수 있으므로 프롬프트는 실행 뒤의 문서에서 다시 계산한다
  const result = (lines: readonly ConsoleLine[]): ConsoleResult => {
    const current = env.getDocument().devices.find((candidate) => candidate.id === device.id) ?? device;
    return { lines, prompt: iosPrompt(current, env) };
  };

  // 설정 중이던 대상이 사라져 config 모드로 물러났으면 그 세션을 저장한다.
  // 저장하지 않으면 대상이 다른 경로로 다시 생겼을 때 옛 모드가 되살아난다
  const stored = env.getSession(device.id);
  const session = effectiveSession(stored, device);
  if (session !== stored) env.setSession(device.id, session);

  // `!`로 시작하는 줄은 설명이다. show running-config의 출력을 그대로 붙여 넣을 수 있게 한다
  const trimmed = line.trim();
  if (trimmed === "" || trimmed.startsWith("!")) return result([]);

  const parsed = parseLine(line, session.mode, device.kind, definitions);
  if (!parsed.ok) {
    const error: ConsoleLine =
      parsed.position === undefined
        ? { kind: "error", ...parsed.error }
        : { kind: "error", ...parsed.error, position: parsed.position };
    return result([error]);
  }

  const outcome = parsed.definition.run(parsed.args, {
    device,
    document: env.getDocument(),
    session,
    dispatch: (command) => env.dispatch(command),
    ...(env.runtime === undefined ? {} : { runtime: env.runtime }),
  });
  if (outcome.session !== undefined) env.setSession(device.id, outcome.session);
  return result(outcome.lines ?? []);
}
