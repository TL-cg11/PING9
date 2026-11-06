// 오류 코드의 한국어 문구 (AD-14). engine과 api는 `{ code, params }`만 만들고 문장은 여기서 만든다.
// 모든 코드를 다루는 Record라서, 코드를 더하고 문구를 빠뜨리면 타입 검사가 실패한다.
// 문구에는 params의 값만 글자 그대로 넣는다. HTML을 만들지 않는다 (SEC-11).

import type { DeviceKind, ErrorCode, ErrorInfo, ErrorParamsByCode, LimitName } from "@ping9/shared";

import { withSubject, withTopic } from "./particles";

const KIND_NAMES: Readonly<Record<DeviceKind, string>> = { pc: "PC", switch: "Switch", router: "Router" };

const LIMIT_MESSAGES: Readonly<Record<LimitName, (max: number) => string>> = {
  devices: (max) => `장비는 토폴로지 하나에 ${max}대까지 놓을 수 있어요`,
  links: (max) => `링크는 토폴로지 하나에 ${max}개까지 만들 수 있어요`,
  staticRoutes: (max) => `Static route는 Router 하나에 ${max}개까지 넣을 수 있어요`,
  vlans: (max) => `VLAN은 Switch 하나에 ${max}개까지 만들 수 있어요`,
  allowedVlanRanges: (max) => `trunk 허용 목록의 범위는 포트 하나에 ${max}개까지 쓸 수 있어요`,
};

export const ERROR_MESSAGES: { readonly [C in ErrorCode]: (params: ErrorParamsByCode[C]) => string } = {
  // 값 하나의 형식
  INVALID_IPV4: ({ value }) => `IP 주소의 형식이 맞지 않아요: ${value}`,
  RESERVED_IPV4: ({ value }) => `장비에 쓸 수 없는 IP 주소예요: ${value}`,
  INVALID_MASK: ({ value }) => `서브넷 마스크로 쓸 수 없는 값이에요: ${value}`,
  IP_IS_NETWORK_ADDRESS: ({ ip, mask }) => `${withTopic(ip)} ${mask} 네트워크의 네트워크 주소라 쓸 수 없어요`,
  IP_IS_BROADCAST_ADDRESS: ({ ip, mask }) => `${withTopic(ip)} ${mask} 네트워크의 브로드캐스트 주소라 쓸 수 없어요`,
  GATEWAY_NOT_IN_NETWORK: ({ gateway, ip, mask }) =>
    `게이트웨이 ${withSubject(gateway)} ${ip} ${mask}와 같은 네트워크에 없어요`,
  INVALID_VLAN_ID: ({ value }) => `VLAN 번호는 1~4094여야 해요: ${value}`,
  INVALID_VLAN_NAME: ({ value }) => `VLAN 이름은 영문자, 숫자, -, _로 1~32자여야 해요: ${value}`,
  INVALID_DEVICE_NAME: ({ value }) => `장비 이름은 영문자, 숫자, -, _로 1~32자여야 해요: ${value}`,
  INVALID_TOPOLOGY_NAME: ({ length }) => `토폴로지 이름으로 쓸 수 없어요 (${length}자)`,
  INVALID_ID: ({ id }) => `ID의 형식이 맞지 않아요: ${id}`,

  // 문서 전체
  DOCUMENT_TOO_LARGE: ({ size, limit }) => `문서가 너무 커요 (${size}바이트, 한도 ${limit}바이트)`,
  DOCUMENT_INVALID_JSON: () => "JSON으로 읽을 수 없는 파일이에요",
  DOCUMENT_FORBIDDEN_KEY: ({ key }) => `문서에 쓸 수 없는 키가 있어요: ${key}`,
  DOCUMENT_TOO_DEEP: ({ limit }) => `문서의 중첩이 너무 깊어요 (한도 ${limit}단계)`,
  DOCUMENT_UNSUPPORTED_VERSION: ({ current }) => `이 버전의 문서는 열 수 없어요 (지원 버전 ${current})`,
  DOCUMENT_INVALID_SHAPE: ({ path }) => `문서의 형태가 맞지 않아요: ${path}`,
  DUPLICATE_ID: ({ id }) => `같은 ID가 두 번 나와요: ${id}`,
  DUPLICATE_DEVICE_NAME: ({ name }) => `이미 쓰고 있는 장비 이름이에요: ${name}`,
  DUPLICATE_VLAN: ({ vlanId }) => `VLAN ${withTopic(vlanId)} 이미 있어요`,
  UNKNOWN_PORT: ({ kind, port }) => `${KIND_NAMES[kind]}에 없는 포트예요: ${port}`,
  LINK_DEVICE_NOT_FOUND: () => "링크가 가리키는 장비가 없어요",
  LINK_PORT_NOT_FOUND: ({ port }) => `링크가 가리키는 포트가 없어요: ${port}`,
  LINK_SAME_DEVICE: () => "같은 장비의 포트끼리는 연결할 수 없어요",
  PORT_IN_USE: ({ port }) => `이미 연결된 포트예요: ${port}`,
  LIMIT_EXCEEDED: ({ limit, max }) => LIMIT_MESSAGES[limit](max),
  TRACE_INVALID: ({ path }) => `추적 기록의 형태가 맞지 않아요: ${path}`,

  // Command 처리
  UNKNOWN_COMMAND: ({ type }) => `아직 지원하지 않는 동작이에요: ${type}`,
  DEVICE_NOT_FOUND: () => "장비를 찾을 수 없어요",
  LINK_NOT_FOUND: () => "링크를 찾을 수 없어요",
  DEVICE_KIND_MISMATCH: ({ expected, actual }) =>
    `${KIND_NAMES[expected]}에서만 할 수 있는 동작이에요 (이 장비는 ${KIND_NAMES[actual]})`,
  PC_ADDRESS_INCOMPLETE: ({ missing }) => (missing === "ip" ? "IP 주소가 빠졌어요" : "서브넷 마스크가 빠졌어요"),
  VLAN_NOT_FOUND: ({ vlanId }) => `VLAN ${withSubject(vlanId)} 없어요`,
  DEFAULT_VLAN_READONLY: () => "VLAN 1은 지우거나 이름을 바꿀 수 없어요",

  // CLI 해석
  CLI_UNKNOWN_COMMAND: ({ token }) => `알 수 없는 명령어예요: ${token}`,
  CLI_INCOMPLETE_COMMAND: () => "명령어가 끝나지 않았어요",
  CLI_AMBIGUOUS_COMMAND: ({ token }) => `여러 명령어로 읽힐 수 있어요: ${token}`,
  CLI_INVALID_VALUE: ({ token }) => `이 자리에 쓸 수 없는 값이에요: ${token}`,
  CLI_WRONG_MODE: ({ token }) => `이 모드에서는 쓸 수 없는 명령어예요: ${token}`,
  CLI_LINE_TOO_LONG: ({ limit }) => `한 줄은 ${limit}자까지 입력할 수 있어요`,
};

export function formatError(error: ErrorInfo): string {
  // 코드로 좁혀진 params를 그 코드의 문구 함수에 넘긴다. 타입으로는 한 번에 표현되지 않아 여기서만 넓힌다
  const message = ERROR_MESSAGES[error.code] as (params: ErrorInfo["params"]) => string;
  return message(error.params);
}
