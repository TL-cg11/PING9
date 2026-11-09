import { errorInfo, validateDocument } from "@ping9/shared";

import { describeValue } from "../describe";
import type { CommandHandler } from "../reducer";

/** 드래그가 끝날 때 한 번 호출한다. 장비 구성과 링크 참조는 보존한다. */
export const moveDevice: CommandHandler<"device/move"> = (document, command) => {
  if (!document.devices.some(device => device.id === command.deviceId)) {
    return { ok: false, error: errorInfo("DEVICE_NOT_FOUND", { deviceId: describeValue(command.deviceId) }) };
  }
  const checked = validateDocument({
    ...document,
    devices: document.devices.map(device => device.id === command.deviceId ? { ...device, position: command.position } : device),
  });
  return checked.ok ? { ok: true, document: checked.document, notices: [] } : checked;
};
