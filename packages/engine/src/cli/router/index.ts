// Router는 공통 모드·포트 제어, IP와 정적 경로 명령을 조합한다.
import { BASE_COMMANDS, INTERFACE_COMMANDS } from "../ios";
import type { CommandDefinition } from "../ios";
import { ROUTER_INTERFACE_COMMANDS } from "./interface-commands";
import { ROUTER_SHOW_COMMANDS } from "./show-commands";
import { ROUTER_ROUTE_COMMANDS } from "./route-commands";

export const ROUTER_COMMANDS: readonly CommandDefinition[] = [
  ...BASE_COMMANDS,
  ...INTERFACE_COMMANDS,
  ...ROUTER_INTERFACE_COMMANDS,
  ...ROUTER_SHOW_COMMANDS,
  ...ROUTER_ROUTE_COMMANDS,
];
