// 속성 기반 테스트 PBT-9: 임의의 값과, 유효한 문서를 조금씩 망가뜨린 값을 넣어도 예외가 나지 않는다.
import fc from "fast-check";
import { describe, expect, test } from "vitest";

import { EXAMPLE_DOCUMENTS } from "./examples/index";
import { parseDocumentJson, validateDocument } from "./validate";

/** 값 안의 한 곳을 다른 값으로 바꾸거나 지운다. `path`의 수를 차례로 써서 내려갈 곳을 고른다 */
function mutate(value: unknown, path: readonly number[], replacement: unknown, remove: boolean): unknown {
  if (typeof value !== "object" || value === null || path.length === 0) return replacement;

  const [head, ...rest] = path as [number, ...number[]];
  if (Array.isArray(value)) {
    if (value.length === 0) return replacement;
    const index = head % value.length;
    const copy = [...value];
    if (rest.length === 0 && remove) copy.splice(index, 1);
    else copy[index] = mutate(copy[index], rest, replacement, remove);
    return copy;
  }

  const keys = Object.keys(value);
  if (keys.length === 0) return replacement;
  const key = keys[head % keys.length]!;
  const copy: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  if (rest.length === 0 && remove) delete copy[key];
  else copy[key] = mutate(copy[key], rest, replacement, remove);
  return copy;
}

const exampleDocument = fc.constantFrom(...EXAMPLE_DOCUMENTS.map((example) => example.document));

const brokenDocument = fc
  .tuple(
    exampleDocument,
    fc.array(fc.nat(), { minLength: 1, maxLength: 7 }),
    fc.oneof(fc.jsonValue(), fc.string(), fc.integer(), fc.constant(null)),
    fc.boolean(),
  )
  .map(([document, path, replacement, remove]) => mutate(document, path, replacement, remove));

/** 통과했다면 돌려준 값은 다시 넣어도 그대로 통과해야 한다 */
function expectStable(result: ReturnType<typeof validateDocument>): void {
  if (!result.ok) {
    expect(typeof result.error.code).toBe("string");
    return;
  }
  expect(validateDocument(result.document)).toEqual(result);
  expect(parseDocumentJson(JSON.stringify(result.document))).toEqual(result);
}

describe("PBT-9: 검증은 어떤 값에도 예외를 던지지 않는다", () => {
  test("임의의 값", () => {
    fc.assert(
      fc.property(fc.anything({ withBigInt: true, withDate: true, withMap: true, withSet: true }), (value) => {
        expectStable(validateDocument(value));
      }),
      { numRuns: 500 },
    );
  });

  test("임의의 JSON 글자", () => {
    fc.assert(
      fc.property(fc.json(), (text) => {
        expectStable(parseDocumentJson(text));
      }),
      { numRuns: 500 },
    );
  });

  test("임의의 글자", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        expect(parseDocumentJson(text).ok).toBe(false);
      }),
      { numRuns: 300 },
    );
  });

  test("유효한 문서를 한 곳씩 망가뜨린 값", () => {
    fc.assert(
      fc.property(brokenDocument, (value) => {
        expectStable(validateDocument(value));
        expectStable(parseDocumentJson(JSON.stringify(value) ?? ""));
      }),
      { numRuns: 1000 },
    );
  });

  test("망가뜨리는 함수가 실제로 유효한 문서와 깨진 문서를 모두 만든다", () => {
    const samples = fc.sample(brokenDocument, { numRuns: 400, seed: 7 });
    const accepted = samples.filter((value) => validateDocument(value).ok).length;

    expect(accepted).toBeGreaterThan(0);
    expect(accepted).toBeLessThan(samples.length);
  });
});
