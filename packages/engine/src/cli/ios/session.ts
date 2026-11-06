// CLI 세션: 장비마다 현재 모드와 설정 중인 대상을 기억한다 (FR-19).
// 세션은 Simulator가 장비별로 하나씩 보관하고, 문서를 다시 불러오면 처음 상태로 돌아간다.

import { isPortName, switchVlans } from "@ping9/shared";
import type { ConsoleLine, Device, DispatchResult } from "@ping9/shared";

import type { CliSession } from "./define";

export const INITIAL_SESSION: CliSession = { mode: "user" };

/** 프롬프트. 예: `SW1>`, `SW1#`, `SW1(config)#`, `SW1(config-if)#`, `SW1(config-vlan)#` */
export function promptFor(deviceName: string, session: CliSession): string {
  switch (session.mode) {
    case "user":
      return `${deviceName}>`;
    case "privileged":
      return `${deviceName}#`;
    case "config":
      return `${deviceName}(config)#`;
    case "config-if":
      return `${deviceName}(config-if)#`;
    case "config-vlan":
      return `${deviceName}(config-vlan)#`;
  }
}

/**
 * 실제로 쓸 세션. 설정 중이던 대상이 다른 경로로 사라졌으면 config 모드로 돌아간다.
 * (예: config-vlan에 있는 동안 다른 곳에서 그 VLAN을 지움)
 */
export function effectiveSession(session: CliSession, device: Device): CliSession {
  if (session.mode === "config-vlan") {
    // VLAN 1은 구성에 없어도 있는 것으로 친다 (switchVlans)
    const exists =
      device.kind === "switch" && switchVlans(device.config).some((vlan) => vlan.id === session.targetVlan);
    if (!exists) return { mode: "config" };
  }
  if (session.mode === "config-if") {
    const exists = session.targetPort !== undefined && isPortName(device.kind, session.targetPort);
    if (!exists) return { mode: "config" };
  }
  return session;
}

/** dispatch의 결과를 콘솔 줄로 바꾼다. 성공이면 알림 줄들, 실패면 오류 줄 하나 */
export function linesFromDispatch(result: DispatchResult): readonly ConsoleLine[] {
  if (!result.ok) return [{ kind: "error", ...result.error }];
  return result.notices.map((notice) => ({ kind: "notice", ...notice }));
}
