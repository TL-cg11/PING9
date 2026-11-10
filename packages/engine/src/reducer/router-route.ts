import { checkStaticRoute, errorInfo, LIMITS } from "@ping9/shared";
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
  const error = shapeError(command) ?? checkStaticRoute(device.id, command, device.config.interfaces);
  if (error !== null) return { ok: false, error };
  if (device.config.staticRoutes.some(route => sameRoute(route, command))) return { ok: true, document, notices: [] };
  if (device.config.staticRoutes.length >= LIMITS.maxStaticRoutesPerRouter) {
    return { ok: false, error: errorInfo("LIMIT_EXCEEDED", { limit: "staticRoutes", max: LIMITS.maxStaticRoutesPerRouter }) };
  }
  const route = { network: command.network, mask: command.mask, nextHop: command.nextHop };
  return withRouterConfig(document, device, { ...device.config, staticRoutes: [...device.config.staticRoutes, route] });
};

export const removeRoute: CommandHandler<"route/remove"> = (document, command) => {
  const found = findRouter(document, command.deviceId);
  if (!found.ok) return found;
  const { device } = found;
  const error = shapeError(command) ?? checkStaticRoute(device.id, command, device.config.interfaces);
  if (error !== null) return { ok: false, error };
  if (!device.config.staticRoutes.some(route => sameRoute(route, command))) {
    return { ok: false, error: errorInfo("ROUTE_NOT_FOUND", {
      deviceId: device.id, network: command.network, mask: command.mask, nextHop: command.nextHop,
    }) };
  }
  return withRouterConfig(document, device, {
    ...device.config, staticRoutes: device.config.staticRoutes.filter(route => !sameRoute(route, command)),
  });
};
