// 값 하나의 형식 검증 (AD-3). CLI 해석기, reducer, validateDocument가 같은 함수를 쓴다.
// 모든 함수는 문제가 없으면 null, 있으면 `{ code, params }`를 돌려준다. 예외를 던지지 않는다.

import { errorInfo } from "./codes";
import type { ErrorInfo } from "./codes";
import { LIMITS, VLAN_ID_MAX, VLAN_ID_MIN } from "./limits";

const IPV4_PATTERN = /^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/;

/** 점으로 구분한 IPv4 문자열을 부호 없는 32비트 수로. 형식이 틀리면 null. 앞에 0이 붙은 표기(`01.2.3.4`)는 받지 않는다 */
export function parseIpv4(value: string): number | null {
  const match = IPV4_PATTERN.exec(value);
  if (!match) return null;

  let result = 0;
  for (let i = 1; i <= 4; i += 1) {
    const octet = Number(match[i]);
    if (octet > 255) return null;
    result = result * 256 + octet;
  }
  return result;
}

/** 부호 없는 32비트 수를 점으로 구분한 문자열로 */
export function formatIpv4(address: number): string {
  const a = Math.floor(address / 16777216) % 256;
  const b = Math.floor(address / 65536) % 256;
  const c = Math.floor(address / 256) % 256;
  const d = address % 256;
  return `${a}.${b}.${c}.${d}`;
}

/** IPv4 형식만 확인한다. 특수 주소도 통과한다 (경로의 목적지 네트워크 등에 씀) */
export function checkIpv4(value: string): ErrorInfo<"INVALID_IPV4"> | null {
  return parseIpv4(value) === null ? errorInfo("INVALID_IPV4", { value }) : null;
}

/**
 * 장비나 인터페이스에 줄 수 있는 주소인지. 형식에 더해 특수 주소를 거부한다 (MAL-5):
 * `0.0.0.0`, `255.255.255.255`, `127.x`, `224.x` 이상.
 */
export function checkHostIpv4(
  value: string,
): ErrorInfo<"INVALID_IPV4" | "RESERVED_IPV4"> | null {
  const address = parseIpv4(value);
  if (address === null) return errorInfo("INVALID_IPV4", { value });

  const firstOctet = Math.floor(address / 16777216);
  if (address === 0 || firstOctet === 127 || firstOctet >= 224) {
    return errorInfo("RESERVED_IPV4", { value });
  }
  return null;
}

/** 마스크의 접두사 길이 (0~32). 1이 연속되지 않으면 null */
export function maskToPrefixLength(value: string): number | null {
  const mask = parseIpv4(value);
  if (mask === null) return null;

  let length = 0;
  let bit = 2147483648; // 2^31
  while (bit >= 1 && mask >= bit && Math.floor(mask / bit) % 2 === 1) {
    length += 1;
    bit /= 2;
  }
  // 남은 비트가 모두 0이어야 연속된 마스크다
  const expected = length === 0 ? 0 : 4294967296 - 2 ** (32 - length);
  return mask === expected ? length : null;
}

/** 접두사 길이를 마스크 문자열로. 범위를 벗어나면 null */
export function prefixLengthToMask(length: number): string | null {
  if (!Number.isInteger(length) || length < 0 || length > 32) return null;
  return formatIpv4(length === 0 ? 0 : 4294967296 - 2 ** (32 - length));
}

/** 1이 연속된 마스크인지만 확인한다. `0.0.0.0`(기본 경로)과 `/32`도 통과한다 */
export function checkMask(value: string): ErrorInfo<"INVALID_MASK"> | null {
  return maskToPrefixLength(value) === null ? errorInfo("INVALID_MASK", { value }) : null;
}

/** 주소가 속한 네트워크의 주소 */
function networkOf(address: number, prefixLength: number): number {
  const size = 2 ** (32 - prefixLength);
  return Math.floor(address / size) * size;
}

/** 두 주소가 같은 네트워크에 있는지. 값의 형식이 틀리면 false */
export function isSameNetwork(a: string, b: string, mask: string): boolean {
  const first = parseIpv4(a);
  const second = parseIpv4(b);
  const length = maskToPrefixLength(mask);
  if (first === null || second === null || length === null) return false;
  return networkOf(first, length) === networkOf(second, length);
}

