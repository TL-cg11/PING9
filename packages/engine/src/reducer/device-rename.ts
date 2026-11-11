// T1.3.1에서 남아 있던 device/rename 처리 (T1.3.3). 화면의 이름 바꾸기와 IOS CLI의 `hostname`이 함께 쓴다.
import { checkDeviceName, errorInfo, validateDocument } from "@ping9/shared";

import { describeValue } from "../describe";
import type { CommandHandler } from "../reducer";

/** 이름만 바꾼다. 형식은 여기서 먼저 보고, 다른 장비와 겹치는지는 문서 검증기가 본다 */
export const renameDevice: CommandHandler<"device/rename"> = (document, command) => {
  if (!document.devices.some(device => device.id === command.deviceId)) {
    return { ok: false, error: errorInfo("DEVICE_NOT_FOUND", { deviceId: describeValue(command.deviceId) }) };
  }
  // 타입으로는 string이지만 경계 밖에서 온 값일 수 있다 (AD-16)
  const name: unknown = command.name;
  if (typeof name !== "string") {
    return { ok: false, error: errorInfo("INVALID_DEVICE_NAME", { value: describeValue(name) }) };
  }
  const nameError = checkDeviceName(name);
  if (nameError !== null) return { ok: false, error: nameError };

  const checked = validateDocument({
    ...document,
    devices: document.devices.map(device => device.id === command.deviceId ? { ...device, name } : device),
  });
  return checked.ok ? { ok: true, document: checked.document, notices: [] } : checked;
};
