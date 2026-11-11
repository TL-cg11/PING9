// 터미널 창. 시안의 .term 마크업과 동작(끌어 옮기기, 크기 바꾸기, 닫기)을 옮긴 것이다.
// 장비 종류를 모른다. 받은 상태를 그리고 입력을 위로 올릴 뿐이라 PC, Switch, Router가 함께 쓴다.
// 글은 React의 글자 노드로만 넣는다. HTML로 해석되는 길이 없다 (SEC-11).

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";

import { fitWindow, RESIZE_HANDLES, resizeWindow } from "../window-bounds";
import type { ResizeHandle, WindowRect } from "../window-bounds";

import { helpRequest, keyAction } from "../terminal/keys";
import type { TerminalLine, TerminalState } from "../terminal/terminal-state";
import type { TerminalPlacement } from "../ui-state";

const LINE_CLASS: Readonly<Record<Exclude<TerminalLine["kind"], "input">, string>> = {
  // 열을 맞춘 출력이라 공백을 그대로 둔다
  text: "pre",
  error: "err",
  notice: "dim",
  // 공백으로 위치를 맞춘 줄이라 공백을 그대로 둔다
  marker: "pre err",
};

function Line({ line }: { readonly line: TerminalLine }) {
  if (line.kind === "input") {
    return (
      <div>
        {/* 입력한 글의 공백을 그대로 둔다. 아래의 ^ 줄과 위치가 맞아야 한다 */}
        <span className="p">{line.prompt}</span> <span className="pre">{line.text}</span>
      </div>
    );
  }
  return <div className={LINE_CLASS[line.kind]}>{line.text}</div>;
}

