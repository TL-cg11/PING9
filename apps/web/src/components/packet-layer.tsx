// 캔버스의 펭귄 층 (T6.1.2). 펭귄이 프레임(물고기)을 들고 케이블을 따라 걷고, 원인 폐기에서 물고기를 놓친다.
// 위치는 매 프레임 `지금 - 시작`으로 계산한다. 캔버스 SVG 안에 그리므로 확대·이동·장비 끌기를 따로 처리하지 않는다.
// 그림은 사용자의 스프라이트 시트를 포즈마다 잘라 줄인 PNG다 (설계안 2절 ②).

import type { DeviceKind, Position } from "@ping9/shared";
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
import { FIREWALL_SHIFT, Shield } from "./device-icons";
import type { ShieldState } from "./device-icons";

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
  "gre-request": "blue", "gre-reply": "yellow", "esp": "blue",
  "icmp-request": "blue",
  "icmp-reply": "yellow",
  "arp-request": "green",
  "arp-reply": "green",
  "icmp-error": "red",
  "rip-request": "purple",
  "rip-response": "purple",
  // TCP·UDP 서비스는 ping과 같은 색을 쓴다: 요청은 파랑, 응답은 노랑 (T0.20)
  "tcp-request": "blue",
  "tcp-response": "yellow",
  "udp-request": "blue",
  "udp-response": "yellow",
};
const colorOf = (kind: FrameKind): Color => COLOR[kind];

/**
 * 색만으로 구별하지 않게 ARP에는 머리 위에 요청 `?`, 응답 `!`를 붙인다 (NFR-12).
 * RIP는 요청 `R?`, 응답 `R!`. ICMP 오류는 글자 없이 빨강만 (T11.5.1 결정 5·6)
 */
const MARK: Readonly<Partial<Record<FrameKind, string>>> = {
  "gre-request": "G", "gre-reply": "G", "esp": "E",
  "arp-request": "?",
  "arp-reply": "!",
  "rip-request": "R?",
  "rip-response": "R!",
  // ping과 색이 같아 글자로 가른다: TCP는 T, UDP는 U (T0.20)
  "tcp-request": "T",
  "tcp-response": "T",
  "udp-request": "U",
  "udp-response": "U",
};
const markOf = (kind: FrameKind): string | undefined => MARK[kind];

const KIND_NAME: Readonly<Record<FrameKind, string>> = {
  "esp": "IPsec ESP 시뮬레이션 (암호화 없음)",
  "gre-request": "GRE로 감싼 ping 요청",
  "gre-reply": "GRE로 감싼 ping 응답",
  "arp-request": "ARP 요청",
  "arp-reply": "ARP 응답",
  "icmp-request": "ping 요청",
  "icmp-reply": "ping 응답",
  "icmp-error": "ICMP 오류 알림",
  "rip-request": "RIP 요청",
  "rip-response": "RIP 응답",
  "tcp-request": "TCP 요청",
  "tcp-response": "TCP 응답",
  "udp-request": "UDP 요청",
  "udp-response": "UDP 응답",
};

export interface Replay {
  readonly key: string;
  readonly timeline: Timeline;
  /** 시뮬레이션 시계(`sim-clock.ts`) 기준 (T0.15) */
  readonly startedAt: number;
  /** 재생하는 추적. 이벤트 목록이 재생에 맞춰 자란다 (T1.9.2) */
  readonly traceId?: number;
}

export interface LinkPath {
  readonly geometry: CableGeometry;
  /** `geometry.at(0)` 쪽 장비 */
  readonly startDeviceId: string;
}

/** 누른 펭귄 (T6.3.1). 이 이벤트의 프레임을 카드로 보인다 */
export interface PenguinPick {
  readonly key: string;
  readonly traceId: number | undefined;
  readonly seq: number;
  /** 펭귄이 있는 케이블. 링크 없는 폐기면 undefined */
  readonly linkId: string | undefined;
  readonly at: Position;
}

