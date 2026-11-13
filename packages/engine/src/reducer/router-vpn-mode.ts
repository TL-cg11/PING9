import { errorInfo, VPN_MODES } from "@ping9/shared";
import type { CommandHandler } from "../reducer";
import { findRouter, withRouterConfig } from "./router-common";

export const setVpnMode: CommandHandler<"router/set-vpn-mode"> = (document, command) => {
  const found = findRouter(document, command.deviceId);
  if (!found.ok) return found;
  if (command.mode !== null && !(VPN_MODES as readonly unknown[]).includes(command.mode)) {
    return { ok: false, error: errorInfo("DOCUMENT_INVALID_SHAPE", { path: "vpnMode" }) };
  }
  return withRouterConfig(document, found.device, { ...found.device.config, vpnMode: command.mode ?? undefined });
};
