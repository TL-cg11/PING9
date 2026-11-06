// show 명령어의 표 (설계 7.5절). 열 너비는 머리글과 값 중 가장 긴 것에 맞추고,
// 열 사이는 공백 2칸이며, 줄 끝의 공백은 지운다. 줄이 없으면 머리줄만 나온다.

const GAP = "  ";

export function tableLines(headers: readonly string[], rows: readonly (readonly string[])[]): string[] {
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => (row[column] ?? "").length)),
  );
  const line = (cells: readonly string[]) =>
    headers
      .map((_header, column) => (cells[column] ?? "").padEnd(widths[column]!))
      .join(GAP)
      .trimEnd();

  return [line(headers), ...rows.map(line)];
}
