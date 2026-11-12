// 속성 패널에서 PC에만 있는 구역: OS (T0.7), 포트 켜고 끄기 (T0.14), IP, 서브넷 마스크, 기본 게이트웨이 (T1.5.2, FR-25).
// "적용" 버튼이나 Enter로 pc/set-ip를 한 번 dispatch한다 (AD-3). 판단은 format/pc-address.ts에 있다.
// OS는 고르는 즉시 pc/set-os를, 포트 토글은 누르는 즉시 interface/set-admin을 dispatch한다. IP의 "적용"과 따로다.
// 문구는 카탈로그에서 만들어 글자 그대로 넣는다 (AD-14, SEC-11).

import { OS_KINDS, PORT_NAMES, osOf } from "@ping9/shared";
import type { Command, DispatchResult, ErrorInfo, Notice, OsKind, PcDevice } from "@ping9/shared";
import { useId, useState } from "react";

import { applyDraft, draftOf, OS_NAMES, PC_FIELDS, prefixLabel } from "../format/pc-address";
import type { FieldErrors, PcDraft, PcField } from "../format/pc-address";
import { formatError } from "../messages/errors";
import { formatNotice } from "../messages/notices";

const LABELS: Readonly<Record<PcField, string>> = {
  ip: "IP 주소",
  mask: "서브넷 마스크",
  gateway: "기본 게이트웨이",
};

/** OS 고르기. 라디오 버튼이라 화살표 키로 바꿀 수 있다 (NFR-12) */
export function OsChoice({ os, onChange }: { readonly os: OsKind; readonly onChange: (os: OsKind) => void }) {
  const name = useId();
  return (
    <fieldset className="os-choice">
      <legend>OS</legend>
      {OS_KINDS.map((kind) => (
        <label key={kind}>
          <input
            type="radio"
            name={name}
            value={kind}
            checked={os === kind}
            onChange={() => onChange(kind)}
          />
          {OS_NAMES[kind]}
        </label>
      ))}
    </fieldset>
  );
}

const PC_PORT = PORT_NAMES.pc[0];

/** 패널에 보이는 포트 이름. Linux는 콘솔과 같은 `eth0`, 문서 안의 이름은 OS와 상관없이 `Ethernet0`이다 */
const PORT_LABELS: Readonly<Record<OsKind, string>> = { windows: PC_PORT, linux: "eth0" };

/** 토글을 눌렀을 때 낼 Command (T0.14) */
export function portAdminCommand(deviceId: string, adminUp: boolean): Command {
  return { type: "interface/set-admin", deviceId, port: PC_PORT, adminUp };
}

/**
 * 포트 켜고 끄기 (T0.14). 스위치 모양 버튼이고, 색만으로 구별하지 않도록 "켜짐"·"꺼짐" 글자를 함께 쓴다.
 * Windows에는 끄는 명령어가 없어 여기서만 끈다 (결정 3)
 */
export function PortSwitch({
  os,
  adminUp,
  onChange,
}: {
  readonly os: OsKind;
  readonly adminUp: boolean;
  readonly onChange: (adminUp: boolean) => void;
}) {
  const port = PORT_LABELS[os];
  return (
    <div className={adminUp ? "port-row" : "port-row off"}>
      <span className="key">포트</span>
      <span className="port-name">{port}</span>
      <button
        type="button"
        className="port-switch"
        role="switch"
        aria-checked={adminUp}
        aria-label={`포트 ${port}`}
        onClick={() => onChange(!adminUp)}
      >
        <span className="state">{adminUp ? "켜짐" : "꺼짐"}</span>
        <span className="track" aria-hidden="true">
          <span className="knob" />
        </span>
      </button>
    </div>
  );
}

/** 가장 긴 입력 `255.255.255.255/32` (IP 칸에 길이까지 쓸 수 있다, T0.7) */
const MAX_LENGTH = 18;

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
        // 마스크 칸 옆에 `/24` (T0.7). 비었거나 틀렸으면 없음
        const prefix = field === "mask" ? prefixLabel(draft) : null;
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
            {prefix !== null && <span className="prefix">{prefix}</span>}
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

  const os = osOf(device.config);
  const adminUp = device.config.adminUp ?? true;

  return (
    <>
      <OsChoice
        os={os}
        onChange={(next) => {
          if (next !== os) onDispatch({ type: "pc/set-os", deviceId: device.id, os: next });
        }}
      />
      <PortSwitch os={os} adminUp={adminUp} onChange={(next) => onDispatch(portAdminCommand(device.id, next))} />
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
    </>
  );
}
