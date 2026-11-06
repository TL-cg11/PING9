// `show vlan brief`의 출력 줄. 형식은 직접 설계한 것이다 (T3.4.2: 다른 제품의 문구를 복제하지 않음).
// 출처: docs/superpowers/specs/2026-11-05-switch-vlan-design.md 7.5절.

import { shortPortName, switchVlans, vlanAccessPorts } from "@ping9/shared";
import type { SwitchConfig } from "@ping9/shared";

const HEADERS = ["VLAN", "Name", "Status"] as const;
const GAP = "  ";
/** Ports 열에 한 줄에 쓰는 포트 수. 넘으면 다음 줄에 이어 쓴다 */
const PORTS_PER_LINE = 3;

interface Row {
  readonly cells: readonly [id: string, name: string, status: string];
  /** 줄인 포트 이름. access 모드 포트만 */
  readonly ports: readonly string[];
}

export function showVlanBriefLines(config: SwitchConfig): readonly string[] {
  const rows: Row[] = switchVlans(config).map((vlan) => ({
    cells: [String(vlan.id), vlan.name, "active"],
    ports: vlanAccessPorts(config, vlan.id).map(shortPortName),
  }));

  // 열 너비는 머리글과 값 중 가장 긴 것에 맞춘다
  const widths = HEADERS.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => row.cells[column]!.length)),
  );
  const pad = (cells: readonly string[]) => cells.map((cell, column) => cell.padEnd(widths[column]!)).join(GAP);
  const indent = " ".repeat(pad(HEADERS).length + GAP.length);

  const lines = [`${pad(HEADERS)}${GAP}Ports`];
  for (const row of rows) {
    const chunks: string[] = [];
    for (let start = 0; start < row.ports.length; start += PORTS_PER_LINE) {
      chunks.push(row.ports.slice(start, start + PORTS_PER_LINE).join(", "));
    }

    lines.push(`${pad(row.cells)}${GAP}${chunks[0] ?? ""}`.trimEnd());
    for (const chunk of chunks.slice(1)) lines.push(`${indent}${chunk}`);
  }
  return lines;
}
