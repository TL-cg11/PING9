// 터미널 창. 시안의 .term 마크업과 동작(끌어 옮기기, 크기 바꾸기, 닫기)을 옮긴 것이다.
// 장비 종류를 모른다. 받은 상태를 그리고 입력을 위로 올릴 뿐이라 PC, Switch, Router가 함께 쓴다.
// 글은 React의 글자 노드로만 넣는다. HTML로 해석되는 길이 없다 (SEC-11).

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent as ReactMouseEvent } from "react";

import type { TerminalLine, TerminalState } from "../terminal/terminal-state";
import type { TerminalPlacement } from "../ui-state";

const LINE_CLASS: Readonly<Record<Exclude<TerminalLine["kind"], "input">, string>> = {
  // 열을 맞춘 출력이라 공백을 그대로 둔다
  text: "pre",
  error: "err",
  notice: "dim",
};

function Line({ line }: { readonly line: TerminalLine }) {
  if (line.kind === "input") {
    return (
      <div>
        <span className="p">{line.prompt}</span> {line.text}
      </div>
    );
  }
  return <div className={LINE_CLASS[line.kind]}>{line.text}</div>;
}

export function TerminalWindow({
  deviceName,
  kindLabel,
  state,
  placement,
  zIndex,
  onSubmit,
  onHistory,
  onClose,
  onFocus,
  onMove,
}: {
  readonly deviceName: string;
  readonly kindLabel: "PC" | "Switch" | "Router";
  readonly state: TerminalState;
  readonly placement: TerminalPlacement;
  readonly zIndex: number;
  readonly onSubmit: (input: string) => void;
  /** 위·아래 화살표. 입력란에 넣을 글을 돌려준다 */
  readonly onHistory: (direction: "up" | "down") => string;
  readonly onClose: () => void;
  readonly onFocus: () => void;
  readonly onMove: (x: number, y: number) => void;
}) {
  const [input, setInput] = useState("");
  const windowRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 줄이 더해지면 맨 아래를 보여 준다
  useEffect(() => {
    const body = bodyRef.current;
    if (body !== null) body.scrollTop = body.scrollHeight;
  }, [state.lines]);

  // 창이 열리면 바로 입력할 수 있게 한다
  useEffect(() => {
    if (!placement.hidden) inputRef.current?.focus();
  }, [placement.hidden]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      onSubmit(input);
      setInput("");
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      setInput(onHistory(event.key === "ArrowUp" ? "up" : "down"));
    }
  };

  // 제목 막대를 끌면 캔버스 안에서 움직인다 (시안의 wireTerm과 같은 범위)
  const startDrag = (event: ReactMouseEvent<HTMLDivElement>) => {
    const element = windowRef.current;
    const canvas = element?.parentElement;
    if (element === null || canvas === null || canvas === undefined) return;
    if ((event.target as HTMLElement).closest(".t-x") !== null) return;

    const windowBox = element.getBoundingClientRect();
    const canvasBox = canvas.getBoundingClientRect();
    const offsetX = event.clientX - windowBox.left;
    const offsetY = event.clientY - windowBox.top;

    const move = (moveEvent: MouseEvent) => {
      const x = Math.max(0, Math.min(canvasBox.width - 80, moveEvent.clientX - canvasBox.left - offsetX));
      const y = Math.max(0, Math.min(canvasBox.height - 40, moveEvent.clientY - canvasBox.top - offsetY));
      onMove(x, y);
    };
    const stop = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", stop);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", stop);
  };

  return (
    <div
      ref={windowRef}
      className={placement.hidden ? "term hidden" : "term"}
      style={{ left: placement.x, top: placement.y, zIndex }}
      onMouseDown={onFocus}
    >
      <div className="term-bar" onMouseDown={startDrag}>
        <span className="t-name">{deviceName}</span>
        <span className="t-chip">{kindLabel}</span>
        <button
          className="t-x"
          aria-label="닫기"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        >
          ×
        </button>
      </div>
      <div ref={bodyRef} className="term-body" onClick={() => inputRef.current?.focus()}>
        {state.lines.map((line, index) => (
          <Line key={index} line={line} />
        ))}
        <div className="term-in">
          <span className="p">{state.prompt}</span>
          <input
            ref={inputRef}
            spellCheck={false}
            autoComplete="off"
            aria-label={`${deviceName} 명령어 입력`}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>
    </div>
  );
}
