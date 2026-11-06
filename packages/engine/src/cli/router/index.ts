// Router는 공통 모드·포트 제어와 IP 설정 명령을 조합한다. route 명령은 T4.3.1에서 추가한다.
import { BASE_COMMANDS, INTERFACE_COMMANDS } from "../ios";
import type { CommandDefinition } from "../ios";
import { ROUTER_INTERFACE_COMMANDS } from "./interface-commands";
import { ROUTER_SHOW_COMMANDS } from "./show-commands";

export const ROUTER_COMMANDS: readonly CommandDefinition[] = [
  ...BASE_COMMANDS,
  ...INTERFACE_COMMANDS,
  ...ROUTER_INTERFACE_COMMANDS,
  ...ROUTER_SHOW_COMMANDS,
];
