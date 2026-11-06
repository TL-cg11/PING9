// Switch 포트의 명령어: switchport mode, switchport access vlan (T5.2.1, FR-32).
// 인터페이스 설정 모드에서 쓴다. 구성은 switchport/* Command를 dispatch해서만 바꾼다 (AD-3).

import { DEFAULT_VLAN_ID } from "@ping9/shared";
import type { Command, SwitchportMode } from "@ping9/shared";

import { defineCommand, linesFromDispatch } from "../ios";
import type { CommandContext, CommandDefinition, CommandOutcome } from "../ios";
import { VLAN_ID } from "./vlan-commands";

/** 설정 중인 포트에 Command를 보낸다. 성공하면 알림만, 실패하면 오류 줄이 나온다 */
function onPort(context: CommandContext, command: (deviceId: string, port: string) => Command): CommandOutcome {
  const port = context.session.targetPort;
  if (port === undefined) return {};
  return { lines: linesFromDispatch(context.dispatch(command(context.device.id, port))) };
}

const setMode = (mode: SwitchportMode) => (_args: unknown, context: CommandContext) =>
  onPort(context, (deviceId, port) => ({ type: "switchport/set-mode", deviceId, port, mode }));

const setAccessVlan = (context: CommandContext, vlanId: number) =>
  onPort(context, (deviceId, port) => ({ type: "switchport/set-access-vlan", deviceId, port, vlanId }));

export const SWITCHPORT_COMMANDS: readonly CommandDefinition[] = [
  defineCommand({
    modes: ["config-if"],
    devices: ["switch"],
    tokens: ["switchport", "mode", "access"],
    help: "Carry one VLAN without tags",
    run: setMode("access"),
  }),
  defineCommand({
    modes: ["config-if"],
    devices: ["switch"],
    tokens: ["switchport", "mode", "trunk"],
    help: "Carry several VLANs with tags",
    run: setMode("trunk"),
  }),
  defineCommand({
    modes: ["config-if"],
    devices: ["switch"],
    tokens: ["switchport", "access", "vlan", VLAN_ID],
    help: "Set the VLAN of this port when it is in access mode",
    run: (args, context) => setAccessVlan(context, Number(args.id)),
  }),
  defineCommand({
    modes: ["config-if"],
    devices: ["switch"],
    tokens: ["no", "switchport", "access", "vlan"],
    help: "Put this port back in VLAN 1",
    run: (_args, context) => setAccessVlan(context, DEFAULT_VLAN_ID),
  }),
];
