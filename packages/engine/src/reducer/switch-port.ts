// Switch 포트의 모드, access VLAN, trunk 허용 목록을 바꾸는 Command 처리기 (T5.2.1, T5.3.1, FR-32, FR-33).
// 처음 걸리는 오류를 돌려주고 Document는 바꾸지 않는다.
// 출처: docs/superpowers/specs/2026-11-05-switch-vlan-design.md 5.2절.

import { LIMITS, SWITCHPORT_MODES, checkVlanId, defaultVlanName, errorInfo, switchVlans } from "@ping9/shared";
import type { ErrorInfo, Notice, SwitchDevice, VlanRange } from "@ping9/shared";

import type { CommandHandler, ReduceResult } from "../reducer";
import { checkSwitchPort, checkVlanIdValue, findSwitch, withSwitchPort } from "./switch-common";

const rejected = (error: ErrorInfo): ReduceResult => ({ ok: false, error });

export const setSwitchportMode: CommandHandler<"switchport/set-mode"> = (document, command) => {
  const found = findSwitch(document, command.deviceId);
  if (!found.ok) return found;

  const portError = checkSwitchPort(found.device, command.port);
  if (portError !== null) return rejected(portError);

  // 경계 밖에서 온 값일 수 있다 (AD-16)
  if (!(SWITCHPORT_MODES as readonly unknown[]).includes(command.mode)) {
    return rejected(errorInfo("DOCUMENT_INVALID_SHAPE", { path: "mode" }));
  }

  // 모드만 바꾼다. access VLAN과 허용 목록은 그대로 둔다 (실제 장비와 같다)
  return {
    ok: true,
    document: withSwitchPort(document, found.device, command.port, { mode: command.mode }),
    notices: [],
  };
};

export const setSwitchportAccessVlan: CommandHandler<"switchport/set-access-vlan"> = (document, command) => {
  const found = findSwitch(document, command.deviceId);
  if (!found.ok) return found;
  let device: SwitchDevice = found.device;

  const portError = checkSwitchPort(device, command.port);
  if (portError !== null) return rejected(portError);

  const idError = checkVlanIdValue(command.vlanId);
  if (idError !== null) return rejected(idError);

  // 없는 VLAN이면 기본 이름으로 만들고 알린다 (실제 장비와 같다)
  const notices: Notice[] = [];
  const vlans = switchVlans(device.config);
  if (!vlans.some((vlan) => vlan.id === command.vlanId)) {
    if (vlans.length >= LIMITS.maxVlansPerSwitch) {
      return rejected(errorInfo("LIMIT_EXCEEDED", { limit: "vlans", max: LIMITS.maxVlansPerSwitch }));
    }
    device = {
      ...device,
      config: {
        ...device.config,
        vlans: [...device.config.vlans, { id: command.vlanId, name: defaultVlanName(command.vlanId) }],
      },
    };
    notices.push({
      code: "VLAN_AUTO_CREATED",
      params: { device: { deviceId: device.id, deviceName: device.name }, vlanId: command.vlanId },
    });
  }

  // 포트가 trunk 모드여도 값은 저장한다. access 모드로 돌아오면 쓰인다
  return {
    ok: true,
    document: withSwitchPort(document, device, command.port, { accessVlan: command.vlanId }),
    notices,
  };
};

/** 경계 밖에서 온 값을 범위의 목록으로 읽는다. 형태가 틀리면 오류를 돌려준다 */
function readRanges(value: unknown): readonly VlanRange[] | ErrorInfo {
  const shape = errorInfo("DOCUMENT_INVALID_SHAPE", { path: "allowedVlans" });
  if (!Array.isArray(value)) return shape;

  const ranges: VlanRange[] = [];
  for (const item of value as readonly unknown[]) {
    if (!Array.isArray(item) || item.length !== 2) return shape;
    const [start, end] = item as readonly unknown[];
    if (typeof start !== "number" || typeof end !== "number") return shape;
    const idError = checkVlanId(start) ?? checkVlanId(end);
    if (idError !== null) return idError;
    if (start > end) return shape;
    ranges.push([start, end]);
  }
  return ranges;
}

/** 시작 번호순으로 놓고, 겹치거나 이어진 범위를 합친다. 같은 허용 목록은 항상 같은 값이 된다 */
function mergeRanges(ranges: readonly VlanRange[]): VlanRange[] {
  const merged: [number, number][] = [];
  for (const [start, end] of [...ranges].sort((left, right) => left[0] - right[0] || left[1] - right[1])) {
    const last = merged.at(-1);
    if (last !== undefined && start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

export const setSwitchportAllowedVlans: CommandHandler<"switchport/set-allowed-vlans"> = (document, command) => {
  const found = findSwitch(document, command.deviceId);
  if (!found.ok) return found;

  const portError = checkSwitchPort(found.device, command.port);
  if (portError !== null) return rejected(portError);

  const ranges = readRanges(command.allowedVlans);
  if ("code" in ranges) return rejected(ranges);

  // 빈 목록은 "아무 VLAN도 허용하지 않음"이다. 전부 허용([[1, 4094]])은 정규화가 기본값으로 지운다
  const allowedVlans = mergeRanges(ranges);
  if (allowedVlans.length > LIMITS.maxAllowedVlanRanges) {
    return rejected(
      errorInfo("LIMIT_EXCEEDED", { limit: "allowedVlanRanges", max: LIMITS.maxAllowedVlanRanges }),
    );
  }

  return {
    ok: true,
    document: withSwitchPort(document, found.device, command.port, { allowedVlans }),
    notices: [],
  };
};
