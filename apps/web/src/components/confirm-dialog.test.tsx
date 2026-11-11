// T7.1.2: 바꾸기 전에 묻는 확인 창
import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";

import { ConfirmDialog } from "./confirm-dialog";

test("제목, 내용, 취소와 확인 버튼. 화면 안의 창이다", () => {
  const html = renderToString(
    <ConfirmDialog title="지금 토폴로지를 바꿀까요?" confirmLabel="바꾸기" onConfirm={() => {}} onCancel={() => {}}>
      <p>내용</p>
    </ConfirmDialog>,
  );

  expect(html).toContain('role="alertdialog"');
  expect(html).toContain('aria-modal="true"');
  expect(html).toContain('<strong id="confirm-title">지금 토폴로지를 바꿀까요?</strong>');
  expect(html).toContain("<p>내용</p>");
  expect([...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map(([, label]) => label)).toEqual(["취소", "바꾸기"]);
});
