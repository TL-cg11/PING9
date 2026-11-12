// 상단 막대의 토폴로지 이름. 눌러서 그 자리에서 고친다 (T0.16 시안).
// Enter·칸 밖 누름은 저장, Esc는 원래 이름. 비었으면 칸을 연 채 안내를 띄우고, 그때 칸 밖을 누르면 원래 이름으로 돌아간다.
// 고친 이름은 내보내기 파일 이름이 된다 (T7.1.1).

import { useEffect, useRef, useState } from "react";

import { LIMITS, checkTopologyName } from "@ping9/shared";

export const NAME_HINT = `이름을 1~${LIMITS.maxTopologyNameLength}자로 적어 주세요`;

/** 입력한 이름을 저장할 이름으로. 앞뒤 공백을 뗀다. 쓸 수 없으면 null */
export function normalizeTopologyName(draft: string): string | null {
  const name = draft.trim();
  return checkTopologyName(name) === null ? name : null;
}

export function TopologyName({ name, onRename }: {
  readonly name: string;
  readonly onRename: (name: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // 칸이 열리면 글자를 모두 고른 채 시작한다. 열릴 때 한 번만
  const editing = draft !== null;
  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const close = () => {
    setDraft(null);
    setInvalid(false);
  };

  /** 저장한다. 쓸 수 없는 이름이면 Enter일 때는 칸을 열어 두고, 칸 밖을 누른 때는 원래 이름으로 */
  const commit = (keepOpenOnError: boolean) => {
    if (draft === null) return;
    const next = normalizeTopologyName(draft);
    if (next === null) {
      if (keepOpenOnError) setInvalid(true);
      else close();
      return;
    }
    if (next !== name) onRename(next);
    close();
  };

  if (draft === null) {
    return (
      <button type="button" className="name" title="이름 고치기" aria-label={`토폴로지 이름 ${name}, 눌러서 고치기`}
        onClick={() => setDraft(name)}>
        {name} <span className="pen" aria-hidden="true">✎</span>
      </button>
    );
  }

  return (
    <span className="name-edit">
      <input ref={input} className={invalid ? "bad" : undefined} value={draft} maxLength={LIMITS.maxTopologyNameLength}
        aria-label="토폴로지 이름" aria-invalid={invalid} spellCheck={false}
        onChange={(event) => {
          setDraft(event.currentTarget.value);
          setInvalid(false);
        }}
        onKeyDown={(event) => {
          // 한글 조합 중의 Enter는 글자를 끝내는 것이다
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter") commit(true);
          else if (event.key === "Escape") close();
        }}
        onBlur={() => commit(false)} />
      {invalid && <span className="name-tip" role="alert">{NAME_HINT}</span>}
    </span>
  );
}
