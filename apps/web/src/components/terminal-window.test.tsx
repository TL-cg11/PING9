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

const render = (hidden = false, busy = false) =>
  renderToString(
    <TerminalWindow
      deviceName="SW1"
      kindLabel="Switch"
      state={STATE}
      busy={busy}
      placement={{ deviceId: "x", x: 10, y: 20, hidden }}
      zIndex={21}
      onSubmit={() => {}}
      onHistory={() => ""}
      onComplete={(input) => input}
      onHelp={() => {}}
      onLeave={() => {}}
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

test("닫기 버튼은 Tab으로 닿는다. Safari도 건너뛰지 않게 tabindex를 적는다 (T1.6.2)", () => {
  expect(render()).toContain('<button type="button" class="t-x" tabindex="0" aria-label="닫기">');
});

test("위치와 쌓이는 순서를 스타일로 넣고, 닫은 창은 hidden 클래스를 단다", () => {
  expect(render()).toMatch(/class="term"[^>]* style="left:10px;top:20px;z-index:21"/);
  expect(render(true)).toContain('class="term hidden"');
});

test("창은 장비 이름의 콘솔 영역이고, 출력은 화면 낭독기가 읽는 기록이다 (T1.6.2)", () => {
  const html = render();

  expect(html).toContain('<div class="term" data-device-id="x" role="region" aria-label="SW1 콘솔"');
  // 입력란은 기록 밖에 있다. 입력하는 글자를 기록으로 읽지 않는다
  expect(html).toMatch(/<div role="log" aria-live="polite" aria-label="SW1 출력">.*<\/div><div class="term-in">/);
});

test("출력이 이어지는 중에는 입력 줄을 숨긴다. 입력란은 남아 Ctrl+C를 받는다 (T1.8.3)", () => {
  expect(render()).toContain('<div class="term-in">');
  const html = render(false, true);
  expect(html).toMatch(/<div class="term-in busy"><span class="p">SW1#<\/span><input/);
});
