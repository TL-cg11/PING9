// 알림 코드의 한국어 문구 (AD-14). Command는 받아들여졌지만 사용자에게 알릴 것이다.
// 모든 코드를 다루는 Record라서, 코드를 더하고 문구를 빠뜨리면 타입 검사가 실패한다.

import type { Notice, NoticeCode, NoticeParamsByCode } from "@ping9/shared";

import { withSubject, withTopic } from "./particles";

export const NOTICE_MESSAGES: { readonly [C in NoticeCode]: (params: NoticeParamsByCode[C]) => string } = {
  DUPLICATE_IP: ({ ip, others }) =>
    `${withTopic(ip)} ${others.map((other) => other.deviceName).join(", ")}도 쓰고 있어요`,
  VLAN_AUTO_CREATED: ({ vlanId }) => `VLAN ${withSubject(vlanId)} 없어서 새로 만들었어요`,
};

export function formatNotice(notice: Notice): string {
  // 코드로 좁혀진 params를 그 코드의 문구 함수에 넘긴다. 타입으로는 한 번에 표현되지 않아 여기서만 넓힌다
  const message = NOTICE_MESSAGES[notice.code] as (params: Notice["params"]) => string;
  return message(notice.params);
}