/**
 * Firewall 장면 (T14.2.3).
 * - `reject`: 멈칫. 선 그림에 `!`
 * - `vanish`: DROP. 펭귄은 눈가루로 흩어지고 물고기는 방패로 빨려 들어간다. `progress`는 0~1, `shield`는 방패 자리
 */
type Scene = { readonly type: "vanish"; readonly progress: number; readonly shield: Position | undefined };

interface Placed {
  readonly key: string;
  /** 돌아서서 걷는다 (REJECT가 돌려보낸 ICMP 오류) */
  readonly mirror?: boolean;
  readonly scene?: Scene;
  readonly seq: number;
  readonly linkId: string | undefined;
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
      key, seq: sprite.hop.seq, linkId: sprite.hop.linkId, href: PICTURES[color][sprite.stride], width: SIZE, opacity: 1,
      at: path.geometry.at(forward ? sprite.progress : 1 - sprite.progress),
      mark: markOf(sprite.hop.kind), label: KIND_NAME[sprite.hop.kind],
      ...(sprite.hop.rejected === undefined ? {} : { mirror: true }),
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
  const base = { key, seq: fall.seq, linkId: fall.linkId };
  if (sprite.type === "drop" && fall.blocked !== undefined) {
    // Firewall이 막음: REJECT는 멈칫(!) 하고, 돌려보낸 ICMP 오류 펭귄이 돌아서서 걷는다. DROP은 흩어진다
    const label = `${KIND_NAME[fall.kind]}을 Firewall이 막음 (${fall.blocked.target})`;
    if (fall.blocked.target === "REJECT") {
      return { ...base, href: pictures.stand, at, width: SIZE, mark: "!", opacity: sprite.opacity, label };
    }
    const device = positionOf(fall.deviceId);
    return {
      ...base, href: pictures.drop, at, width: SIZE, mark: undefined, opacity: sprite.opacity, label,
      scene: { type: "vanish", progress: sprite.progress, shield: device === undefined ? undefined : shieldAt(device) },
    };
  }
  return sprite.type === "drop"
    ? { ...base, href: pictures.drop, at, width: DROP_WIDTH, mark: undefined, opacity: sprite.opacity, label: `${KIND_NAME[fall.kind]}을 잃어버림` }
    : { ...base, href: pictures.stand, at, width: SIZE, mark: markOf(fall.kind), opacity: sprite.opacity, label: KIND_NAME[fall.kind] };
}

/** 장비 아이콘(50×50, 32 격자)의 왼쪽 위. canvas.tsx의 배치와 같다 */
const iconBox = (device: Position) => ({ x: device.x - 25, y: device.y - 33 });
/** 아이콘 안 방패의 가운데 (32 격자의 23.5, 17.4) */
const shieldAt = (device: Position): Position => ({ x: device.x - 25 + (23.5 + FIREWALL_SHIFT) * 50 / 32, y: device.y - 33 + 17.4 * 50 / 32 });

/**
 * 놓침 그림(152×128)에서 펭귄과 물고기만 오려 낸다. `×` 표시와 물고기 밑의 날아간 자국은 뺀다.
 * 펭귄: 오른쪽 위의 `×`를 피한 모양. 물고기: 꼬리까지, 밑의 점선 앞에서 자름
 */
// 경계는 drop 그림(152×128)의 픽셀에 맞췄다: 펭귄은 x≤104, ×는 x 87~105·y≤23, 물고기는 x 103~145·y 20~47,
// 물고기 아래·오른쪽의 짧은 선은 어느 쪽에도 넣지 않는다
const DROP_PENGUIN = { box: [0, 0, 106, 128], clip: "0,0 86,0 86,26 96,26 96,52 106,52 106,128 0,128" } as const;
const DROP_FISH = { box: [102, 17, 45, 32], clip: "102,25 118,17 147,17 147,37 134,39.5 128,43 113,48.5 102,48.5" } as const;

