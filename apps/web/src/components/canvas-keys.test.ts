import { expect, test } from "vitest";

import { nodeKeyAction } from "./canvas-keys";

test.each([
  ["Enter", "open"],
  [" ", "select"],
])("%j → %s", (key, action) => {
  expect(nodeKeyAction(key)).toBe(action);
});

test.each(["Tab", "Escape", "a", "ArrowDown"])("%j는 노드가 처리하지 않는다 (Tab은 다음 노드로 감)", (key) => {
  expect(nodeKeyAction(key)).toBeNull();
});
