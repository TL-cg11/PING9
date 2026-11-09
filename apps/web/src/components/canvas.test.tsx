import type { TopologyDocument } from "@ping9/shared";
import { TWO_SWITCH_VLAN, twoPcDocument, twoPcSwitchDocument, twoSwitchVlanDocument } from "@ping9/shared/examples";
import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";

import { Canvas } from "./canvas";

const render = (document: TopologyDocument, selectedDeviceId: string | null = null) =>
  renderToString(
    <Canvas
      document={document}
      selectedDeviceId={selectedDeviceId}
      onSelect={() => {}}
      onOpenTerminal={() => {}}
    />,
  );

test("예시 문서의 장비 6대와 링크 5개를 그리고 선택한 장비를 표시한다", () => {
  const html = render(twoSwitchVlanDocument, TWO_SWITCH_VLAN.sw1.id);

  for (const name of ["PC1", "PC2", "PC3", "PC4", "SW1", "SW2"]) expect(html).toContain(`>${name}<`);
  // 링크 5개 가운데 SW1-SW2는 trunk다 (T0.8: 케이블 그림)
  expect(html.match(/<g class="cable">/g)).toHaveLength(5);
  expect(html.match(/class="cable-edge"/g)).toHaveLength(5);
  expect(html.match(/stroke-width="22"/g)).toHaveLength(1);
  expect(html.match(/class="node sel"/g)).toHaveLength(1);
  expect(html.match(/class="node"/g)).toHaveLength(5);
  expect(html).toContain("10.0.10.1");
});

test("장비 종류마다 그 종류의 아이콘을 쓴다 (T0.6)", () => {
  const html = render(twoSwitchVlanDocument);

  expect(html.match(/class="icon icon-pc icon-os-windows"/g)).toHaveLength(4);
  expect(html.match(/class="icon icon-switch"/g)).toHaveLength(2);
  expect(html).not.toContain("icon-router");
});

test("선택 빛: 그라디언트는 하나, 빛의 원은 장비마다 하나 (T0.6)", () => {
  const html = render(twoSwitchVlanDocument, TWO_SWITCH_VLAN.sw1.id);

  expect(html.match(/<radialGradient id="sel-glow"/g)).toHaveLength(1);
  expect(html.match(/class="halo"/g)).toHaveLength(6);
});

test("링크 선은 장비 위치가 아니라 장비 둘레의 타원에서 끝난다 (T0.6, T0.8)", () => {
  const html = render(twoSwitchVlanDocument);
  const centers = new Set(twoSwitchVlanDocument.devices.map((device) => `${device.position.x},${device.position.y}`));
  // 선택 빛 선은 길 전체(타원 테두리에서 테두리까지)다
  const lines = [...html.matchAll(/<path class="cable-halo" d="M([^ ]+) ([^L]+)L([^ ]+) ([^"]+)"/g)];

  expect(lines).toHaveLength(5);
  for (const [, x1, y1, x2, y2] of lines) {
    expect(centers.has(`${x1},${y1}`)).toBe(false);
    expect(centers.has(`${x2},${y2}`)).toBe(false);
  }
});

test("장비마다 아이콘 뒤에 타원 받침이 있고, 테두리는 길이 들어오는 자리를 지운다 (T0.8)", () => {
  const html = render(twoSwitchVlanDocument);

  expect(html).toMatch(/<g class="rings ring-fill"[^>]*>(<ellipse[^>]*><\/ellipse>){6}<\/g>/);
  expect(html).toContain('mask="url(#ring-edge-mask)"');
  expect(html).toContain('<mask id="ring-edge-mask"');
});

test("시안과 같은 크기의 문서는 viewBox가 시안과 같다", () => {
  expect(render(twoSwitchVlanDocument)).toContain('viewBox="0 0 860 330"');
});

test("장비가 기본 영역을 벗어나면 여백 60과 함께 들어오게 넓힌다", () => {
  const document: TopologyDocument = {
    ...twoPcDocument,
    devices: twoPcDocument.devices.map((device, index) => ({
      ...device,
      position: index === 0 ? { x: -200, y: -100 } : { x: 1200, y: 700 },
    })),
  };

  // 왼쪽 -200-40-60, 위 -100-36-60, 오른쪽 1200+40+60, 아래 700+64+60
  expect(render(document)).toContain('viewBox="-300 -196 1600 1020"');
});

