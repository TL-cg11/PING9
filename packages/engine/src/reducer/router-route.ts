import { checkStaticRoute, DEFAULT_DISTANCE, errorInfo, LIMITS, routerInterfaces } from "@ping9/shared";
import type { CommandOf, ErrorInfo, StaticRoute } from "@ping9/shared";

import { describeValue } from "../describe";
import type { CommandHandler } from "../reducer";
import { findRouter, withRouterConfig } from "./router-common";

/** 타입 경계 밖의 직접 dispatch도 형식 오류로 돌려준다. */
function shapeError(command: CommandOf<"route/add" | "route/remove">): ErrorInfo | null {
  for (const key of ["network", "mask", "nextHop"] as const) {
    if (typeof command[key] !== "string" || command[key].length > 64) {
      return errorInfo(key === "mask" ? "INVALID_MASK" : "INVALID_IPV4", { value: describeValue(command[key]) });
    }
  }
  return null;
}

const sameRoute = (a: StaticRoute, b: StaticRoute) => a.network === b.network && a.mask === b.mask && a.nextHop === b.nextHop;

export const addRoute: CommandHandler<"route/add"> = (document, command) => {
  const found = findRouter(document, command.deviceId);
  if (!found.ok) return found;
  const { device } = found;
  const error = shapeError(command) ?? checkStaticRoute(device.id, command, routerInterfaces(device.config));
  if (error !== null) return { ok: false, error };
  const distance = command.distance ?? DEFAULT_DISTANCE.static;
  const route = { network: command.network, mask: command.mask, nextHop: command.nextHop, distance };
  const existing = device.config.staticRoutes.find(candidate => sameRoute(candidate, command));
  if (existing !== undefined) {
    // 같은 경로를 다른 AD로 다시 넣으면 AD만 바꾼다 (실제 IOS와 같음)
    if ((existing.distance ?? DEFAULT_DISTANCE.static) === distance) return { ok: true, document, notices: [] };
    return withRouterConfig(document, device, {
      ...device.config,
      staticRoutes: device.config.staticRoutes.map(candidate => candidate === existing ? route : candidate),
    });
  }
  if (device.config.staticRoutes.length >= LIMITS.maxStaticRoutesPerRouter) {
    return { ok: false, error: errorInfo("LIMIT_EXCEEDED", { limit: "staticRoutes", max: LIMITS.maxStaticRoutesPerRouter }) };
  }
  return withRouterConfig(document, device, { ...device.config, staticRoutes: [...device.config.staticRoutes, route] });
};

export const removeRoute: CommandHandler<"route/remove"> = (document, command) => {
  const found = findRouter(document, command.deviceId);
  if (!found.ok) return found;
  const { device } = found;
  const error = shapeError(command) ?? checkStaticRoute(device.id, command, routerInterfaces(device.config));
  if (error !== null) return { ok: false, error };
  // AD를 주면 그 AD일 때만 지운다. 안 주면 AD와 상관없이 지운다 (T11.1.1 결정 4)
  const target = device.config.staticRoutes.find(route => sameRoute(route, command) &&
    (command.distance === undefined || (route.distance ?? DEFAULT_DISTANCE.static) === command.distance));
  if (target === undefined) {
    return { ok: false, error: errorInfo("ROUTE_NOT_FOUND", {
      deviceId: device.id, network: command.network, mask: command.mask, nextHop: command.nextHop,
    }) };
  }
  return withRouterConfig(document, device, {
    ...device.config, staticRoutes: device.config.staticRoutes.filter(route => route !== target),
  });
};
