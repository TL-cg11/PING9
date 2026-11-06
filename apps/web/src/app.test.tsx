import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";

import { App } from "./app";

// 서버 렌더링은 글자 사이에 주석 표시를 넣으므로 빼고 비교한다
const html = () => renderToString(<App />).replaceAll("<!-- -->", "");

test("편집기 화면이 예시 토폴로지를 그린다", () => {
  const text = html();

  expect(text).toContain("VLAN 실습 1");
  expect(text).toContain("장비 6 / 50");
  expect(text).toContain(">SW1<");
  expect(text).toContain(">PC4<");
});

test("시안의 틀(상단 막대, 장비 목록, 캔버스, 속성 패널)이 있다", () => {
  const text = html();

  for (const className of ["topbar", "palette", "canvas", "inspector"]) {
    expect(text).toContain(`class="${className}"`);
  }
});

test("아직 동작하지 않는 버튼은 꺼져 있다", () => {
  const text = html();

  expect(text.match(/<button[^>]*disabled=""[^>]*>/g)).toHaveLength(5);
});
