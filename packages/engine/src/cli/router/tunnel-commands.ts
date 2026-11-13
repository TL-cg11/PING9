import { errorInfo, isTunnelName } from "@ping9/shared";
import type { GreTunnelConfig } from "@ping9/shared";
import { computeViews } from "../../views";
import { tunnelStates } from "../../devices/router/routing";
import { resolvePortName } from "../ios/port-name";
import { defineCommand, linesFromDispatch, param } from "../ios";
import type { CommandContext, CommandDefinition, CommandOutcome } from "../ios";

function configure(context: CommandContext, patch: Partial<GreTunnelConfig>): CommandOutcome {
  const name = context.session.targetPort;
  const tunnel = context.device.kind === "router" && name !== undefined ? context.device.config.tunnels?.[name] : undefined;
  if (name === undefined || tunnel === undefined) return { lines: [{ kind: "error", ...errorInfo("TUNNEL_INVALID_CONFIG", { detail: "Tunnel 인터페이스에서 입력하세요" }) }] };
  return { lines: linesFromDispatch(context.dispatch({ type: "tunnel/set", deviceId: context.device.id, name, config: { ...tunnel, ...patch } })) };
}

export const ROUTER_TUNNEL_COMMANDS: readonly CommandDefinition[] = [
  defineCommand({ modes: ["config-if"], devices: ["router"], tokens: ["tunnel", "mode", "gre", "ip"],
    help: "Use GRE over IPv4", run: (_args, context) => configure(context, { mode: "gre" }) }),
  defineCommand({ modes: ["config-if"], devices: ["router"], tokens: ["tunnel", "source", param("source", "word", "Physical source interface (gi0/1)")],
    help: "Set the physical tunnel source interface", run: (args, context) => {
      const source = resolvePortName("router", String(args.source));
      return source === undefined || isTunnelName(source)
        ? { lines: [{ kind: "error", ...errorInfo("TUNNEL_INVALID_CONFIG", { detail: "source는 물리 Router 인터페이스여야 합니다" }) }] }
        : configure(context, { source });
    } }),
  defineCommand({ modes: ["config-if"], devices: ["router"], tokens: ["tunnel", "destination", param("destination", "ipv4", "Outer peer IPv4 address")],
    help: "Set the remote tunnel endpoint", run: (args, context) => configure(context, { destination: String(args.destination) }) }),
  defineCommand({ modes: ["config"], devices: ["router"], tokens: ["no", "interface", param("tunnel", "word", "Tunnel0-Tunnel3")],
    help: "Remove a logical tunnel interface", run: (args, context) => {
      const name = resolvePortName("router", String(args.tunnel)) ?? String(args.tunnel);
      return { lines: linesFromDispatch(context.dispatch({ type: "tunnel/remove", deviceId: context.device.id, name })) };
    } }),
  defineCommand({ modes: ["privileged"], devices: ["router"], tokens: ["show", "interfaces", param("tunnel", "word", "Tunnel0-Tunnel3")],
    help: "Show a GRE tunnel and its local underlay status", run: (args, context) => {
      if (context.device.kind !== "router") return {};
      const name = resolvePortName("router", String(args.tunnel));
      const tunnel = name === undefined ? undefined : context.device.config.tunnels?.[name];
      if (name === undefined || tunnel === undefined) return { lines: [{ kind: "error", ...errorInfo("TUNNEL_INVALID_CONFIG", { detail: "설정된 Tunnel 이름을 입력하세요" }) }] };
      const ports = computeViews(context.document)[context.device.id]!.ports;
      const state = tunnelStates(context.device.config, ports).find(state => state.name === name)!;
      return { lines: [`${name} is ${state.status}`, `  Internet address: ${tunnel.ip ?? "unassigned"} ${tunnel.mask ?? ""}`,
        `  Tunnel source ${tunnel.source ?? "unset"} (${state.sourceIp ?? "unassigned"}), destination ${tunnel.destination ?? "unset"}`,
        "  Tunnel protocol GRE/IP (no encryption)", "  State reflects local source and underlay; peer availability is not negotiated.",
      ].map(text => ({ kind: "text", text })) };
    } }),
];
