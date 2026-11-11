// RIP 구성 명령어 (T11.2.1). `router rip`로 `config-router` 모드에 들어가 `network`, `passive-interface`를 넣는다.
// 구성만 바꾼다. 패킷을 주고받는 것은 T11.2.2. version 2, no auto-summary로 고정이다 (E11 결정 5).

import { errorInfo } from "@ping9/shared";

import { customParam, defineCommand, linesFromDispatch, param, resolvePortName } from "../ios";
import type { CommandDefinition, ParamValue } from "../ios";

const NETWORK = param("network", "ipv4", "Network to run RIP on (classful, e.g. 10.0.0.0)");

/** `g0/2`, `GigabitEthernet0/2`처럼 붙여 쓴 이름. 값은 전체 이름이다 */
const PORT = customParam("port", "Interface name (for example g0/2)", (text, kind): ParamValue => {
  const port = resolvePortName(kind, text);
  return port === undefined
    ? { ok: false, error: errorInfo("CLI_INVALID_VALUE", { token: text.slice(0, 64) }) }
    : { ok: true, value: port };
});

/** `version 1`·`version 2`만 읽는다. 1은 실행할 때 지원하지 않는다고 알린다 */
const VERSION = customParam("version", "RIP version (PING9 supports 2)", (text): ParamValue =>
  text === "1" || text === "2"
    ? { ok: true, value: Number(text) }
    : { ok: false, error: errorInfo("CLI_INVALID_VALUE", { token: text.slice(0, 64) }) },
);

const rip = (definition: Omit<CommandDefinition, "devices">): CommandDefinition =>
  defineCommand({ ...definition, devices: ["router"] });

export const ROUTER_RIP_COMMANDS: readonly CommandDefinition[] = [
  rip({
    modes: ["config"],
    tokens: ["router", "rip"],
    help: "Enable RIP and enter router configuration mode",
    run: (_args, context) => {
      const result = context.dispatch({ type: "rip/enable", deviceId: context.device.id });
      return result.ok ? { session: { mode: "config-router" } } : { lines: linesFromDispatch(result) };
    },
  }),
  rip({
    modes: ["config"],
    tokens: ["no", "router", "rip"],
    help: "Remove the RIP configuration",
    run: (_args, context) => ({
      lines: linesFromDispatch(context.dispatch({ type: "rip/disable", deviceId: context.device.id })),
    }),
  }),
  ...([false, true] as const).map((remove) =>
    rip({
      modes: ["config-router"],
      tokens: [...(remove ? ["no"] : []), "network", NETWORK],
      help: remove ? "Stop running RIP on a network" : "Run RIP on the interfaces in a network",
      run: (args, context) => ({
        lines: linesFromDispatch(context.dispatch({
          type: remove ? "rip/remove-network" : "rip/add-network",
          deviceId: context.device.id,
          network: String(args.network),
        })),
      }),
    }),
  ),
  ...([false, true] as const).map((remove) =>
    rip({
      modes: ["config-router"],
      tokens: [...(remove ? ["no"] : []), "passive-interface", PORT],
      help: remove ? "Send RIP updates on the interface again" : "Only listen for RIP updates on the interface",
      run: (args, context) => ({
        lines: linesFromDispatch(context.dispatch({
          type: "rip/set-passive",
          deviceId: context.device.id,
          port: String(args.port),
          passive: !remove,
        })),
      }),
    }),
  ),
  rip({
    modes: ["config-router"],
    tokens: ["version", VERSION],
    help: "Set the RIP version (always 2 in PING9)",
    run: (args) =>
      args.version === 2
        ? {}
        : { lines: [{ kind: "error", ...errorInfo("RIP_VERSION_UNSUPPORTED", { version: Number(args.version) }) }] },
  }),
  rip({
    modes: ["config-router"],
    tokens: ["no", "auto-summary"],
    help: "Do not summarize routes at classful boundaries (always on in PING9)",
    run: () => ({}),
  }),
  rip({
    modes: ["config-router"],
    tokens: ["auto-summary"],
    help: "Summarize routes at classful boundaries (not supported in PING9)",
    run: () => ({ lines: [{ kind: "error", ...errorInfo("RIP_AUTO_SUMMARY_UNSUPPORTED", {}) }] }),
  }),
];
