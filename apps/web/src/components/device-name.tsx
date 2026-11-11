// 속성 패널의 제목 줄: 장비 이름, 종류, 이름 바꾸기 (T1.3.3, FR-10).
// 이름은 device/rename을 한 번 dispatch해 바꾼다 (AD-3). 형식과 중복은 reducer가 판단하고, 거부되면 그 사유를 입력란 아래에 보인다.
// 문구는 카탈로그에서 만들어 글자 그대로 넣는다 (AD-14, SEC-11).

import { LIMITS } from "@ping9/shared";
import type { Command, Device, DispatchResult, ErrorInfo } from "@ping9/shared";
import { useEffect, useId, useRef, useState } from "react";
import type { RefObject } from "react";

import { formatError } from "../messages/errors";

export interface DeviceNameViewProps {
  readonly name: string;
  readonly kindLabel: string;
  /** 입력 중인 이름. 바꾸는 중이 아니면 null */
  readonly draft: string | null;
  readonly error: ErrorInfo | null;
  readonly onStart: () => void;
  readonly onChange: (value: string) => void;
  /** `byEnter`: Enter로 적용했다. 입력란을 벗어나서 적용한 것이면 false */
  readonly onApply: (byEnter: boolean) => void;
  readonly onCancel: () => void;
  readonly startRef?: RefObject<HTMLButtonElement | null>;
}

/** 상태가 없는 모양. 받은 값을 그린다 */
export function DeviceNameView({ name, kindLabel, draft, error, onStart, onChange, onApply, onCancel, startRef }: DeviceNameViewProps) {
  const errorId = useId();

  if (draft === null) {
    return (
      <div className="title">
        <h3>{name}</h3>
        <span className="chip">{kindLabel}</span>
        <button ref={startRef} type="button" className="rename" aria-label={`${name} 이름 바꾸기`} title="이름 바꾸기" onClick={onStart}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M11.2 2.3l2.5 2.5-7.6 7.6-3.2.7.7-3.2z" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <>
      <form className="title name-form" onSubmit={(event) => { event.preventDefault(); onApply(true); }}>
        <input
          className="name-input"
          type="text"
          aria-label="장비 이름"
          autoComplete="off"
          spellCheck={false}
          autoFocus
          maxLength={LIMITS.maxDeviceNameLength}
          value={draft}
          aria-invalid={error !== null}
          aria-describedby={error === null ? undefined : errorId}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => onApply(false)}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            // 이름 바꾸기만 그만둔다. 연결 도구 해제 같은 화면 전체의 Esc로 번지지 않게 한다
            event.stopPropagation();
            onCancel();
          }}
        />
        <span className="chip">{kindLabel}</span>
      </form>
      {error !== null && (
        <div id={errorId} className="name-err" role="alert">
          {formatError(error)}
        </div>
      )}
      <div className="name-help">Enter로 적용 · Esc로 취소</div>
    </>
  );
}

/**
 * 입력 중인 이름을 들고 있는 제목 줄. 장비가 바뀌면 부모가 `key`로 새로 만든다.
 * Enter나 입력란을 벗어나면 적용한다. 거부되면 입력란을 그대로 두고 사유를 보인다.
 */
export function DeviceName({ device, kindLabel, onDispatch }: {
  readonly device: Device;
  readonly kindLabel: string;
  readonly onDispatch: (command: Command) => DispatchResult;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<ErrorInfo | null>(null);
  // 입력란이 사라질 때 브라우저가 보내는 blur로 한 번 더 적용하지 않게 한다
  const editing = useRef(false);
  const startRef = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);

  // 키보드로 바꾼 뒤에도 자리를 잃지 않게, 끝나면 "이름 바꾸기" 버튼으로 돌아간다 (NFR-12)
  useEffect(() => {
    if (draft !== null || !refocus.current) return;
    refocus.current = false;
    startRef.current?.focus();
  }, [draft]);

  const close = (focusBack: boolean) => {
    editing.current = false;
    refocus.current = focusBack;
    setDraft(null);
    setError(null);
  };

  const apply = (focusBack: boolean) => {
    if (!editing.current || draft === null) return;
    const name = draft.trim();
    if (name === device.name) return close(focusBack);
    const result = onDispatch({ type: "device/rename", deviceId: device.id, name });
    if (result.ok) close(focusBack);
    else setError(result.error);
  };

  return (
    <DeviceNameView
      name={device.name}
      kindLabel={kindLabel}
      draft={draft}
      error={error}
      startRef={startRef}
      onStart={() => { editing.current = true; setDraft(device.name); setError(null); }}
      onChange={(value) => { setDraft(value); setError(null); }}
      onApply={apply}
      onCancel={() => close(true)}
    />
  );
}
