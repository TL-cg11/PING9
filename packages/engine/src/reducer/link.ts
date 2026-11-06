// T1.4.1: 포트 연결과 해제. 전체 문서의 참조/점유 규칙은 shared 검증기만 사용한다.
import { LIMITS, errorInfo, isUuid, validateDocument } from "@ping9/shared";

import { describeValue } from "../describe";
import type { CommandHandler } from "../reducer";

export const addLink: CommandHandler<"link/add"> = (document, command) => {
  if (typeof command.id !== "string" || !isUuid(command.id)) {
    return { ok: false, error: errorInfo("INVALID_ID", { id: describeValue(command.id) }) };
  }
  if (document.links.length >= LIMITS.maxLinks) {
    return { ok: false, error: errorInfo("LIMIT_EXCEEDED", { limit: "links", max: LIMITS.maxLinks }) };
  }
  const checked = validateDocument({
    ...document,
    links: [...document.links, { id: command.id, ends: command.ends }],
  });
  return checked.ok ? { ok: true, document: checked.document, notices: [] } : checked;
};

export const removeLink: CommandHandler<"link/remove"> = (document, command) => {
  if (!document.links.some(link => link.id === command.linkId)) {
    return { ok: false, error: errorInfo("LINK_NOT_FOUND", { linkId: describeValue(command.linkId) }) };
  }
  return { ok: true, document: { ...document, links: document.links.filter(link => link.id !== command.linkId) }, notices: [] };
};

/** 장비 삭제 명령을 연결할 때 연결된 링크도 함께 지운다 (T1.3.1/T1.4.1). 확인 창은 T1.4.3이다. */
export const removeDevice: CommandHandler<"device/remove"> = (document, command) => {
  if (!document.devices.some(device => device.id === command.deviceId)) {
    return { ok: false, error: errorInfo("DEVICE_NOT_FOUND", { deviceId: describeValue(command.deviceId) }) };
  }
  return {
    ok: true,
    document: {
      ...document,
      devices: document.devices.filter(device => device.id !== command.deviceId),
      links: document.links.filter(link => link.ends.every(end => end.deviceId !== command.deviceId)),
    },
    notices: [],
  };
};
