// 한도 상수. 출처: docs/project-plan/05-security-and-testing.md 5.5절 (SEC-12, SEC-15), 02 문서 NFR-6.
export const LIMITS = {
  /** 토폴로지당 장비 수 (SEC-15) */
  maxDevices: 50,
  /** 토폴로지당 링크 수 (SEC-15) */
  maxLinks: 100,
  /** Router당 Static route 수 (SEC-15) */
  maxStaticRoutesPerRouter: 100,
  /** Router당 RIP `network` 수. 실제 IOS에는 한도가 없으나 문서 크기를 막는 다른 한도와 같은 취지 (T11.2.1) */
  maxRipNetworks: 16,
  /** Switch당 VLAN 수 (SEC-15) */
  maxVlansPerSwitch: 64,
  /** trunk 포트 하나의 허용 VLAN 범위 수. 문서에 수치가 없어 VLAN 수 한도와 같게 둠 */
  maxAllowedVlanRanges: 64,
  /** 통신 1회의 이벤트 수. 넘으면 LOOP_GUARD (SEC-15) */
  maxTraceEvents: 2000,
  /** 보관하는 추적 수 (SEC-15) */
  maxTraces: 20,
  /** 콘솔 입력 한 줄의 글자 수 (SEC-15) */
  maxConsoleLineLength: 512,
  /** 문서 크기. UTF-8, 공백 없는 직렬화 기준 (SEC-12) */
  maxDocumentBytes: 512 * 1024,
  /** 가져오기 파일 크기 (SEC-12) */
  maxImportBytes: 2 * 1024 * 1024,
  /** 문서의 중첩 깊이 (SEC-8). 정상 문서의 가장 깊은 곳은 8단계 */
  maxDocumentDepth: 12,
  /** 장비 이름 길이 (규칙 문서의 이름 규칙) */
  maxDeviceNameLength: 32,
  /** VLAN 이름 길이. 문서에 수치가 없어 장비 이름과 같게 둠 */
  maxVlanNameLength: 32,
  /** 토폴로지 이름 길이 (SEC-7) */
  maxTopologyNameLength: 100,
  /** 캔버스 좌표의 절댓값 상한. 문서에 수치가 없어 정함 */
  maxPosition: 1_000_000,
} as const;

/** LIMIT_EXCEEDED 오류가 가리키는 한도의 종류 */
export type LimitName =
  | "devices"
  | "links"
  | "staticRoutes"
  | "ripNetworks"
  | "vlans"
  | "allowedVlanRanges";

export const VLAN_ID_MIN = 1;
export const VLAN_ID_MAX = 4094;

/** 링크 한 구간의 지연. 가상 시간, 마이크로초 (규칙 문서의 "가상 시간") */
export const LINK_DELAY_MICROSECONDS = 1000;

/** 현재 Document 스키마 버전 (AD-9) */
export const CURRENT_SCHEMA_VERSION = 1;