/** 놓침 그림의 한 부분만 `width`×`height`로 그린다 */
function DropPart({ href, part, id, x, y, width, height, opacity }: {
  readonly href: string; readonly part: typeof DROP_PENGUIN | typeof DROP_FISH; readonly id: string;
  readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly opacity: number;
}) {
  return (
    <svg x={x} y={y} width={width} height={height} viewBox={part.box.join(" ")} opacity={opacity}>
      <clipPath id={id}><polygon points={part.clip} /></clipPath>
      <image href={href} width={152} height={128} clipPath={`url(#${id})`} />
    </svg>
  );
}
/** 흩어지는 눈가루의 방향 */
const SNOW: readonly (readonly [number, number])[] = [[-1, -0.6], [-0.4, -1], [0.3, -0.9], [0.9, -0.4], [-0.9, 0.3], [0.6, 0.5], [0, 0.8]];

function Vanish({ item, scene }: { readonly item: Placed; readonly scene: Scene }) {
  const t = scene.progress;
  const top = item.at.y - SIZE + FOOT;
  const left = item.at.x - SIZE / 2;
  const scale = SIZE / 128;
  const penguinWidth = DROP_PENGUIN.box[2] * scale;
  // 물고기는 펭귄 손 옆(그림 속 자리)에서 출발해 앞 60% 동안 방패로 날아가며 작아지고, 남은 동안 사라진다
  const startW = DROP_FISH.box[2] * scale;
  const from = { x: left + (DROP_FISH.box[0] + DROP_FISH.box[2] / 2) * scale, y: top + (DROP_FISH.box[1] + DROP_FISH.box[3] / 2) * scale };
  const to = scene.shield ?? from;
  const f = Math.min(1, t / 0.6);
  const ease = f * f;
  const fishW = startW * (1 - 0.6 * f);
  const fishH = fishW * DROP_FISH.box[3] / DROP_FISH.box[2];
  const center = { x: left + penguinWidth / 2, y: top + SIZE / 2 };
  const id = `vanish-${item.key.replace(/[^A-Za-z0-9_-]/g, "-")}`;
  return (
    <>
      <DropPart href={item.href} part={DROP_PENGUIN} id={`${id}-p`} x={left} y={top} width={penguinWidth} height={SIZE} opacity={1 - t} />
      {SNOW.map(([dx, dy], index) => (
        <circle key={index} className="snow-dust" cx={center.x + dx * (6 + t * 20)} cy={center.y + dy * (6 + t * 16) - t * 4}
          r={1.6 - t * 0.6} opacity={Math.min(1, t * 4) * (1 - t)} />
      ))}
      <DropPart href={item.href} part={DROP_FISH} id={`${id}-f`}
        x={from.x + (to.x - from.x) * ease - fishW / 2} y={from.y + (to.y - from.y) * ease - fishH / 2}
        width={fishW} height={fishH} opacity={1 - Math.max(0, (t - 0.6) / 0.4)} />
    </>
  );
}

interface ShieldView {
  readonly state: Exclude<ShieldState, "idle">;
  readonly text: string;
}

const blockedText = (blocked: { readonly rule?: number }) => (blocked.rule === undefined ? "기본 정책 차단" : `규칙 ${blocked.rule} 차단`);

/** 지금 그릴 Firewall 방패. 막힘이 허용보다 앞선다 */
function shieldsOf(sprites: readonly Sprite[], isFirewall: (deviceId: string) => boolean): Map<string, ShieldView> {
  const shields = new Map<string, ShieldView>();
  const allow = (deviceId: string) => {
    if (isFirewall(deviceId) && !shields.has(deviceId)) shields.set(deviceId, { state: "allow", text: "허용" });
  };
  for (const sprite of sprites) {
    if (sprite.type === "walk") {
      const { hop, progress } = sprite;
      if (hop.rejected !== undefined && progress < 0.35 && isFirewall(hop.fromDeviceId)) {
        shields.set(hop.fromDeviceId, { state: "deny", text: blockedText(hop.rejected) });
      }
      if (hop.passesAt !== undefined && progress >= 0.6) allow(hop.passesAt);
      if (hop.forwarded === true && progress < 0.35) allow(hop.fromDeviceId);
    } else if (sprite.type === "drop" && sprite.fall.blocked !== undefined && isFirewall(sprite.fall.deviceId)) {
      shields.set(sprite.fall.deviceId, { state: "deny", text: blockedText(sprite.fall.blocked) });
    }
  }
  return shields;
}

