// 케이블 그림 (T0.8). 길은 같은 선을 두 번 그린다: 굵은 테두리 색 선 위에 조금 가는 안쪽 색 선.
// 직선(눈길, trunk)과 휜 선(다리)이 같은 방법을 쓴다. 무엇을 그릴지는 format/cable-look.ts가 정한다.
// 글자(VLAN 10, trunk)는 알약 없이 길 위에 길 방향으로 쓴다.

import type { CableLook, Lane } from "../format/cable-look";
import { JOINT_LENGTH, ringJoint } from "../format/link-ends";
import type { LineEnds } from "../format/link-ends";
import { vlanColor } from "../format/vlan-color";

interface Point {
  readonly x: number;
  readonly y: number;
}

/** 선의 모양. `at(t)`는 선 위의 점 (0이 첫 끝, 1이 둘째 끝) */
export interface CableGeometry {
  readonly d: string;
  at(t: number): Point;
  /** t에서 선이 나아가는 방향 (단위 벡터, t가 커지는 쪽) */
  direction(t: number): Point;
  /** 선의 길이 (곡선은 어림) */
  readonly length: number;
  /** a에서 b까지만의 선 */
  section(a: number, b: number): string;
}

function unit(x: number, y: number): Point {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

/** 다리가 휘는 높이: 길이의 이 배, 최대 BRIDGE_MAX_RISE */
const BRIDGE_RISE = 0.15;
const BRIDGE_MAX_RISE = 40;

/** 길이 방향과 그 수직(화면 위쪽을 향함) */
function axes(ends: LineEnds) {
  const dx = ends.x2 - ends.x1;
  const dy = ends.y2 - ends.y1;
  const length = Math.hypot(dx, dy) || 1;
  const along = { x: dx / length, y: dy / length };
  let normal = { x: -along.y, y: along.x };
  if (normal.y > 0 || (normal.y === 0 && normal.x > 0)) normal = { x: -normal.x, y: -normal.y };
  return { length, along, normal };
}

/** 글자가 거꾸로 서지 않는 길 방향의 각도 (-90 ~ 90도) */
function uprightAngle(ends: LineEnds): number {
  const { along } = axes(ends);
  let angle = (Math.atan2(along.y, along.x) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;
  return angle;
}

export function cableGeometry(ends: LineEnds, bridge: boolean): CableGeometry {
  const { x1, y1, x2, y2 } = ends;
  if (!bridge) {
    return {
      d: `M${x1} ${y1}L${x2} ${y2}`,
      at: (t) => ({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t }),
      direction: () => unit(x2 - x1, y2 - y1),
      length: Math.hypot(x2 - x1, y2 - y1),
      section: (a, b) => `M${x1 + (x2 - x1) * a} ${y1 + (y2 - y1) * a}L${x1 + (x2 - x1) * b} ${y1 + (y2 - y1) * b}`,
    };
  }
  const { length, normal } = axes(ends);
  const rise = Math.min(length * BRIDGE_RISE, BRIDGE_MAX_RISE);
  // 2차 곡선의 꼭대기가 rise만큼 오르려면 조절점은 그 두 배다
  const cx = (x1 + x2) / 2 + normal.x * rise * 2;
  const cy = (y1 + y2) / 2 + normal.y * rise * 2;
  return {
    d: `M${x1} ${y1}Q${cx} ${cy} ${x2} ${y2}`,
    at: (t) => ({
      x: (1 - t) ** 2 * x1 + 2 * (1 - t) * t * cx + t ** 2 * x2,
      y: (1 - t) ** 2 * y1 + 2 * (1 - t) * t * cy + t ** 2 * y2,
    }),
    direction: (t) => unit(
      2 * (1 - t) * (cx - x1) + 2 * t * (x2 - cx),
      2 * (1 - t) * (cy - y1) + 2 * t * (y2 - cy),
    ),
    length: (Math.hypot(cx - x1, cy - y1) + Math.hypot(x2 - cx, y2 - cy) + length) / 2,
    // 2차 곡선의 a~b 부분도 2차 곡선이다 (조절점은 blossom)
    section: (a, b) => {
      const blossom = (s: number, t: number) => ({
        x: (1 - s) * (1 - t) * x1 + ((1 - s) * t + s * (1 - t)) * cx + s * t * x2,
        y: (1 - s) * (1 - t) * y1 + ((1 - s) * t + s * (1 - t)) * cy + s * t * y2,
      });
      const p = blossom(a, a);
      const q = blossom(a, b);
      const r = blossom(b, b);
      return `M${p.x} ${p.y}Q${q.x} ${q.y} ${r.x} ${r.y}`;
    },
  };
}

/** 케이블 양 끝의 타원 가운데. 길을 타원에 잇는 이음목(시안 C)에 쓴다 */
export type RingCenters = readonly [Point, Point];

/**
 * 길을 타원에 잇는 모양 (시안 C). 길은 양 끝에서 JOINT_LENGTH씩 줄여 그리고, 그 자리를 이음목이 채운다.
 * 선이 너무 짧으면 이음목 없이 타원 테두리까지 그린다
 */
function cableJoints(ends: LineEnds, centers: RingCenters, geometry: CableGeometry, look: CableLook) {
  const base = look.down ? STYLE.down : STYLE[look.shape];
  if (geometry.length <= JOINT_LENGTH * 3) return undefined;
  const a = JOINT_LENGTH / geometry.length;
  const b = 1 - a;
  const first = geometry.direction(0);
  const last = geometry.direction(1);
  const startDir = geometry.direction(a);
  const endDir = geometry.direction(b);
  return {
    // 길을 이음목 밑으로 조금 더 넣어 둘 사이에 이음매가 보이지 않게 한다
    d: geometry.section(a * 0.75, 1 - a * 0.75),
    joints: [
      ringJoint(centers[0], { x: ends.x1, y: ends.y1 }, first, geometry.at(a), startDir,
        base.edgeWidth / 2, base.coreWidth / 2),
      ringJoint(centers[1], { x: ends.x2, y: ends.y2 }, { x: -last.x, y: -last.y }, geometry.at(b),
        { x: -endDir.x, y: -endDir.y }, base.edgeWidth / 2, base.coreWidth / 2),
    ],
  };
}

/** 타원 테두리를 지울 자리: 이음목의 안쪽 색 부분. canvas가 타원 테두리의 mask에 검은색으로 그린다 */
export function CableJointMask({ ends, look, geometry, centers }: {
  readonly ends: LineEnds;
  readonly look: CableLook;
  readonly geometry: CableGeometry;
  readonly centers: RingCenters;
}) {
  const joined = cableJoints(ends, centers, geometry, look);
  if (joined === undefined) return null;
  return <>{joined.joints.map((joint) => <path key={joint.core} d={joint.core} fill="#000" />)}</>;
}

/** 모양별 색과 굵기 */
const STYLE = {
  road: { edge: "#B9D5F3", core: "#FFFFFF", edgeWidth: 12, coreWidth: 7 },
  trunk: { edge: "#B9D5F3", core: "#FFFFFF", edgeWidth: 22, coreWidth: 18 },
  bridge: { edge: "#5CC8A0", core: "#E1F5EC", edgeWidth: 10, coreWidth: 6 },
  down: { edge: "#D3CEC4", core: "#F3F0EA", edgeWidth: 10, coreWidth: 6 },
} as const;

/**
 * VLAN별 access 길 테두리와 trunk 차선의 색. 계열은 vlanColor와 같다 (10 청록, 20 주황).
 * 시안에 없는 번호는 vlanColor처럼 번호로 네 가지 가운데 고른다
 */
const VLAN_PAINT: Readonly<Record<number, { readonly road: string; readonly lane: string }>> = {
  1: { road: "#C9D3E6", lane: "#7A84A3" },
  10: { road: "#A3DED0", lane: "#1E9E78" },
  20: { road: "#F3D592", lane: "#E39A1C" },
};
const EXTRA_PAINT = [
  { road: "#A9C8F5", lane: "#1565D8" },
  { road: "#F2B3CB", lane: "#B4326B" },
  { road: "#B9DDA5", lane: "#3D7A1F" },
  { road: "#C3CAE0", lane: "#4A5578" },
] as const;

function vlanPaint(vlan: number) {
  return VLAN_PAINT[vlan] ?? EXTRA_PAINT[Math.abs(Math.trunc(vlan)) % EXTRA_PAINT.length]!;
}

/** 끊긴 마디: 둥근 끝이 굵기의 반씩 늘어나므로 보이는 마디는 36, 틈은 2다 */
const DOWN_DASH = "26 12";

/** 무지개 길의 연한 7색 */
const RAINBOW = ["#F7A8A8", "#F9C98F", "#F5E08A", "#A8DDA8", "#9CCFF0", "#A9B4F2", "#D1A8EE"];

/**
 * trunk 길 안의 자리 (길 가운데에서 화면 위쪽이 +). 글자는 가운데, 차선은 글자의 위아래에 번갈아 둔다.
 * 순서대로 위 5.5, 아래 5.5, 위 7.8, 아래 7.8 (안쪽 반폭 9 안에 굵기 2.2가 들어간다)
 */
const LANE_OFFSETS = [5.5, -5.5, 7.8, -7.8] as const;
/** 차선과 무지개가 길 끝(장비 둘레 타원)에서 이만큼 안쪽에서 끝난다 */
const LANE_INSET = 3;
/** 바깥쪽 차선의 ✕를 길 방향으로 옮기는 거리. 안쪽 차선의 ✕(지름 16)와 겹치지 않는다 */
const BLOCK_SLIDE = 18;
const BLOCK_RED = "#E5484D";

function shift(point: Point, normal: Point, offset: number): Point {
  return { x: point.x + normal.x * offset, y: point.y + normal.y * offset };
}

/** 길 위에 길 방향으로 쓰는 글자. 흰 테두리를 둘러 길 위에서도 읽힌다 */
function RoadText({ at, angle, text, color, size }: {
  readonly at: Point;
  readonly angle: number;
  readonly text: string;
  readonly color: string;
  readonly size: number;
}) {
  return (
    <text className="cable-text" transform={`translate(${at.x} ${at.y}) rotate(${angle})`} y={size * 0.36}
      textAnchor="middle" fill={color} fontSize={size}>
      {text}
    </text>
  );
}

function LaneLine({ ends, lane, index }: { readonly ends: LineEnds; readonly lane: Lane; readonly index: number }) {
  const { along, normal } = axes(ends);
  const offset = LANE_OFFSETS[index] ?? 0;
  const start = shift({ x: ends.x1 + along.x * LANE_INSET, y: ends.y1 + along.y * LANE_INSET }, normal, offset);
  const end = shift({ x: ends.x2 - along.x * LANE_INSET, y: ends.y2 - along.y * LANE_INSET }, normal, offset);
  const color = vlanPaint(lane.vlan).lane;
  if (lane.blockedAt === undefined) {
    return (
      <g className="cable-lane">
        <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      </g>
    );
  }
  // 막힌 차선: 허용한 끝에서 길 가운데까지는 실선, 가운데부터 막은 끝까지는 흐린 점선.
  // 가운데에 빨간 막대와 ✕를 세운다. 바깥쪽 차선(셋째, 넷째)의 ✕는 안쪽 차선의 ✕와 겹치지 않게 조금 옮긴다
  const slide = index >= 2 ? BLOCK_SLIDE : 0;
  const stop = { x: (start.x + end.x) / 2 + along.x * slide, y: (start.y + end.y) / 2 + along.y * slide };
  const [open, closed] = lane.blockedAt === 1 ? [start, end] : [end, start];
  // ✕는 차선이 있는 쪽(위 또는 아래)의 길 바깥에 둔다. 가운데의 trunk 글자와 겹치지 않는다
  const side = offset >= 0 ? 1 : -1;
  const mark = shift(stop, normal, side * (STYLE.trunk.edgeWidth / 2 + 8) - offset);
  return (
    <g className="cable-lane">
      <line x1={open.x} y1={open.y} x2={stop.x} y2={stop.y} stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      <line className="cable-lane-closed" x1={stop.x} y1={stop.y} x2={closed.x} y2={closed.y} stroke={color} strokeWidth="2.2"
        strokeDasharray="3 4" opacity="0.45" />
      <g className="cable-block">
        <line x1={stop.x} y1={stop.y} x2={mark.x} y2={mark.y}
          stroke={BLOCK_RED} strokeWidth="2" strokeLinecap="round" />
        <circle cx={mark.x} cy={mark.y} r="6.5" fill={BLOCK_RED} stroke="#fff" strokeWidth="1.5" />
        <path d={`M${mark.x - 2.6} ${mark.y - 2.6}L${mark.x + 2.6} ${mark.y + 2.6}M${mark.x + 2.6} ${mark.y - 2.6}L${mark.x - 2.6} ${mark.y + 2.6}`}
          stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      </g>
    </g>
  );
}

/** 금: 길 가운데를 가로지르는 지그재그 */
function Crack({ ends, geometry }: { readonly ends: LineEnds; readonly geometry: CableGeometry }) {
  const { along: u, normal: n } = axes(ends);
  const m = geometry.at(0.5);
  const p = (a: number, b: number) => `${m.x + n.x * a + u.x * b} ${m.y + n.y * a + u.y * b}`;
  return <path className="cable-crack" d={`M${p(8, -1.5)}L${p(2.5, 3)}L${p(-2.5, -2.5)}L${p(-8, 2)}`} />;
}

/** 다리 아래의 바다와 물결. 휜 쪽의 반대편에 둔다 */
function Sea({ ends }: { readonly ends: LineEnds }) {
  const { length, along } = axes(ends);
  const angle = (Math.atan2(along.y, along.x) * 180) / Math.PI;
  // 회전한 좌표에서 위로 휜 쪽이 -y가 되게 뒤집는다 (axes의 normal이 화면 위쪽이다)
  const flip = Math.abs(angle) > 90 ? -1 : 1;
  const width = Math.max(length - 16, 20);
  const waves = [-0.3, 0, 0.3].map((t) => t * width);
  return (
    <g className="cable-sea" pointerEvents="none"
      transform={`translate(${(ends.x1 + ends.x2) / 2} ${(ends.y1 + ends.y2) / 2}) rotate(${angle}) scale(1 ${flip})`}>
      <rect x={-width / 2} y="2" width={width} height="20" rx="10" fill="#E3EEFB" />
      {waves.map((x) => (
        <path key={x} d={`M${x - 14} 12q7 -5 14 0t14 0`} fill="none" stroke="#86B6EA" strokeWidth="1.5"
          strokeLinecap="round" />
      ))}
    </g>
  );
}

export function Cable({
  id,
  ends,
  look,
  geometry,
  centers,
}: {
  readonly id: string;
  readonly ends: LineEnds;
  readonly look: CableLook;
  readonly geometry: CableGeometry;
  readonly centers: RingCenters;
}) {
  const base = look.down ? STYLE.down : STYLE[look.shape];
  const edge = !look.down && look.shape === "road" && look.vlan !== undefined ? vlanPaint(look.vlan).road : base.edge;
  const dash = look.down ? DOWN_DASH : undefined;
  const lanes = look.down ? undefined : look.lanes;
  const rainbowId = `rainbow-${id}`;
  const { normal } = axes(ends);
  const angle = uprightAngle(ends);
  const middle = geometry.at(0.5);
  const joined = cableJoints(ends, centers, geometry, look);
  const road = joined?.d ?? geometry.d;

  return (
    <g className="cable">
      {look.shape === "bridge" && <Sea ends={ends} />}
      {lanes === "all" && (
        <defs>
          <linearGradient id={rainbowId} gradientUnits="userSpaceOnUse"
            x1={ends.x1} y1={ends.y1} x2={ends.x2} y2={ends.y2}>
            {RAINBOW.map((color, index) => (
              <stop key={color} offset={index / (RAINBOW.length - 1)} stopColor={color} />
            ))}
          </linearGradient>
        </defs>
      )}
      {/* 선택했을 때만 보이는 파란 빛. 아이콘의 선택 빛(sel-glow)과 같은 색으로 길을 따라 번진다 */}
      <path className="cable-halo" d={geometry.d} strokeWidth={base.edgeWidth + 14} filter="url(#cable-glow)" />
      <path className={look.down ? "cable-edge segmented" : "cable-edge"} d={road} stroke={edge} strokeWidth={base.edgeWidth} strokeDasharray={dash} />
      {/* 이음목 (시안 C): 길 가장자리가 휘어 타원 테두리에 닿는다. 타원 안쪽은 canvas의 타원이 덮는다 */}
      {joined?.joints.map((joint) => <path key={joint.edge} className="cable-joint" d={joint.edge} fill={edge} />)}
      <path className={look.down ? "cable-core segmented" : "cable-core"} d={road} stroke={base.core} strokeWidth={base.coreWidth}
        strokeDasharray={dash} />
      {joined?.joints.map((joint) => <path key={joint.core} className="cable-joint" d={joint.core} fill={base.core} />)}
      {/* 무지개는 길을 따라 색이 바뀐다. 나란한 차선(그 VLAN들)과 모양이 다르다 */}
      {lanes === "all" && (() => {
        // 글자의 위아래에 무지개 줄 하나씩
        const { along } = axes(ends);
        const a = { x: ends.x1 + along.x * LANE_INSET, y: ends.y1 + along.y * LANE_INSET };
        const b = { x: ends.x2 - along.x * LANE_INSET, y: ends.y2 - along.y * LANE_INSET };
        return [8, -8].map((offset) => {
          const p = shift(a, normal, offset);
          const q = shift(b, normal, offset);
          return <line key={offset} className="cable-rainbow" x1={p.x} y1={p.y} x2={q.x} y2={q.y}
            stroke={`url(#${rainbowId})`} strokeWidth="4" />;
        });
      })()}
      {lanes !== undefined && lanes !== "all" && lanes.map((lane, index) => (
        <LaneLine key={lane.vlan} ends={ends} lane={lane} index={index} />
      ))}
      {!look.down && look.shape === "road" && look.vlan !== undefined && (
        <RoadText at={middle} angle={angle} text={`VLAN ${look.vlan}`} color={vlanColor(look.vlan).text} size={10} />
      )}
      {!look.down && look.shape === "trunk" && (
        <RoadText at={middle} angle={angle} text="trunk"
          color={vlanColor("trunk").text} size={8.5} />
      )}
      {look.down && <Crack ends={ends} geometry={geometry} />}
    </g>
  );
}
