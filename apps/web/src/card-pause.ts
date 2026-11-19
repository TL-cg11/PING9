// 패킷 카드(T6.3.1)와 시뮬레이션 시계. 펭귄을 눌러 카드를 띄우면 시계를 멈추고, 카드를 내리면 다시 돌린다.
// 카드가 멈춘 시계만 카드가 다시 돌린다: 사용자가 "멈춤"으로 세운 시계는 카드를 닫아도 서 있다.
// 카드가 내려가는 길이 여럿이라(닫기 단추, 같은 펭귄 다시 누르기, 재생이 지워짐, 추적이 바뀜) 한곳에 모았다.

import type { SimClock } from "./sim-clock";

export interface CardPause {
  /** 카드를 띄울 때. 돌고 있던 시계만 멈춘다 */
  open(): void;
  /** 카드를 내릴 때. 어느 길로 내리든 부른다. 카드가 멈춘 시계만 다시 돌린다 */
  close(): void;
}

export function createCardPause(clock: Pick<SimClock, "state" | "pause" | "resume">): CardPause {
  let pausedByCard = false;
  return {
    open: () => {
      if (clock.state().paused) return;
      clock.pause();
      pausedByCard = true;
    },
    close: () => {
      if (!pausedByCard) return;
      pausedByCard = false;
      // 사용자가 그 사이에 "다시 실행"을 눌렀으면 이미 돌고 있다. 그때는 아무 일도 없다
      clock.resume();
    },
  };
}

/**
 * 카드를 계속 띄울 수 있는가. 그 펭귄의 재생이 캔버스에 남아 있고(`replayKeys`), 추적에서 이벤트를 찾을 수 있어야 한다.
 * 펭귄의 `key`는 `<재생 key>-<이벤트 seq>`다
 */
export function cardStillShown(pick: { readonly key: string }, replayKeys: readonly string[], hasEvent: boolean): boolean {
  return hasEvent && replayKeys.some((key) => pick.key.startsWith(`${key}-`));
}