/**
 * 인터페이스(PC, Router)에 줄 주소와 마스크의 짝을 확인한다.
 * 주소는 특수 주소가 아니어야 하고, 마스크는 /1 ~ /30이어야 하며, 주소가 네트워크 주소나 브로드캐스트 주소면 안 된다.
 */
export function checkInterfaceAddress(
  ip: string,
  mask: string,
): ErrorInfo<
  | "INVALID_IPV4"
  | "RESERVED_IPV4"
  | "INVALID_MASK"
  | "IP_IS_NETWORK_ADDRESS"
  | "IP_IS_BROADCAST_ADDRESS"
> | null {
  const ipError = checkHostIpv4(ip);
  if (ipError) return ipError;

  const length = maskToPrefixLength(mask);
  if (length === null || length < 1 || length > 30) {
    return errorInfo("INVALID_MASK", { value: mask });
  }

  const address = parseIpv4(ip) as number;
  const network = networkOf(address, length);
  const broadcast = network + 2 ** (32 - length) - 1;
  if (address === network) return errorInfo("IP_IS_NETWORK_ADDRESS", { ip, mask });
  if (address === broadcast) return errorInfo("IP_IS_BROADCAST_ADDRESS", { ip, mask });
  return null;
}

/** 기본 게이트웨이를 확인한다. 특수 주소가 아니고 인터페이스와 같은 네트워크에 있어야 한다 */
export function checkGateway(
  gateway: string,
  ip: string,
  mask: string,
): ErrorInfo<"INVALID_IPV4" | "RESERVED_IPV4" | "GATEWAY_NOT_IN_NETWORK"> | null {
  const gatewayError = checkHostIpv4(gateway);
  if (gatewayError) return gatewayError;
  if (!isSameNetwork(gateway, ip, mask)) {
    return errorInfo("GATEWAY_NOT_IN_NETWORK", { gateway, ip, mask });
  }
  return null;
}

export function checkVlanId(value: number): ErrorInfo<"INVALID_VLAN_ID"> | null {
  const valid = Number.isInteger(value) && value >= VLAN_ID_MIN && value <= VLAN_ID_MAX;
  return valid ? null : errorInfo("INVALID_VLAN_ID", { value });
}

const NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

/** 오류 params에 담을 값을 잘라 낸다. 긴 입력이 그대로 화면까지 가지 않게 한다 */
function clip(value: string): string {
  return value.length > 64 ? value.slice(0, 64) : value;
}

/** 장비 이름: 영문자, 숫자, `-`, `_`. 1~32자 */
export function checkDeviceName(value: string): ErrorInfo<"INVALID_DEVICE_NAME"> | null {
  const valid = value.length <= LIMITS.maxDeviceNameLength && NAME_PATTERN.test(value);
  return valid ? null : errorInfo("INVALID_DEVICE_NAME", { value: clip(value) });
}

/** VLAN 이름: 장비 이름과 같은 규칙 */
export function checkVlanName(value: string): ErrorInfo<"INVALID_VLAN_NAME"> | null {
  const valid = value.length <= LIMITS.maxVlanNameLength && NAME_PATTERN.test(value);
  return valid ? null : errorInfo("INVALID_VLAN_NAME", { value: clip(value) });
}

function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

/** 토폴로지 이름: 1~100자, 제어 문자 없음 (SEC-7). web과 api가 함께 쓴다 */
export function checkTopologyName(value: string): ErrorInfo<"INVALID_TOPOLOGY_NAME"> | null {
  const valid =
    value.length >= 1 &&
    value.length <= LIMITS.maxTopologyNameLength &&
    !hasControlCharacter(value);
  return valid ? null : errorInfo("INVALID_TOPOLOGY_NAME", { length: value.length });
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** 소문자 UUID 형식인지. `crypto.randomUUID()`가 만드는 값은 통과한다 */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** 문자열을 UTF-8로 적었을 때의 바이트 수 */
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) {
      // 대리 쌍은 두 단위가 4바이트
      bytes += 4;
      i += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}
