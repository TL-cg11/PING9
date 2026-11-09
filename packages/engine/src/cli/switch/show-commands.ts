// Switch의 조회 명령어: show interfaces trunk (T5.3.2), show running-config (T3.4.1),
// show mac address-table (T3.4.2).
// 출력의 열 구성과 글은 직접 설계한 것이다 (설계 7.5절). 구성은 shared의 읽기 함수로,
// 포트 상태는 화면과 같은 계산(computeViews)으로 읽는다 (AD-7).

import { shortPortName, switchPorts } from "@ping9/shared";
import type { ConsoleLine, MacTableEntryView, SwitchDevice } from "@ping9/shared";

import { computeViews } from "../../views";
import { defineCommand } from "../ios";
import type { CommandContext, CommandDefinition, CommandOutcome } from "../ios";
import { tableLines } from "../ios/table";
import { runningConfigLines } from "./running-config";
import { formatVlanList } from "./vlan-list";

const asText = (lines: readonly string[]): ConsoleLine[] => lines.map((text) => ({ kind: "text", text }));

/** Switch가 아닌 장비에서는 아무것도 내지 않는다 (정의의 `devices`가 이미 막는다) */
function onSwitch(context: CommandContext, lines: (device: SwitchDevice) => readonly string[]): CommandOutcome {
  return context.device.kind === "switch" ? { lines: asText(lines(context.device)) } : {};
}

function showInterfacesTrunk(context: CommandContext): CommandOutcome {
  return onSwitch(context, (device) => {
    const statuses = computeViews(context.document)[device.id]?.ports ?? [];
    const rows = switchPorts(device.config)
      .filter((port) => port.mode === "trunk")
      .map((port) => [
        shortPortName(port.name),
        statuses.find((status) => status.name === port.name)?.status ?? "",
        formatVlanList(port.allowedVlans),
      ]);
    return tableLines(["Port", "Status", "Allowed VLANs"], rows);
  });
}

/** MAC 주소 테이블의 줄. 값은 화면의 테이블과 같은 것(DeviceView.macTable)이다 */
export function macAddressTableLines(entries: readonly MacTableEntryView[]): string[] {
  return tableLines(
    ["VLAN", "MAC address", "Port"],
    entries.map((entry) => [String(entry.vlan), entry.mac, shortPortName(entry.port)]),
  );
}

/** 배운 주소는 Runtime(Switch 모델)에 있다 (T5.2.2). Runtime 없이 쓰는 콘솔(테스트)에서는 빈 테이블이다 */
function showMacAddressTable(context: CommandContext): CommandOutcome {
  return onSwitch(context, (device) => macAddressTableLines(context.runtime?.macTable(device.id) ?? []));
}

export const SHOW_COMMANDS: readonly CommandDefinition[] = [
  defineCommand({
    modes: ["privileged"],
    devices: ["switch"],
    tokens: ["show", "interfaces", "trunk"],
    help: "Show trunk ports and the VLANs they carry",
    run: (_args, context) => showInterfacesTrunk(context),
  }),
  defineCommand({
    modes: ["privileged"],
    devices: ["switch"],
    tokens: ["show", "running-config"],
    help: "Show the configuration as commands",
    run: (_args, context) => onSwitch(context, runningConfigLines),
  }),
  defineCommand({
    modes: ["privileged"],
    devices: ["switch"],
    tokens: ["show", "mac", "address-table"],
    help: "Show the MAC addresses this switch has learned",
    run: (_args, context) => showMacAddressTable(context),
  }),
];
