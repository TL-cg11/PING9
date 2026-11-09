import { maskToPrefixLength, PORT_NAMES } from "@ping9/shared";

import { computeViews } from "../../views";
import { defineCommand } from "../ios";
import type { CommandDefinition } from "../ios";
import { tableLines } from "../ios/table";
import { routerRunningConfigLines } from "./running-config";

export const ROUTER_SHOW_COMMANDS: readonly CommandDefinition[] = [
  defineCommand({
    modes: ["privileged"], devices: ["router"], tokens: ["show", "ip", "route"],
    help: "Show active connected and static routes",
    run: (_args, context) => {
      const view = computeViews(context.document)[context.device.id];
      if (view?.kind !== "router") return {};
      const rows = view.routingTable.map(route => [route.source === "connected" ? "C" : "S",
        `${route.network}/${maskToPrefixLength(route.mask)}`, route.nextHop ?? "directly connected", route.port ?? ""]);
      const lines = ["Codes: C - connected, S - static", ...tableLines(["Type", "Network", "Next hop", "Interface"], rows)];
      return { lines: lines.map(text => ({ kind: "text", text })) };
    },
  }),
  defineCommand({
    modes: ["privileged"], devices: ["router"], tokens: ["show", "running-config"],
    help: "Show the router configuration as commands",
    run: (_args, context) => context.device.kind === "router"
      ? { lines: routerRunningConfigLines(context.device).map(text => ({ kind: "text", text })) }
      : {},
  }),
  defineCommand({
    modes: ["privileged"],
    devices: ["router"],
    tokens: ["show", "ip", "interface", "brief"],
    help: "Show interface addresses and operational status",
    run: (_args, context) => {
      const device = context.device;
      if (device.kind !== "router") return {};
      const ports = computeViews(context.document)[device.id]?.ports ?? [];
      const rows = PORT_NAMES.router.map(port => [
        port, device.config.interfaces[port]?.ip ?? "unassigned",
        ports.find(view => view.name === port)?.status ?? "admin-down",
      ]);
      return { lines: tableLines(["Interface", "IP address", "Status"], rows).map(text => ({ kind: "text", text })) };
    },
  }),
];
