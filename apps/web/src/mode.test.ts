// T0.13: 모드를 브라우저에 기억하기
import { describe, expect, test } from "vitest";

import { DEFAULT_MODE, MODE_STORAGE_KEY, readMode, writeMode } from "./mode";

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

describe("readMode", () => {
  test("처음 열면 실시간", () => {
    expect(DEFAULT_MODE).toBe("realtime");
    expect(readMode(memoryStorage())).toBe("realtime");
    expect(readMode(undefined)).toBe("realtime");
  });

  test("기억한 모드를 읽는다", () => {
    expect(readMode(memoryStorage({ [MODE_STORAGE_KEY]: "simulation" }))).toBe("simulation");
    expect(readMode(memoryStorage({ [MODE_STORAGE_KEY]: "realtime" }))).toBe("realtime");
  });

  test("모르는 값이나 읽지 못하는 저장소는 처음 모드", () => {
    expect(readMode(memoryStorage({ [MODE_STORAGE_KEY]: "replay" }))).toBe("realtime");
    expect(readMode(broken)).toBe("realtime");
  });
});

describe("writeMode", () => {
  test("고른 모드를 기억하고 다시 읽는다", () => {
    const storage = memoryStorage();
    writeMode(storage, "simulation");

    expect(storage.values.get(MODE_STORAGE_KEY)).toBe("simulation");
    expect(readMode(storage)).toBe("simulation");
  });

  test("저장하지 못해도 오류를 내지 않는다", () => {
    expect(() => writeMode(broken, "simulation")).not.toThrow();
    expect(() => writeMode(undefined, "simulation")).not.toThrow();
  });
});
