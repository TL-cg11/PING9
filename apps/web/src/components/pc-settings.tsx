// 속성 패널에서 PC에만 있는 구역: IP, 서브넷 마스크, 기본 게이트웨이 (T1.5.2, FR-25).
// "적용" 버튼이나 Enter로 pc/set-ip를 한 번 dispatch한다 (AD-3). 판단은 format/pc-address.ts에 있다.
// 문구는 카탈로그에서 만들어 글자 그대로 넣는다 (AD-14, SEC-11).

import type { Command, DispatchResult, ErrorInfo, Notice, PcDevice } from "@ping9/shared";
import { useId, useState } from "react";

import { applyDraft, draftOf, PC_FIELDS } from "../format/pc-address";
import type { FieldErrors, PcDraft, PcField } from "../format/pc-address";
import { formatError } from "../messages/errors";
import { formatNotice } from "../messages/notices";

const LABELS: Readonly<Record<PcField, string>> = {
  ip: "IP 주소",
  mask: "서브넷 마스크",
  gateway: "기본 게이트웨이",
};

/** IPv4의 가장 긴 형태 `255.255.255.255` */
const MAX_LENGTH = 15;

/** 구성 값이 바뀌었는지 비교할 열쇠 */
const configKey = (device: PcDevice) => PC_FIELDS.map((field) => device.config[field] ?? "").join("|");

/** 마지막 적용의 결과 한 줄. 칸을 다시 고치면 사라진다 */
export type ApplyStatus = "applied" | "unchanged" | null;

const STATUS_TEXT: Readonly<Record<"applied" | "unchanged", string>> = {
  applied: "✓ 적용했어요",
  unchanged: "바뀐 값이 없어요",
};

export interface PcSettingsViewProps {
  readonly draft: PcDraft;
  readonly errors: FieldErrors;
  /** 칸과 상관없는 오류 */
  readonly general: ErrorInfo | null;
  readonly notices: readonly Notice[];
  readonly status: ApplyStatus;
  readonly onChange: (field: PcField, value: string) => void;
  readonly onApply: () => void;
}

/** 상태가 없는 모양. 받은 값을 그린다 */
export function PcSettingsView({ draft, errors, general, notices, status, onChange, onApply }: PcSettingsViewProps) {
  const id = useId();

  return (
    <form
      className="pc-form"
      onSubmit={(event) => {
        event.preventDefault();
        onApply();
      }}
    >
      <h4>IP 설정</h4>
      {general !== null && (
        <div className="form-err" role="alert">
          {formatError(general)}
        </div>
      )}
      {PC_FIELDS.map((field) => {
        const error = errors[field];
        const inputId = `${id}-${field}`;
        const errorId = `${inputId}-err`;
        return (
          <div key={field} className="field">
            <label htmlFor={inputId}>{LABELS[field]}</label>
            <input
              id={inputId}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              maxLength={MAX_LENGTH}
              value={draft[field]}
              aria-invalid={error !== undefined}
              aria-describedby={error === undefined ? undefined : errorId}
              onChange={(event) => onChange(field, event.target.value)}
            />
            {error !== undefined && (
              <div id={errorId} className="field-err">
                {formatError(error)}
              </div>
            )}
          </div>
        );
      })}
      <button type="submit" className="apply">
        적용
      </button>
      {status !== null && (
        <div className={`form-status ${status}`} role="status">
          {STATUS_TEXT[status]}
        </div>
      )}
      {notices.map((notice, index) => (
        <div key={index} className="form-notice" role="status">
          ⚠ {formatNotice(notice)}
        </div>
      ))}
    </form>
  );
}

/**
 * 입력 중인 값을 들고 있는 구역. 장비가 바뀌면 부모가 `key`로 새로 만든다.
 * 콘솔의 ipconfig처럼 구성이 바깥에서 바뀌면 입력 중인 값과 칸의 오류를 새 구성으로 바꾼다.
 * 중복 IP 경고는 그 적용의 결과라서, 값을 바꿔 다시 적용하거나 다른 장비를 고를 때까지 남는다.
 * 같은 값으로 다시 적용하면 아무것도 보내지 않으므로 경고도 그대로 둔다.
 */
export function PcSettings({
  device,
  onDispatch,
}: {
  readonly device: PcDevice;
  readonly onDispatch: (command: Command) => DispatchResult;
}) {
  const [draft, setDraft] = useState<PcDraft>(() => draftOf(device.config));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [general, setGeneral] = useState<ErrorInfo | null>(null);
  const [notices, setNotices] = useState<readonly Notice[]>([]);
  const [status, setStatus] = useState<ApplyStatus>(null);

  // 렌더링 중에 바뀐 구성을 알아채 상태를 맞춘다 (React의 "props가 바뀌면 상태 조정" 방식)
  const key = configKey(device);
  const [seenKey, setSeenKey] = useState(key);
  if (seenKey !== key) {
    setSeenKey(key);
    setDraft(draftOf(device.config));
    setErrors({});
    setGeneral(null);
  }

  const apply = () => {
    const outcome = applyDraft(device.id, device.config, draft, onDispatch);
    setGeneral(null);
    setStatus(null);
    if (outcome.kind === "unchanged") {
      setErrors({});
      setStatus("unchanged");
      return;
    }
    setNotices([]);
    switch (outcome.kind) {
      case "invalid":
        setErrors(outcome.errors);
        return;
      case "applied":
        setErrors({});
        setNotices(outcome.notices);
        setStatus("applied");
        return;
      case "rejected":
        if (outcome.field === null) {
          setErrors({});
          setGeneral(outcome.error);
        } else {
          setErrors({ [outcome.field]: outcome.error });
        }
        return;
    }
  };

  return (
    <PcSettingsView
      draft={draft}
      errors={errors}
      general={general}
      notices={notices}
      status={status}
      onChange={(field, value) => {
        setStatus(null);
        setDraft((current) => ({ ...current, [field]: value }));
      }}
      onApply={apply}
    />
  );
}