function FirewallShield({ device, view }: { readonly device: Position; readonly view: ShieldView }) {
  const box = iconBox(device);
  const center = shieldAt(device);
  const width = view.text.length * 9 + 16;
  const top = box.y - 14;
  return (
    <g className={`fw-shield ${view.state}`} aria-hidden="true">
      <svg x={box.x} y={box.y} width={50} height={50} viewBox="0 0 32 32"><g transform={`translate(${FIREWALL_SHIFT} 0)`}><Shield state={view.state} /></g></svg>
      <g className="fw-say">
        <rect x={center.x - width / 2} y={top - 18} width={width} height={18} rx={6} />
        <path d={`M${center.x - 4} ${top}l4 5 4-5Z`} />
        <text x={center.x} y={top - 5.5}>{view.text}</text>
      </g>
    </g>
  );
}

/** 장비 하나가 누르기를 받는 네모 */
export interface CardBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const PICK_AREA = "penguin-pick-area";
/** 캔버스 어디든 덮는 네모. 여기에 장비 카드를 겹쳐 evenodd로 빼낸다 */
const EVERYWHERE = "M-100000 -100000h200000v200000h-200000Z";
const cardPath = (card: CardBox) => `M${card.x} ${card.y}h${card.width}v${card.height}h${-card.width}Z`;

function reducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const realTime = () => (typeof performance === "undefined" ? 0 : performance.now());

