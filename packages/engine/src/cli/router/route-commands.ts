import { errorInfo } from "@ping9/shared";

import { customParam, defineCommand, linesFromDispatch, param } from "../ios";
import type { CommandDefinition, ParamValue } from "../ios";

/** floating static의 AD (T11.1.1). 숫자만 읽고, 1~255 범위는 reducer가 본다 */
const DISTANCE = customParam("distance", "Administrative distance (1-255)", (text): ParamValue =>
  /^\d{1,9}$/.test(text)
    ? { ok: true, value: Number(text) }
    : { ok: false, error: errorInfo("CLI_INVALID_VALUE", { token: text.slice(0, 64) }) },
);

// `ip route`, `ip route ... <AD>`, `no ip route`, `no ip route ... <AD>`
export const ROUTER_ROUTE_COMMANDS: readonly CommandDefinition[] = ([false, true] as const).flatMap(remove =>
  ([false, true] as const).map(withDistance => defineCommand({
    modes: ["config"], devices: ["router"],
    tokens: [...(remove ? ["no"] : []), "ip", "route", param("network", "ipv4", "Destination network"),
      param("mask", "mask", "Destination subnet mask"), param("nextHop", "ipv4", "Next-hop IPv4 address"),
      ...(withDistance ? [DISTANCE] : [])],
    help: remove
      ? withDistance ? "Remove a static route with this distance" : "Remove a static route"
      : withDistance ? "Configure a static route with an administrative distance" : "Configure a static route",
    run: (args, context) => ({ lines: linesFromDispatch(context.dispatch({
      type: remove ? "route/remove" : "route/add", deviceId: context.device.id,
      network: String(args.network), mask: String(args.mask), nextHop: String(args.nextHop),
      ...(withDistance ? { distance: Number(args.distance) } : {}),
    })) }),
  })));
