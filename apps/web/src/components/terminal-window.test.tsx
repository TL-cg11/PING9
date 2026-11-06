import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";

import type { TerminalState } from "../terminal/terminal-state";
import { TerminalWindow } from "./terminal-window";

const STATE: TerminalState = {
  prompt: "SW1#",
  history: [],
  historyIndex: null,
  lines: [
    { kind: "input", prompt: "SW1>", text: "<b>enable</b>" },
    { kind: "text", text: "VLAN  Name" },
    { kind: "error", text: "오류" },
    { kind: "notice", text: "알림" },
  ],
};

const render = (hidden = false) =>
  renderToString(
    <TerminalWindow
      deviceName="SW1"
      kindLabel="Switch"
      state={STATE}
      placement={{ deviceId: "x", x: 10, y: 20, hidden }}
      zIndex={21}
      onSubmit={() => {}}
      onHistory={() => ""}
      onClose={() => {}}
      onFocus={() => {}}
      onMove={() => {}}
    />,
  ).replaceAll("<!-- -->", "");

test("줄 종류마다 시안의 클래스로 그린다", () => {
  const html = render();

  expect(html).toContain('<div class="pre">VLAN  Name</div>');
  expect(html).toContain('<div class="err">오류</div>');
  expect(html).toContain('<div class="dim">알림</div>');
  expect(html).toContain('<span class="p">SW1&gt;</span>');
});

test("입력한 글은 이스케이프되어 글자 그대로 보인다", () => {
  const html = render();

  expect(html).toContain("&lt;b&gt;enable&lt;/b&gt;");
  expect(html).not.toContain("<b>enable</b>");
});

test("제목 막대에 장비 이름과 종류, 닫기 버튼이 있고 입력란 앞에 현재 프롬프트가 있다", () => {
  const html = render();

  expect(html).toContain('<span class="t-name">SW1</span>');
  expect(html).toContain('<span class="t-chip">Switch</span>');
  expect(html).toContain('aria-label="닫기"');
  expect(html).toMatch(/class="term-in"><span class="p">SW1#<\/span><input/);
});

test("위치와 쌓이는 순서를 스타일로 넣고, 닫은 창은 hidden 클래스를 단다", () => {
  expect(render()).toMatch(/class="term" style="left:10px;top:20px;z-index:21"/);
  expect(render(true)).toContain('class="term hidden"');
});
