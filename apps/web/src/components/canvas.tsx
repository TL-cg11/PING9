// 가운데 캔버스. Document의 장비와 링크를 그린다 (읽기 전용).
// 노드는 장비 아이콘과 이름이다 (T0.6). 흰 카드는 보이지 않고 클릭 영역으로만 남는다. 캔버스는 자체 상태로 장비 목록을 들고 있지 않다 (AD-4).

import { osOf } from "@ping9/shared";
import type { Device, DeviceKind, Position, TopologyDocument } from "@ping9/shared";

import { linkEnds } from "../format/link-ends";
import { linkVlan } from "../format/link-vlan";
import { cidrOf, OS_NAMES } from "../format/pc-address";
import { vlanColor } from "../format/vlan-color";
import { nodeKeyAction } from "./canvas-keys";
import { DeviceIcon } from "./device-icons";

/** 시안의 기본 그림 영역 */
const BASE_WIDTH = 860;
const BASE_HEIGHT = 330;
/** 노드(클릭 영역)의 크기. 장비의 위치는 클릭 영역의 가운데다 */
const HALF_WIDTH = 40;
const ABOVE = 36;
/** 카드 아래쪽 끝(36)과 그 밑의 IP 글자까지 */
const BELOW = 64;
/** 기본 영역을 벗어난 쪽에 두는 여백 */
const MARGIN = 60;

/** 화면 낭독기가 읽는 장비 종류 */
const KIND_NAME: Readonly<Record<DeviceKind, string>> = { pc: "PC", switch: "Switch", router: "Router" };

/** 링크 가운데에 붙는 알약 모양 표시. 시안의 vlabel과 같은 크기 계산이다 */
function LinkLabel({
  x,
  y,
  text,
  vlan,
}: {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly vlan: number | "trunk";
}) {
  const width = text.length * 7 + 16;
  const color = vlanColor(vlan);
  return (
    <g className="vlabel">
      <rect x={x - width / 2} y={y - 10} width={width} height="20" rx="10" fill={color.background} />
      <text x={x} y={y + 4} textAnchor="middle" fill={color.text}>
        {text}
      </text>
    </g>
  );
}

/**
 * trunk 끝 옆에 그 끝의 허용 목록을 쓴다. 시안처럼 노드 카드 바깥, 선이 뻗는 쪽에 둔다
 * (카드 가운데에서 가로 48, 세로 24).
 */
function TrunkEndText({
  at,
  other,
  text,
}: {
  readonly at: Position;
  readonly other: Position;
  readonly text: string | undefined;
}) {
  if (text === undefined) return null;
  const toRight = other.x >= at.x;
  return (
    <text className="net" x={toRight ? at.x + 48 : at.x - 48} y={at.y + 24} textAnchor={toRight ? "start" : "end"}>
      {text}
    </text>
  );
}

/** 모든 장비가 보이는 viewBox. 시안의 영역 안에 다 들어가면 시안과 같다 */
function viewBoxFor(devices: readonly Device[]): string {
  let left = 0;
  let top = 0;
  let right = BASE_WIDTH;
  let bottom = BASE_HEIGHT;

  for (const { position } of devices) {
    if (position.x - HALF_WIDTH < left) left = position.x - HALF_WIDTH - MARGIN;
    if (position.y - ABOVE < top) top = position.y - ABOVE - MARGIN;
    if (position.x + HALF_WIDTH > right) right = position.x + HALF_WIDTH + MARGIN;
    if (position.y + BELOW > bottom) bottom = position.y + BELOW + MARGIN;
  }
  return `${left} ${top} ${right - left} ${bottom - top}`;
}

