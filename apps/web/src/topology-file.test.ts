// T7.1.1: 내보낸 파일의 이름과 내용. T7.1.2: 고른 파일 읽기
import { EMPTY_DOCUMENT, LIMITS, TOPOLOGY_EXPORT_KIND, parseDocumentJson, validateDocument } from "@ping9/shared";
import { fourRouterRipDocument, twoSwitchVlanDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { EXPORT_EXTENSION, exportFile, exportFileName, needsReplaceConfirm, readImportFile } from "./topology-file";

describe("내용", () => {
  test("`{ kind, name, document }`이고 document가 검증을 통과하며 schemaVersion이 있다 (완료 기준)", () => {
    const { text } = exportFile("우리 반 실습", fourRouterRipDocument);
    const content = JSON.parse(text) as Record<string, unknown>;

    expect(Object.keys(content)).toEqual(["kind", "name", "document"]);
    expect(content.kind).toBe(TOPOLOGY_EXPORT_KIND);
    expect(content.name).toBe("우리 반 실습");
    expect((content.document as { schemaVersion?: unknown }).schemaVersion).toBe(1);
    expect(validateDocument(content.document)).toEqual({ ok: true, document: fourRouterRipDocument });
  });

  test("가져오기의 공통 절차로 읽으면 같은 Document (왕복)", () => {
    for (const document of [EMPTY_DOCUMENT, fourRouterRipDocument, twoSwitchVlanDocument]) {
      const content = JSON.parse(exportFile("t", document).text) as { document: unknown };
      expect(parseDocumentJson(JSON.stringify(content.document))).toEqual({ ok: true, document });
    }
  });

  test("들여쓰기 2칸, 끝에 줄바꿈. 가져오기 크기 한도 안", () => {
    const { text } = exportFile("t", fourRouterRipDocument);
    expect(text.startsWith('{\n  "kind": "topology-export",\n  "name": "t",\n  "document": {\n')).toBe(true);
    expect(text.endsWith("}\n")).toBe(true);
    expect(new TextEncoder().encode(text).length).toBeLessThan(LIMITS.maxImportBytes);
  });

  test("장비가 없어도 내보낸다", () => {
    expect(JSON.parse(exportFile("새 토폴로지", EMPTY_DOCUMENT).text)).toEqual({
      kind: TOPOLOGY_EXPORT_KIND, name: "새 토폴로지", document: EMPTY_DOCUMENT,
    });
  });
});

describe("파일 이름", () => {
  test("토폴로지 이름 + `.ping9.json`", () => {
    expect(EXPORT_EXTENSION).toBe(".ping9.json");
    expect(exportFile("새 토폴로지", EMPTY_DOCUMENT).fileName).toBe("새 토폴로지.ping9.json");
  });

  test.each([
    ["a/b\\c", "a_b_c.ping9.json"],
    ['실습: 1*2?"<>|', "실습_ 1_2_____.ping9.json"],
    ["줄\n바꿈\t", "줄_바꿈_.ping9.json"],
    ["  양쪽 공백  ", "양쪽 공백.ping9.json"],
    ["..숨김", "숨김.ping9.json"],
    ["", "topology.ping9.json"],
    ["...", "topology.ping9.json"],
  ])("%j → %s", (name, fileName) => {
    expect(exportFileName(name)).toBe(fileName);
  });
});

describe("가져오기: 고른 파일 읽기 (T7.1.2)", () => {
  const fakeFile = (text: string, size = new TextEncoder().encode(text).length) => {
    let reads = 0;
    return { size, text: async () => { reads += 1; return text; }, get reads() { return reads; } };
  };

  test("내보낸 파일을 가져오면 같은 이름과 Document (완료 기준)", async () => {
    const file = fakeFile(exportFile("우리 반 실습", fourRouterRipDocument).text);
    expect(await readImportFile(file)).toEqual({ ok: true, name: "우리 반 실습", document: fourRouterRipDocument });
  });

  test("2MB가 넘으면 읽지 않고 거부", async () => {
    const file = fakeFile("{}", LIMITS.maxImportBytes + 1);
    expect(await readImportFile(file)).toEqual({
      ok: false, error: { code: "DOCUMENT_TOO_LARGE", params: { size: LIMITS.maxImportBytes + 1, limit: LIMITS.maxImportBytes } },
    });
    expect(file.reads).toBe(0);
  });

  test("깨진 파일은 사유와 함께 거부", async () => {
    expect(await readImportFile(fakeFile("not json"))).toMatchObject({ ok: false, error: { code: "DOCUMENT_INVALID_JSON" } });
    expect(await readImportFile(fakeFile(JSON.stringify(EMPTY_DOCUMENT)))).toMatchObject({ ok: false, error: { code: "IMPORT_NOT_EXPORT_FILE" } });
  });

  test("읽다가 실패하면 JSON 오류", async () => {
    const file = { size: 10, text: () => Promise.reject(new Error("gone")) };
    expect(await readImportFile(file)).toMatchObject({ ok: false, error: { code: "DOCUMENT_INVALID_JSON" } });
  });

  test("캔버스에 장비가 있을 때만 바꿀지 묻는다", () => {
    expect(needsReplaceConfirm(EMPTY_DOCUMENT)).toBe(false);
    expect(needsReplaceConfirm(fourRouterRipDocument)).toBe(true);
  });
});
