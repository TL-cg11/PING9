import { maskToPrefixLength, PORT_NAMES } from "@ping9/shared";

import { computeViews } from "../../views";
import { lookupRoute } from "../../devices/router/routing";
import type { RoutingEntry } from "../../devices/router/routing";
import { defineCommand, param } from "../ios";
import type { CommandDefinition } from "../ios";
import { tableLines } from "../ios/table";
import { routerRunningConfigLines } from "./running-config";

export const ROUTER_SHOW_COMMANDS: readonly CommandDefinition[] = [
  defineCommand({
    modes: ["privileged"], devices: ["router"],
    tokens: ["show", "ip", "route", param("destination", "ipv4", "Destination IPv4 address")],
    help: "Look up the route, outgoing interface and next hop for a destination",
    run: (args, context) => {
      const view = computeViews(context.document)[context.device.id];
      if (view?.kind !== "router") return {};
      // 계산된 Router 테이블은 모두 실제 출력 포트를 포함한다.
      const table = view.routingTable.filter((route): route is RoutingEntry => route.port !== undefined);
      const destination = String(args.destination);
      const decision = lookupRoute(table, destination);
      const lines = decision === null ? [`No route to ${destination}`] : [
        `Routing entry for ${decision.route.network}/${maskToPrefixLength(decision.route.mask)}`,
        `  ${decision.route.source === "connected" ? "C - connected" : "S - static"}`,
        `  Next hop: ${decision.nextHop}`,
        `  Outgoing interface: ${decision.port}`,
      ];
      return { lines: lines.map(text => ({ kind: "text", text })) };
    },
  }),
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
