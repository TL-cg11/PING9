import { expect, test } from "vitest";

import { ENGINE_PACKAGE_NAME, ENGINE_WORKSPACE_DEPENDENCIES } from "./index";

test("engine 패키지가 shared를 불러온다", () => {
  expect(ENGINE_PACKAGE_NAME).toBe("@ping9/engine");
  expect(ENGINE_WORKSPACE_DEPENDENCIES).toEqual(["@ping9/shared"]);
});
