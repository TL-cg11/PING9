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

  for (const className of ["topbar", "palette", "canvas"]) {
    expect(text).toContain(`class="${className}"`);
  }
  // 고른 장비가 없으면 속성 패널은 빈 카드다 (T0.17)
  expect(text).toContain('class="inspector inspector-idle"');
});

test("캔버스와 속성 패널 사이에 패널 폭 손잡이가 있다 (T0.18)", () => {
  const text = html();

  expect(text).toContain('class="side-resize"');
  expect(text).toContain('role="separator"');
  // 기억한 폭이 없으면(서버 렌더링) 처음 폭 270px
  expect(text).toContain("grid-template-columns:112px minmax(0, 1fr) 270px");
  expect(text).toContain('aria-valuenow="270"');
});

test("창 전체에 지금 모드가 클래스로 붙는다 (T0.17, 시뮬레이션 배경)", () => {
  expect(html()).toMatch(/<div class="app mode-(realtime|simulation)">/);
});

test("모드 버튼 둘과 내보내기, 가져오기가 켜져 있다 (T0.13, T7.1.1, T7.1.2)", () => {
  const text = html();

  const topbar = text.slice(text.indexOf('<header class="topbar">'), text.indexOf("</header>"));
  expect(topbar.match(/<button[^>]*disabled=""[^>]*>/g)).toBeNull();
  expect(topbar).toMatch(/<button type="button" class="ghost">⤓ 내보내기/);
  expect(topbar).toMatch(/<button type="button" class="ghost">⤒ 가져오기/);
  // ping 실행 버튼은 없고(T0.15), 실시간이라 멈춤·속도도 없다
  expect(topbar).not.toContain("ping 실행");
  expect(topbar).not.toContain("sim-controls");
  expect(topbar.match(/<button[^>]*role="tab"[^>]*>/g)?.every((tab) => !tab.includes("disabled"))).toBe(true);
});

test("확인 창과 가져오기 실패 알림은 처음에 없다 (T7.1.2)", () => {
  const text = html();
  expect(text).not.toContain("confirm-dialog");
  expect(text).not.toContain("import-error");
});

test("처음 열면 실시간 모드 (T0.13)", () => {
  const topbar = html().match(/<div class="mode".*?<\/div>/s)?.[0] ?? "";
  expect(topbar).toMatch(/<button[^>]*aria-selected="true"[^>]*>⏱ 실시간/);
});

test("장비가 2대보다 적으면 케이블 도구가 꺼져 있다", () => {
  const palette = html().match(/<aside class="palette">.*?<\/aside>/s)?.[0] ?? "";

  expect(palette.match(/<button[^>]*disabled=""[^>]*>/g)).toHaveLength(1);
});

test("실시간 모드에는 상세 정보 / 이벤트 탭이 없다 (T1.9.2, 시뮬레이션만)", () => {
  const text = html();

  expect(text).toContain('class="app mode-realtime"');
  expect(text).not.toContain("side-tabs");
});
