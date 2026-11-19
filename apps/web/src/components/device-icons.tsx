// 장비 아이콘 (T0.6). PC는 이글루, Switch는 갈림길 표지판, Router는 열린 관문이다.
// 필터 규칙(iptables)을 건 서버는 이글루 오른쪽 위에 방패 배지를 단다 (T0.21. T14.2.3의 Firewall 방패를 옮김).
// 시안의 펭귄·물고기 은유를 따른다: 펭귄이 사는 집, 길을 알려 주는 표지판, 다른 동네로 가는 문.
// 캔버스와 왼쪽 장비 목록이 같은 그림을 쓴다. 모두 32×32 기준이다.

import type { SVGProps } from "react";
import type { DeviceKind, PcOsChoice } from "@ping9/shared";

type Box = Pick<SVGProps<SVGSVGElement>, "x" | "y" | "width" | "height">;

const LINE = { strokeLinecap: "round", strokeLinejoin: "round" } as const;

/**
 * 이글루. OS마다 창과 문이 다르다 (T0.7). 작게 그려도 구분되도록 모양으로 나눈다.
 * - Linux: 둥근 문과 그 위의 검은 터미널 간판(`>_`)
 * - Windows: 큰 유리창(제목 줄이 있는 앱 창 모양)과 넓은 네모 문
 * - Server: 문 위에 불빛이 켜진 장비 선반 (T0.20). 임시 그림이다
 * - OS 없음: T0.6의 원래 그림(둥근 문과 노란 작은 창). OS를 고르기 전인 장비 목록이 쓴다
 */
function Igloo({ os }: { readonly os: PcOsChoice | undefined }) {
  const blue = "#1A5FA8";
  // 이글루는 납작해서 다른 그림보다 작아 보인다. 바닥선을 기준으로 1.2배 키운다
  return (
    <g transform="translate(16 25.8) scale(1.2) translate(-16 -25.8)">
      <path d="M5 25.5A11 11 0 0 1 27 25.5Z" fill="#E6F0FB" stroke={blue} strokeWidth="1.1" {...LINE} />
      <path
        d="M7 21h18M9.5 17.5h13M11.5 21v4.5M20.5 21v4.5M16 17.5V21"
        fill="none"
        stroke="#A8C8EC"
        strokeWidth="0.8"
        {...LINE}
      />
      {os === undefined ? (
        <>
          <path d="M13 25.5v-3.5a3 3 0 0 1 6 0v3.5Z" fill={blue} />
          <rect x="20" y="18.2" width="3.2" height="2.5" rx="0.7" fill="#F5C36B" stroke={blue} strokeWidth="0.7" />
        </>
      ) : os === "server" ? (
        <g className="igloo-server">
          <path d="M13 25.5v-2.9a3 3 0 0 1 6 0v2.9Z" fill={blue} />
          <rect x="11" y="14.6" width="10" height="5.8" rx="0.9" fill="#0E1A38" />
          <path d="M11 17.5h10" fill="none" stroke="#3A4A78" strokeWidth="0.5" />
          <circle cx="12.6" cy="16.05" r="0.5" fill="#6FE3A1" />
          <circle cx="12.6" cy="18.95" r="0.5" fill="#6FE3A1" />
          <path d="M14.6 16.05h4.8M14.6 18.95h4.8" fill="none" stroke="#7FD3F7" strokeWidth="0.55" {...LINE} />
        </g>
      ) : os === "linux" ? (
        <g className="igloo-linux">
          <path d="M13 25.5v-2.9a3 3 0 0 1 6 0v2.9Z" fill={blue} />
          <rect x="11.8" y="16.9" width="8.4" height="3.3" rx="0.9" fill="#0E1A38" />
          <path d="M14.2 17.8l1 0.75-1 0.75M15.9 19.3h1.8" fill="none" stroke="#7FD3F7" strokeWidth="0.55" {...LINE} />
        </g>
      ) : (
        <g className="igloo-windows">
          <rect x="10.8" y="17.1" width="10.4" height="5.1" rx="0.8" fill="#B9D6F3" stroke={blue} strokeWidth="0.7" />
          <path d="M10.8 18.5v-0.6a0.8 0.8 0 0 1 0.8-0.8h8.8a0.8 0.8 0 0 1 0.8 0.8v0.6Z" fill={blue} />
          <circle cx="11.8" cy="17.85" r="0.28" fill="#fff" />
          <circle cx="12.7" cy="17.85" r="0.28" fill="#fff" />
          <path d="M12.8 21.2l1.7-1.7M14.1 21.4l2.1-2.1" fill="none" stroke="#fff" strokeWidth="0.45" {...LINE} />
          <path d="M12.6 25.5v-1.9a0.9 0.9 0 0 1 0.9-0.9h5a0.9 0.9 0 0 1 0.9 0.9v1.9Z" fill={blue} />
        </g>
      )}
      <path d="M3.5 25.8h25" fill="none" stroke={blue} strokeWidth="1.1" {...LINE} />
    </g>
  );
}

function Signpost() {
  const purple = "#4B3DB8";
  const sign = { fill: "#EEEDFD", stroke: "#5B4BD1", strokeWidth: 1, ...LINE } as const;
  return (
    <>
      <ellipse cx="16" cy="27.6" rx="9.5" ry="1.8" fill="#E6E4FB" stroke="#5B4BD1" strokeWidth="0.9" />
      <path d="M16 6.5h9l2.6 2.6-2.6 2.6h-9Z" {...sign} />
      <path d="M16 12.8H7.4l-2.6 2.6 2.6 2.6H16Z" {...sign} />
      <path d="M16 19.1h7l2.4 2.4-2.4 2.4h-7Z" {...sign} />
      <path d="M16 3v24.5" fill="none" stroke={purple} strokeWidth="1.6" {...LINE} />
      <circle cx="19.2" cy="9.1" r="0.9" fill="#5B4BD1" />
      <circle cx="12.6" cy="15.4" r="0.9" fill="#5B4BD1" />
      <circle cx="19.2" cy="21.5" r="0.9" fill="#5B4BD1" />
    </>
  );
}

