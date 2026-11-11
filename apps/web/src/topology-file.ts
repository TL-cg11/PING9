// 토폴로지를 파일로 내보내기 (T7.1.1)와 가져오기 (T7.1.2) (FR-7).
// 파일 내용은 `{ kind: "topology-export", name, document }`. Runtime(ARP 표, 콘솔 기록, RIP로 배운 경로)은 넣지 않는다:
// 열면 Runtime은 비어 있다 (03 문서 "불러오기").

import { LIMITS, TOPOLOGY_EXPORT_KIND, errorInfo, parseExportJson } from "@ping9/shared";
import type { ExportFileResult, TopologyDocument, TopologyExport } from "@ping9/shared";

/** 받는 파일의 끝. 열기 창에서는 `.json`으로 고른다 (설계 결정 3) */
export const EXPORT_EXTENSION = ".ping9.json";

/** 파일 이름이 비었을 때 */
const FALLBACK_FILE_NAME = "topology";

// Windows·macOS 파일 이름에 쓸 수 없는 글자와 제어 문자
// eslint-disable-next-line no-control-regex
const UNSAFE_FILE_CHARACTERS = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;

/** 토폴로지 이름으로 받는 파일 이름. 쓸 수 없는 글자는 `_`, 앞의 점(숨김 파일)은 뺀다 */
export function exportFileName(name: string): string {
  const safe = name.replace(UNSAFE_FILE_CHARACTERS, "_").trim().replace(/^\.+/, "");
  return `${safe === "" ? FALLBACK_FILE_NAME : safe}${EXPORT_EXTENSION}`;
}

/** 받을 파일의 이름과 내용. 내용은 들여쓰기 2칸의 JSON이다 */
export function exportFile(name: string, document: TopologyDocument): { readonly fileName: string; readonly text: string } {
  const content: TopologyExport = { kind: TOPOLOGY_EXPORT_KIND, name, document };
  return { fileName: exportFileName(name), text: `${JSON.stringify(content, null, 2)}\n` };
}

/** 브라우저가 파일로 받게 한다 */
export function downloadText(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = window.document.createElement("a");
  link.href = url;
  link.download = fileName;
  window.document.body.append(link);
  link.click();
  link.remove();
  // 받기가 시작된 뒤에 놓는다. 바로 놓으면 받지 못하는 브라우저가 있다
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 가져오기에 필요한 파일의 부분. 브라우저의 `File`이 맞는다 */
export interface ImportFile {
  readonly size: number;
  text(): Promise<string>;
}

/**
 * 고른 파일을 읽어 검증한다 (T7.1.2). 2MB가 넘으면 읽지 않고 거부한다.
 * 읽은 뒤는 `shared`의 공통 절차(`parseExportJson`)를 쓴다 (SEC-8)
 */
export async function readImportFile(file: ImportFile): Promise<ExportFileResult> {
  if (file.size > LIMITS.maxImportBytes) {
    return { ok: false, error: errorInfo("DOCUMENT_TOO_LARGE", { size: file.size, limit: LIMITS.maxImportBytes }) };
  }
  try {
    return parseExportJson(await file.text());
  } catch {
    // 읽는 사이에 파일이 지워졌거나 바뀌었다
    return { ok: false, error: errorInfo("DOCUMENT_INVALID_JSON", {}) };
  }
}

/** 지금 캔버스를 바꾸기 전에 물어야 하는지. 장비가 없으면 잃을 것이 없다 */
export function needsReplaceConfirm(document: TopologyDocument): boolean {
  return document.devices.length > 0;
}
