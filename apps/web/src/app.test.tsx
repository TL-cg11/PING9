import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";

import { App } from "./app";

test("자리표시 화면이 Simulator에 불러온 예시 토폴로지의 요약을 그린다", () => {
  // 서버 렌더링은 글자 사이에 주석 표시를 넣으므로 빼고 비교한다
  const text = renderToString(<App />).replaceAll("<!-- -->", "");

  expect(text).toContain("PING9");
  expect(text).toContain("예시 토폴로지: 장비 2대 (PC1, PC2), 링크 1개");
});
