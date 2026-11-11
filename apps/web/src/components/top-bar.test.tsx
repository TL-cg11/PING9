// T0.13: 상단 막대의 모드 전환
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { PING_IN_SIMULATION, TopBar } from "./top-bar";

const tabs = (html: string) =>
  [...html.matchAll(/<button[^>]*role="tab"[^>]*>(.*?)<\/button>/g)].map(([tag, label]) => ({
    label: label!.replaceAll("<!-- -->", ""),
    selected: tag.includes('aria-selected="true"'),
    on: tag.includes('class="on"'),
    disabled: / disabled=""/.test(tag),
  }));

describe("모드 버튼", () => {
  test("두 버튼이 켜져 있고, 고른 모드만 선택 표시", () => {
    const html = renderToString(<TopBar name="새 토폴로지" mode="simulation" onModeChange={() => {}} />);

    expect(tabs(html)).toEqual([
      { label: "⏱ 실시간", selected: false, on: false, disabled: false },
      { label: "⏯ 시뮬레이션", selected: true, on: true, disabled: false },
    ]);
  });

  test("실시간을 고르면 실시간에 선택 표시", () => {
    const html = renderToString(<TopBar name="새 토폴로지" mode="realtime" onModeChange={() => {}} />);
    expect(tabs(html).map((tab) => tab.selected)).toEqual([true, false]);
  });

  test("내보내기, 가져오기는 그대로 꺼져 있다", () => {
    const html = renderToString(<TopBar name="새 토폴로지" mode="realtime" onModeChange={() => {}} />);
    expect(html.match(/<button class="ghost" disabled="">/g)).toHaveLength(2);
  });
});

describe("ping 실행", () => {
  const pingButton = (html: string) => html.match(/<button[^>]*class="ping-btn[^"]*"[^>]*>/)![0];

  test("실시간 모드(onPing 없음): 꺼지고 시뮬레이션 모드를 안내한다", () => {
    const button = pingButton(renderToString(<TopBar name="새 토폴로지" mode="realtime" onModeChange={() => {}} />));
    expect(button).toContain('class="ping-btn off"');
    expect(button).toContain('aria-disabled="true"');
    expect(button).toContain(`title="${PING_IN_SIMULATION}"`);
  });

  test("시뮬레이션 모드: 눌러지고, 도구가 켜지면 켜진 표시", () => {
    const off = pingButton(renderToString(<TopBar name="새 토폴로지" mode="simulation" onModeChange={() => {}} onPing={() => {}} />));
    expect(off).toContain('class="ping-btn"');
    expect(off).toContain('aria-pressed="false"');
    expect(off).not.toContain("aria-disabled");

    const on = pingButton(renderToString(<TopBar name="새 토폴로지" mode="simulation" onModeChange={() => {}} onPing={() => {}} pingActive />));
    expect(on).toContain('class="ping-btn on"');
    expect(on).toContain('aria-pressed="true"');
  });
});