/** 관문의 기둥과 지붕. 열린 문과 닫힌 문이 같이 쓴다 */
function GateFrame() {
  const green = "#17725F";
  const edge = { stroke: green, strokeWidth: 1, ...LINE } as const;
  return (
    <>
      <rect x="3.5" y="5" width="25" height="4.2" rx="1.6" fill="#A3E2CB" {...edge} />
      <rect x="5.5" y="9.2" width="4.6" height="16.6" rx="0.8" fill="#E2F5EF" {...edge} />
      <rect x="21.9" y="9.2" width="4.6" height="16.6" rx="0.8" fill="#E2F5EF" {...edge} />
      <path d="M3 25.8h26" fill="none" stroke={green} strokeWidth="1.1" {...LINE} />
    </>
  );
}

function GateOpen() {
  const door = { fill: "#5FC9A5", stroke: "#17725F", strokeWidth: 0.9, ...LINE } as const;
  return (
    <>
      <GateFrame />
      <path d="M10.1 11l4 1.6v11.6l-4 1.6Z" {...door} />
      <path d="M21.9 11l-4 1.6v11.6l4 1.6Z" {...door} />
    </>
  );
}

/**
 * 경로가 없을 때: 문이 닫히고 가운데에 빨간 X.
 * 아직 이 상태를 보여 주는 화면이 없다. 실패 사유 표시(T1.10.2)에서 쓴다
 */
export function GateClosedIcon(box: Box) {
  return (
    <svg className="icon icon-blocked" viewBox="0 0 32 32" aria-hidden="true" {...box}>
      <GateFrame />
      <rect x="10.1" y="9.2" width="11.8" height="16.6" fill="#5FC9A5" stroke="#17725F" strokeWidth="0.9" />
      <path d="M16 9.2v16.6" stroke="#17725F" strokeWidth="0.8" />
      <circle cx="16" cy="17.5" r="4.6" fill="#E04848" />
      <path d="M14.2 15.7l3.6 3.6M17.8 15.7l-3.6 3.6" stroke="#fff" strokeWidth="1.5" {...LINE} />
    </svg>
  );
}

export type ShieldState = "idle" | "allow" | "deny";

/**
 * 필터의 방패 (T14.2.3). 평소는 분홍 바탕에 흰 별표,
 * 펭귄이 허용되면 초록 체크, 막히면 빨간 X. 펭귄 층이 같은 자리에 겹쳐 그린다
 */
function Shield({ state }: { readonly state: ShieldState }) {
  const [fill, edge] = state === "allow" ? ["#1E9E6A", "#0F6B47"] : state === "deny" ? ["#E04848", "#A12828"] : ["#D6517A", "#8E2A4C"];
  return (
    <g className={`shield shield-${state}`}>
      <path d="M23.5 8.6L29.6 11v6.4c0 4.2-2.7 7.3-6.1 9-3.4-1.7-6.1-4.8-6.1-9V11Z" fill={fill} stroke={edge} strokeWidth="1.1" {...LINE} />
      <path
        d={state === "allow" ? "M20.8 17.3l2 2 3.9-4.2" : state === "deny" ? "M21.4 15l4.2 4.2M25.6 15l-4.2 4.2" : "M23.5 14v6M20.9 15.5l5.2 3M20.9 18.5l5.2-3"}
        fill="none" stroke="#fff" strokeWidth={state === "idle" ? 1.3 : 1.7} {...LINE}
      />
    </g>
  );
}

/**
 * 서버 아이콘 위 방패 배지의 자리 (32 격자). 방패 그림(가운데가 23.5, 17.5)을 줄여 이글루 오른쪽 위에 둔다.
 * 펭귄 층이 같은 자리에 허용·차단 방패를 겹쳐 그리고, DROP된 물고기가 이리로 날아간다
 */
export const FILTER_BADGE = { x: 26.4, y: 11.4, scale: 0.6 } as const;

/** 필터 규칙을 건 서버의 방패 배지 (T0.21) */
export function FilterBadge({ state }: { readonly state: ShieldState }) {
  return (
    <g className="filter-badge" transform={`translate(${FILTER_BADGE.x} ${FILTER_BADGE.y}) scale(${FILTER_BADGE.scale}) translate(-23.5 -17.5)`}>
      <Shield state={state} />
    </g>
  );
}

/**
 * `os`는 PC에만 쓴다 (T0.7). 캔버스는 `osOf`로 늘 넘긴다.
 * 넘기지 않으면 OS가 없는 원래 이글루다 (장비 목록).
 * `filtering`: 필터 규칙을 건 서버다. 방패 배지를 단다 (T0.21)
 */
export function DeviceIcon({ kind, os, filtering = false, ...box }: {
  readonly kind: DeviceKind; readonly os?: PcOsChoice; readonly filtering?: boolean;
} & Box) {
  const osClass = kind === "pc" && os !== undefined ? ` icon-os-${os}` : "";
  return (
    <svg className={`icon icon-${kind}${osClass}`} viewBox="0 0 32 32" aria-hidden="true" {...box}>
      {kind === "pc" ? <Igloo os={os} /> : kind === "switch" ? <Signpost /> : <GateOpen />}
      {kind === "pc" && filtering && <FilterBadge state="idle" />}
    </svg>
  );
}
