// 장비 아이콘 (T0.6). PC는 이글루, Switch는 갈림길 표지판, Router는 열린 관문이다.
// 시안의 펭귄·물고기 은유를 따른다: 펭귄이 사는 집, 길을 알려 주는 표지판, 다른 동네로 가는 문.
// 캔버스와 왼쪽 장비 목록이 같은 그림을 쓴다. 모두 32×32 기준이다.

import type { SVGProps } from "react";
import type { DeviceKind } from "@ping9/shared";

type Box = Pick<SVGProps<SVGSVGElement>, "x" | "y" | "width" | "height">;

const LINE = { strokeLinecap: "round", strokeLinejoin: "round" } as const;

function Igloo() {
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
      <path d="M13 25.5v-3.5a3 3 0 0 1 6 0v3.5Z" fill={blue} />
      <rect x="20" y="18.2" width="3.2" height="2.5" rx="0.7" fill="#F5C36B" stroke={blue} strokeWidth="0.7" />
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

export function DeviceIcon({ kind, ...box }: { readonly kind: DeviceKind } & Box) {
  return (
    <svg className={`icon icon-${kind}`} viewBox="0 0 32 32" aria-hidden="true" {...box}>
      {kind === "pc" ? <Igloo /> : kind === "switch" ? <Signpost /> : <GateOpen />}
    </svg>
  );
}
