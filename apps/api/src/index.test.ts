import { EMPTY_DOCUMENT, parseDocumentJson } from "@ping9/shared";
import { expect, test } from "vitest";

import { API_PACKAGE_NAME } from "./index";

test("api 패키지가 불러와진다", () => {
  expect(API_PACKAGE_NAME).toBe("@ping9/api");
});

test("api가 저장할 때 쓸 shared의 검증 절차를 불러올 수 있다 (AD-9)", () => {
  expect(parseDocumentJson(JSON.stringify(EMPTY_DOCUMENT))).toEqual({
    ok: true,
    document: EMPTY_DOCUMENT,
  });
  expect(parseDocumentJson('{"schemaVersion":1,"devices":"x","links":[]}')).toMatchObject({
    ok: false,
    error: { code: "DOCUMENT_INVALID_SHAPE" },
  });
});
