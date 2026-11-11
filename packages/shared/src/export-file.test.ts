// T7.1.2: 내보낸 파일을 읽는 공통 절차 (SEC-8). 유효·무효 파일 표와 PBT-9와 같은 속성
import fc from "fast-check";
import { describe, expect, test } from "vitest";

import { EMPTY_DOCUMENT } from "./document";
import { EXAMPLE_DOCUMENTS, fourRouterRipDocument } from "./examples/index";
import { TOPOLOGY_EXPORT_KIND } from "./export-file";
import { LIMITS } from "./limits";
import { parseExportJson } from "./validate";

const file = (content: unknown) => JSON.stringify(content, null, 2);
const exported = (overrides: Record<string, unknown> = {}) =>
  file({ kind: TOPOLOGY_EXPORT_KIND, name: "우리 반 실습", document: fourRouterRipDocument, ...overrides });

describe("유효한 파일", () => {
  test("이름과 검증된 Document를 돌려준다", () => {
    expect(parseExportJson(exported())).toEqual({ ok: true, name: "우리 반 실습", document: fourRouterRipDocument });
  });

  test("모든 예시와 빈 문서가 왕복한다", () => {
    for (const document of [EMPTY_DOCUMENT, ...EXAMPLE_DOCUMENTS.map((example) => example.document)]) {
      expect(parseExportJson(exported({ document }))).toEqual({ ok: true, name: "우리 반 실습", document });
    }
  });

  test("겉 포장의 다른 키는 무시한다", () => {
    expect(parseExportJson(exported({ app: "PING9", exportedAt: "2026-11-11" })).ok).toBe(true);
  });
});

describe("무효한 파일: 구별되는 오류", () => {
  test.each<[string, string, unknown]>([
    ["JSON이 아님", "{ kind:", { code: "DOCUMENT_INVALID_JSON", params: {} }],
    ["겉 포장 없는 Document (결정 4)", file(fourRouterRipDocument), { code: "IMPORT_NOT_EXPORT_FILE", params: {} }],
    ["kind가 다름", exported({ kind: "topology" }), { code: "IMPORT_NOT_EXPORT_FILE", params: {} }],
    ["배열", "[]", { code: "IMPORT_NOT_EXPORT_FILE", params: {} }],
    ["null", "null", { code: "IMPORT_NOT_EXPORT_FILE", params: {} }],
    ["name 없음", exported({ name: undefined }), { code: "DOCUMENT_INVALID_SHAPE", params: { path: "name" } }],
    ["name이 수", exported({ name: 3 }), { code: "DOCUMENT_INVALID_SHAPE", params: { path: "name" } }],
    ["name이 빈 글자", exported({ name: "" }), { code: "INVALID_TOPOLOGY_NAME", params: { length: 0 } }],
    ["name이 101자", exported({ name: "가".repeat(101) }), { code: "INVALID_TOPOLOGY_NAME", params: { length: 101 } }],
    ["name에 제어 문자", exported({ name: "a\u0007b" }), { code: "INVALID_TOPOLOGY_NAME", params: { length: 3 } }],
    ["document 없음", exported({ document: undefined }), { code: "DOCUMENT_INVALID_SHAPE", params: { path: "document" } }],
    ["document가 글자", exported({ document: "x" }), { code: "DOCUMENT_INVALID_SHAPE", params: { path: "document" } }],
    ["미래 버전", exported({ document: { ...EMPTY_DOCUMENT, schemaVersion: 2 } }),
      { code: "DOCUMENT_UNSUPPORTED_VERSION", params: { current: 1 } }],
    ["안쪽 형태 오류는 파일 기준 위치", exported({ document: { ...EMPTY_DOCUMENT, links: {} } }),
      { code: "DOCUMENT_INVALID_SHAPE", params: { path: "document.links" } }],
    ["깨진 참조", exported({ document: { ...fourRouterRipDocument, devices: fourRouterRipDocument.devices.slice(1) } }),
      { code: "LINK_DEVICE_NOT_FOUND" }],
  ])("%s", (_name, text, error) => {
    const result = parseExportJson(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject(error as object);
  });

  test("금지 키는 겉 포장에 있어도 거부", () => {
    const text = `{"kind":"${TOPOLOGY_EXPORT_KIND}","name":"a","__proto__":{},"document":${JSON.stringify(EMPTY_DOCUMENT)}}`;
    expect(parseExportJson(text)).toEqual({ ok: false, error: { code: "DOCUMENT_FORBIDDEN_KEY", params: { key: "__proto__" } } });
  });

  test("가져오기 크기 한도(2MB)를 넘으면 해석하지 않는다", () => {
    const text = exported({ padding: "x".repeat(LIMITS.maxImportBytes) });
    expect(parseExportJson(text)).toMatchObject({ ok: false, error: { code: "DOCUMENT_TOO_LARGE", params: { limit: LIMITS.maxImportBytes } } });
  });
});

describe("PBT-9와 같은 속성: 어떤 글자에도 예외를 던지지 않는다", () => {
  test("임의의 JSON과 글자", () => {
    fc.assert(
      fc.property(fc.oneof(fc.json(), fc.string()), (text) => {
        const result = parseExportJson(text);
        if (!result.ok) expect(typeof result.error.code).toBe("string");
      }),
      { numRuns: 500 },
    );
  });

  test("겉 포장 안의 임의의 값", () => {
    fc.assert(
      fc.property(fc.jsonValue(), fc.jsonValue(), (name, document) => {
        const result = parseExportJson(JSON.stringify({ kind: TOPOLOGY_EXPORT_KIND, name, document }));
        if (!result.ok) expect(typeof result.error.code).toBe("string");
      }),
      { numRuns: 500 },
    );
  });
});
