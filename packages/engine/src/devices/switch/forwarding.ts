// Switch의 프레임 전달 규칙 (T1.7.3). 입력만으로 결과가 정해지는 순수 함수다 (AD-5).
// kernel이 아직 없어서 따로 둔다. kernel이 들어오면 Switch 모델이 이 함수를 부르고,
// 결과를 프레임 보내기와 Trace 이벤트로 옮긴다 (설계 6.4절).
// 출처: docs/superpowers/specs/2026-11-05-switch-vlan-design.md 6절.

import { BROADCAST_MAC, DEFAULT_VLAN_ID, PORT_NAMES } from "@ping9/shared";
import type { DropParamsByReason, MacTableEntryView, SwitchConfig } from "@ping9/shared";

/** MAC 주소 테이블의 한 줄. `(vlan, mac)`마다 하나다 */
export interface MacEntry {
  readonly vlan: number;
  readonly mac: string;
  readonly port: string;
  /** 이 주소를 마지막으로 본 가상 시각 (마이크로초) */
  readonly lastSeen: number;
}

/** 변경 불가능한 값이다. VLAN, MAC 순으로 놓여 있어 같은 내용이면 항상 같은 값이다 */
export type MacTable = readonly MacEntry[];

export const EMPTY_MAC_TABLE: MacTable = [];

/** 이 시간 동안 다시 보이지 않은 주소는 없는 것으로 친다. 300초 (가상 시간, 마이크로초) */
export const MAC_AGING_US = 300_000_000;

/** Switch가 내는 폐기. `params`는 그 폐기 사유의 params에서 `device`만 뺀 것이다 */
export type SwitchDrop = {
  [R in "IF_DOWN"]: { readonly reason: R; readonly params: Omit<DropParamsByReason[R], "device"> };
}["IF_DOWN"];

export interface ForwardFrame {
  readonly sourceMac: string;
  readonly destinationMac: string;
  readonly vlanTag?: number;
}

export interface ForwardInput {
  readonly config: SwitchConfig;
  /** 포트 상태가 `up`인가 (AD-7: 상태는 views가 계산한다) */
  readonly isPortUp: (port: string) => boolean;
  readonly macTable: MacTable;
  /** 가상 시각 (마이크로초) */
  readonly now: number;
  readonly inPort: string;
  readonly frame: ForwardFrame;
}

export interface ForwardOutput {
  readonly port: string;
  /** 나갈 때 붙는 VLAN 태그. 없으면 태그 없이 나간다 */
  readonly vlanTag?: number;
  /** 목적지를 몰라 여러 포트로 내보낸 것인가 */
  readonly flooded: boolean;
}

export interface ForwardResult {
  /** 학습과 만료가 반영된 새 테이블 */
  readonly macTable: MacTable;
  /** 이 프레임이 속한 VLAN. 들어오다 폐기되면 없다 */
  readonly vlan?: number;
  /** 새로 배웠거나 다른 포트로 옮겨 간 주소 */
  readonly learned?: { readonly mac: string; readonly port: string; readonly vlan: number };
  /** 들어오다 폐기된 경우 */
  readonly ingressDrop?: SwitchDrop;
  /** 목적지가 받은 포트에 있어 내보내지 않음. 실패가 아닌 정상 동작이다 */
  readonly samePort?: true;
  /** 내보낼 포트. 포트 순번 오름차순 */
  readonly outputs: readonly ForwardOutput[];
  /** flooding에서 VLAN 때문에 빠진 켜진 포트 */
  readonly blocked: readonly SwitchDrop[];
}

const compareEntries = (left: MacEntry, right: MacEntry): number =>
  left.vlan - right.vlan || (left.mac < right.mac ? -1 : left.mac > right.mac ? 1 : 0);

const isFresh = (entry: MacEntry, now: number): boolean => now - entry.lastSeen < MAC_AGING_US;

