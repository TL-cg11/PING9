// 화면 안의 작은 확인 창 (T7.1.2). 가져오기와 새로 만들기가 지금 토폴로지를 바꾸기 전에 묻는다.
// 브라우저의 `confirm()` 대신 쓴다: 모양이 화면과 맞고 테스트할 수 있다 (설계 결정 6). Esc는 앱이 취소로 처리한다

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export function ConfirmDialog({ title, children, confirmLabel, onConfirm, onCancel }: {
  readonly title: string;
  readonly children: ReactNode;
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  const confirm = useRef<HTMLButtonElement>(null);
  // 열리면 확인 버튼으로. Enter로 바로 정하고 Tab으로 취소에 간다
  useEffect(() => confirm.current?.focus(), []);
  return (
    <div className="confirm-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <strong id="confirm-title">{title}</strong>
        <div className="confirm-body">{children}</div>
        <div className="confirm-actions">
          <button type="button" onClick={onCancel}>취소</button>
          <button ref={confirm} type="button" className="primary" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
