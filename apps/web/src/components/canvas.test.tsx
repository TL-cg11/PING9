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
  // 링크 5개 가운데 SW1-SW2는 trunk다
  expect(html.match(/class="wire"/g)).toHaveLength(4);
  expect(html.match(/class="wire trunk"/g)).toHaveLength(1);
  expect(html.match(/class="node sel"/g)).toHaveLength(1);
  expect(html.match(/class="node"/g)).toHaveLength(5);
  expect(html).toContain("10.0.10.1");
});

test("장비 종류마다 시안의 배지 클래스를 쓴다", () => {
  const html = render(twoSwitchVlanDocument);

  expect(html.match(/class="badge-p"/g)).toHaveLength(4);
  expect(html.match(/class="badge-s"/g)).toHaveLength(2);
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

test("Switch의 access 포트에 연결된 링크에 VLAN 표시가 붙는다", () => {
  const html = render(twoSwitchVlanDocument);

  // PC1-SW1, SW2-PC3은 VLAN 10, PC2-SW1, SW2-PC4는 VLAN 20
  expect(html.match(/>VLAN 10</g)).toHaveLength(2);
  expect(html.match(/>VLAN 20</g)).toHaveLength(2);
  expect(html).toContain('fill="#DDF4F1"');
  expect(html).toContain('fill="#FFF2D6"');
});

test("VLAN 1뿐인 문서에는 VLAN 표시가 없다", () => {
  expect(render(twoPcSwitchDocument)).not.toContain("vlabel");
});

test("trunk 링크는 굵은 선과 trunk 표시, 끝마다 그 끝의 허용 목록", () => {
  const html = render(twoSwitchVlanDocument).replaceAll("<!-- -->", "");

  expect(html).toContain(">trunk<");
  expect(html).toContain('fill="#ECE9FE"');
  // SW1(왼쪽)의 글은 오른쪽으로, SW2(오른쪽)의 글은 왼쪽으로 뻗는다
  expect(html).toMatch(/<text class="net"[^>]*text-anchor="start"[^>]*>허용 10, 20<\/text>/);
  expect(html).toMatch(/<text class="net"[^>]*text-anchor="end"[^>]*>허용 20<\/text>/);
});
