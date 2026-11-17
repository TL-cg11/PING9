// Router 배치(T4.1.1)에 필요한 공통 device/add 처리. 이동/이름 변경/삭제는 T1.3.1에 남는다.
import {
  DEFAULT_VLAN_ID,
  DEFAULT_VLAN_NAME,
  DEVICE_KINDS,
  EMPTY_FIREWALL_FILTER,
  LIMITS,
  PC_OS_CHOICES,
  PORT_NAMES,
  errorInfo,
  isUuid,
  validateDocument,
} from "@ping9/shared";
import type { Device, DeviceKind, PcOsChoice, Position, TopologyDocument } from "@ping9/shared";

import { describeValue } from "../describe";
import type { CommandHandler } from "../reducer";

const PREFIX: Readonly<Record<DeviceKind, string>> = { pc: "PC", switch: "SW", router: "R", firewall: "FW" };

function nextName(document: TopologyDocument, kind: DeviceKind): string {
  const used = new Set(document.devices.map(device => device.name));
  let number = 1;
  while (used.has(`${PREFIX[kind]}${number}`)) number += 1;
  return `${PREFIX[kind]}${number}`;
}

function newDevice(kind: DeviceKind, id: string, name: string, position: Position, os: PcOsChoice | undefined): Device {
  const base = { id, name, position };
  switch (kind) {
    case "pc":
      // OS를 고르지 않았으면 칸을 두지 않는다 (DEFAULT_OS, T0.7)
      return { ...base, kind, config: os === undefined ? {} : { os } };
    case "switch":
      return { ...base, kind, config: { vlans: [{ id: DEFAULT_VLAN_ID, name: DEFAULT_VLAN_NAME }], ports: {} } };
    case "router":
      return {
        ...base, kind,
        config: {
          interfaces: Object.fromEntries(PORT_NAMES.router.map(port => [port, { adminUp: false }])),
          staticRoutes: [],
        },
      };
    case "firewall":
      // 인터페이스는 켜져 있고 주소가 없다. 필터는 세 체인 모두 ACCEPT에 규칙이 없다 (T14.2.1)
      return {
        ...base, kind,
        config: {
          interfaces: Object.fromEntries(PORT_NAMES.firewall.map(port => [port, { adminUp: true }])),
          staticRoutes: [],
          filter: EMPTY_FIREWALL_FILTER,
        },
      };
  }
}

export const addDevice: CommandHandler<"device/add"> = (document, command) => {
  if (typeof command.kind !== "string" || !DEVICE_KINDS.includes(command.kind)) {
    return { ok: false, error: errorInfo("DOCUMENT_INVALID_SHAPE", { path: "kind" }) };
  }
  // `os`는 PC에만 있다 (T0.7)
  if (command.os !== undefined && (command.kind !== "pc" || !PC_OS_CHOICES.includes(command.os))) {
    return { ok: false, error: errorInfo("DOCUMENT_INVALID_SHAPE", { path: "os" }) };
  }
  if (typeof command.id !== "string" || !isUuid(command.id)) {
    return { ok: false, error: errorInfo("INVALID_ID", { id: describeValue(command.id) }) };
  }
  if (document.devices.some(device => device.id === command.id) || document.links.some(link => link.id === command.id)) {
    return { ok: false, error: errorInfo("DUPLICATE_ID", { id: command.id }) };
  }
  if (document.devices.length >= LIMITS.maxDevices) {
    return { ok: false, error: errorInfo("LIMIT_EXCEEDED", { limit: "devices", max: LIMITS.maxDevices }) };
  }

  const device = newDevice(command.kind, command.id, nextName(document, command.kind), command.position, command.os);
  // 위치와 문서 전체의 제약도 기존 검증기로 확인하고, 호출자의 객체와 공유하지 않는 값을 반환한다.
  const checked = validateDocument({ ...document, devices: [...document.devices, device] });
  return checked.ok ? { ok: true, document: checked.document, notices: [] } : checked;
};