export function PacketLayer({
  replays,
  pathOf,
  positionOf,
  now: fixedNow,
  time = realTime,
  paused = false,
  onPick,
  pickedKey,
  kindOf,
  deviceCards,
}: {
  readonly replays: readonly Replay[];
  readonly pathOf: (linkId: string) => LinkPath | undefined;
  readonly positionOf: (deviceId: string) => Position | undefined;
  /** 테스트용 고정 시각. 주면 스스로 시계를 돌리지 않는다 */
  readonly now?: number;
  /** 재생의 시각. 시뮬레이션 시계를 넘긴다 (T0.15) */
  readonly time?: () => number;
  /** 시계가 멈췄다. 펭귄이 그 자리에 서고 다시 그리지 않는다 (T0.15) */
  readonly paused?: boolean;
  /** 펭귄을 눌렀을 때. 없으면 펭귄은 눌리지 않는다 (T6.3.1) */
  readonly onPick?: (pick: PenguinPick) => void;
  /** 카드를 띄운 펭귄의 `key` */
  readonly pickedKey?: string | undefined;
  /** 장비 종류. Firewall의 방패 장면에 쓴다. 없으면 방패를 바꾸지 않는다 */
  readonly kindOf?: (deviceId: string) => DeviceKind | undefined;
  /** 장비마다 누르기를 받는 네모(카드). 펭귄을 누르는 자리에서 뺀다: 겹친 곳을 누르면 장비가 받는다 */
  readonly deviceCards?: readonly CardBox[];
}) {
  const [clock, setClock] = useState(time);
  const now = fixedNow ?? clock;

  // 걷는 펭귄이 있는 동안만 매 프레임 다시 그린다. 넘어진 펭귄만 남거나 시계가 멈추면 그친다
  useEffect(() => {
    if (fixedNow !== undefined || replays.length === 0) return;
    setClock(time());
    if (paused) return;
    let frame = 0;
    const tick = () => {
      const current = time();
      setClock(current);
      if (replays.some((replay) => current - replay.startedAt < replay.timeline.durationMs + 100)) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [replays, fixedNow, time, paused]);

  const reduced = reducedMotion();
  const sprites = replays.map((replay) => ({ replay, sprites: spritesAt(replay.timeline, now - replay.startedAt, reduced) }));
  const isFirewall = (deviceId: string) => kindOf?.(deviceId) === "firewall";
  const shields = [...shieldsOf(sprites.flatMap((entry) => entry.sprites), isFirewall)]
    .flatMap(([deviceId, view]) => {
      const device = positionOf(deviceId);
      return device === undefined ? [] : [{ deviceId, device, view }];
    });
  const placed = sprites.flatMap(({ replay, sprites: current }) =>
    current.flatMap((sprite) => {
      const seq = sprite.type === "walk" ? sprite.hop.seq : sprite.fall.seq;
      const item = place(sprite, `${replay.key}-${seq}`, pathOf, positionOf);
      return item === undefined ? [] : [{ ...item, traceId: replay.traceId }];
    }),
  );
  if (placed.length === 0 && shields.length === 0) return null;

  // 다 흩어져 보이지 않는 펭귄(DROP 장면의 끝)은 누를 것이 없다
  const pickable = (item: Placed) => onPick !== undefined && !(item.scene !== undefined && item.scene.progress >= 1);
  const anyPickable = placed.some(pickable);

  return (
    <g className="packet-layer">
      {anyPickable && (
        // 펭귄을 누를 수 있는 영역: 캔버스 전체에서 장비 카드를 뺀 곳 (evenodd).
        // 펭귄 그림은 장비보다 위에 그리지만, 장비와 겹친 곳을 누르면 장비가 받아 고르기·끌기·터미널 열기가 그대로 된다
        <clipPath id={PICK_AREA}>
          <path clipRule="evenodd" d={`${EVERYWHERE}${(deviceCards ?? []).map(cardPath).join("")}`} />
        </clipPath>
      )}
      {shields.map(({ deviceId, device, view }) => <FirewallShield key={deviceId} device={device} view={view} />)}
      {placed.map((item) => (
        <g key={item.key} className={["penguin", pickable(item) ? "pickable" : "", pickedKey === item.key ? "picked" : ""].filter(Boolean).join(" ")}
          opacity={item.opacity} role={pickable(item) ? "button" : "img"} aria-label={item.label}
          {...(onPick !== undefined && pickable(item) ? {
            tabIndex: 0,
            onPointerDown: (event: { stopPropagation: () => void }) => event.stopPropagation(),
            onClick: (event: { stopPropagation: () => void }) => {
              event.stopPropagation();
              onPick({ key: item.key, traceId: item.traceId, seq: item.seq, linkId: item.linkId, at: item.at });
            },
          } : {})}>
          {pickable(item) && (
            // 누르는 자리. 그림(투명한 곳까지 네모 전체가 눌린다) 대신 이 네모만 누르기를 받는다
            <rect className="penguin-hit" x={item.at.x - SIZE / 2} y={item.at.y - SIZE + FOOT} width={item.width} height={SIZE}
              clipPath={`url(#${PICK_AREA})`} />
          )}
          {item.scene !== undefined
            ? <Vanish item={item} scene={item.scene} />
            : <image href={item.href} x={item.at.x - SIZE / 2} y={item.at.y - SIZE + FOOT} width={item.width} height={SIZE}
                {...(item.mirror === true ? { transform: `translate(${2 * item.at.x} 0) scale(-1 1)` } : {})} />}
          {item.mark !== undefined && (
            // ARP의 `?`·`!`는 한 글자라 크게 (22px), RIP의 `R?`·`R!`는 그대로 15px
            item.mark.length === 1
              ? <text className="penguin-mark big" x={item.at.x + 8} y={item.at.y - SIZE + FOOT + 1}>{item.mark}</text>
              : <text className="penguin-mark" x={item.at.x + 9 - (item.mark.length - 1) * 6} y={item.at.y - SIZE + FOOT + 2}>{item.mark}</text>
          )}
        </g>
      ))}
    </g>
  );
}
