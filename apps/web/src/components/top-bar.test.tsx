// T0.13: 상단 막대의 모드 전환. T7.1.1, T7.1.2: 내보내기, 가져오기
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { TopBar } from "./top-bar";

const tabs = (html: string) =>
  [...html.matchAll(/<button[^>]*role="tab"[^>]*>(.*?)<\/button>/g)].map(([tag, label]) => ({
    label: label!.replaceAll("<!-- -->", ""),
    selected: tag.includes('aria-selected="true"'),
    on: tag.includes('class="on"'),
    disabled: / disabled=""/.test(tag),
  }));

describe("모드 버튼", () => {
  test("두 버튼이 켜져 있고, 고른 모드만 선택 표시", () => {
    const html = renderToString(<TopBar name="새 토폴로지" onExport={() => {}} onImport={() => {}} mode="simulation" onModeChange={() => {}} />);

    expect(tabs(html)).toEqual([
      { label: "⏱ 실시간", selected: false, on: false, disabled: false },
      { label: "⏯ 시뮬레이션", selected: true, on: true, disabled: false },
    ]);
  });

  test("실시간을 고르면 실시간에 선택 표시", () => {
    const html = renderToString(<TopBar name="새 토폴로지" onExport={() => {}} onImport={() => {}} mode="realtime" onModeChange={() => {}} />);
    expect(tabs(html).map((tab) => tab.selected)).toEqual([true, false]);
  });

});

describe("내보내기, 가져오기 (T7.1.1, T7.1.2)", () => {
  const html = renderToString(<TopBar name="새 토폴로지" onExport={() => {}} onImport={() => {}} mode="realtime" onModeChange={() => {}} />);
  const ghosts = [...html.matchAll(/<button[^>]*class="ghost"[^>]*>(.*?)<\/button>/g)]
    .map(([tag, label]) => ({ label: label!.trim(), disabled: / disabled=""/.test(tag) }));

  test("두 버튼이 켜져 있다", () => {
    expect(ghosts).toEqual([{ label: "⤓ 내보내기", disabled: false }, { label: "⤒ 가져오기", disabled: false }]);
  });

  test("가져오기는 숨은 파일 고르기 창으로 `.json`을 고른다", () => {
    expect(html).toMatch(/<input type="file" accept="\.json,application\/json" hidden="" aria-label="가져올 파일"\/>/);
  });

  test("두 버튼은 왼쪽, 토폴로지 이름 바로 뒤에 있고 모드는 그 뒤", () => {
    const order = ["새 토폴로지", "⤓ 내보내기", "⤒ 가져오기", 'class="spacer"', "⏱ 실시간"].map((text) => html.indexOf(text));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe("시뮬레이션의 멈춤·속도 (T0.15)", () => {
  const sim = (clock: { paused: boolean; speed: 0.5 | 1 | 2 }) => ({ clock, onPause: () => {}, onResume: () => {}, onSpeed: () => {} });
  const render = (mode: "realtime" | "simulation", paused = false) => renderToString(
    <TopBar name="새 토폴로지" onExport={() => {}} onImport={() => {}} mode={mode} onModeChange={() => {}}
      {...(mode === "simulation" ? { sim: sim({ paused, speed: 1 }) } : {})} />);

  test("ping 실행 버튼은 없다", () => {
    expect(render("realtime")).not.toContain("ping 실행");
    expect(render("simulation")).not.toContain("ping 실행");
  });

  test("실시간: 멈춤과 속도가 없다", () => {
    const html = render("realtime");
    expect(html).not.toContain("sim-controls");
    expect(html).not.toContain("⏸ 멈춤");
  });

  test("시뮬레이션: 멈춤과 속도 셋, 1×가 눌림", () => {
    const html = render("simulation");
    expect(html).toContain("⏸ 멈춤");
    expect(html).not.toContain("다시 실행");
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*aria-label="1배속"[^>]*class="on"[^>]*>1<!-- -->×/);
    expect(html).toContain('aria-label="0.5배속"');
    expect(html).toContain('aria-label="2배속"');
  });

  test("멈춘 동안: 다시 실행", () => {
    const html = render("simulation", true);
    expect(html).toContain('class="sim-run paused"');
    expect(html).toContain("▶ 다시 실행");
    expect(html).not.toContain("⏸ 멈춤");
  });

  test("모드 탭은 맨 오른쪽, 멈춤·속도는 그 왼쪽", () => {
    const html = render("simulation");
    const order = ['class="spacer"', "⏸ 멈춤", "2배속", "⏱ 실시간", "⏯ 시뮬레이션"].map((text) => html.indexOf(text));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html.slice(html.indexOf("⏯ 시뮬레이션"))).toMatch(/^⏯ 시뮬레이션<\/button><\/div><\/header>$/);
  });
});
