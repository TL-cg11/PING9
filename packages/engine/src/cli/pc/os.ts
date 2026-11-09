// PC의 OS별로 달라지는 것 (T0.7). 명령 정의 목록, 프롬프트, 콘솔에 보이는 인터페이스 이름.
// 네트워크 동작은 OS와 상관없이 같다. 문서 안의 포트 이름도 OS와 상관없이 `Ethernet0`이다.

import { osOf } from "@ping9/shared";
import type { PcDevice } from "@ping9/shared";

import type { CommandDefinition } from "../ios";
import { LINUX_PC_COMMANDS } from "./linux-commands";
import { WINDOWS_PC_COMMANDS } from "./pc-commands";

/** 이 PC의 콘솔이 쓰는 명령 정의 목록 */
export function pcCommandsFor(pc: PcDevice): readonly CommandDefinition[] {
  return osOf(pc.config) === "linux" ? LINUX_PC_COMMANDS : WINDOWS_PC_COMMANDS;
}

/** 프롬프트. Windows는 `PC1>`, Linux는 `PC2$` */
export function pcPrompt(pc: PcDevice): string {
  return osOf(pc.config) === "linux" ? `${pc.name}$` : `${pc.name}>`;
}
