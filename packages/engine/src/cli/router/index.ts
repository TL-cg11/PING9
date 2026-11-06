// Router는 공통 모드·인터페이스 명령을 재사용한다. IP/route 명령은 T4.1.2 이후에 추가한다.
import { BASE_COMMANDS, INTERFACE_COMMANDS } from "../ios";
import type { CommandDefinition } from "../ios";
import { ROUTER_SHOW_COMMANDS } from "./show-commands";

export const ROUTER_COMMANDS: readonly CommandDefinition[] = [
  ...BASE_COMMANDS,
  ...INTERFACE_COMMANDS,
  ...ROUTER_SHOW_COMMANDS,
];
