import { errorInfo, isIpsecName } from "@ping9/shared";
import type { CommandHandler } from "../reducer";
import { findRouter, withRouterConfig } from "./router-common";

export const setIpsec: CommandHandler<"ipsec/set"> = (document, command) => {
  const found = findRouter(document, command.deviceId);
  if (!found.ok) return found;
  if (typeof command.name !== "string" || !isIpsecName(command.name)) return {
    ok: false, error: errorInfo("IPSEC_INVALID_CONFIG", { detail: "프로필 이름은 영문자·숫자·-·_로 1~32자입니다" }),
  };
  return withRouterConfig(document, found.device, {
    ...found.device.config, ipsec: { ...found.device.config.ipsec, [command.name]: command.config },
  });
};

export const removeIpsec: CommandHandler<"ipsec/remove"> = (document, command) => {
  const found = findRouter(document, command.deviceId);
  if (!found.ok) return found;
  if (typeof command.name !== "string" || !isIpsecName(command.name)) return {
    ok: false, error: errorInfo("IPSEC_INVALID_CONFIG", { detail: "프로필 이름을 확인하세요" }),
  };
  return withRouterConfig(document, found.device, { ...found.device.config,
    ipsec: Object.fromEntries(Object.entries(found.device.config.ipsec ?? {}).filter(([name]) => name !== command.name)),
  });
};
