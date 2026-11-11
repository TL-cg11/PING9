// 캔버스의 펭귄 층 (T6.1.2). 펭귄이 프레임(물고기)을 들고 케이블을 따라 걷고, 원인 폐기에서 물고기를 놓친다.
// 위치는 매 프레임 `지금 - 시작`으로 계산한다. 캔버스 SVG 안에 그리므로 확대·이동·장비 끌기를 따로 처리하지 않는다.
// 그림은 사용자의 스프라이트 시트를 포즈마다 잘라 줄인 PNG다 (설계안 2절 ②).

import type { Position } from "@ping9/shared";
import { useEffect, useState } from "react";

import dropBlue from "../assets/penguin/drop-blue.png";
import dropGreen from "../assets/penguin/drop-green.png";
import dropPurple from "../assets/penguin/drop-purple.png";
import dropRed from "../assets/penguin/drop-red.png";
import dropYellow from "../assets/penguin/drop-yellow.png";
import standBlue from "../assets/penguin/stand-blue.png";
import standGreen from "../assets/penguin/stand-green.png";
import standPurple from "../assets/penguin/stand-purple.png";
import standRed from "../assets/penguin/stand-red.png";
import standYellow from "../assets/penguin/stand-yellow.png";
import walkABlue from "../assets/penguin/walk-a-blue.png";
import walkAGreen from "../assets/penguin/walk-a-green.png";
import walkAPurple from "../assets/penguin/walk-a-purple.png";
import walkARed from "../assets/penguin/walk-a-red.png";
import walkAYellow from "../assets/penguin/walk-a-yellow.png";
import walkBBlue from "../assets/penguin/walk-b-blue.png";
import walkBGreen from "../assets/penguin/walk-b-green.png";
import walkBPurple from "../assets/penguin/walk-b-purple.png";
import walkBRed from "../assets/penguin/walk-b-red.png";
import walkBYellow from "../assets/penguin/walk-b-yellow.png";
import type { FrameKind } from "../replay/steps";
import { spritesAt } from "../replay/timeline";
import type { Sprite, Timeline } from "../replay/timeline";
import type { CableGeometry } from "./cable";

/** 펭귄 그림의 크기 (장비 아이콘 50보다 조금 작게) */
const SIZE = 36;
/** 놓침 그림은 물고기가 옆으로 날아가 가로가 더 길다 (152×128) */
const DROP_WIDTH = (SIZE * 152) / 128;
/** 발이 케이블 위에 오도록 그림을 내리는 양 */
const FOOT = 5;
/** 케이블로 들어온 프레임이 버려질 때 펭귄이 서는 자리 (도착 장비 쪽 끝에서) */
const FALL_AT = 0.8;

type Color = "blue" | "green" | "yellow" | "red" | "purple";
const PICTURES: Readonly<Record<Color, { a: string; b: string; stand: string; drop: string }>> = {
  blue: { a: walkABlue, b: walkBBlue, stand: standBlue, drop: dropBlue },
  green: { a: walkAGreen, b: walkBGreen, stand: standGreen, drop: dropGreen },
  yellow: { a: walkAYellow, b: walkBYellow, stand: standYellow, drop: dropYellow },
  red: { a: walkARed, b: walkBRed, stand: standRed, drop: dropRed },
  purple: { a: walkAPurple, b: walkBPurple, stand: standPurple, drop: dropPurple },
};

/** 물고기 색. ICMP 요청은 파랑, 응답은 노랑, ARP는 초록, ICMP 오류는 빨강, RIP는 보라 (T11.5.1) */
const COLOR: Readonly<Record<FrameKind, Color>> = {
  "icmp-request": "blue",
  "icmp-reply": "yellow",
  "arp-request": "green",
  "arp-reply": "green",
  "icmp-error": "red",
  "rip-request": "purple",
  "rip-response": "purple",
};
const colorOf = (kind: FrameKind): Color => COLOR[kind];

/**
 * 색만으로 구별하지 않게 ARP에는 머리 위에 요청 `?`, 응답 `!`를 붙인다 (NFR-12).
 * RIP는 요청 `R?`, 응답 `R!`. ICMP 오류는 글자 없이 빨강만 (T11.5.1 결정 5·6)
 */
const MARK: Readonly<Partial<Record<FrameKind, string>>> = {
  "arp-request": "?",
  "arp-reply": "!",
  "rip-request": "R?",
  "rip-response": "R!",
};
const markOf = (kind: FrameKind): string | undefined => MARK[kind];

