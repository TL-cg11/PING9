// T6.3.1 버그 수정: 패킷 카드가 시계를 멈추고 다시 돌리는 규칙. 가짜 시각으로 실제 시뮬레이션 시계를 쓴다
import { describe, expect, test } from "vitest";

import { cardStillShown, createCardPause } from "./card-pause";
import { createSimClock } from "./sim-clock";
import type { TimeSource } from "./sim-clock";

const SOURCE: TimeSource = { now: () => 1000, setTimeout: () => 0, clearTimeout: () => {} };

function setup() {
  const clock = createSimClock(SOURCE);
  return { clock, card: createCardPause(clock) };
}

describe("카드가 멈춘 시계만 카드가 다시 돌린다", () => {
  test("돌던 시계는 카드를 열면 멈추고 닫으면 다시 돈다", () => {
    const { clock, card } = setup();
    card.open();
    expect(clock.state().paused).toBe(true);
    card.close();
    expect(clock.state().paused).toBe(false);
  });

  test("사용자가 멈춘 시계는 카드를 열었다 닫아도 멈춘 채다", () => {
    const { clock, card } = setup();
    clock.pause();
    card.open();
    card.close();
    expect(clock.state().paused).toBe(true);
  });

  test("카드를 연 채 다른 펭귄을 눌러도, 닫으면 다시 돈다", () => {
    const { clock, card } = setup();
    card.open();
    card.open();
    card.close();
    expect(clock.state().paused).toBe(false);
  });

  test("카드 없이 닫기만 불려도 사용자의 멈춤을 풀지 않는다", () => {
    const { clock, card } = setup();
    card.open();
    card.close();
    clock.pause();
    card.close();
    expect(clock.state().paused).toBe(true);
  });

  test("카드가 멈춘 것을 사용자가 '다시 실행'으로 풀면, 그 뒤 사용자의 멈춤은 카드가 풀지 않는다", () => {
    const { clock, card } = setup();
    card.open();
    // 상단의 '다시 실행'. 앱은 시계가 돌면 카드를 닫는다
    clock.resume();
    card.close();
    clock.pause();
    card.open();
    card.close();
    expect(clock.state().paused).toBe(true);
  });
});

describe("카드를 계속 띄울 수 있는가", () => {
  const pick = { key: "replay-3-7" };

  test("그 펭귄의 재생이 남아 있고 이벤트를 찾을 수 있으면 띄운다", () => {
    expect(cardStillShown(pick, ["replay-2", "replay-3"], true)).toBe(true);
  });

  test("재생이 지워졌으면 내린다 (빈 곳 누르기, Ctrl+C, 장비 삭제, 가져오기, 다음 재생)", () => {
    expect(cardStillShown(pick, [], true)).toBe(false);
    expect(cardStillShown(pick, ["replay-4"], true)).toBe(false);
  });

  test("재생 번호의 앞부분만 같은 다른 재생은 그 펭귄의 재생이 아니다", () => {
    expect(cardStillShown({ key: "replay-12-7" }, ["replay-1"], true)).toBe(false);
  });

  test("추적이 바뀌어 이벤트를 찾을 수 없으면 내린다 (경로 교환 추적은 구성을 고치면 바뀐다)", () => {
    expect(cardStillShown(pick, ["replay-3"], false)).toBe(false);
  });
});
