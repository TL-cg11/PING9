// reducer: `pc/set-ip` (T1.5.1, FR-25, FR-27).
// 설정 패널과 콘솔의 `ipconfig <IP> <마스크>`가 같은 Command로 이 처리기를 부른다 (AD-3).
// 값 하나의 형식은 shared의 검증 함수가 판정하고, 여기서는 장비 확인, 세 값의 조합, 중복 IP만 다룬다.

import { checkGateway, checkInterfaceAddress, errorInfo } from "@ping9/shared";
import type {
  CommandOf,
  Device,
  DeviceRef,
  ErrorInfo,
  Notice,
  PcConfig,
  TopologyDocument,
} from "@ping9/shared";

import { describeValue } from "../describe";
import type { ReduceResult } from "../reducer";

/** 오류 params에 담는 경계 밖 값의 최대 길이. reducer.ts의 UNKNOWN_COMMAND와 같다 */
const MAX_ECHO_LENGTH = 64;

// String(value)는 `{ toString: 1 }` 같은 값에서 예외를 던진다. 다른 처리기와 같은 함수를 쓴다 (AD-16)
const echo = describeValue;

const fail = (error: ErrorInfo): ReduceResult => ({ ok: false, error });

/**
 * 경계 밖에서 온 값을 `string | null`로 읽는다 (AD-16: 예외를 던지지 않음).
 * `undefined`는 `null`과 같게 본다. 문자열도 null도 아니면 `undefined`를 돌려준다.
 */
function readField(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : undefined;
}

/** 이 장비가 `ip`를 쓰는가. PC는 자기 주소, Router는 모든 인터페이스의 주소를 본다 */
function usesIp(device: Device, ip: string): boolean {
  switch (device.kind) {
    case "pc":
      return device.config.ip === ip;
    case "router":
      return Object.values(device.config.interfaces).some((iface) => iface.ip === ip);
    case "switch":
      return false;
  }
}

export function setPcIp(
  document: TopologyDocument,
  command: CommandOf<"pc/set-ip">,
): ReduceResult {
  const device = document.devices.find((candidate) => candidate.id === command.deviceId);
  if (device === undefined) {
    return fail(errorInfo("DEVICE_NOT_FOUND", { deviceId: echo(command.deviceId) }));
  }
  if (device.kind !== "pc") {
    return fail(
      errorInfo("DEVICE_KIND_MISMATCH", { deviceId: device.id, expected: "pc", actual: device.kind }),
    );
  }

  const ip = readField(command.ip);
  const mask = readField(command.mask);
  const gateway = readField(command.gateway);
  // 문자열이 아니거나 지나치게 긴 값은 shared 검사 함수에 넘기지 않는다.
  // 그 함수들은 받은 값을 오류에 그대로 담으므로, 오류의 크기를 여기서 묶는다 (IPv4는 길어야 15자)
  const tooLong = (value: string | null): boolean => value !== null && value.length > MAX_ECHO_LENGTH;
  if (ip === undefined || tooLong(ip)) {
    return fail(errorInfo("INVALID_IPV4", { value: echo(command.ip) }));
  }
  if (mask === undefined || tooLong(mask)) {
    return fail(errorInfo("INVALID_MASK", { value: echo(command.mask) }));
  }
  if (gateway === undefined || tooLong(gateway)) {
    return fail(errorInfo("INVALID_IPV4", { value: echo(command.gateway) }));
  }

  // IP 구성만 바꾼다. OS(T0.7)는 IP와 상관없이 그대로 둔다
  let address: PcConfig;
  const notices: Notice[] = [];

  if (ip === null) {
    // 세 값을 모두 비우면 설정 지우기. 하나라도 남아 있으면 IP가 빠진 것이다
    if (mask !== null || gateway !== null) {
      return fail(errorInfo("PC_ADDRESS_INCOMPLETE", { deviceId: device.id, missing: "ip" }));
    }
    address = {};
  } else {
    if (mask === null) {
      return fail(errorInfo("PC_ADDRESS_INCOMPLETE", { deviceId: device.id, missing: "mask" }));
    }

    const addressError = checkInterfaceAddress(ip, mask);
    if (addressError) return fail(addressError);

    if (gateway !== null) {
      const gatewayError = checkGateway(gateway, ip, mask);
      if (gatewayError) return fail(gatewayError);
    }

    // 비운 칸은 키를 지운다. 스키마는 값이 없는 칸을 키가 없는 것으로만 받는다
    address = gateway === null ? { ip, mask } : { ip, mask, gateway };

    // 같은 IP를 쓰는 다른 장비가 있어도 설정은 반영하고 알리기만 한다 (FR-27).
    // Document에 나오는 순서대로 담아 결과가 매번 같다 (AD-5)
    const others: DeviceRef[] = document.devices
      .filter((other) => other.id !== device.id && usesIp(other, ip))
      .map((other) => ({ deviceId: other.id, deviceName: other.name }));
    if (others.length > 0) notices.push({ code: "DUPLICATE_IP", params: { ip, others } });
  }

  const config: PcConfig = device.config.os === undefined ? address : { ...address, os: device.config.os };

  // 받은 Document는 고치지 않고 새 객체를 만든다
  return {
    ok: true,
    document: {
      ...document,
      devices: document.devices.map((candidate) =>
        candidate.id === device.id ? { ...device, config } : candidate,
      ),
    },
    notices,
  };
}
