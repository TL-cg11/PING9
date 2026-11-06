// VLAN 번호별 색 (표현만 다룬다, 설계 8.2절). 시안의 세 가지(1 회색, 10 청록, 20 주황)와 trunk의 보라는
// 시안 그대로이고, 그 밖의 번호는 같은 계열의 색 네 가지 가운데 번호로 고른다.

export interface VlanColor {
  /** 속성 패널의 표시(`.vtag`)에 붙이는 클래스. 색은 editor.css에 있다 */
  readonly className: string;
  /** 캔버스의 표시(SVG)에 쓰는 바탕색과 글자색 */
  readonly background: string;
  readonly text: string;
}

const FIXED: Readonly<Record<number, VlanColor>> = {
  1: { className: "v1", background: "#E6F1FE", text: "#5A6385" },
  10: { className: "v10", background: "#DDF4F1", text: "#1E7A6E" },
  20: { className: "v20", background: "#FFF2D6", text: "#96620A" },
};

const TRUNK: VlanColor = { className: "vt", background: "#ECE9FE", text: "#5B4BD1" };

/** 시안에 없는 번호의 색. editor.css의 `.vx0` ~ `.vx3`과 같은 값이다 */
const EXTRA: readonly VlanColor[] = [
  { className: "vx0", background: "#E3EEFF", text: "#1565D8" },
  { className: "vx1", background: "#FDE8F0", text: "#B4326B" },
  { className: "vx2", background: "#E6F4DE", text: "#3D7A1F" },
  { className: "vx3", background: "#E9ECF5", text: "#4A5578" },
];

export function vlanColor(vlan: number | "trunk"): VlanColor {
  if (vlan === "trunk") return TRUNK;
  // 번호가 같으면 항상 같은 색이다
  return FIXED[vlan] ?? EXTRA[Math.abs(Math.trunc(vlan)) % EXTRA.length] ?? EXTRA[0]!;
}
