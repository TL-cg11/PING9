import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";

import { DeviceIcon, GateClosedIcon } from "./device-icons";

test.each(["pc", "switch", "router"] as const)("%s 아이콘: 32×32 그림이고 종류 클래스가 붙는다", (kind) => {
  const html = renderToString(<DeviceIcon kind={kind} />);

  expect(html).toMatch(new RegExp(`^<svg class="icon icon-${kind}( icon-os-windows)?" viewBox="0 0 32 32" aria-hidden="true">`));
});

test("PC에는 OS 클래스가 붙고, 없으면 Windows다 (T0.7)", () => {
  expect(renderToString(<DeviceIcon kind="pc" />)).toContain('class="icon icon-pc icon-os-windows"');
  expect(renderToString(<DeviceIcon kind="pc" os="linux" />)).toContain('class="icon icon-pc icon-os-linux"');
  expect(renderToString(<DeviceIcon kind="switch" os="linux" />)).toContain('class="icon icon-switch"');
});

test("종류마다 다른 그림이다", () => {
  const shapes = (["pc", "switch", "router"] as const).map((kind) =>
    renderToString(<DeviceIcon kind={kind} />).replace(/class="[^"]*"/, ""),
  );

  expect(new Set(shapes).size).toBe(3);
});

test("크기와 자리를 받으면 svg에 그대로 붙는다 (캔버스 안의 중첩 svg)", () => {
  const html = renderToString(<DeviceIcon kind="pc" x={12} y={-2} width={56} height={56} />);

  expect(html).toContain('x="12" y="-2" width="56" height="56"');
});

test("닫힌 관문: Router의 관문과 같은 틀에 빨간 X가 있다", () => {
  const closed = renderToString(<GateClosedIcon />);
  const open = renderToString(<DeviceIcon kind="router" />);

  expect(closed).toMatch(/^<svg class="icon icon-blocked" viewBox="0 0 32 32" aria-hidden="true">/);
  expect(closed).toContain('fill="#E04848"');
  // 지붕은 열린 관문과 같다
  expect(open).toContain('<rect x="3.5" y="5" width="25" height="4.2"');
  expect(closed).toContain('<rect x="3.5" y="5" width="25" height="4.2"');
});
