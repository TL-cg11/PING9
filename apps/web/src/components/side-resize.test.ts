// T0.18: 오른쪽 패널 폭 조절
import { describe, expect, test } from "vitest";

import { SIDE_DEFAULT, SIDE_MAX, SIDE_MIN, SIDE_STORAGE_KEY, clampSideWidth, keyedSideWidth, readSideWidth, writeSideWidth } from "./side-resize";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

const broken = {
  getItem: () => { throw new Error("blocked"); },
  setItem: () => { throw new Error("quota"); },
};

describe("clampSideWidth", () => {
  test("270 ~ 560 안으로 맞추고 정수로", () => {
    expect([SIDE_DEFAULT, SIDE_MIN, SIDE_MAX]).toEqual([270, 270, 560]);
    expect(clampSideWidth(100)).toBe(270);
    expect(clampSideWidth(900)).toBe(560);
    expect(clampSideWidth(400.6)).toBe(401);
  });
});

describe("readSideWidth", () => {
  test("기억한 값이 없거나 읽지 못하면 처음 폭", () => {
    expect(readSideWidth(memoryStorage())).toBe(270);
    expect(readSideWidth(undefined)).toBe(270);
    expect(readSideWidth(broken)).toBe(270);
  });

  test("기억한 폭을 읽고, 범위 밖이면 맞춘다", () => {
    expect(readSideWidth(memoryStorage({ [SIDE_STORAGE_KEY]: "420" }))).toBe(420);
    expect(readSideWidth(memoryStorage({ [SIDE_STORAGE_KEY]: "9999" }))).toBe(560);
    expect(readSideWidth(memoryStorage({ [SIDE_STORAGE_KEY]: "0" }))).toBe(270);
  });

  test("숫자가 아니면 처음 폭", () => {
    expect(readSideWidth(memoryStorage({ [SIDE_STORAGE_KEY]: "wide" }))).toBe(270);
    expect(readSideWidth(memoryStorage({ [SIDE_STORAGE_KEY]: "" }))).toBe(270);
  });
});

describe("writeSideWidth", () => {
  test("폭을 기억하고, 저장하지 못해도 오류를 내지 않는다", () => {
    const storage = memoryStorage();
    writeSideWidth(storage, 333);
    expect(storage.values.get(SIDE_STORAGE_KEY)).toBe("333");
    expect(() => writeSideWidth(broken, 333)).not.toThrow();
    expect(() => writeSideWidth(undefined, 333)).not.toThrow();
  });
});

describe("keyedSideWidth", () => {
  test("← 넓게, → 좁게. Shift는 40px씩", () => {
    expect(keyedSideWidth(300, "ArrowLeft", false)).toBe(310);
    expect(keyedSideWidth(300, "ArrowRight", false)).toBe(290);
    expect(keyedSideWidth(300, "ArrowLeft", true)).toBe(340);
    expect(keyedSideWidth(275, "ArrowRight", true)).toBe(270);
  });

  test("Home은 가장 넓게, End는 가장 좁게, 다른 키는 무시", () => {
    expect(keyedSideWidth(300, "Home", false)).toBe(560);
    expect(keyedSideWidth(300, "End", false)).toBe(270);
    expect(keyedSideWidth(300, "Enter", false)).toBeUndefined();
  });
});
