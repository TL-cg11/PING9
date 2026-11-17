// 서버로 쓰는 PC의 구성 규칙 (T0.20). 문서 불러오기(validateDocument)와 reducer가 같은 함수를 쓴다.
// PC의 종류를 `server`로 고르면 그 PC가 HTTP, DNS, NTP, FTP 서비스를 돌린다. 콘솔과 네트워크 동작은 Linux PC와 같다.

import { errorInfo } from "./codes";
import type { ErrorInfo } from "./codes";
import { DEFAULT_OS, SERVICE_KINDS } from "./document";
import type { DnsRecord, PcConfig, PcOsChoice, ServiceKind } from "./document";
import { LIMITS } from "./limits";
import { checkHostIpv4 } from "./values";

/** 속성 패널에서 고른 종류. 칸이 없으면 `DEFAULT_OS` */
export function osChoiceOf(config: PcConfig): PcOsChoice {
  return config.os ?? DEFAULT_OS;
}

/** 서버로 쓰는 PC인지 */
export function isServer(config: PcConfig): boolean {
  return config.os === "server";
}

/**
 * 지금 켜져 있는 서비스. 서버가 아니면 없다. 서버인데 `services` 칸이 없으면 넷 다 켜져 있다
 * (처음 서버로 바꾸면 바로 쓸 수 있다)
 */
export function servicesOf(config: PcConfig): readonly ServiceKind[] {
  if (!isServer(config)) return [];
  return config.services ?? SERVICE_KINDS;
}

/** DNS 서비스가 답하는 이름과 주소. 없으면 빈 목록 */
export function dnsRecordsOf(config: PcConfig): readonly DnsRecord[] {
  return config.dnsRecords ?? [];
}

const LABEL = "[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?";
const HOST_NAME = new RegExp(`^${LABEL}(\\.${LABEL})*$`);

/**
 * DNS 이름의 최대 길이. 응답의 첫 줄 `<이름> A <주소>`(주소는 길어야 15자)가
 * 프레임 안 글자의 한도 64자(SEC-7)에 들어가는 길이다
 */
export const MAX_HOST_NAME_LENGTH = 45;

/** DNS 이름: 소문자 영문자, 숫자, `-`의 마디를 `.`으로 이은 것. 전체 45자까지 */
export function checkHostName(value: string): ErrorInfo<"DNS_NAME_INVALID"> | null {
  return value.length <= MAX_HOST_NAME_LENGTH && HOST_NAME.test(value)
    ? null
    : errorInfo("DNS_NAME_INVALID", { value: value.slice(0, 64) });
}

/** 서비스 목록은 정해진 순서로, 겹침 없이 */
export function normalizeServices(services: readonly ServiceKind[]): readonly ServiceKind[] {
  return SERVICE_KINDS.filter((kind) => services.includes(kind));
}

/** 문서 불러오기와 reducer가 같은 규칙을 쓴다. 서비스 이름의 형태는 스키마가 본다 */
export function checkPcServices(config: PcConfig, path: string): ErrorInfo | null {
  const shape = (where: string) => errorInfo("DOCUMENT_INVALID_SHAPE", { path: `${path}.${where}`.slice(0, 200) });
  const { services, dnsRecords } = config;
  if (services !== undefined && normalizeServices(services).join() !== services.join()) return shape("services");
  if (dnsRecords === undefined) return null;
  if (dnsRecords.length > LIMITS.maxDnsRecords) return errorInfo("LIMIT_EXCEEDED", { limit: "dnsRecords", max: LIMITS.maxDnsRecords });
  const names = new Set<string>();
  for (const record of dnsRecords) {
    const error = checkHostName(record.name) ?? checkHostIpv4(record.address);
    if (error !== null) return error;
    if (names.has(record.name)) return shape("dnsRecords");
    names.add(record.name);
  }
  return null;
}
