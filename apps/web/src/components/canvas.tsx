// 가운데 캔버스. 드래그 중 위치만 임시로 그리고, 놓을 때 원본 변경 명령을 보낸다.
// 노드는 장비 아이콘과 이름이다 (T0.6). 흰 카드는 보이지 않고 클릭 영역으로만 남는다. 캔버스는 자체 상태로 장비 목록을 들고 있지 않다 (AD-4).

import { osOf, shortPortName } from "@ping9/shared";
import type { Device, DeviceKind, PortRef, Position, TopologyDocument } from "@ping9/shared";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import { DEVICE_DRAG_TYPE, MAX_CANVAS_ZOOM, MIN_CANVAS_ZOOM, clampCanvasPosition, readDraggedDevice, screenToWorld, zoomViewBox } from "../canvas-interaction";
import type { CanvasViewBox } from "../canvas-interaction";
import { cableLook } from "../format/cable-look";
import { RING_DY, RING_RX, RING_RY, linkEnds, ringCenter } from "../format/link-ends";
import { linkVlan } from "../format/link-vlan";
import { cidrOf, OS_NAMES } from "../format/pc-address";
import { nodeKeyAction } from "./canvas-keys";
import { Cable, CableJointMask, cableGeometry } from "./cable";
import type { RingCenters } from "./cable";
import { DeviceIcon } from "./device-icons";
import { PortPicker } from "./port-picker";

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

interface NodeDrag {
  readonly deviceId: string;
  readonly pointerId: number;
  readonly start: Position;
  readonly offset: Position;
  position: Position;
  moved: boolean;
}
/** 화면 낭독기가 읽는 장비 종류 */
const KIND_NAME: Readonly<Record<DeviceKind, string>> = { pc: "PC", switch: "Switch", router: "Router" };

/**
 * 타원 받침. 안(fill)과 테두리(edge)를 따로 그린다. 테두리는 길이 들어오는 자리를 mask로 지운다 (시안 C).
 * 드래그 중인 장비는 임시 위치에 그린다
 */
function Rings({ places, part, mask }: {
  readonly places: readonly { readonly id: string; readonly position: Position }[];
  readonly part: "fill" | "edge";
  readonly mask?: string;
}) {
  return (
    <g className={`rings ring-${part}`} aria-hidden="true" mask={mask === undefined ? undefined : `url(#${mask})`}>
      {places.map(({ id, position }) => (
        <ellipse key={id} cx={position.x} cy={position.y + RING_DY} rx={RING_RX} ry={RING_RY} />
      ))}
    </g>
  );
}

/** 링크 하나를 그리는 데 필요한 모양. 케이블과 타원 테두리의 mask가 같이 쓴다 */
function linkShape(document: TopologyDocument, link: TopologyDocument["links"][number], from: Position, to: Position) {
  const look = cableLook(document, link);
  const ends = linkEnds(from, to);
  const geometry = cableGeometry(ends, look.shape === "bridge");
  const centers: RingCenters = [ringCenter(from), ringCenter(to)];
  return { look, ends, geometry, centers };
}

