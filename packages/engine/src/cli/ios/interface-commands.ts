// `interface <이름>`: 인터페이스 설정 모드로 들어간다 (T3.3.1). `shutdown`: 포트를 끈다 (T3.3.2).
// 장비 종류를 가리지 않는다. 포트 이름은 그 장비 종류의 것으로 읽는다.

import { errorInfo, isTunnelName } from "@ping9/shared";

import { customParam, defineCommand } from "./define";
import type { CommandContext, CommandDefinition, CommandOutcome, ParamValue } from "./define";
import { isPortType, resolvePortName } from "./port-name";
import { linesFromDispatch } from "./session";

/** 오류에 담을 글을 자른다. 해석기의 한도와 같다 */
const clip = (text: string): string => text.slice(0, 64);

const invalid = (text: string): ParamValue => ({
  ok: false,
  error: errorInfo("CLI_INVALID_VALUE", { token: clip(text) }),
});

/** `fa0/1`, `FastEthernet0/1`처럼 붙여 쓴 이름. 값은 전체 이름이다 */
const PORT = customParam("port", "Interface name (for example fa0/1)", (text, kind) => {
  const port = resolvePortName(kind, text);
  return port === undefined ? invalid(text) : { ok: true, value: port };
});

// `fastethernet 0/1`처럼 종류와 번호를 띄어 쓴 이름
const PORT_TYPE = customParam("type", "Interface type (for example fastethernet)", (text, kind) =>
  isPortType(kind, text) ? { ok: true, value: text } : invalid(text),
);
const PORT_NUMBER = customParam("number", "Interface number (for example 0/1)", (text) =>
  /^\d+(\/\d+)*$/.test(text) ? { ok: true, value: text } : invalid(text),
);

function setAdmin(context: CommandContext, adminUp: boolean): CommandOutcome {
  const port = context.session.targetPort;
  if (port === undefined) return {};
  return {
    lines: linesFromDispatch(
      context.dispatch({ type: "interface/set-admin", deviceId: context.device.id, port, adminUp }),
    ),
  };
}

function enterInterface(context: CommandContext, port: string): CommandOutcome {
  if (context.device.kind === "router" && isTunnelName(port) && context.device.config.tunnels?.[port] === undefined) {
    const result = context.dispatch({ type: "tunnel/set", deviceId: context.device.id, name: port, config: { mode: "gre", adminUp: false } });
    if (!result.ok) return { lines: linesFromDispatch(result) };
  }
  return { session: { mode: "config-if", targetPort: port } };
}

export const INTERFACE_COMMANDS: readonly CommandDefinition[] = [
  defineCommand({
    modes: ["config"],
    tokens: ["interface", PORT],
    help: "Enter interface configuration mode",
    run: (args, context) => enterInterface(context, String(args.port)),
  }),
  defineCommand({
    modes: ["config"],
    tokens: ["interface", PORT_TYPE, PORT_NUMBER],
    help: "Enter interface configuration mode",
    run: (args, context) => {
      const typed = `${String(args.type)} ${String(args.number)}`;
      const port = resolvePortName(context.device.kind, typed);
      // 두 단어를 합쳐야 포트가 정해지므로 없는 포트는 여기서 알린다 (틀린 위치는 없다)
      if (port === undefined) return { lines: [{ kind: "error", ...errorInfo("CLI_INVALID_VALUE", { token: clip(typed) }) }] };
      return enterInterface(context, port);
    },
  }),
  // 포트를 끄고 켠다 (T3.3.2). Document는 interface/set-admin으로만 바꾼다 (AD-3)
  defineCommand({
    modes: ["config-if"],
    tokens: ["shutdown"],
    help: "Disable this interface",
    run: (_args, context) => setAdmin(context, false),
  }),
  defineCommand({
    modes: ["config-if"],
    tokens: ["no", "shutdown"],
    help: "Enable this interface",
    run: (_args, context) => setAdmin(context, true),
  }),
];
