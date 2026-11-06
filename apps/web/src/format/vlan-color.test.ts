import { expect, test } from "vitest";

import { vlanColor } from "./vlan-color";

test("시안에 색이 정해진 VLAN과 trunk는 시안의 색이다", () => {
  expect(vlanColor(1)).toEqual({ className: "v1", background: "#E6F1FE", text: "#5A6385" });
  expect(vlanColor(10)).toEqual({ className: "v10", background: "#DDF4F1", text: "#1E7A6E" });
  expect(vlanColor(20)).toEqual({ className: "v20", background: "#FFF2D6", text: "#96620A" });
  expect(vlanColor("trunk")).toEqual({ className: "vt", background: "#ECE9FE", text: "#5B4BD1" });
});

test("그 밖의 번호는 같은 번호면 같은 색이고, 이웃한 번호는 다른 색이다", () => {
  expect(vlanColor(30)).toEqual(vlanColor(30));
  expect(vlanColor(30).className).toMatch(/^vx[0-3]$/);
  expect(new Set([30, 31, 32, 33].map((vlan) => vlanColor(vlan).className)).size).toBe(4);
});

test("1~4094의 어떤 번호에도 색이 있다", () => {
  for (const vlan of [2, 9, 11, 99, 1000, 4094]) {
    const color = vlanColor(vlan);
    expect(color.background).toMatch(/^#[0-9A-F]{6}$/);
    expect(color.text).toMatch(/^#[0-9A-F]{6}$/);
  }
});