/** 받은 포트에서 이 프레임이 속할 VLAN을 정한다 */
function classify(): { readonly vlan: number } | { readonly drop: SwitchDrop } {
  // VLAN을 나누는 규칙은 T5.2.1(access)과 T5.3.1(trunk)에서 넣는다. 그전까지는 모두 VLAN 1이다
  return { vlan: DEFAULT_VLAN_ID };
}

/** 이 포트가 그 VLAN의 프레임을 내보내는가. 내보내면 붙일 태그를 함께 돌려준다 */
function egress(): { readonly vlanTag?: number } | { readonly drop: SwitchDrop } {
  // 그전까지는 모든 포트가 VLAN 1의 프레임을 태그 없이 내보낸다
  return {};
}

export function switchForward(input: ForwardInput): ForwardResult {
  const { isPortUp, now, inPort, frame } = input;

  if (!isPortUp(inPort)) {
    return {
      macTable: input.macTable,
      ingressDrop: { reason: "IF_DOWN", params: { port: inPort } },
      outputs: [],
      blocked: [],
    };
  }

  const classified = classify();
  if ("drop" in classified) {
    return { macTable: input.macTable, ingressDrop: classified.drop, outputs: [], blocked: [] };
  }
  const { vlan } = classified;

  // 만료된 항목을 버린다
  let table = input.macTable.filter((entry) => isFresh(entry, now));

  // 학습: (VLAN, 출발 MAC) → 받은 포트. 브로드캐스트 주소는 배우지 않는다
  let learned: ForwardResult["learned"];
  if (frame.sourceMac !== BROADCAST_MAC) {
    const known = table.find((entry) => entry.vlan === vlan && entry.mac === frame.sourceMac);
    if (known?.port !== inPort) learned = { mac: frame.sourceMac, port: inPort, vlan };
    table = [
      ...table.filter((entry) => entry !== known),
      { vlan, mac: frame.sourceMac, port: inPort, lastSeen: now },
    ].sort(compareEntries);
  }

  const base = { macTable: table, vlan, ...(learned !== undefined && { learned }) };

  // 목적지를 알고 그 포트가 켜져 있으면 그 포트 하나로 보낸다
  const target =
    frame.destinationMac === BROADCAST_MAC
      ? undefined
      : table.find((entry) => entry.vlan === vlan && entry.mac === frame.destinationMac && isPortUp(entry.port));
  if (target !== undefined) {
    if (target.port === inPort) return { ...base, samePort: true, outputs: [], blocked: [] };
    const out = egress();
    if (!("drop" in out)) return { ...base, outputs: [{ port: target.port, ...out, flooded: false }], blocked: [] };
    // 배운 뒤에 그 포트의 VLAN이 바뀐 경우다. 아래의 flooding으로 간다
  }

  // flooding: 받은 포트를 뺀, 켜져 있고 그 VLAN에 속한 포트 전부
  const outputs: ForwardOutput[] = [];
  const blocked: SwitchDrop[] = [];
  for (const port of PORT_NAMES.switch) {
    if (port === inPort || !isPortUp(port)) continue;
    const out = egress();
    if ("drop" in out) blocked.push(out.drop);
    else outputs.push({ port, ...out, flooded: true });
  }
  return { ...base, outputs, blocked };
}

/**
 * 구성이나 링크가 바뀐 뒤 쓸 수 없게 된 항목을 지운다 (설계 6.3절).
 * 지울 것이 없으면 받은 테이블을 그대로 돌려준다.
 */
export function pruneMacTable(
  table: MacTable,
  state: { readonly config: SwitchConfig; readonly isPortUp: (port: string) => boolean },
): MacTable {
  const kept = table.filter((entry) => state.isPortUp(entry.port) && !("drop" in egress()));
  return kept.length === table.length ? table : kept;
}

/** 화면과 `show mac address-table`에 보일 목록. 만료된 항목은 뺀다 */
export function macTableView(table: MacTable, now: number): MacTableEntryView[] {
  return table
    .filter((entry) => isFresh(entry, now))
    .map((entry) => ({ mac: entry.mac, port: entry.port, vlan: entry.vlan }));
}
