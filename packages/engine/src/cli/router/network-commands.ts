import type { ConsoleLine } from "@ping9/shared";
import { ROUTER_TTL } from "../../devices/router/router-model";
import { defineCommand, param } from "../ios";
import type { CommandDefinition } from "../ios";
import { tableLines } from "../ios/table";
import { loopbackPingLines } from "../pc/ping-output";

const text = (value: string): ConsoleLine => ({ kind: "text", text: value });
export const ROUTER_NETWORK_COMMANDS: readonly CommandDefinition[] = [
  defineCommand({ modes: ["user", "privileged"], devices: ["router"], tokens: ["ping", param("ip", "ipv4", "Destination IPv4 address")],
    help: "Send 4 ICMP echo requests using the routing table",
    run: (args, context) => {
      if (context.device.kind !== "router" || context.runtime === undefined) return {};
      const target = String(args.ip);
      if (target.startsWith("127.") || Object.values(context.device.config.interfaces).some(iface => iface.adminUp && iface.ip === target)) {
        return { lines: loopbackPingLines("windows", target, 4, ROUTER_TTL) };
      }
      const result = context.runtime.ping({ deviceId: context.device.id, targetIp: target, count: 4, stopOnUnsent: false });
      if (!result.ok) return { lines: [{ kind: "error", ...result.error }] };
      const lines: ConsoleLine[] = [text(`Sending ${result.rounds.length} ICMP Echo requests to ${target}:`)];
      let received = 0;
      for (const round of result.rounds) {
        if (round.kind === "reply") { received += 1; lines.push(text(`Reply from ${target}: time=${round.timeUs / 1000} ms TTL=${round.ttl}`)); }
        else if (round.kind === "icmp-error") lines.push(text(`From ${round.sourceIp}: ${round.error === "time-exceeded" ? "TTL expired in transit." : "Destination unreachable."}`));
        else lines.push(text(round.kind === "unreachable" ? "Destination unreachable." : "Request timed out."));
        lines.push({ kind: "trace", traceId: round.traceId });
      }
      lines.push(text(`Success rate: ${received}/${result.rounds.length}`));
      return { lines };
    },
  }),
  defineCommand({ modes: ["privileged"], devices: ["router"], tokens: ["show", "arp"], help: "Show learned IP, MAC and interface mappings",
    run: (_args, context) => {
      const entries = context.runtime?.arpTable(context.device.id) ?? [];
      return { lines: tableLines(["IP address", "MAC address", "Interface"], entries.map(entry => [entry.ip, entry.mac, entry.port])).map(text) };
    },
  }),
];
