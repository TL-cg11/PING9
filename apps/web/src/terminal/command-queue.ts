// 터미널마다 명령을 한 번에 하나씩, 입력한 순서대로 실행하기 위한 대기열.
// 콘솔의 실행(exec)이 비동기라 Enter를 연달아 누르면 줄의 순서가 섞일 수 있다.
// 실패한 작업이 있어도 그 뒤의 작업이 막히지 않는다.

export interface CommandQueue {
  /**
   * `key`(장비 ID)의 앞 작업이 끝난 뒤에 `task`를 실행한다. 다른 `key`의 작업은 기다리지 않는다.
   * 돌려주는 Promise는 `task`가 실패해도 거부되지 않는다. 실패는 `onError`로 알린다.
   */
  enqueue(key: string, task: () => Promise<void>): Promise<void>;
}

export function createCommandQueue(onError: (key: string, error: unknown) => void): CommandQueue {
  const tails = new Map<string, Promise<void>>();

  return {
    enqueue(key, task) {
      const previous = tails.get(key) ?? Promise.resolve();
      // then 안에서 부르므로 task가 바로 던져도 거부로 바뀌고, 아래 catch가 받는다
      const next = previous.then(task).catch((error: unknown) => {
        onError(key, error);
      });
      tails.set(key, next);
      return next;
    },
  };
}
