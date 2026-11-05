// 가운데 캔버스. Document의 장비와 링크를 그린다 (읽기 전용).
// 노드의 모양은 시안의 그리기 코드를 옮긴 것이다. 캔버스는 자체 상태로 장비 목록을 들고 있지 않다 (AD-4).

import type { Device, DeviceKind, TopologyDocument } from "@ping9/shared";

/** 시안의 기본 그림 영역 */
const BASE_WIDTH = 860;
const BASE_HEIGHT = 330;
/** 노드 카드의 크기. 장비의 위치는 카드의 가운데다 */
const HALF_WIDTH = 40;
const ABOVE = 36;
/** 카드 아래쪽 끝(36)과 그 밑의 IP 글자까지 */
const BELOW = 64;
/** 기본 영역을 벗어난 쪽에 두는 여백 */
const MARGIN = 60;

const BADGE: Readonly<Record<DeviceKind, string>> = { pc: "badge-p", switch: "badge-s", router: "badge-r" };

const ICON_STROKE = { fill: "none", strokeLinecap: "round" } as const;

function Icon({ kind }: { readonly kind: DeviceKind }) {
  switch (kind) {
    case "pc":
      return <path d="M31 17h18v11H31zM37 32h6" stroke="#1565D8" strokeWidth="2" {...ICON_STROKE} />;
    case "switch":
      return (
        <>
          <path d="M30 23h20" stroke="#5B4BD1" strokeWidth="2.5" {...ICON_STROKE} />
          <path d="M33 19v8M47 19v8" stroke="#5B4BD1" strokeWidth="2" {...ICON_STROKE} />
        </>
      );
    case "router":
      return <path d="M34 17l12 12M46 17L34 29" stroke="#1E7A6E" strokeWidth="2" {...ICON_STROKE} />;
  }
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
        <g>
          {document.links.map((link) => {
            const from = positions.get(link.ends[0].deviceId);
            const to = positions.get(link.ends[1].deviceId);
            if (from === undefined || to === undefined) return null;
            return <line key={link.id} className="wire" x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
          })}
        </g>
        <g>
          {document.devices.map((device) => (
            <g
              key={device.id}
              className={device.id === selectedDeviceId ? "node sel" : "node"}
              transform={`translate(${device.position.x - HALF_WIDTH},${device.position.y - ABOVE})`}
              onClick={() => onSelect(device.id)}
              onDoubleClick={() => onOpenTerminal(device.id)}
            >
              <rect className="card" width="80" height="72" rx="16" />
              <rect className={BADGE[device.kind]} x="24" y="10" width="32" height="26" rx="8" />
              <Icon kind={device.kind} />
              <text className="lbl" x="40" y="56" textAnchor="middle">
                {device.name}
              </text>
              {device.kind === "pc" && device.config.ip !== undefined && (
                <text className="ip" x="40" y="100" textAnchor="middle">
                  {device.config.ip}
                </text>
              )}
            </g>
          ))}
        </g>
      </svg>
      <div className="hint">
        장비를 더블클릭하면 터미널이 열려요 · 창은 끌어서 옮기고 모서리로 크기를 바꿀 수 있어요
      </div>
    </>
  );
}
