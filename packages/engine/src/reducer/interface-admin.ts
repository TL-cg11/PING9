// reducer: `interface/set-admin` (T3.3.2, FR-18). 포트를 끄고 켠다.
// Switch의 포트와 Router의 인터페이스를 다룬다 (T4.1.1).

import { errorInfo, isPortName } from "@ping9/shared";

import { describeValue } from "../describe";
import type { CommandHandler } from "../reducer";
import { checkSwitchPort, findSwitch, withSwitchPort } from "./switch-common";

export const setInterfaceAdmin: CommandHandler<"interface/set-admin"> = (document, command) => {
  const router = document.devices.find(device => device.id === command.deviceId);
  if (router?.kind === "router") {
    if (typeof command.port !== "string" || !isPortName("router", command.port)) {
      return { ok: false, error: errorInfo("UNKNOWN_PORT", {
        deviceId: router.id, kind: "router", port: describeValue(command.port),
      }) };
    }
    if (typeof command.adminUp !== "boolean") {
      return { ok: false, error: errorInfo("DOCUMENT_INVALID_SHAPE", { path: "adminUp" }) };
    }
    return {
      ok: true,
      document: {
        ...document,
        devices: document.devices.map(device => device === router ? {
          ...router,
          config: {
            ...router.config,
            interfaces: {
              ...router.config.interfaces,
              [command.port]: { ...router.config.interfaces[command.port], adminUp: command.adminUp },
            },
          },
        } : device),
      },
      notices: [],
    };
  }
  const found = findSwitch(document, command.deviceId);
  if (!found.ok) return found;

  const portError = checkSwitchPort(found.device, command.port);
  if (portError !== null) return { ok: false, error: portError };

  // 경계 밖에서 온 값일 수 있다. 참거짓이 아니면 받아들이지 않는다 (AD-16)
  if (typeof command.adminUp !== "boolean") {
    return { ok: false, error: errorInfo("DOCUMENT_INVALID_SHAPE", { path: "adminUp" }) };
  }

  return {
    ok: true,
    document: withSwitchPort(document, found.device, command.port, { adminUp: command.adminUp }),
    notices: [],
  };
};
