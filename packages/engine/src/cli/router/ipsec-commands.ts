import { errorInfo, IPSEC_DEFAULT_LIFETIME } from "@ping9/shared";
import type { IpsecProfileConfig } from "@ping9/shared";
import { computeViews } from "../../views";
import { customParam, defineCommand, linesFromDispatch, param } from "../ios";
import type { CommandContext, CommandDefinition, CommandOutcome } from "../ios";
import { resolvePortName } from "../ios/port-name";

const number = (name: string, help: string) => customParam(name, help, text => /^\d{1,10}$/.test(text)
  ? { ok: true, value: Number(text) } : { ok: false, error: errorInfo("CLI_INVALID_VALUE", { token: text.slice(0, 64) }) });

function update(context: CommandContext, patch: Partial<IpsecProfileConfig>): CommandOutcome {
  const name = context.session.targetIpsec;
  const config = name === undefined || context.device.kind !== "router" ? undefined : context.device.config.ipsec?.[name];
  if (name === undefined || config === undefined) return {};
  return { lines: linesFromDispatch(context.dispatch({ type: "ipsec/set", deviceId: context.device.id, name, config: { ...config, ...patch } })) };
}

/** PING9 교육용 부분집합. 실제 Cisco IKE/crypto map 문법이나 운영 장비와의 호환을 뜻하지 않는다. */
export const ROUTER_IPSEC_COMMANDS: readonly CommandDefinition[] = [
  defineCommand({ modes: ["config"], devices: ["router"], tokens: ["crypto", "ipsec", "profile", param("name", "word", "Educational IPsec profile name")],
    help: "Configure a simulated IPsec tunnel (no encryption)", run: (args, context) => {
      if (context.device.kind !== "router") return {};
      const name = String(args.name);
      const result = context.dispatch({ type: "ipsec/set", deviceId: context.device.id, name,
        config: context.device.config.ipsec?.[name] ?? { adminUp: false } });
      return result.ok ? { session: { mode: "config-ipsec", targetIpsec: name } } : { lines: linesFromDispatch(result) };
    } }),
  defineCommand({ modes: ["config"], devices: ["router"], tokens: ["no", "crypto", "ipsec", "profile", param("name", "word", "Profile to remove")],
    help: "Remove an IPsec policy", run: (args, context) => ({ lines: linesFromDispatch(context.dispatch({ type: "ipsec/remove", deviceId: context.device.id, name: String(args.name) })) }) }),
  defineCommand({ modes: ["config-ipsec"], devices: ["router"], tokens: ["peer", param("peer", "ipv4", "Remote outer IPv4 address")],
    help: "Set the IPsec peer", run: (args, context) => update(context, { peer: String(args.peer) }) }),
  defineCommand({ modes: ["config-ipsec"], devices: ["router"], tokens: ["source-interface", param("interface", "word", "Physical interface (gi0/1)")],
    help: "Bind this profile to a physical source interface", run: (args, context) => update(context, { interface: resolvePortName("router", String(args.interface)) ?? String(args.interface) }) }),
  ...(["local", "remote"] as const).map(side => defineCommand({ modes: ["config-ipsec"], devices: ["router"],
    tokens: [`${side}-subnet`, param("network", "ipv4", "Protected network"), param("mask", "mask", "Protected subnet mask")],
    help: `Set the protected ${side} subnet`, run: (args, context) => update(context, { [side]: { network: String(args.network), mask: String(args.mask) } }) })),
  defineCommand({ modes: ["config-ipsec"], devices: ["router"], tokens: ["key-id", param("keyId", "word", "Public lab key identifier (not a real secret)")],
    help: "Set a public simulation key identifier", run: (args, context) => update(context, { keyId: String(args.keyId) }) }),
  ...(["inbound", "outbound"] as const).map(direction => defineCommand({ modes: ["config-ipsec"], devices: ["router"],
    tokens: ["spi", direction, number("spi", "SPI (256-4294967295)")], help: `Set the manual ${direction} SPI`,
    run: (args, context) => update(context, { [direction === "inbound" ? "inboundSpi" : "outboundSpi"]: Number(args.spi) }) })),
  defineCommand({ modes: ["config-ipsec"], devices: ["router"], tokens: ["lifetime", number("seconds", "Virtual lifetime in seconds (1-86400)")],
    help: "Set the SA lifetime", run: (args, context) => update(context, { lifetimeSeconds: Number(args.seconds) }) }),
  ...([false, true] as const).map(adminUp => defineCommand({ modes: ["config-ipsec"], devices: ["router"], tokens: adminUp ? ["no", "shutdown"] : ["shutdown"],
    help: adminUp ? "Enable this IPsec profile" : "Disable this profile (protected traffic is still blocked)", run: (_args, context) => update(context, { adminUp }) })),
  defineCommand({ modes: ["privileged"], devices: ["router"], tokens: ["show", "crypto", "ipsec", "sa"],
    help: "Show simulated IPsec SAs and counters", run: (_args, context) => {
      if (context.device.kind !== "router") return {};
      const base = computeViews(context.document)[context.device.id];
      const views = context.runtime?.ipsecSa?.(context.device.id) ?? (base?.kind === "router" ? base.ipsec ?? [] : []);
      const lines = ["IPsec educational simulation: NO encryption, NO IKE, NO cryptographic authentication.",
        "Manual SAs; active means locally used, not a negotiated peer session."];
      if (views.length === 0) lines.push("No IPsec profiles configured.");
      for (const view of views) lines.push(`${view.name}: ${view.status}, peer ${view.peer ?? "unset"}`,
        `  inbound SPI ${view.inboundSpi ?? "unset"}, outbound SPI ${view.outboundSpi ?? "unset"}`,
        `  encapsulated ${view.encapsulated}, decapsulated ${view.decapsulated}, rejected ${view.rejected}`,
        `  tx sequence ${view.txSequence}, rx highest ${view.rxHighest}, anti-replay window 64`,
        `  lifetime ${context.device.config.ipsec?.[view.name]?.lifetimeSeconds ?? IPSEC_DEFAULT_LIFETIME} virtual seconds`);
      return { lines: lines.map(text => ({ kind: "text", text })) };
    } }),
];