export function TerminalWindow({
  deviceName,
  kindLabel,
  state,
  busy = false,
  placement,
  zIndex,
  onSubmit,
  onHistory,
  onComplete,
  onHelp,
  onLeave,
  onInterrupt,
  onClose,
  onFocus,
  onMove,
}: {
  readonly deviceName: string;
  readonly kindLabel: "PC" | "Switch" | "Router";
  readonly state: TerminalState;
  /**
   * 출력이 이어지는 중 (ping 회차를 하나씩 보이는 중). 입력 줄을 숨긴다.
   * 입력란은 포커스를 그대로 가져 Ctrl+C를 받는다. 친 글자는 끝난 뒤 보인다
   */
  readonly busy?: boolean;
  readonly placement: TerminalPlacement;
  readonly zIndex: number;
  readonly onSubmit: (input: string) => void;
  /** 위·아래 화살표. 입력란에 넣을 글을 돌려준다 */
  readonly onHistory: (direction: "up" | "down") => string;
  /** Tab. 입력란에 넣을 글을 돌려준다 (완성할 것이 없으면 받은 글 그대로) */
  readonly onComplete: (input: string) => string;
  /** `?`. 도움말을 화면 기록에 더한다 */
  readonly onHelp: (input: string) => void;
  /** Esc. 입력란을 떠나 캔버스의 그 장비로 포커스를 옮긴다. 창은 닫지 않는다 */
  readonly onLeave: () => void;
  /** Ctrl+C. 멈출 출력이 있었으면 true. false면 키를 그대로 둔다 (선택한 글 복사) */
  readonly onInterrupt?: () => boolean;
  readonly onClose: () => void;
  readonly onFocus: () => void;
  readonly onMove: (x: number, y: number) => void;
}) {
  const [input, setInput] = useState("");
  const windowRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [area, setArea] = useState<{ width: number; height: number } | null>(null);
  const [size, setSize] = useState({ width: 400, height: 230 });
  const geometry = area === null ? { ...size, x: placement.x, y: placement.y }
    : fitWindow({ ...size, x: placement.x, y: placement.y }, area);
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  const gesture = useRef<{
    pointerId: number; mode: "move" | ResizeHandle; startX: number; startY: number; rect: WindowRect;
  } | null>(null);

  useLayoutEffect(() => {
    const parent = windowRef.current?.parentElement;
    if (!parent || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const { width, height } = parent.getBoundingClientRect();
      setArea({ width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  // 브라우저 크기 변경이나 재열기 때 오래된 창 위치도 영역 안으로 복구한다.
  useEffect(() => {
    if (area !== null && (geometry.x !== placement.x || geometry.y !== placement.y)) {
      moveRef.current(geometry.x, geometry.y);
    }
  }, [area, geometry.x, geometry.y, placement.x, placement.y]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const current = gesture.current;
      const parent = windowRef.current?.parentElement;
      if (!current || current.pointerId !== event.pointerId || !parent) return;
      const bounds = parent.getBoundingClientRect();
      const dx = event.clientX - current.startX;
      const dy = event.clientY - current.startY;
      if (current.mode === "move") {
        const next = fitWindow({ ...current.rect, x: current.rect.x + dx, y: current.rect.y + dy }, bounds);
        moveRef.current(next.x, next.y);
      } else {
        const next = resizeWindow(current.rect, current.mode, dx, dy, bounds);
        setSize({ width: next.width, height: next.height });
        moveRef.current(next.x, next.y);
      }
    };
    const stop = () => { gesture.current = null; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("blur", stop);
    };
  }, []);

  const startGesture = (event: ReactPointerEvent<HTMLElement>, mode: "move" | ResizeHandle) => {
    if (event.button !== 0 || (mode === "move" && (event.target as HTMLElement).closest("button"))) return;
    event.preventDefault();
    onFocus();
    gesture.current = { pointerId: event.pointerId, mode, startX: event.clientX, startY: event.clientY, rect: geometry };
  };

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
    const action = keyAction(event.key, {
      shift: event.shiftKey,
      composing: event.nativeEvent.isComposing,
      ctrl: event.ctrlKey,
      code: event.code,
    });
    if (action === null) return;
    if (action === "interrupt") {
      if (onInterrupt?.() === true) event.preventDefault();
      return;
    }
    // 출력 중에는 Ctrl+C만 받는다. Enter로 다음 명령어가 보이지 않게 쌓이지 않게 한다
    if (busy) {
      event.preventDefault();
      return;
    }
    // Tab이 포커스를 옮기거나 `?`가 입력란에 들어가지 않게 한다
    event.preventDefault();

    switch (action) {
      case "submit":
        onSubmit(input);
        setInput("");
        break;
      case "history-up":
      case "history-down":
        setInput(onHistory(action === "history-up" ? "up" : "down"));
        break;
      case "complete":
        setInput(onComplete(input));
        break;
      case "help":
        // 입력 중인 줄은 그대로 둔다
        onHelp(input);
        break;
      case "leave":
        // 입력 중인 줄은 그대로 둔다. 다시 돌아오면 이어서 쓸 수 있다
        onLeave();
        break;
    }
  };


  return (
    <div
      ref={windowRef}
      className={placement.hidden ? "term hidden" : "term"}
      data-device-id={placement.deviceId}
      role="region"
      aria-label={`${deviceName} 콘솔`}
      style={{ left: geometry.x, top: geometry.y, width: geometry.width, height: geometry.height, zIndex }}
      onMouseDown={onFocus}
    >
      <div className="term-bar" onPointerDown={event => startGesture(event, "move")}>
        <span className="t-name">{deviceName}</span>
        <span className="t-chip">{kindLabel}</span>
        {/* Safari는 기본 설정에서 Tab이 버튼을 건너뛴다. tabIndex를 적어 Shift+Tab으로 닿게 한다 (NFR-12) */}
        <button
          type="button"
          className="t-x"
          tabIndex={0}
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
        {/* 새 줄이 생기면 화면 낭독기가 읽어 준다 */}
        <div role="log" aria-live="polite" aria-label={`${deviceName} 출력`}>
          {state.lines.map((line, index) => (
            <Line key={index} line={line} />
          ))}
        </div>
        <div className={busy ? "term-in busy" : "term-in"}>
          <span className="p">{state.prompt}</span>
          <input
            ref={inputRef}
            spellCheck={false}
            autoComplete="off"
            aria-label={`${deviceName} 명령어 입력`}
            value={input}
            onChange={(event) => {
              // 키 입력 없이 들어온 `?`(붙여 넣기, 화면 자판)도 도움말로 처리한다
              const line = helpRequest(event.target.value);
              if (line === null) {
                setInput(event.target.value);
              } else {
                setInput(line);
                onHelp(line);
              }
            }}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>
      {(Object.keys(RESIZE_HANDLES) as ResizeHandle[]).map(handle => (
        <button key={handle} type="button" className={`term-resize resize-${handle}`}
          aria-label={`${deviceName} 콘솔 ${RESIZE_HANDLES[handle]} 크기 조절`}
          title={`${RESIZE_HANDLES[handle]} 변 드래그 또는 방향키로 크기 조절`}
          onPointerDown={event => startGesture(event, handle)}
          onKeyDown={event => {
            const delta = { ArrowRight: [10, 0], ArrowLeft: [-10, 0], ArrowDown: [0, 10], ArrowUp: [0, -10] }[event.key];
            if (!delta || !area) return;
            event.preventDefault();
            const next = resizeWindow(geometry, handle, delta[0]!, delta[1]!, area);
            setSize({ width: next.width, height: next.height });
            onMove(next.x, next.y);
          }} />
      ))}
    </div>
  );
}