const KIND_NAME: Readonly<Record<FrameKind, string>> = {
  "arp-request": "ARP 요청",
  "arp-reply": "ARP 응답",
  "icmp-request": "ping 요청",
  "icmp-reply": "ping 응답",
  "icmp-error": "ICMP 오류 알림",
  "rip-request": "RIP 요청",
  "rip-response": "RIP 응답",
};

export interface Replay {
  readonly key: string;
  readonly timeline: Timeline;
  /** `performance.now()` 기준 */
  readonly startedAt: number;
}

export interface LinkPath {
  readonly geometry: CableGeometry;
  /** `geometry.at(0)` 쪽 장비 */
  readonly startDeviceId: string;
}

interface Placed {
  readonly key: string;
  readonly href: string;
  readonly at: Position;
  readonly width: number;
  readonly mark: string | undefined;
  readonly opacity: number;
  readonly label: string;
}

function place(
  sprite: Sprite,
  key: string,
  pathOf: (linkId: string) => LinkPath | undefined,
  positionOf: (deviceId: string) => Position | undefined,
): Placed | undefined {
  if (sprite.type === "walk") {
    const path = pathOf(sprite.hop.linkId);
    if (path === undefined) return undefined;
    const forward = sprite.hop.fromDeviceId === path.startDeviceId;
    const color = colorOf(sprite.hop.kind);
    return {
      key, href: PICTURES[color][sprite.stride], width: SIZE, opacity: 1,
      at: path.geometry.at(forward ? sprite.progress : 1 - sprite.progress),
      mark: markOf(sprite.hop.kind), label: KIND_NAME[sprite.hop.kind],
    };
  }
  const { fall } = sprite;
  const path = fall.linkId === undefined ? undefined : pathOf(fall.linkId);
  let at: Position | undefined;
  if (path !== undefined) {
    // 도착 장비 쪽 끝 가까이
    at = path.geometry.at(fall.deviceId === path.startDeviceId ? 1 - FALL_AT : FALL_AT);
  } else {
    // 출발 장비의 타이머처럼 링크가 없는 폐기: 장비 아이콘 오른쪽 옆
    const device = positionOf(fall.deviceId);
    at = device === undefined ? undefined : { x: device.x + 44, y: device.y + 14 };
  }
  if (at === undefined) return undefined;
  const pictures = PICTURES[colorOf(fall.kind)];
  return sprite.type === "drop"
    ? { key, href: pictures.drop, at, width: DROP_WIDTH, mark: undefined, opacity: sprite.opacity, label: `${KIND_NAME[fall.kind]}을 잃어버림` }
    : { key, href: pictures.stand, at, width: SIZE, mark: markOf(fall.kind), opacity: sprite.opacity, label: KIND_NAME[fall.kind] };
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function PacketLayer({
  replays,
  pathOf,
  positionOf,
  now: fixedNow,
}: {
  readonly replays: readonly Replay[];
  readonly pathOf: (linkId: string) => LinkPath | undefined;
  readonly positionOf: (deviceId: string) => Position | undefined;
  /** 테스트용 고정 시각. 주면 스스로 시계를 돌리지 않는다 */
  readonly now?: number;
}) {
  const [clock, setClock] = useState(() => (typeof performance === "undefined" ? 0 : performance.now()));
  const now = fixedNow ?? clock;

  // 걷는 펭귄이 있는 동안만 매 프레임 다시 그린다. 넘어진 펭귄만 남으면 멈춘다
  useEffect(() => {
    if (fixedNow !== undefined || replays.length === 0) return;
    let frame = 0;
    const tick = () => {
      const time = performance.now();
      setClock(time);
      if (replays.some((replay) => time - replay.startedAt < replay.timeline.durationMs + 100)) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [replays, fixedNow]);

  const reduced = reducedMotion();
  const placed = replays.flatMap((replay) =>
    spritesAt(replay.timeline, now - replay.startedAt, reduced).flatMap((sprite) => {
      const seq = sprite.type === "walk" ? sprite.hop.seq : sprite.fall.seq;
      const item = place(sprite, `${replay.key}-${seq}`, pathOf, positionOf);
      return item === undefined ? [] : [item];
    }),
  );
  if (placed.length === 0) return null;

  return (
    <g className="packet-layer">
      {placed.map((item) => (
        <g key={item.key} className="penguin" opacity={item.opacity} role="img" aria-label={item.label}>
          <image href={item.href} x={item.at.x - SIZE / 2} y={item.at.y - SIZE + FOOT} width={item.width} height={SIZE} />
          {item.mark !== undefined && (
            <text className="penguin-mark" x={item.at.x + 9 - (item.mark.length - 1) * 6} y={item.at.y - SIZE + FOOT + 2}>{item.mark}</text>
          )}
        </g>
      ))}
    </g>
  );
}
