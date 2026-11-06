// Switch 포트의 모드와 access VLAN을 바꾸는 Command 처리기 (T5.2.1, FR-32).
// 처음 걸리는 오류를 돌려주고 Document는 바꾸지 않는다.
// 출처: docs/superpowers/specs/2026-11-05-switch-vlan-design.md 5.2절.

import { LIMITS, SWITCHPORT_MODES, checkVlanId, defaultVlanName, errorInfo, switchVlans } from "@ping9/shared";
import type { ErrorInfo, Notice, SwitchDevice } from "@ping9/shared";

import type { CommandHandler, ReduceResult } from "../reducer";
import { checkSwitchPort, findSwitch, withSwitchPort } from "./switch-common";

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

  const idError = checkVlanId(command.vlanId);
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
