// Router는 공통 모드·포트 제어, IP와 정적 경로, RIP 구성(T11.2.1)과 확인(T11.2.4) 명령을 조합한다.
import { BASE_COMMANDS, INTERFACE_COMMANDS } from "../ios";
import type { CommandDefinition } from "../ios";
import { ROUTER_INTERFACE_COMMANDS } from "./interface-commands";
import { ROUTER_SHOW_COMMANDS } from "./show-commands";
import { ROUTER_ROUTE_COMMANDS } from "./route-commands";
import { ROUTER_NETWORK_COMMANDS } from "./network-commands";
import { ROUTER_RIP_COMMANDS } from "./rip-commands";
import { ROUTER_RIP_SHOW_COMMANDS } from "./rip-show";

export const ROUTER_COMMANDS: readonly CommandDefinition[] = [
  ...BASE_COMMANDS,
  ...INTERFACE_COMMANDS,
  ...ROUTER_INTERFACE_COMMANDS,
  ...ROUTER_SHOW_COMMANDS,
  ...ROUTER_ROUTE_COMMANDS,
  ...ROUTER_NETWORK_COMMANDS,
  ...ROUTER_RIP_COMMANDS,
  ...ROUTER_RIP_SHOW_COMMANDS,
];
