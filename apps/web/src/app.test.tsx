import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";

import { App } from "./app";

test("자리표시 화면이 engine과 shared를 불러와 그려진다", () => {
  const html = renderToString(<App />);

  expect(html).toContain("PING9");
  expect(html).toContain("@ping9/engine");
  expect(html).toContain("@ping9/shared");
});
