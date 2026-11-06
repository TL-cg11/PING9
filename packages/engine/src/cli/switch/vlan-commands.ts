// Switch의 VLAN 명령어: vlan, no vlan, name, show vlan brief (FR-31).
// 구성은 vlan/* Command를 dispatch해서만 바꾼다 (AD-3).

import { switchVlans } from "@ping9/shared";
import type { ConsoleLine } from "@ping9/shared";

import { defineCommand, linesFromDispatch, param } from "../ios";
import type { CommandContext, CommandDefinition, CommandOutcome } from "../ios";
import { showVlanBriefLines } from "./show-vlan";

const VLAN_ID = param("id", "vlan-id", "VLAN ID (1-4094)");

function showVlanBrief(context: CommandContext): CommandOutcome {
  if (context.device.kind !== "switch") return {};
  const lines: ConsoleLine[] = showVlanBriefLines(context.device.config).map((text) => ({ kind: "text", text }));
  return { lines };
}

export const VLAN_COMMANDS: readonly CommandDefinition[] = [
  defineCommand({
    modes: ["config"],
    devices: ["switch"],
    tokens: ["vlan", VLAN_ID],
    help: "Create a VLAN or enter its configuration mode",
    run: (args, context) => {
      if (context.device.kind !== "switch") return {};
      const vlanId = Number(args.id);
      const enter: CommandOutcome = { session: { mode: "config-vlan", targetVlan: vlanId } };

      // 이미 있으면 만들지 않고 들어가기만 한다
      if (switchVlans(context.device.config).some((vlan) => vlan.id === vlanId)) return enter;

      const result = context.dispatch({ type: "vlan/create", deviceId: context.device.id, vlanId });
      return result.ok ? { ...enter, lines: linesFromDispatch(result) } : { lines: linesFromDispatch(result) };
    },
  }),
  defineCommand({
    modes: ["config"],
    devices: ["switch"],
    tokens: ["no", "vlan", VLAN_ID],
    help: "Delete a VLAN",
    run: (args, context) => ({
      lines: linesFromDispatch(
        context.dispatch({ type: "vlan/remove", deviceId: context.device.id, vlanId: Number(args.id) }),
      ),
    }),
  }),
  defineCommand({
    modes: ["config-vlan"],
    devices: ["switch"],
    tokens: ["name", param("name", "word", "VLAN name")],
    help: "Set the name of this VLAN",
    run: (args, context) => {
      const vlanId = context.session.targetVlan;
      if (vlanId === undefined) return {};
      return {
        lines: linesFromDispatch(
          context.dispatch({ type: "vlan/rename", deviceId: context.device.id, vlanId, name: String(args.name) }),
        ),
      };
    },
  }),
  defineCommand({
    modes: ["privileged"],
    devices: ["switch"],
    tokens: ["show", "vlan", "brief"],
    help: "Show VLANs and their access ports",
    run: (_args, context) => showVlanBrief(context),
  }),
  defineCommand({
    modes: ["privileged"],
    devices: ["switch"],
    tokens: ["show", "vlan"],
    help: "Show VLANs and their access ports",
    run: (_args, context) => showVlanBrief(context),
  }),
];
