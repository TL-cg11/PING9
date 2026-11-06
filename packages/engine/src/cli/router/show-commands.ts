import { PORT_NAMES } from "@ping9/shared";

import { computeViews } from "../../views";
import { defineCommand } from "../ios";
import type { CommandDefinition } from "../ios";
import { tableLines } from "../ios/table";

export const ROUTER_SHOW_COMMANDS: readonly CommandDefinition[] = [
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
