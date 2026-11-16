import { errorInfo, validateDocument } from "@ping9/shared";
import type { CommandHandler } from "../reducer";
import { findRouter, withRouterConfig } from "./router-common";

export const setCliStyle: CommandHandler<"router/set-cli-style"> = (document, command) => {
  const found = findRouter(document, command.deviceId);
  if (!found.ok) return found;
  if (command.style !== "ios" && command.style !== "vyos") return { ok: false, error: errorInfo("CLI_INVALID_VALUE", { token: "cliStyle" }) };
  return withRouterConfig(document, found.device, { ...found.device.config, cliStyle: command.style,
    ...(command.style === "vyos" ? { vpnMode: undefined } : {}),
    ...(command.style === "ios" ? { vyos: undefined } : {}) });
};

export const commitVyos: CommandHandler<"router/commit-vyos"> = (document, command) => {
  const found = findRouter(document, command.deviceId);
  if (!found.ok) return found;
  const checked = validateDocument({ ...document, devices: document.devices.map(device => device.id === command.deviceId ? { ...device, config: command.config } : device) });
  if (!checked.ok) return checked;
  return withRouterConfig(document, found.device, command.config);
};
