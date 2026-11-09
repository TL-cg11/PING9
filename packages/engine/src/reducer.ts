// Document reducer: Command를 검증하고 새 Document를 만든다 (AD-3).
// Document를 바꾸는 경로는 여기 하나다. 화면과 CLI는 Command를 만들어 dispatch할 뿐이다.
//
// 지금은 뼈대다. Command 처리기는 아래 `handlers`에 하나씩 추가한다:
//   T1.3.1 device/*   T1.4.1 link/*   T1.5.1 pc/set-ip   T0.7 pc/set-os   E3~E5 나머지
// 처리기는 받은 Document를 고치지 않고 새 객체를 돌려준다.
// 돌려준 Document는 항상 validateDocument()를 통과해야 한다 (속성 기반 테스트 PBT-1).

import { errorInfo } from "@ping9/shared";
import type { Command, CommandOf, CommandType, ErrorInfo, Notice, TopologyDocument } from "@ping9/shared";

import { describeValue } from "./describe";
import { addDevice } from "./reducer/device-add";
import { moveDevice } from "./reducer/device-move";
import { setInterfaceAdmin } from "./reducer/interface-admin";
import { addLink, removeDevice, removeLink } from "./reducer/link";
import { setPcIp } from "./reducer/pc-set-ip";
import { setPcOs } from "./reducer/pc-set-os";
import { clearRouterInterfaceIp, setRouterInterfaceIp } from "./reducer/router-interface-ip";
import { addRoute, removeRoute } from "./reducer/router-route";
import {
  setSwitchportAccessVlan,
  setSwitchportAllowedVlans,
  setSwitchportMode,
} from "./reducer/switch-port";
import { createVlan, removeVlan, renameVlan } from "./reducer/switch-vlan";

export type ReduceResult =
  | {
      readonly ok: true;
      readonly document: TopologyDocument;
      readonly notices: readonly Notice[];
    }
  | { readonly ok: false; readonly error: ErrorInfo };

export type CommandHandler<T extends CommandType> = (
  document: TopologyDocument,
  command: CommandOf<T>,
) => ReduceResult;

// 처리기의 본문은 reducer/ 폴더의 각자 파일에 두고, 여기에는 자기 Command의 줄만 더한다
const handlers: { readonly [T in CommandType]?: CommandHandler<T> } = {
  "device/add": addDevice,
  "device/move": moveDevice,
  "device/remove": removeDevice,
  "link/add": addLink,
  "link/remove": removeLink,
  "pc/set-ip": setPcIp,
  "pc/set-os": setPcOs,
  "interface/set-admin": setInterfaceAdmin,
  "interface/set-ip": setRouterInterfaceIp,
  "interface/clear-ip": clearRouterInterfaceIp,
  "route/add": addRoute,
  "route/remove": removeRoute,
  "vlan/create": createVlan,
  "vlan/rename": renameVlan,
  "vlan/remove": removeVlan,
  "switchport/set-mode": setSwitchportMode,
  "switchport/set-access-vlan": setSwitchportAccessVlan,
  "switchport/set-allowed-vlans": setSwitchportAllowedVlans,
};

/** 처리기가 있는 Command. 처리기가 없는 Command를 확인하는 테스트가 쓴다 */
export const HANDLED_COMMAND_TYPES = Object.keys(handlers) as readonly CommandType[];

export function reduce(document: TopologyDocument, command: Command): ReduceResult {
  // 타입으로는 Command지만 경계 밖에서 온 값일 수 있다. 예외 대신 오류 결과를 돌려준다 (AD-16)
  const type: unknown = (command as { type?: unknown } | null | undefined)?.type;
  if (typeof type !== "string" || !Object.hasOwn(handlers, type)) {
    return {
      ok: false,
      error: errorInfo("UNKNOWN_COMMAND", { type: describeValue(type) }),
    };
  }

  const handler = handlers[type as CommandType] as CommandHandler<CommandType>;
  return handler(document, command);
}
