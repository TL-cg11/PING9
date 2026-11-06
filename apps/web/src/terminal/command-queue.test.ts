import { describe, expect, test } from "vitest";

import { createCommandQueue } from "./command-queue";

/** 밖에서 끝낼 수 있는 Promise */
function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createCommandQueue", () => {
  test("같은 키의 작업은 앞의 것이 끝난 뒤에 시작한다", async () => {
    const queue = createCommandQueue(() => {});
    const first = deferred();
    const log: string[] = [];

    const a = queue.enqueue("sw1", async () => {
      log.push("a 시작");
      await first.promise;
      log.push("a 끝");
    });
    const b = queue.enqueue("sw1", async () => {
      log.push("b 시작");
    });

    await Promise.resolve();
    expect(log).toEqual(["a 시작"]);

    first.resolve();
    await Promise.all([a, b]);
    expect(log).toEqual(["a 시작", "a 끝", "b 시작"]);
  });

  test("다른 키의 작업은 서로 기다리지 않는다", async () => {
    const queue = createCommandQueue(() => {});
    const slow = deferred();
    const log: string[] = [];

    const a = queue.enqueue("sw1", async () => {
      await slow.promise;
      log.push("sw1");
    });
    await queue.enqueue("sw2", async () => {
      log.push("sw2");
    });

    expect(log).toEqual(["sw2"]);
    slow.resolve();
    await a;
    expect(log).toEqual(["sw2", "sw1"]);
  });

  test("실패한 작업이 있어도 그 뒤의 작업은 실행되고, 실패는 알려 준다", async () => {
    const errors: [string, unknown][] = [];
    const queue = createCommandQueue((key, error) => errors.push([key, error]));
    const log: string[] = [];
    const boom = new Error("boom");

    await Promise.all([
      queue.enqueue("sw1", async () => {
        throw boom;
      }),
      queue.enqueue("sw1", () => {
        // async가 아닌 함수가 바로 던지는 경우
        throw new TypeError("sync");
      }),
      queue.enqueue("sw1", async () => {
        log.push("다음 작업");
      }),
    ]);

    expect(log).toEqual(["다음 작업"]);
    expect(errors.map(([key]) => key)).toEqual(["sw1", "sw1"]);
    expect(errors[0]![1]).toBe(boom);
  });

  test("enqueue가 돌려주는 Promise는 실패해도 거부되지 않는다", async () => {
    const queue = createCommandQueue(() => {});

    await expect(
      queue.enqueue("sw1", async () => {
        throw new Error("boom");
      }),
    ).resolves.toBeUndefined();
  });
});
