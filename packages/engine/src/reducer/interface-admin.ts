// reducer: `interface/set-admin` (T3.3.2, FR-18). 포트를 끄고 켠다.
// 지금은 Switch의 포트만 다룬다. Router의 인터페이스는 Router 담당이 이 처리기에 분기를 더한다.

import { errorInfo } from "@ping9/shared";

import type { CommandHandler } from "../reducer";
import { checkSwitchPort, findSwitch, withSwitchPort } from "./switch-common";

export const setInterfaceAdmin: CommandHandler<"interface/set-admin"> = (document, command) => {
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
