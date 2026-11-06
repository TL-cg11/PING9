// 화면만의 상태: 선택한 장비와 열린 터미널 창 (AD-4). Document와 Runtime은 engine에 있다.
// 순수 reducer라 DOM 없이 테스트한다.

export interface TerminalPlacement {
  readonly deviceId: string;
  /** 캔버스의 왼쪽 위에서부터의 위치 (px) */
  readonly x: number;
  readonly y: number;
  /** 닫은 창. 다시 열면 내용과 위치가 그대로다 */
  readonly hidden: boolean;
}

export interface UiState {
  readonly selectedDeviceId: string | null;
  /** 배열의 뒤쪽이 위에 그려진다 */
  readonly terminals: readonly TerminalPlacement[];
}

export const INITIAL_UI_STATE: UiState = { selectedDeviceId: null, terminals: [] };

export type UiAction =
  | { readonly type: "select"; readonly deviceId: string | null }
  | { readonly type: "open-terminal"; readonly deviceId: string }
  | { readonly type: "close-terminal"; readonly deviceId: string }
  | { readonly type: "focus-terminal"; readonly deviceId: string }
  | { readonly type: "move-terminal"; readonly deviceId: string; readonly x: number; readonly y: number }
  /** 문서에 없는 장비의 선택과 터미널을 지운다 */
  | { readonly type: "sync"; readonly deviceIds: readonly string[] };

/** 새 창의 자리. 열 때마다 조금씩 비켜 놓는다 */
const FIRST_X = 120;
const FIRST_Y = 40;
const STEP = 30;

/** 터미널 하나를 바꿔 맨 위(배열의 끝)로 옮긴다 */
function raise(
  terminals: readonly TerminalPlacement[],
  deviceId: string,
  change: (terminal: TerminalPlacement) => TerminalPlacement,
): readonly TerminalPlacement[] {
  const target = terminals.find((terminal) => terminal.deviceId === deviceId)!;
  return [...terminals.filter((terminal) => terminal !== target), change(target)];
}

export function uiReducer(state: UiState, action: UiAction): UiState {
  if (action.type === "select") {
    return state.selectedDeviceId === action.deviceId ? state : { ...state, selectedDeviceId: action.deviceId };
  }

  if (action.type === "sync") {
    const alive = new Set(action.deviceIds);
    const terminals = state.terminals.filter((terminal) => alive.has(terminal.deviceId));
    const selected =
      state.selectedDeviceId !== null && alive.has(state.selectedDeviceId) ? state.selectedDeviceId : null;
    if (terminals.length === state.terminals.length && selected === state.selectedDeviceId) return state;
    return { selectedDeviceId: selected, terminals };
  }

  const index = state.terminals.findIndex((terminal) => terminal.deviceId === action.deviceId);
  const existing = state.terminals[index];
  const isTop = index === state.terminals.length - 1;

  switch (action.type) {
    case "open-terminal": {
      if (existing === undefined) {
        const count = state.terminals.length;
        const created = {
          deviceId: action.deviceId,
          x: FIRST_X + STEP * count,
          y: FIRST_Y + STEP * count,
          hidden: false,
        };
        return { ...state, terminals: [...state.terminals, created] };
      }
      if (isTop && !existing.hidden) return state;
      return {
        ...state,
        terminals: raise(state.terminals, action.deviceId, (terminal) => ({ ...terminal, hidden: false })),
      };
    }
    case "close-terminal": {
      if (existing === undefined || existing.hidden) return state;
      return {
        ...state,
        terminals: state.terminals.map((terminal) => (terminal === existing ? { ...terminal, hidden: true } : terminal)),
      };
    }
    case "focus-terminal": {
      if (existing === undefined || isTop) return state;
      return { ...state, terminals: raise(state.terminals, action.deviceId, (terminal) => terminal) };
    }
    case "move-terminal": {
      if (existing === undefined) return state;
      return {
        ...state,
        terminals: state.terminals.map((terminal) =>
          terminal === existing ? { ...terminal, x: action.x, y: action.y } : terminal,
        ),
      };
    }
  }
}
