// reducer: `pc/set-os` (T0.7). PC의 OS를 바꾼다.
// IP 구성과 링크는 그대로 둔다. 바뀌는 것은 콘솔의 명령어와 출력 형식, 화면의 아이콘이다.

import { OS_KINDS, errorInfo } from "@ping9/shared";
import type { OsKind } from "@ping9/shared";

import { describeValue } from "../describe";
import type { CommandHandler } from "../reducer";

function isOsKind(value: unknown): value is OsKind {
  return typeof value === "string" && (OS_KINDS as readonly string[]).includes(value);
}

export const setPcOs: CommandHandler<"pc/set-os"> = (document, command) => {
  const device = document.devices.find((candidate) => candidate.id === command.deviceId);
  if (device === undefined) {
    return { ok: false, error: errorInfo("DEVICE_NOT_FOUND", { deviceId: describeValue(command.deviceId) }) };
  }
  if (device.kind !== "pc") {
    return {
      ok: false,
      error: errorInfo("DEVICE_KIND_MISMATCH", { deviceId: device.id, expected: "pc", actual: device.kind }),
    };
  }

  // 경계 밖에서 온 값일 수 있다. 정해진 OS가 아니면 받아들이지 않는다 (AD-16)
  if (!isOsKind(command.os)) {
    return { ok: false, error: errorInfo("DOCUMENT_INVALID_SHAPE", { path: "os" }) };
  }

  // 같은 OS여도 성공이다. 문서는 같은 내용의 새 객체다
  const os = command.os;
  return {
    ok: true,
    document: {
      ...document,
      devices: document.devices.map((candidate) =>
        candidate.id === device.id ? { ...device, config: { ...device.config, os } } : candidate,
      ),
    },
    notices: [],
  };
};
