// 속성 기반 테스트 PBT-9의 뒷부분: 검증을 통과한 문서는 engine이 불러오고 스냅샷을 만들 수 있다.
import { validateDocument } from "@ping9/shared";
import type { TopologyDocument } from "@ping9/shared";
import { EXAMPLE_DOCUMENTS } from "@ping9/shared/examples";
import fc from "fast-check";
import { expect, test } from "vitest";

import { createSimulator } from "./index";

/** 값 안의 한 곳을 다른 값으로 바꾼다. `path`의 수를 차례로 써서 내려갈 곳을 고른다 */
function replaceAt(value: unknown, path: readonly number[], replacement: unknown): unknown {
  if (typeof value !== "object" || value === null || path.length === 0) return replacement;

  const [head, ...rest] = path as [number, ...number[]];
  if (Array.isArray(value)) {
    if (value.length === 0) return replacement;
    const copy = [...value];
    copy[head % copy.length] = replaceAt(copy[head % copy.length], rest, replacement);
    return copy;
  }

  const keys = Object.keys(value);
  if (keys.length === 0) return replacement;
  const key = keys[head % keys.length]!;
  return { ...value, [key]: replaceAt((value as Record<string, unknown>)[key], rest, replacement) };
}

const candidate = fc
  .tuple(
    fc.constantFrom(...EXAMPLE_DOCUMENTS.map((example) => example.document)),
    fc.array(fc.nat(), { minLength: 1, maxLength: 7 }),
    fc.oneof(
      fc.jsonValue(),
      // 유효한 값으로 바뀌는 경우가 섞이도록 문서에 나올 법한 값을 넣는다
      fc.constantFrom<unknown>(true, false, 1, 10, "PC9", "192.168.1.77", "255.255.0.0", "trunk", {}, []),
    ),
  )
  .map(([document, path, replacement]) => replaceAt(document, path, replacement));

test("load는 어떤 값에도 예외를 던지지 않고, 검증을 통과한 문서는 스냅샷이 된다", () => {
  let loaded = 0;

  fc.assert(
    fc.property(candidate, (value) => {
      const simulator = createSimulator();
      const expected = validateDocument(value);

      const result = simulator.load(value as TopologyDocument);

      expect(result.ok).toBe(expected.ok);
      const snapshot = simulator.getSnapshot();
      if (expected.ok) {
        loaded += 1;
        expect(snapshot.document).toEqual(expected.document);
        expect(Object.keys(snapshot.views)).toHaveLength(expected.document.devices.length);
        for (const device of expected.document.devices) {
          expect(simulator.console(device.id).prompt()).toBe(`${device.name}>`);
        }
      } else {
        expect(snapshot.docVersion).toBe(0);
      }
    }),
    { numRuns: 1000, seed: 20261105 },
  );

  // 통과하는 문서가 하나도 없으면 뒷부분을 확인하지 못한 것이다
  expect(loaded).toBeGreaterThan(10);
});
