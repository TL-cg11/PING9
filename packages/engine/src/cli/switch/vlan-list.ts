// trunk 허용 목록의 글 형태 (T5.3.1): `10,20-30`, `all`, `none`.
// 명령어의 값 읽기, `show interfaces trunk`, `show running-config`가 함께 쓴다.

import { ALL_VLANS, VLAN_ID_MAX, VLAN_ID_MIN, checkVlanId, errorInfo } from "@ping9/shared";
import type { ErrorInfo, VlanRange } from "@ping9/shared";

export type ParsedVlanList =
  | { readonly ok: true; readonly ranges: readonly VlanRange[] }
  | { readonly ok: false; readonly error: ErrorInfo };

const invalid = (text: string): ParsedVlanList => ({
  ok: false,
  error: errorInfo("CLI_INVALID_VALUE", { token: text.slice(0, 64) }),
});

/** 글을 범위의 목록으로 읽는다. 정렬하거나 합치지는 않는다 (reducer가 한다) */
export function parseVlanList(text: string): ParsedVlanList {
  const typed = text.toLowerCase();
  if (typed === "all") return { ok: true, ranges: ALL_VLANS };
  if (typed === "none") return { ok: true, ranges: [] };

  const ranges: VlanRange[] = [];
  for (const part of typed.split(",")) {
    // 십진수 숫자만 받는다. 번호는 길어야 4자리지만 범위 오류를 알리려고 조금 더 받는다
    const match = /^([0-9]{1,6})(?:-([0-9]{1,6}))?$/.exec(part);
    if (match === null) return invalid(text);

    const start = Number(match[1]);
    const end = match[2] === undefined ? start : Number(match[2]);
    const error = checkVlanId(start) ?? checkVlanId(end);
    if (error !== null) return { ok: false, error };
    if (start > end) return invalid(text);
    ranges.push([start, end]);
  }
  return { ok: true, ranges };
}

/** 범위의 목록을 글로 쓴다. 전부 허용은 `all`, 빈 목록은 `none` */
export function formatVlanList(ranges: readonly VlanRange[]): string {
  if (ranges.length === 0) return "none";
  if (ranges.length === 1 && ranges[0]![0] === VLAN_ID_MIN && ranges[0]![1] === VLAN_ID_MAX) return "all";
  return ranges.map(([start, end]) => (start === end ? `${start}` : `${start}-${end}`)).join(",");
}
