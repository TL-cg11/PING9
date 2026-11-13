// 콘솔 경계 (AD-8). web은 장비마다 ConsolePort 하나를 받아 명령어를 실행한다.
//
// 장비 종류에 명령 정의 목록이 있으면 IOS 방식 CLI(cli/ios)로 넘긴다.
// 목록이 없는 종류는 아직 모든 명령어가 알 수 없는 명령어다. 담당이 자기 목록을 아래에 더한다.
// `complete`와 `help`는 E3(T3.2.x)에서 같은 명령 정의로 계산한다.

import { LIMITS, errorInfo, osOf } from "@ping9/shared";
import type { ConsoleLine, ConsoleResult, Device, DeviceKind, HelpEntry, PcDevice } from "@ping9/shared";

import { iosCandidates, iosComplete, iosExec, iosHelp, iosPrompt } from "./cli/ios";
import type { PathCompleter } from "./cli/ios";
import { pathCompletions } from "./cli/pc/file-tree";
import type { CommandDefinition, IosConsoleEnv } from "./cli/ios";
import { initialFiles, parseEcho, pcCommandsFor, pcPrompt, runEcho, unknownCommandText, unsupportedSyntaxAt } from "./cli/pc";
import type { PcFiles } from "./cli/pc";
import { splitWords } from "./cli/ios/parse";
import { ROUTER_COMMANDS } from "./cli/router";
import { SWITCH_COMMANDS } from "./cli/switch";

export interface ConsolePort {
  /** 현재 프롬프트 (예: `PC1 User>`, `R1(config-if)#`) */
  prompt(): string;
  /** 한 줄을 실행한다. 틀린 입력에도 거부(reject)하지 않고 오류 줄을 돌려준다 */
  exec(line: string): Promise<ConsoleResult>;
  /** Tab 완성. 완성할 것이 없으면 null */
  complete(line: string): string | null;
  /** Tab을 두 번 눌렀을 때 보일 후보 (T0.19). 없으면 빈 목록 */
  candidates(line: string): readonly string[];
  /** `?` 도움말 */
  help(line: string): HelpEntry[];
}

/** 장비 종류별 명령 정의 목록. 없는 종류는 아직 CLI가 없다. PC는 OS에 따라 고른다 (T0.7) */
const DEFINITIONS_BY_KIND: Partial<Record<Exclude<DeviceKind, "pc">, readonly CommandDefinition[]>> = {
  router: ROUTER_COMMANDS,
  switch: SWITCH_COMMANDS,
};

/**
 * PC에서 첫 단어가 없는 명령어면 OS 형식의 줄(`ls: command not found`)과 한국어 안내로 바꾼다 (T0.9).
 * 첫 단어는 맞고 뒤가 틀린 줄은 `^` 표시가 있는 오류 그대로 둔다
 */
function pcUnknownCommand(lines: readonly ConsoleLine[], text: string, pc: PcDevice): readonly ConsoleLine[] {
  const [only] = lines;
  const first = splitWords(text)[0];
  if (lines.length !== 1 || only?.kind !== "error" || only.code !== "CLI_UNKNOWN_COMMAND") return lines;
  if (first === undefined || only.position !== first.position) return lines;
  return [
    ...unknownCommandText(osOf(pc.config), only.params.token).map((line): ConsoleLine => ({ kind: "text", text: line })),
    { kind: "notice", code: "PC_UNKNOWN_COMMAND", params: { token: only.params.token } },
  ];
}

function definitionsFor(device: Device): readonly CommandDefinition[] | undefined {
  return device.kind === "pc" ? pcCommandsFor(device) : DEFINITIONS_BY_KIND[device.kind];
}

