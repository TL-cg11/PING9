import { defineCommand, linesFromDispatch, param } from "../ios";
import type { CommandDefinition } from "../ios";

export const ROUTER_ROUTE_COMMANDS: readonly CommandDefinition[] = ([false, true] as const).map(remove => defineCommand({
  modes: ["config"], devices: ["router"],
  tokens: [...(remove ? ["no"] : []), "ip", "route", param("network", "ipv4", "Destination network"),
    param("mask", "mask", "Destination subnet mask"), param("nextHop", "ipv4", "Next-hop IPv4 address")],
  help: remove ? "Remove a static route" : "Configure a static route",
  run: (args, context) => ({ lines: linesFromDispatch(context.dispatch({
    type: remove ? "route/remove" : "route/add", deviceId: context.device.id,
    network: String(args.network), mask: String(args.mask), nextHop: String(args.nextHop),
  })) }),
}));
