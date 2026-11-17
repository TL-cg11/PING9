// T6.4.2: 캔버스 "보기" 메뉴와 Router 포트의 전체 주소
import { oneRouterLabDocument } from "@ping9/shared/examples";
import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";

import { Canvas } from "./canvas";
import { CANVAS_VIEW_ITEMS, CanvasViewMenu, hiddenClasses, nextHidden } from "./canvas-view-menu";

const canvas = () =>
  renderToString(<Canvas document={oneRouterLabDocument} selectedDeviceId={null} onSelect={() => {}} onOpenTerminal={() => {}} />)
    .replaceAll("<!-- -->", "");

test("Router 포트는 전체 주소/길이. PC 쪽 케이블에는 주소를 쓰지 않는다 (이름 아래에 있음)", () => {
  const html = canvas();
  const addresses = [...html.matchAll(/class="wire-ip"[^>]*>([^<]*)</g)].map((match) => match[1]);
  expect(addresses.sort()).toEqual(["192.168.1.1/24", "192.168.2.1/24"]);
  expect(addresses).not.toContain(".10");
  // PC 주소는 이름 아래에 그대로
  expect(html).toContain('class="ip"');
  expect(html).toContain("192.168.1.10/24");
});

test("포트 주소는 장비 아이콘보다 앞(뒤에 그림)에 그린다", () => {
  const html = canvas();
  expect(html.indexOf('class="canvas-labels port-addresses"')).toBeGreaterThan(html.lastIndexOf('class="node'));
  expect(html.indexOf("wire-ip")).toBeGreaterThan(html.lastIndexOf('class="node'));
});

test("보기 메뉴: 처음에는 아무것도 끄지 않고, 닫혀 있다", () => {
  const html = canvas();
  expect(html).toContain('class="topo"');
  expect(html).toContain("canvas-view-button");
  expect(html).not.toContain("canvas-view-menu");
});

test("하나를 누르면 그것만 끄고 켠다", () => {
  const off = nextHidden(new Set(), "band");
  expect([...off]).toEqual(["band"]);
  expect([...nextHidden(off, "band")]).toEqual([]);
  expect(hiddenClasses(nextHidden(off, "vlan"))).toBe(" hide-band hide-vlan");
});

test("전체: 모두 켜져 있으면 모두 끄고, 하나라도 꺼져 있으면 모두 켠다", () => {
  const all = nextHidden(new Set(), "all");
  expect(all.size).toBe(CANVAS_VIEW_ITEMS.length);
  expect(nextHidden(all, "all").size).toBe(0);
  expect(nextHidden(new Set(["port"] as const), "all").size).toBe(0);
});

test("메뉴 단추는 일부라도 끄면 회색 표시(some-off)", () => {
  expect(renderToString(<CanvasViewMenu hidden={new Set()} onToggle={() => {}} />)).not.toContain("some-off");
  expect(renderToString(<CanvasViewMenu hidden={new Set(["band"] as const)} onToggle={() => {}} />)).toContain("some-off");
});