export function createConsolePort(deviceId: string, env: IosConsoleEnv): ConsolePort {
  const findDevice = () => env.getDocument().devices.find((device) => device.id === deviceId);
  // PC의 경로 자리에서 Tab이 파일·폴더 이름을 채운다 (T0.19)
  const pathsOf = (device: Device): PathCompleter | undefined =>
    device.kind === "pc" ? (typed, dirsOnly) => pathCompletions(filesOf(device), typed, dirsOnly) : undefined;
  // 파일 트리가 없는 환경(일부 테스트)에서는 늘 처음 상태다
  const filesOf = (pc: PcDevice): PcFiles => env.getFiles?.(pc.id, osOf(pc.config)) ?? initialFiles(osOf(pc.config));

  const prompt = (): string => {
    const device = findDevice();
    if (device === undefined) return ">";
    // PC에는 모드가 없고 OS마다 프롬프트가 다르다 (Windows `PC1 User>`, Linux `user@PC2 ~ $`, T0.19)
    if (device.kind === "pc") return pcPrompt(device, filesOf(device));
    return definitionsFor(device) === undefined ? `${device.name}>` : iosPrompt(device, env);
  };

  const result = (...lines: ConsoleLine[]): ConsoleResult => ({ lines, prompt: prompt() });

  // 완성과 도움말을 계산할 수 있는 경우만 돌려준다. 장비가 없거나, 명령 정의가 없는 종류거나,
  // 글이 아니거나 너무 긴 줄이면 완성도 도움말도 없다 (예외를 던지지 않는다, AD-16)
  const assistTarget = (line: unknown) => {
    const device = findDevice();
    if (device === undefined) return undefined;
    const definitions = definitionsFor(device);
    if (definitions === undefined) return undefined;
    if (typeof line !== "string" || line.length > LIMITS.maxConsoleLineLength) return undefined;
    return { text: line, device, definitions };
  };

  return {
    prompt,

    exec: async (line: string): Promise<ConsoleResult> => {
      const device = findDevice();
      if (device === undefined) {
        return result({ kind: "error", code: "DEVICE_NOT_FOUND", params: { deviceId } });
      }

      const text = typeof line === "string" ? line : "";
      if (text.length > LIMITS.maxConsoleLineLength) {
        return result({
          kind: "error",
          code: "CLI_LINE_TOO_LONG",
          params: { limit: LIMITS.maxConsoleLineLength },
        });
      }

      // `echo <글>`, `echo <글> > <파일>`은 리다이렉트 기호 검사의 예외다 (T0.19 설계안 결정 3)
      if (device.kind === "pc") {
        const echo = parseEcho(text, osOf(device.config));
        if (echo !== undefined) {
          const outcome = runEcho(filesOf(device), echo);
          if (outcome.files !== undefined) env.setFiles?.(device.id, outcome.files);
          return result(...(outcome.lines ?? []).map((line): ConsoleLine => ({ kind: "text", text: line })));
        }
      }

      // PC 콘솔은 한 줄에 명령 하나다. 파이프, 리다이렉트, 명령 연결은 실행하지 않는다 (T0.9)
      if (device.kind === "pc") {
        const blocked = unsupportedSyntaxAt(text);
        if (blocked !== undefined) {
          return result({
            kind: "error",
            ...errorInfo("CLI_UNSUPPORTED_SYNTAX", { token: blocked.token }),
            position: blocked.position,
          });
        }
      }

      const definitions = definitionsFor(device);
      if (definitions !== undefined) {
        const executed = iosExec(text, device, definitions, env);
        // iosExec의 프롬프트는 IOS 모드의 것이다. PC는 실행 뒤의 문서로 OS별 프롬프트를 다시 만든다
        return device.kind === "pc"
          ? { lines: pcUnknownCommand(executed.lines, text, device), prompt: prompt() }
          : executed;
      }

      const token = text.trim().split(/\s+/)[0] ?? "";
      if (token === "") return result();

      // 이 종류의 장비에는 명령 정의가 아직 없어 모든 명령어가 알 수 없는 명령어다
      return result({
        kind: "error",
        code: "CLI_UNKNOWN_COMMAND",
        params: { token },
        position: text.indexOf(token),
      });
    },

    complete: (line: string): string | null => {
      const target = assistTarget(line);
      return target === undefined ? null : iosComplete(target.text, target.device, target.definitions, env, pathsOf(target.device));
    },

    candidates: (line: string): readonly string[] => {
      const target = assistTarget(line);
      // Tab을 두 번 누르면 PC도 Switch·Router도 그 자리에서 칠 수 있는 것을 나열한다 (T0.19)
      return target === undefined ? [] : iosCandidates(target.text, target.device, target.definitions, env, pathsOf(target.device));
    },

    help: (line: string): HelpEntry[] => {
      const target = assistTarget(line);
      return target === undefined ? [] : iosHelp(target.text, target.device, target.definitions, env);
    },
  };
}
