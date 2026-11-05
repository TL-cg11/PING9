import { expect, test } from "vitest";

import { SHARED_PACKAGE_NAME } from "./index";

test("shared 패키지가 불러와진다", () => {
  expect(SHARED_PACKAGE_NAME).toBe("@ping9/shared");
});
