import type { TopologyDocument } from "@ping9/shared";
import { TWO_SWITCH_VLAN, twoPcDocument, twoSwitchVlanDocument } from "@ping9/shared/examples";
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
  expect(html.match(/class="wire"/g)).toHaveLength(5);
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
