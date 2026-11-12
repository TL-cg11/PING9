// PC의 라우팅 표 (T0.14). Windows `route print`, Linux `ip route`·`route -n`이 같은 경로를 다른 모양으로 보인다.
// PC의 경로는 문서의 IP·마스크·게이트웨이에서 계산한다. 따로 저장하지 않는다.

import { PORT_NAMES, formatIpv4, maskToPrefixLength, parseIpv4 } from "@ping9/shared";
import type { PcDevice, PortStatus } from "@ping9/shared";

import { computeViews } from "../../views";
import type { CommandContext } from "../ios";

const PC_PORT = PORT_NAMES.pc[0];

export interface PcRoutes {
  readonly ip: string;
  readonly mask: string;
  readonly prefix: number;
  /** 내 네트워크 주소 */
  readonly network: string;
  /** 기본 게이트웨이. 없으면 기본 경로가 없다 */
  readonly gateway?: string;
  /** 포트 상태. Linux의 `linkdown` 표시에 쓴다 */
  readonly status: PortStatus;
}

/** 포트 상태는 화면과 같은 값을 쓴다 (AD-7) */
export function portStatusOf(pc: PcDevice, context: CommandContext): PortStatus {
  return computeViews(context.document)[pc.id]?.ports.find((port) => port.name === PC_PORT)?.status ?? "no-link";
}

/**
 * 지금 PC의 경로. IP가 없거나 포트가 꺼져 있으면 null (경로가 하나도 없다).
 * 꺼진 동안 게이트웨이는 문서에 남지만 경로에는 보이지 않는다 (T0.14 결정 4)
 */
export function pcRoutes(pc: PcDevice, status: PortStatus): PcRoutes | null {
  const { ip, mask, gateway } = pc.config;
  if (status === "admin-down" || ip === undefined || mask === undefined) return null;
  const address = parseIpv4(ip);
  const bits = parseIpv4(mask);
  const prefix = maskToPrefixLength(mask);
  if (address === null || bits === null || prefix === null) return null;
  // 32비트 정수의 비트 연산은 부호가 생기므로 >>> 0으로 양수로 되돌린다
  const network = formatIpv4((address & bits) >>> 0);
  return { ip, mask, prefix, network, ...(gateway === undefined ? {} : { gateway }), status };
}
