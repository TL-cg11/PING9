// reducer: RIP 구성 (T11.2.1). `router rip`, `network`, `passive-interface`가 내는 Command.
// 구성만 바꾼다. RIP 패킷을 주고받고 경로를 배우는 것은 T11.2.2.

import { classfulNetwork, errorInfo, LIMITS } from "@ping9/shared";
import type { ErrorInfo, RipConfig, RouterDevice, TopologyDocument } from "@ping9/shared";

import { describeValue } from "../describe";
import type { CommandHandler, ReduceResult } from "../reducer";
import { checkRouterPort, findRouter, withRouterConfig } from "./router-common";

const unchanged = (document: TopologyDocument): ReduceResult => ({ ok: true, document, notices: [] });

function withRip(document: TopologyDocument, device: RouterDevice, rip: RipConfig | undefined): ReduceResult {
  const { interfaces, staticRoutes } = device.config;
  return withRouterConfig(document, device, rip === undefined ? { interfaces, staticRoutes } : { interfaces, staticRoutes, rip });
}

/** RIP가 켜진 Router. 아니면 오류 */
function ripRouter(document: TopologyDocument, deviceId: unknown):
  | { readonly ok: true; readonly device: RouterDevice; readonly rip: RipConfig }
  | { readonly ok: false; readonly error: ErrorInfo } {
  const found = findRouter(document, deviceId);
  if (!found.ok) return found;
  const { rip } = found.device.config;
  if (rip === undefined) return { ok: false, error: errorInfo("RIP_NOT_ENABLED", { deviceId: found.device.id }) };
  return { ok: true, device: found.device, rip };
}

/** 경계 밖에서 온 값일 수 있다 (AD-16). 글이 아니거나 클래스풀로 맞출 수 없으면 오류 */
function networkOf(value: unknown): { readonly ok: true; readonly network: string } | { readonly ok: false; readonly error: ErrorInfo } {
  const network = typeof value === "string" && value.length <= 64 ? classfulNetwork(value) : null;
  return network === null
    ? { ok: false, error: errorInfo("RIP_NETWORK_INVALID", { network: describeValue(value) }) }
    : { ok: true, network };
}

export const enableRip: CommandHandler<"rip/enable"> = (document, command) => {
  const found = findRouter(document, command.deviceId);
  if (!found.ok) return found;
  if (found.device.config.rip !== undefined) return unchanged(document);
  return withRip(document, found.device, { networks: [], passiveInterfaces: [] });
};

export const disableRip: CommandHandler<"rip/disable"> = (document, command) => {
  const found = findRouter(document, command.deviceId);
  if (!found.ok) return found;
  if (found.device.config.rip === undefined) return unchanged(document);
  return withRip(document, found.device, undefined);
};

export const addRipNetwork: CommandHandler<"rip/add-network"> = (document, command) => {
  const found = ripRouter(document, command.deviceId);
  if (!found.ok) return found;
  const parsed = networkOf(command.network);
  if (!parsed.ok) return parsed;
  const { device, rip } = found;
  if (rip.networks.includes(parsed.network)) return unchanged(document);
  if (rip.networks.length >= LIMITS.maxRipNetworks) {
    return { ok: false, error: errorInfo("LIMIT_EXCEEDED", { limit: "ripNetworks", max: LIMITS.maxRipNetworks }) };
  }
  return withRip(document, device, { ...rip, networks: [...rip.networks, parsed.network] });
};

export const removeRipNetwork: CommandHandler<"rip/remove-network"> = (document, command) => {
  const found = ripRouter(document, command.deviceId);
  if (!found.ok) return found;
  const parsed = networkOf(command.network);
  if (!parsed.ok) return parsed;
  const { device, rip } = found;
  if (!rip.networks.includes(parsed.network)) {
    return { ok: false, error: errorInfo("RIP_NETWORK_NOT_FOUND", { deviceId: device.id, network: parsed.network }) };
  }
  return withRip(document, device, { ...rip, networks: rip.networks.filter(network => network !== parsed.network) });
};

export const setRipPassive: CommandHandler<"rip/set-passive"> = (document, command) => {
  const found = ripRouter(document, command.deviceId);
  if (!found.ok) return found;
  const { device, rip } = found;
  const portError = checkRouterPort(device, command.port);
  if (portError !== null) return { ok: false, error: portError };
  if (typeof command.passive !== "boolean") {
    return { ok: false, error: errorInfo("DOCUMENT_INVALID_SHAPE", { path: "passive" }) };
  }
  const now = rip.passiveInterfaces.includes(command.port);
  if (now === command.passive) return unchanged(document);
  const passiveInterfaces = command.passive
    ? [...rip.passiveInterfaces, command.port]
    : rip.passiveInterfaces.filter(port => port !== command.port);
  return withRip(document, device, { ...rip, passiveInterfaces });
};
