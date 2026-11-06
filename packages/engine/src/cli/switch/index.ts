// Switch의 명령 정의 목록. console.ts가 Switch의 콘솔에 이 목록을 쓴다.

import { BASE_COMMANDS, INTERFACE_COMMANDS } from "../ios";
import type { CommandDefinition } from "../ios";
import { SHOW_COMMANDS } from "./show-commands";
import { SWITCHPORT_COMMANDS } from "./switchport-commands";
import { VLAN_COMMANDS } from "./vlan-commands";

export const SWITCH_COMMANDS: readonly CommandDefinition[] = [
  ...BASE_COMMANDS,
  ...INTERFACE_COMMANDS,
  ...VLAN_COMMANDS,
  ...SWITCHPORT_COMMANDS,
  ...SHOW_COMMANDS,
];