test("빈 문서도 그린다", () => {
  const html = render({ schemaVersion: 1, devices: [], links: [] });

  expect(html).toContain('viewBox="0 0 860 330"');
  expect(html).not.toContain('class="node');
});

test("Switch의 access 포트에 연결된 링크는 테두리가 VLAN 색이고 길 위에 VLAN 번호를 쓴다 (T0.8)", () => {
  const html = render(twoSwitchVlanDocument);

  // PC1-SW1, SW2-PC3은 VLAN 10, PC2-SW1, SW2-PC4는 VLAN 20
  expect(html.match(/>VLAN 10</g)).toHaveLength(2);
  expect(html.match(/>VLAN 20</g)).toHaveLength(2);
  expect(html.match(/class="cable-edge"[^>]*stroke="#A3DED0"/g)).toHaveLength(2);
  expect(html.match(/class="cable-edge"[^>]*stroke="#F3D592"/g)).toHaveLength(2);
  // 알약 표시는 없어졌다
  expect(html).not.toContain("vlabel");
});

test("VLAN 1뿐인 문서에는 VLAN 표시가 없다", () => {
  expect(render(twoPcSwitchDocument)).not.toContain(">VLAN ");
});

test("trunk 링크는 넓은 길과 trunk 글자, 차선, 끝마다 그 끝의 허용 목록 (T0.8)", () => {
  const html = render(twoSwitchVlanDocument).replaceAll("<!-- -->", "");

  expect(html).toContain(">trunk<");
  // SW1은 10, 20을, SW2는 20만 허용한다: 차선 둘, 10은 SW2 앞에서 막힌다
  expect(html.match(/class="cable-lane"/g)).toHaveLength(2);
  expect(html.match(/class="cable-block"/g)).toHaveLength(1);
  // 막힌 10은 길 가운데부터 SW2까지 흐린 점선이다
  expect(html.match(/class="cable-lane-closed"/g)).toHaveLength(1);
  // SW1(왼쪽)의 글은 오른쪽으로, SW2(오른쪽)의 글은 왼쪽으로 뻗는다
  expect(html).toMatch(/<text class="net"[^>]*text-anchor="start"[^>]*>허용 10, 20<\/text>/);
  expect(html).toMatch(/<text class="net"[^>]*text-anchor="end"[^>]*>허용 20<\/text>/);
});

test("노드는 키보드로 고를 수 있는 버튼이다 (T1.6.2)", () => {
  const html = render(twoSwitchVlanDocument, TWO_SWITCH_VLAN.sw1.id);

  expect(html.match(/<g class="node[^"]*"[^>]* tabindex="0" role="button"/g)).toHaveLength(6);
  expect(html).toContain('aria-label="SW1, Switch, 콘솔 열기" aria-pressed="true"');
  expect(html).toContain('aria-label="PC1, PC, Windows, 콘솔 열기" aria-pressed="false"');
  expect(html).toContain(`data-device-id="${TWO_SWITCH_VLAN.sw1.id}"`);
  expect(html.match(/class="focus-ring"/g)).toHaveLength(6);
});

test("PC의 IP는 CIDR로 보인다 (T0.7)", () => {
  expect(render(twoSwitchVlanDocument)).toMatch(/<text class="ip"[^>]*>10\.0\.10\.1\/24<\/text>/);
});

test("Linux PC는 아이콘과 이름표에 OS가 나온다 (T0.7)", () => {
  const linux: TopologyDocument = {
    ...twoPcDocument,
    devices: twoPcDocument.devices.map((device) =>
      device.kind === "pc" && device.name === "PC2" ? { ...device, config: { ...device.config, os: "linux" } } : device,
    ),
  };
  const html = render(linux);

  expect(html.match(/icon-os-linux/g)).toHaveLength(1);
  expect(html.match(/icon-os-windows/g)).toHaveLength(1);
  expect(html).toContain('aria-label="PC2, PC, Linux, 콘솔 열기"');
});
