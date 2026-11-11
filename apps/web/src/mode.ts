// 실시간 / 시뮬레이션 모드 (T0.13). 화면만의 상태라 Document와 engine에는 넣지 않는다.
// 펭귄 재생은 시뮬레이션에서만 한다. 실시간의 콘솔은 실제 OS처럼 줄을 바로 띄운다.
// 고른 모드는 브라우저에 기억해 새로고침해도 그대로다 (설계 결정 8).

export type Mode = "realtime" | "simulation";

/** 처음 열었고 기억한 값이 없을 때 */
export const DEFAULT_MODE: Mode = "realtime";

export const MODE_STORAGE_KEY = "ping9.mode";

type ModeStorage = Pick<Storage, "getItem" | "setItem">;

/** 브라우저 저장소. 없거나(서버 렌더링, 테스트) 막혀 있으면 undefined */
export function browserStorage(): ModeStorage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** 기억한 모드. 값이 없거나 모르는 값이거나 읽지 못하면 처음 모드 */
export function readMode(storage: ModeStorage | undefined): Mode {
  try {
    const saved = storage?.getItem(MODE_STORAGE_KEY);
    return saved === "realtime" || saved === "simulation" ? saved : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

/** 고른 모드를 기억한다. 저장하지 못해도(사생활 보호 모드, 용량) 모드 전환은 그대로 된다 */
export function writeMode(storage: ModeStorage | undefined, mode: Mode): void {
  try {
    storage?.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // 기억하지 못할 뿐이다
  }
}