export function Canvas({
  document,
  selectedDeviceId,
  onSelect,
  onOpenTerminal,
}: {
  readonly document: TopologyDocument;
  readonly selectedDeviceId: string | null;
  readonly onSelect: (deviceId: string) => void;
  readonly onOpenTerminal: (deviceId: string) => void;
}) {
  const positions = new Map(document.devices.map((device) => [device.id, device.position]));

  return (
    <>
      <svg className="topo" viewBox={viewBoxFor(document.devices)} preserveAspectRatio="xMidYMin meet">
        <defs>
          {/* 선택 표시: 가운데가 진하고 바깥으로 갈수록 사라지는 파란 빛 */}
          <radialGradient id="sel-glow">
            <stop offset="0%" stopColor="#3B8EF0" stopOpacity="0.55" />
            <stop offset="45%" stopColor="#3B8EF0" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#3B8EF0" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g>
          {document.links.map((link) => {
            const from = positions.get(link.ends[0].deviceId);
            const to = positions.get(link.ends[1].deviceId);
            if (from === undefined || to === undefined) return null;
            const mark = linkVlan(document, link);
            const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
            return (
              <g key={link.id}>
                {/* 선은 아이콘과 이름 위를 지나지 않게 장비 둘레에서 끊는다 */}
                <line className={mark?.kind === "trunk" ? "wire trunk" : "wire"} {...linkEnds(from, to)} />
                {mark?.kind === "access" && (
                  <LinkLabel x={middle.x} y={middle.y} text={`VLAN ${mark.vlan}`} vlan={mark.vlan} />
                )}
                {mark?.kind === "trunk" && (
                  <>
                    <LinkLabel x={middle.x} y={middle.y} text="trunk" vlan="trunk" />
                    <TrunkEndText at={from} other={to} text={mark.ends[0]} />
                    <TrunkEndText at={to} other={from} text={mark.ends[1]} />
                  </>
                )}
              </g>
            );
          })}
        </g>
        <g>
          {document.devices.map((device) => (
            <g
              key={device.id}
              className={device.id === selectedDeviceId ? "node sel" : "node"}
              transform={`translate(${device.position.x - HALF_WIDTH},${device.position.y - ABOVE})`}
              data-device-id={device.id}
              // 키보드로도 고르고 콘솔을 연다 (T1.6.2, NFR-12). Tab 순서는 Document의 장비 순서다
              tabIndex={0}
              role="button"
              aria-label={`${device.name}, ${KIND_NAME[device.kind]}, ${
                device.kind === "pc" ? `${OS_NAMES[osOf(device.config)]}, ` : ""
              }콘솔 열기`}
              aria-pressed={device.id === selectedDeviceId}
              onClick={() => onSelect(device.id)}
              onDoubleClick={() => onOpenTerminal(device.id)}
              onKeyDown={(event) => {
                const action = nodeKeyAction(event.key);
                if (action === null) return;
                // Space가 화면을 내리지 않게 한다
                event.preventDefault();
                if (action === "open") onOpenTerminal(device.id);
                else onSelect(device.id);
              }}
            >
              <rect className="card" width="80" height="72" rx="16" />
              {/* 선택했을 때만 보이는 파란 빛. 아이콘 뒤에 그린다 */}
              <circle className="halo" cx="40" cy="36" r="46" />
              {/* 키보드 포커스 표시: 아이콘 둘레의 점선 타원. 선택 빛(퍼짐)과 모양이 달라 겹쳐도 구별된다.
                  아래 끝(y 55)이 이름 글자(기준선 68, 14px)에 닿지 않는다 */}
              <ellipse className="focus-ring" cx="40" cy="30" rx="33" ry="25" />
              <DeviceIcon
                kind={device.kind}
                {...(device.kind === "pc" ? { os: osOf(device.config) } : {})}
                x={12}
                y={-2}
                width={56}
                height={56}
              />
              <text className="lbl" x="40" y="68" textAnchor="middle">
                {device.name}
              </text>
              {device.kind === "pc" && device.config.ip !== undefined && (
                <text className="ip" x="40" y="86" textAnchor="middle">
                  {cidrOf(device.config.ip, device.config.mask)}
                </text>
              )}
            </g>
          ))}
        </g>
      </svg>
      <div className="hint">
        장비를 더블클릭하거나 Tab으로 골라 Enter를 누르면 터미널이 열려요 · 터미널에서 Esc를 누르면 캔버스로 돌아와요 · 창은 끌어서 옮기고 모서리로 크기를 바꿀 수 있어요
      </div>
    </>
  );
}
