// Switch의 명령 정의 목록. console.ts가 Switch의 콘솔에 이 목록을 쓴다.

import { BASE_COMMANDS } from "../ios";
import type { CommandDefinition } from "../ios";

export const SWITCH_COMMANDS: readonly CommandDefinition[] = [...BASE_COMMANDS];
