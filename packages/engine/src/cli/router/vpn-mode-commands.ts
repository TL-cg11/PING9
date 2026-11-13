import { VPN_MODES, vpnModeOf } from "@ping9/shared";
import { defineCommand, linesFromDispatch } from "../ios";
import type { CommandDefinition } from "../ios";

export const ROUTER_VPN_MODE_COMMANDS: readonly CommandDefinition[] = [
  ...VPN_MODES.map(mode => defineCommand({ modes: ["config"], devices: ["router"], tokens: ["vpn", "mode", mode],
    help: mode === "off" ? "Use ordinary routing without VPN" : `Use ${mode.toUpperCase()} for configured VPN traffic`,
    run: (_args, context) => ({ lines: linesFromDispatch(context.dispatch({ type: "router/set-vpn-mode", deviceId: context.device.id, mode })) }) })),
  defineCommand({ modes: ["config"], devices: ["router"], tokens: ["no", "vpn", "mode"], help: "Follow existing tunnel and policy configuration",
    run: (_args, context) => ({ lines: linesFromDispatch(context.dispatch({ type: "router/set-vpn-mode", deviceId: context.device.id, mode: null })) }) }),
  defineCommand({ modes: ["privileged"], devices: ["router"], tokens: ["show", "vpn"], help: "Show the selected VPN mode",
    run: (_args, context) => context.device.kind !== "router" ? {} : { lines: [
      `VPN mode: ${vpnModeOf(context.device.config)}`,
      "off: ordinary routes; gre: Tunnel routes; ipsec: matching protected subnets.",
      "Both peers need matching configuration. IPsec is an educational simulation without encryption.",
    ].map(text => ({ kind: "text", text })) } }),
];
