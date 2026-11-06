// 콘솔 경계 (AD-8). web은 장비마다 ConsolePort 하나를 받아 명령어를 실행한다.
//
// 장비 종류에 명령 정의 목록이 있으면 IOS 방식 CLI(cli/ios)로 넘긴다.
// 목록이 없는 종류는 아직 모든 명령어가 알 수 없는 명령어다. 담당이 자기 목록을 아래에 더한다.
// `complete`와 `help`는 E3(T3.2.x)에서 같은 명령 정의로 계산한다.

import { LIMITS } from "@ping9/shared";
import type { ConsoleLine, ConsoleResult, DeviceKind, HelpEntry } from "@ping9/shared";

import { iosExec, iosPrompt } from "./cli/ios";
import type { CommandDefinition, IosConsoleEnv } from "./cli/ios";
import { SWITCH_COMMANDS } from "./cli/switch";

export interface ConsolePort {
  /** 현재 프롬프트 (예: `PC1>`, `R1(config-if)#`) */
  prompt(): string;
  /** 한 줄을 실행한다. 틀린 입력에도 거부(reject)하지 않고 오류 줄을 돌려준다 */
  exec(line: string): Promise<ConsoleResult>;
  /** Tab 완성. 완성할 것이 없으면 null */
  complete(line: string): string | null;
  /** `?` 도움말 */
  help(line: string): HelpEntry[];
}

/** 장비 종류별 명령 정의 목록. 없는 종류는 아직 CLI가 없다 */
const DEFINITIONS_BY_KIND: Partial<Record<DeviceKind, readonly CommandDefinition[]>> = {
  switch: SWITCH_COMMANDS,
};

export function createConsolePort(deviceId: string, env: IosConsoleEnv): ConsolePort {
  const findDevice = () => env.getDocument().devices.find((device) => device.id === deviceId);

  const prompt = (): string => {
    const device = findDevice();
    if (device === undefined) return ">";
    return DEFINITIONS_BY_KIND[device.kind] === undefined ? `${device.name}>` : iosPrompt(device, env);
  };

  const result = (...lines: ConsoleLine[]): ConsoleResult => ({ lines, prompt: prompt() });

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

      const definitions = DEFINITIONS_BY_KIND[device.kind];
      if (definitions !== undefined) return iosExec(text, device, definitions, env);

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

    complete: () => null,
    help: () => [],
  };
}
