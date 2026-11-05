import type { SwitchConfig } from "@ping9/shared";
import { twoSwitchVlanDocument } from "@ping9/shared/examples";
import { expect, test } from "vitest";

import { showVlanBriefLines } from "./show-vlan";

test("새 Switch: VLAN 1에 포트 8개가 3개씩 나뉘어 나온다", () => {
  expect(showVlanBriefLines({ vlans: [{ id: 1, name: "default" }], ports: {} })).toEqual([
    "VLAN  Name     Status  Ports",
    "1     default  active  Fa0/1, Fa0/2, Fa0/3",
    "                       Fa0/4, Fa0/5, Fa0/6",
    "                       Fa0/7, Fa0/8",
  ]);
});

test("예시 SW1: trunk 포트는 나오지 않고, 포트가 없는 VLAN은 줄 끝에 공백이 없다", () => {
  const sw1 = twoSwitchVlanDocument.devices.find((device) => device.name === "SW1")!.config as SwitchConfig;

  expect(showVlanBriefLines({ ...sw1, vlans: [...sw1.vlans, { id: 30, name: "LAB" }] })).toEqual([
    "VLAN  Name     Status  Ports",
    "1     default  active  Fa0/3, Fa0/4, Fa0/5",
    "                       Fa0/6, Fa0/7",
    "10    SALES    active  Fa0/1",
    "20    DEV      active  Fa0/2",
    "30    LAB      active",
  ]);
});

test("VLAN 1이 없는 구성에도 VLAN 1 줄이 나온다", () => {
  expect(showVlanBriefLines({ vlans: [], ports: {} })[1]).toBe("1     default  active  Fa0/1, Fa0/2, Fa0/3");
});

test("열 너비는 가장 긴 값에 맞춘다", () => {
  expect(
    showVlanBriefLines({
      vlans: [
        { id: 1, name: "default" },
        { id: 4094, name: "MANAGEMENT-NET" },
      ],
      ports: {},
    }),
  ).toEqual([
    "VLAN  Name            Status  Ports",
    "1     default         active  Fa0/1, Fa0/2, Fa0/3",
    "                              Fa0/4, Fa0/5, Fa0/6",
    "                              Fa0/7, Fa0/8",
    "4094  MANAGEMENT-NET  active",
  ]);
});

test("VLAN 64개와 32자 이름에서도 모든 줄의 Status 열 위치가 같다", () => {
  const vlans = Array.from({ length: 64 }, (_, index) => ({
    id: index === 0 ? 1 : 4030 + index,
    name: index === 0 ? "default" : "N".repeat(32),
  }));

  const lines = showVlanBriefLines({ vlans, ports: {} });

  const column = lines[0]!.indexOf("Status");
  const rows = lines.filter((line) => /^[0-9]/.test(line));
  expect(rows).toHaveLength(64);
  for (const row of rows) expect(row.slice(column, column + 6)).toBe("active");
  for (const line of lines) expect(line).toBe(line.trimEnd());
});
