import { EMPTY_DOCUMENT } from "@ping9/shared";
import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";

import { App } from "./app";
import { simulator } from "./simulator";

// 서버 렌더링은 글자 사이에 주석 표시를 넣으므로 빼고 비교한다
const html = () => renderToString(<App />).replaceAll("<!-- -->", "");

test("처음 화면에는 배치된 장비와 케이블이 없다", () => {
  const text = html();

  expect(text).toContain("새 토폴로지");
  expect(text).toContain("장비 0 / 50");
  expect(text).not.toContain("data-device-id");
  expect(simulator.getSnapshot().document).toEqual(EMPTY_DOCUMENT);
});

test("시안의 틀(상단 막대, 장비 목록, 캔버스, 속성 패널)이 있다", () => {
  const text = html();

  for (const className of ["topbar", "palette", "canvas", "inspector"]) {
    expect(text).toContain(`class="${className}"`);
  }
});

test("아직 동작하지 않는 버튼은 꺼져 있다. 모드 버튼 둘은 켜져 있다 (T0.13)", () => {
  const text = html();

  const topbar = text.slice(text.indexOf('<header class="topbar">'), text.indexOf("</header>"));
  // 내보내기, 가져오기. ping 실행은 실시간 모드라 aria-disabled로 꺼짐 (안내가 뜨게)
  expect(topbar.match(/<button[^>]*disabled=""[^>]*>/g)).toHaveLength(2);
  expect(topbar).toMatch(/<button[^>]*class="ping-btn off"[^>]*aria-disabled="true"/);
  expect(topbar.match(/<button[^>]*role="tab"[^>]*>/g)?.every((tab) => !tab.includes("disabled"))).toBe(true);
});

test("처음 열면 실시간 모드 (T0.13)", () => {
  const topbar = html().match(/<div class="mode".*?<\/div>/s)?.[0] ?? "";
  expect(topbar).toMatch(/<button[^>]*aria-selected="true"[^>]*>⏱ 실시간/);
});

test("장비가 2대보다 적으면 케이블 도구가 꺼져 있다", () => {
  const palette = html().match(/<aside class="palette">.*?<\/aside>/s)?.[0] ?? "";

  expect(palette.match(/<button[^>]*disabled=""[^>]*>/g)).toHaveLength(1);
});