/**
 * trunk 끝 옆에 그 끝의 허용 목록을 쓴다. 시안처럼 노드 카드 바깥, 선이 뻗는 쪽에 둔다
 * (카드 가운데에서 가로 48, 세로 36. 넓은 trunk 길 아래).
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
    <text className="net" x={toRight ? at.x + 48 : at.x - 48} y={at.y + 36} textAnchor={toRight ? "start" : "end"}>
      {text}
    </text>
  );
}

/** 모든 장비가 보이는 viewBox. 시안의 영역 안에 다 들어가면 시안과 같다 */
function viewBoxFor(devices: readonly Device[]): CanvasViewBox {
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
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function Canvas({
  document,
  selectedDeviceId,
  onSelect,
  onOpenTerminal,
  selectedLinkId,
  onSelectLink,
  onDropDevice,
  onMoveDevice,
  onDeviceDrag,
  paletteDragKind = null,
  onPaletteDragEnd,
  cableActive = false,
  firstPort = null,
  pickerDeviceId = null,
  onPickPort,
  onClosePortPicker,
}: {
  readonly document: TopologyDocument;
  readonly selectedDeviceId: string | null;
  readonly onSelect: (deviceId: string) => void;
  readonly onOpenTerminal: (deviceId: string) => void;
  readonly selectedLinkId?: string | null;
  readonly onSelectLink?: (linkId: string) => void;
  readonly onDropDevice?: (kind: DeviceKind, position: Position) => void;
  readonly onMoveDevice?: (deviceId: string, position: Position) => void;
  readonly onDeviceDrag?: () => void;
  readonly paletteDragKind?: DeviceKind | null;
  readonly onPaletteDragEnd?: () => void;
  readonly cableActive?: boolean;
  readonly firstPort?: PortRef | null;
  readonly pickerDeviceId?: string | null;
  readonly onPickPort?: (end: PortRef) => void;
  readonly onClosePortPicker?: () => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const documentRef = useRef(document);
  documentRef.current = document;
  // 이동/추가할 때 자동 맞춤을 반복하면 장비가 마우스에서 벗어나므로 현재 뷰를 유지한다.
  const [viewport, setViewport] = useState(() => ({ box: viewBoxFor(document.devices), zoom: 1 }));
  const { box, zoom } = viewport;
  const viewBox = `${box.x} ${box.y} ${box.width} ${box.height}`;
  const dragRef = useRef<NodeDrag | null>(null);
  const suppressClick = useRef(false);
  const suppressDoubleClick = useRef(false);
  const [draft, setDraft] = useState<{ readonly deviceId: string; readonly position: Position } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [cursor, setCursor] = useState<Position | null>(null);
  const [pickerAt, setPickerAt] = useState({ x: 12, y: 60 });
  const positions = new Map(document.devices.map(device => [device.id,
    device.id === draft?.deviceId ? draft.position : device.position]));
  const pickerDevice = document.devices.find(device => device.id === pickerDeviceId);
  const places = document.devices.map(device => ({ id: device.id, position: positions.get(device.id)! }));

  useEffect(() => {
    const svg = svgRef.current;
    if (svg === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (dragRef.current === null) setViewport(current => ({
        zoom: current.zoom,
        box: zoomViewBox(viewBoxFor(documentRef.current.devices), svg.getBoundingClientRect(), current.zoom),
      }));
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  const changeZoom = (step: number) => {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width === 0 || bounds.height === 0) return;
    setViewport(current => {
      const next = Math.max(MIN_CANVAS_ZOOM, Math.min(MAX_CANVAS_ZOOM, current.zoom + step));
      if (next === current.zoom) return current;
      return { zoom: next, box: zoomViewBox(current.box, bounds, next / current.zoom) };
    });
  };

  const cancelDrag = () => {
    dragRef.current = null;
    setDraft(null);
  };

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape") cancelDrag(); };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, []);

  useEffect(() => {
    if (pickerDevice === undefined) return;
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (svg === null || !matrix) return;
    const bounds = svg.getBoundingClientRect();
    const { x, y } = pickerDevice.position;
    setPickerAt({
      x: Math.max(8, Math.min(bounds.width - 258, matrix.a * x + matrix.c * y + matrix.e - bounds.left + 30)),
      y: Math.max(8, Math.min(bounds.height - 340, matrix.b * x + matrix.d * y + matrix.f - bounds.top + 30)),
    });
  }, [pickerDevice, viewBox]);

  const pointAt = (client: Position, offset: Position = { x: 0, y: 0 }): Position | null => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (svg === null || !matrix) return null;
    const point = screenToWorld(matrix, client);
    const box = svg.getBoundingClientRect();
    const topLeft = screenToWorld(matrix, { x: box.left, y: box.top });
    const bottomRight = screenToWorld(matrix, { x: box.right, y: box.bottom });
    if (point === null || topLeft === null || bottomRight === null) return null;
    return clampCanvasPosition({ x: point.x - offset.x, y: point.y - offset.y }, topLeft, bottomRight);
  };

  // 장비 목록에서 시작한 포인터를 창 전체에서 추적한다. 바깥에 놓으면 추가하지 않는다.
  useEffect(() => {
    if (paletteDragKind === null) { setDragOver(false); setCursor(null); return; }
    const inside = (event: PointerEvent) => {
      const box = svgRef.current?.getBoundingClientRect();
      return box !== undefined && event.clientX >= box.left && event.clientX <= box.right &&
        event.clientY >= box.top && event.clientY <= box.bottom;
    };
    const move = (event: PointerEvent) => {
      const over = inside(event);
      setDragOver(over);
      setCursor(over ? pointAt({ x: event.clientX, y: event.clientY }) : null);
    };
    const end = (event: PointerEvent) => {
      if (inside(event)) {
        const position = pointAt({ x: event.clientX, y: event.clientY });
        if (position !== null) onDropDevice?.(paletteDragKind, position);
      }
      onPaletteDragEnd?.();
    };
    const cancel = () => onPaletteDragEnd?.();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
    };
  }, [paletteDragKind, onDropDevice, onPaletteDragEnd]);

  const startMove = (event: ReactPointerEvent<SVGGElement>, device: Device) => {
    if (event.button !== 0 || onMoveDevice === undefined || dragRef.current !== null) return;
    const matrix = svgRef.current?.getScreenCTM();
    if (!matrix) return;
    const point = screenToWorld(matrix, { x: event.clientX, y: event.clientY });
    if (point === null) return;
    event.preventDefault();
    suppressClick.current = false;
    suppressDoubleClick.current = false;
    dragRef.current = {
      deviceId: device.id, pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      offset: { x: point.x - device.position.x, y: point.y - device.position.y },
      position: device.position, moved: false,
    };
  };

  const updateMove = (event: Pick<PointerEvent, "pointerId" | "clientX" | "clientY">) => {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.start.x, event.clientY - drag.start.y) < 4) return;
    if (!drag.moved) onDeviceDrag?.();
    drag.moved = true;
    const position = pointAt({ x: event.clientX, y: event.clientY }, drag.offset);
    if (position === null) return;
    drag.position = position;
    setDraft({ deviceId: drag.deviceId, position });
  };

  const finishMove = (event: PointerEvent) => {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    updateMove(event);
    dragRef.current = null;
    setDraft(null);
    if (drag.moved) {
      suppressClick.current = true;
      suppressDoubleClick.current = true;
      onMoveDevice?.(drag.deviceId, drag.position);
    }
  };

  // 창에서 놓는 이벤트까지 받으므로 아이콘/캔버스 밖으로 나가도 이동이 종료된다.
  useEffect(() => {
    window.addEventListener("pointermove", updateMove);
    window.addEventListener("pointerup", finishMove);
    window.addEventListener("pointercancel", cancelDrag);
    window.addEventListener("blur", cancelDrag);
    return () => {
      window.removeEventListener("pointermove", updateMove);
      window.removeEventListener("pointerup", finishMove);
      window.removeEventListener("pointercancel", cancelDrag);
      window.removeEventListener("blur", cancelDrag);
    };
  });

  return (
    <>
      <svg ref={svgRef} className={`topo${dragOver ? " drop-target" : ""}${cableActive ? " cable-mode" : ""}`}
        viewBox={viewBox} preserveAspectRatio="xMidYMin meet"
        onDragOver={event => {
          if (onDropDevice === undefined || !event.dataTransfer.types.includes(DEVICE_DRAG_TYPE)) return;
          event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDragOver(true);
        }}
        onDragLeave={event => {
          if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragOver(false);
        }}
        onDrop={event => {
          event.preventDefault(); setDragOver(false);
          const kind = readDraggedDevice(event.dataTransfer.getData(DEVICE_DRAG_TYPE));
          const position = pointAt({ x: event.clientX, y: event.clientY });
          if (kind !== null && position !== null) onDropDevice?.(kind, position);
        }}
        onPointerMove={event => {
          if (cableActive && firstPort !== null && dragRef.current === null) setCursor(pointAt({ x: event.clientX, y: event.clientY }));
        }}
        onPointerLeave={() => setCursor(null)}
        onClick={event => { if (event.target === event.currentTarget) onClosePortPicker?.(); }}>
        <defs>
          {/* 선택 표시: 가운데가 진하고 바깥으로 갈수록 사라지는 파란 빛 */}
          <radialGradient id="sel-glow">
            <stop offset="0%" stopColor="#3B8EF0" stopOpacity="0.55" />
            <stop offset="45%" stopColor="#3B8EF0" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#3B8EF0" stopOpacity="0" />
          </radialGradient>
          {/* 케이블 선택 빛: 선을 흐리게 번지게 한다. 가로·세로 선은 상자 높이(너비)가 0이라 영역을 좌표로 준다 */}
          <filter id="cable-glow" filterUnits="userSpaceOnUse" x="-10000" y="-10000" width="20000" height="20000">
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>
        <g>
          {document.links.map((link) => {
            const from = positions.get(link.ends[0].deviceId);
            const to = positions.get(link.ends[1].deviceId);
            if (from === undefined || to === undefined) return null;
            const mark = linkVlan(document, link);
            const { look, ends, geometry, centers } = linkShape(document, link, from, to);
            // 포트 이름 자리. 직선은 장비 가운데 사이의 0.28, 다리는 곡선 위의 점이다 (T0.8)
            const portAt = (t: number) => look.shape === "bridge"
              ? geometry.at(t < 0.5 ? 0.12 : 0.88)
              : { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
            const firstPortAt = portAt(0.28);
            const secondPortAt = portAt(0.72);
            // 넓은 trunk 길은 포트 이름을 막힘 ✕보다 위에 쓴다
            const lift = look.shape === "trunk" ? 30 : 12;
            return (
              <g key={link.id} className={link.id === selectedLinkId ? "link selected" : "link"}
                role={onSelectLink === undefined ? undefined : "button"}
                tabIndex={onSelectLink === undefined ? undefined : 0}
                aria-label={onSelectLink === undefined ? undefined : `케이블 ${link.ends.map(end =>
                  `${document.devices.find(device => device.id === end.deviceId)?.name} ${shortPortName(end.port)}`).join(" ↔ ")}`}
                onClick={() => onSelectLink?.(link.id)}
                onKeyDown={event => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectLink?.(link.id);
                  }
                }}>
                {/* 선은 아이콘과 이름 위를 지나지 않게 장비 둘레에서 끊는다 (T0.6). 누르는 영역도 같은 선이다 */}
                {onSelectLink !== undefined && <path className="wire-hit" d={geometry.d} />}
                <Cable id={link.id} ends={ends} look={look} geometry={geometry} centers={centers} />
                <text className="wire-port" x={firstPortAt.x} y={firstPortAt.y - lift}
                  textAnchor="middle">{shortPortName(link.ends[0].port)}</text>
                <text className="wire-port" x={secondPortAt.x} y={secondPortAt.y - lift}
                  textAnchor="middle">{shortPortName(link.ends[1].port)}</text>
                {/* VLAN 번호와 "trunk"는 알약 없이 길 위에 쓴다 (Cable). 허용 목록은 끝 옆에 그대로 둔다 */}
                {mark?.kind === "trunk" && (
                  <>
                    <TrunkEndText at={from} other={to} text={mark.ends[0]} />
                    <TrunkEndText at={to} other={from} text={mark.ends[1]} />
                  </>
                )}
              </g>
            );
          })}
        </g>
        {/* 아이콘 뒤의 좁은 타원 받침 (T0.8, 시안 B-3d). 케이블 위, 아이콘 아래에 그린다.
            테두리는 길 안쪽이 지나는 자리만 지워 길이 타원 안으로 이어져 보이게 한다 (시안 C) */}
        <Rings places={places} part="fill" />
        <mask id="ring-edge-mask" maskUnits="userSpaceOnUse" x={box.x} y={box.y} width={box.width} height={box.height}>
          <rect x={box.x} y={box.y} width={box.width} height={box.height} fill="#fff" />
          {document.links.map((link) => {
            const from = positions.get(link.ends[0].deviceId);
            const to = positions.get(link.ends[1].deviceId);
            if (from === undefined || to === undefined) return null;
            return <CableJointMask key={link.id} {...linkShape(document, link, from, to)} />;
          })}
        </mask>
        <Rings places={places} part="edge" mask="ring-edge-mask" />
        {cableActive && firstPort !== null && cursor !== null && positions.has(firstPort.deviceId) && (
          <line className="wire pending" x1={positions.get(firstPort.deviceId)!.x} y1={positions.get(firstPort.deviceId)!.y}
            x2={cursor.x} y2={cursor.y} />
        )}
        <g>
          {document.devices.map((device) => (
            <g
              key={device.id}
              className={`${device.id === selectedDeviceId || device.id === draft?.deviceId ? "node sel" : "node"}${
                device.id === firstPort?.deviceId ? " cable-source" : ""}${device.id === draft?.deviceId ? " dragging" : ""}`}
              transform={`translate(${positions.get(device.id)!.x - HALF_WIDTH},${positions.get(device.id)!.y - ABOVE})`}
              data-device-id={device.id}
              // 키보드로도 고르고 콘솔을 연다 (T1.6.2, NFR-12). Tab 순서는 Document의 장비 순서다
              tabIndex={0}
              role="button"
              aria-label={`${device.name}, ${KIND_NAME[device.kind]}, ${
                device.kind === "pc" ? `${OS_NAMES[osOf(device.config)]}, ` : ""
              }콘솔 열기`}
              aria-pressed={device.id === selectedDeviceId}
              onPointerDown={event => startMove(event, device)}
              onDragStart={event => event.preventDefault()}
              onClick={() => {
                if (suppressClick.current) { suppressClick.current = false; return; }
                onSelect(device.id);
              }}
              onDoubleClick={() => { if (!cableActive && !suppressDoubleClick.current) onOpenTerminal(device.id); }}
              onKeyDown={event => {
                const action = nodeKeyAction(event.key);
                if (action !== null) {
                  // Space가 화면을 내리지 않게 한다. 연결 도구가 켜져 있으면 Enter도 클릭처럼 포트 선택으로 간다
                  event.preventDefault();
                  if (action === "open" && !cableActive) onOpenTerminal(device.id);
                  else onSelect(device.id);
                  return;
                }
                const delta = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[event.key];
                if (delta !== undefined && onMoveDevice !== undefined) {
                  event.preventDefault();
                  onMoveDevice(device.id, { x: device.position.x + delta[0]!, y: device.position.y + delta[1]! });
                }
              }}
            >
              <rect className="card" width="80" height="72" rx="16" />
              {/* 선택했을 때만 보이는 파란 빛. 아이콘 뒤에 그린다 */}
              <circle className="halo" cx="40" cy="36" r="46" />
              {/* 키보드 포커스 표시: 아이콘 둘레의 옅은 점선 원. 선택 빛(퍼짐)과 모양이 달라 겹쳐도 구별된다 */}
              <circle className="focus-ring" cx="40" cy="33" r="31" />
              <DeviceIcon
                kind={device.kind}
                {...(device.kind === "pc" ? { os: osOf(device.config) } : {})}
                // 56에서 50으로 줄였다. 바닥선(그림의 25.8/32 높이)은 제자리라 이름과의 간격이 그대로다
                x={15}
                y={3}
                width={50}
                height={50}
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
        {paletteDragKind !== null && cursor !== null && (
          <g className="placement-preview" transform={`translate(${cursor.x - 28},${cursor.y - 28})`}>
            <DeviceIcon kind={paletteDragKind} width={56} height={56} />
          </g>
        )}
      </svg>
      <div className="canvas-zoom" role="group" aria-label="실습 확대·축소">
        <button type="button" aria-label="실습 축소" title="실습 축소" onClick={() => changeZoom(-0.25)}
          disabled={zoom <= MIN_CANVAS_ZOOM || paletteDragKind !== null || draft !== null}>−</button>
        <output aria-label="확대 비율" aria-live="polite">{Math.round(zoom * 100)}%</output>
        <button type="button" aria-label="실습 확대" title="실습 확대" onClick={() => changeZoom(0.25)}
          disabled={zoom >= MAX_CANVAS_ZOOM || paletteDragKind !== null || draft !== null}>+</button>
      </div>
      {cableActive && pickerDevice !== undefined && onPickPort !== undefined && (
        <div className="port-picker-anchor" style={{ left: pickerAt.x, top: pickerAt.y }}>
          <PortPicker document={document} device={pickerDevice} first={firstPort} onPick={onPickPort}
            onClose={() => onClosePortPicker?.()} />
        </div>
      )}
      <div className="hint">
        {cableActive ? "장비를 클릭해 빈 포트를 선택하세요 · Esc로 연결 도구 해제" :
          "장비를 끌어서 배치·이동하세요 · 더블클릭하거나 Tab으로 골라 Enter를 누르면 터미널이 열려요 · 터미널에서 Esc를 누르면 캔버스로 돌아와요"}
      </div>
    </>
  );
}
