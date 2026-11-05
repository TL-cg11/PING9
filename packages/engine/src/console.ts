// 콘솔 경계 (AD-8). web은 장비마다 ConsolePort 하나를 받아 명령어를 실행한다.
//
// 지금은 뼈대다. 명령 트리(T1.6.1)가 들어오면 `exec`가 명령어를 해석해 실행하고,
// `complete`와 `help`는 E3(T3.2.x)에서 같은 명령 트리로 계산한다.

import { LIMITS } from "@ping9/shared";
import type { ConsoleLine, ConsoleResult, HelpEntry, TopologyDocument } from "@ping9/shared";

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

export function createConsolePort(
  deviceId: string,
  getDocument: () => TopologyDocument,
): ConsolePort {
  const findDevice = () => getDocument().devices.find((device) => device.id === deviceId);

  const prompt = (): string => {
    const device = findDevice();
    return device === undefined ? ">" : `${device.name}>`;
  };

  const result = (...lines: ConsoleLine[]): ConsoleResult => ({ lines, prompt: prompt() });

  return {
    prompt,

    exec: async (line: string): Promise<ConsoleResult> => {
      if (findDevice() === undefined) {
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

      const token = text.trim().split(/\s+/)[0] ?? "";
      if (token === "") return result();

      // 명령 트리가 아직 없어 모든 명령어가 알 수 없는 명령어다
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
