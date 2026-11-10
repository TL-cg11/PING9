// PC의 OS별로 달라지는 것 (T0.7). 명령 정의 목록, 프롬프트, 콘솔에 보이는 인터페이스 이름.
// 네트워크 동작은 OS와 상관없이 같다. 문서 안의 포트 이름도 OS와 상관없이 `Ethernet0`이다.

import { osOf } from "@ping9/shared";
import type { OsKind, PcDevice } from "@ping9/shared";

import { defineCommand } from "../ios";
import type { CommandDefinition } from "../ios";
import { LINUX_PC_COMMANDS } from "./linux-commands";
import { WINDOWS_PC_COMMANDS } from "./pc-commands";
import { LINUX_NETWORK_COMMANDS, WINDOWS_NETWORK_COMMANDS } from "./ping";

/** 명령 정의의 쓰는 형태. 매개변수 자리는 `<ip>`처럼 보인다 */
function usageOf(definition: CommandDefinition): string {
  return definition.tokens.map((token) => (typeof token === "string" ? token : `<${token.param}>`)).join(" ");
}

/**
 * `help` (T0.9): 이 OS에서 칠 수 있는 명령어를 모두 쓰는 형태와 설명으로 보인다.
 * `?`는 그 자리에 올 단어만 보이고, `help`는 전체 목록이다
 */
function helpCommand(commands: () => readonly CommandDefinition[]): CommandDefinition {
  return defineCommand({
    modes: ["user"],
    devices: ["pc"],
    tokens: ["help"],
    help: "Show all commands",
    run: () => {
      const rows = commands()
        .map((definition) => ({ usage: usageOf(definition), help: definition.help }))
        .sort((left, right) => (left.usage < right.usage ? -1 : left.usage > right.usage ? 1 : 0));
      const width = Math.max(...rows.map((row) => row.usage.length));
      return { lines: rows.map((row) => ({ kind: "text" as const, text: `  ${row.usage.padEnd(width)}  ${row.help}` })) };
    },
  });
}

// ping과 ARP 명령어(T1.8.3)는 Runtime을 쓰므로 따로 정의하고 여기서 붙인다
const WINDOWS_COMMANDS: readonly CommandDefinition[] = [
  ...WINDOWS_PC_COMMANDS,
  ...WINDOWS_NETWORK_COMMANDS,
  helpCommand(() => WINDOWS_COMMANDS),
];
// Linux는 실제처럼 대소문자를 구분한다 (T0.9). Windows는 구분하지 않는다
const LINUX_COMMANDS: readonly CommandDefinition[] = [
  ...LINUX_PC_COMMANDS,
  ...LINUX_NETWORK_COMMANDS,
  helpCommand(() => LINUX_COMMANDS),
].map((definition) => ({ ...definition, caseSensitive: true }));

/** 이 PC의 콘솔이 쓰는 명령 정의 목록 */
export function pcCommandsFor(pc: PcDevice): readonly CommandDefinition[] {
  return osOf(pc.config) === "linux" ? LINUX_COMMANDS : WINDOWS_COMMANDS;
}

/** 프롬프트. Windows는 `PC1>`, Linux는 `PC2$` */
export function pcPrompt(pc: PcDevice): string {
  return osOf(pc.config) === "linux" ? `${pc.name}$` : `${pc.name}>`;
}

/** 첫 단어가 없는 명령어일 때 OS가 내는 줄 (T0.9). 한국어 안내는 따로 붙는다 */
export function unknownCommandText(os: OsKind, token: string): readonly string[] {
  return os === "linux"
    ? [`${token}: command not found`]
    : [`'${token}' is not recognized as an internal or external command,`, "operable program or batch file."];
}

/**
 * 한 줄에 명령 하나만 받는다 (T0.9, vpc.md 4절). 파이프, 리다이렉트, 명령 연결 기호의 위치를 찾는다.
 * Windows는 `&` 하나로도 명령을 이으므로 `&&`가 아니라 `&`를 본다
 */
export function unsupportedSyntaxAt(line: string): { readonly token: string; readonly position: number } | undefined {
  const match = /[|<>;&`]|\$\(/.exec(line);
  return match === null ? undefined : { token: match[0], position: match.index };
}
