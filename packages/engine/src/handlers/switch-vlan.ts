// VLAN을 만들고, 이름을 바꾸고, 지우는 Command 처리기 (FR-31).
// 처음 걸리는 오류를 돌려주고 Document는 바꾸지 않는다.

import {
  DEFAULT_VLAN_ID,
  LIMITS,
  checkVlanId,
  checkVlanName,
  defaultVlanName,
  errorInfo,
  switchVlans,
} from "@ping9/shared";
import type { ErrorInfo, TopologyDocument } from "@ping9/shared";

import { describeValue } from "../describe";
import type { CommandHandler, ReduceResult } from "../reducer";
import { findSwitch, withSwitchConfig } from "./switch-common";

const rejected = (error: ErrorInfo): ReduceResult => ({ ok: false, error });
const accepted = (document: TopologyDocument): ReduceResult => ({ ok: true, document, notices: [] });

/** 경계 밖에서 온 값일 수 있어 문자열인지부터 본다 */
function checkName(value: unknown): ErrorInfo | null {
  return typeof value === "string"
    ? checkVlanName(value)
    : errorInfo("INVALID_VLAN_NAME", { value: describeValue(value) });
}

export const createVlan: CommandHandler<"vlan/create"> = (document, command) => {
  const found = findSwitch(document, command.deviceId);
  if (!found.ok) return found;
  const { device } = found;

  const idError = checkVlanId(command.vlanId);
  if (idError !== null) return rejected(idError);

  const vlans = switchVlans(device.config);
  if (vlans.some((vlan) => vlan.id === command.vlanId)) {
    return rejected(errorInfo("DUPLICATE_VLAN", { deviceId: device.id, vlanId: command.vlanId }));
  }

  if (command.name !== undefined) {
    const nameError = checkName(command.name);
    if (nameError !== null) return rejected(nameError);
  }

  if (vlans.length >= LIMITS.maxVlansPerSwitch) {
    return rejected(errorInfo("LIMIT_EXCEEDED", { limit: "vlans", max: LIMITS.maxVlansPerSwitch }));
  }

  const name = command.name ?? defaultVlanName(command.vlanId);
  return accepted(
    withSwitchConfig(document, device.id, {
      ...device.config,
      vlans: [...device.config.vlans, { id: command.vlanId, name }],
    }),
  );
};

export const renameVlan: CommandHandler<"vlan/rename"> = (document, command) => {
  const found = findSwitch(document, command.deviceId);
  if (!found.ok) return found;
  const { device } = found;

  const idError = checkVlanId(command.vlanId);
  if (idError !== null) return rejected(idError);
  if (command.vlanId === DEFAULT_VLAN_ID) {
    return rejected(errorInfo("DEFAULT_VLAN_READONLY", { deviceId: device.id }));
  }

  const vlans = switchVlans(device.config);
  if (!vlans.some((vlan) => vlan.id === command.vlanId)) {
    return rejected(errorInfo("VLAN_NOT_FOUND", { deviceId: device.id, vlanId: command.vlanId }));
  }

  const nameError = checkName(command.name);
  if (nameError !== null) return rejected(nameError);

  return accepted(
    withSwitchConfig(document, device.id, {
      ...device.config,
      vlans: device.config.vlans.map((vlan) =>
        vlan.id === command.vlanId ? { id: vlan.id, name: command.name } : vlan,
      ),
    }),
  );
};

export const removeVlan: CommandHandler<"vlan/remove"> = (document, command) => {
  const found = findSwitch(document, command.deviceId);
  if (!found.ok) return found;
  const { device } = found;

  const idError = checkVlanId(command.vlanId);
  if (idError !== null) return rejected(idError);
  if (command.vlanId === DEFAULT_VLAN_ID) {
    return rejected(errorInfo("DEFAULT_VLAN_READONLY", { deviceId: device.id }));
  }

  const vlans = switchVlans(device.config);
  if (!vlans.some((vlan) => vlan.id === command.vlanId)) {
    return rejected(errorInfo("VLAN_NOT_FOUND", { deviceId: device.id, vlanId: command.vlanId }));
  }

  // 이 VLAN을 쓰던 포트의 accessVlan은 그대로 둔다. 그 포트는 VLAN이 다시 생길 때까지 통신할 수 없다
  return accepted(
    withSwitchConfig(document, device.id, {
      ...device.config,
      vlans: device.config.vlans.filter((vlan) => vlan.id !== command.vlanId),
    }),
  );
};
