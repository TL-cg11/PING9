import { expect, test } from "vitest";

import { API_PACKAGE_NAME, API_WORKSPACE_DEPENDENCIES } from "./index";

test("api 패키지가 shared를 불러온다", () => {
  expect(API_PACKAGE_NAME).toBe("@ping9/api");
  expect(API_WORKSPACE_DEPENDENCIES).toEqual(["@ping9/shared"]);
});
