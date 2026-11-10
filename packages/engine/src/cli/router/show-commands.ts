import { maskToPrefixLength, PORT_NAMES } from "@ping9/shared";
import type { RouteEntryView } from "@ping9/shared";

import { computeViews } from "../../views";
import { lookupRoute } from "../../devices/router/routing";
import type { RoutingEntry } from "../../devices/router/routing";
import { defineCommand, param } from "../ios";
import type { CommandContext, CommandDefinition } from "../ios";
import { tableLines } from "../ios/table";
import { routerRunningConfigLines } from "./running-config";

/** 배운 RIP 경로까지 든 테이블 (T11.2.2). Runtime이 없으면 Document만으로 계산한다 */
function routesOf(context: CommandContext): readonly RouteEntryView[] {
  if (context.runtime !== undefined) return context.runtime.routingTable(context.device.id);
  const view = computeViews(context.document)[context.device.id];
  return view?.kind === "router" ? view.routingTable : [];
}

const SOURCE_CODE = { connected: "C", static: "S", rip: "R" } as const;
const SOURCE_LABEL = { connected: "C - connected", static: "S - static", rip: "R - RIP" } as const;

export const ROUTER_SHOW_COMMANDS: readonly CommandDefinition[] = [
  defineCommand({
    modes: ["privileged"], devices: ["router"],
    tokens: ["show", "ip", "route", param("destination", "ipv4", "Destination IPv4 address")],
    help: "Look up the route, outgoing interface and next hop for a destination",
    run: (args, context) => {
      const table = routesOf(context).filter((route): route is RoutingEntry => route.port !== undefined);
      if (context.device.kind !== "router") return {};
      const destination = String(args.destination);
      const decision = lookupRoute(table, destination);
      const lines = decision === null ? [`No route to ${destination}`] : [
        `Routing entry for ${decision.route.network}/${maskToPrefixLength(decision.route.mask)}`,
        `  ${SOURCE_LABEL[decision.route.source]}`,
        `  Distance: ${decision.route.distance}, metric: ${decision.route.metric}`,
        `  Next hop: ${decision.nextHop}`,
        `  Outgoing interface: ${decision.port}`,
      ];
      return { lines: lines.map(text => ({ kind: "text", text })) };
    },
  }),
  defineCommand({
    modes: ["privileged"], devices: ["router"], tokens: ["show", "ip", "route"],
    help: "Show the routing table",
    run: (_args, context) => {
      if (context.device.kind !== "router") return {};
      const rows = routesOf(context).map(route => [SOURCE_CODE[route.source],
        `${route.network}/${maskToPrefixLength(route.mask)}`, `${route.distance}/${route.metric}`,
        route.nextHop ?? "directly connected", route.port ?? ""]);
      const lines = ["Codes: C - connected, S - static, R - RIP",
        ...tableLines(["Type", "Network", "AD/Metric", "Next hop", "Interface"], rows)];
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
