import { createSimulator } from "@ping9/engine";
import type { Snapshot, TopologyDocument } from "@ping9/shared";
import { TWO_SWITCH_VLAN, twoSwitchVlanDocument } from "@ping9/shared/examples";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { Inspector } from "./inspector";

/** 이 파일은 그리기만 본다. 적용은 pc-settings.test.tsx에서 본다 */
const ignoreDispatch = () => ({ ok: true, notices: [] }) as const;

function snapshotOf(document: TopologyDocument): Snapshot {
  const simulator = createSimulator();
  expect(simulator.load(document)).toEqual({ ok: true });
  return simulator.getSnapshot();
}

// 서버 렌더링은 글자 사이에 주석 표시를 넣으므로 빼고 비교한다
const text = (node: ReactElement) => renderToString(node).replaceAll("<!-- -->", "");

const render = (deviceId: string | null, document: TopologyDocument = twoSwitchVlanDocument) =>
  text(<Inspector snapshot={snapshotOf(document)} deviceId={deviceId} onOpenTerminal={() => {}} onDispatch={ignoreDispatch} />);

describe("Switch", () => {
  test("이름, 종류, 포트 수와 연결 수", () => {
    const html = render(TWO_SWITCH_VLAN.sw1.id);

    expect(html).toContain("<h3>SW1</h3>");
    expect(html).toContain('<span class="chip">Switch</span>');
    expect(html).toContain("포트 8개 · 3개 연결");
  });

  test("VLAN 목록: 번호, 이름, 소속 access 포트", () => {
    const html = render(TWO_SWITCH_VLAN.sw1.id);

    expect(html).toMatch(/class="vtag v10">VLAN 10<\/span>SALES<span class="ip">Fa0\/1<\/span>/);
    expect(html).toMatch(/class="vtag v20">VLAN 20<\/span>DEV<span class="ip">Fa0\/2<\/span>/);
    // 이어진 포트는 시안처럼 범위로 줄여 보인다
    expect(html).toMatch(/class="vtag v1">VLAN 1<\/span>default<span class="ip">Fa0\/3~7<\/span>/);
  });

  test("포트 목록: 상태 점, 줄인 이름, VLAN 또는 trunk 표시, 연결된 장비", () => {
    const html = render(TWO_SWITCH_VLAN.sw1.id);

    expect(html).toMatch(/class="dot"><\/span>Fa0\/1<span class="vtag v10">VLAN 10<\/span><span class="ip">PC1<\/span>/);
    expect(html).toMatch(/class="dot"><\/span>Fa0\/2<span class="vtag v20">VLAN 20<\/span><span class="ip">PC2<\/span>/);
    // trunk 포트의 줄에는 연결된 장비 대신 허용 목록이 나온다 (시안)
    expect(html).toMatch(/class="dot"><\/span>Fa0\/8<span class="vtag vt">trunk<\/span><span class="ip">허용 10, 20<\/span>/);
    expect(html).toMatch(/class="dot off"><\/span>Fa0\/3<span class="vtag v1">VLAN 1<\/span><span class="ip">연결 없음<\/span>/);
    expect(html.match(/class="if-row"/g)).toHaveLength(3 + 8);
  });

  test("학습한 주소가 없으면 MAC 주소 테이블에 안내가 나온다", () => {
    const html = render(TWO_SWITCH_VLAN.sw1.id);

    expect(html).toContain("MAC 주소 테이블");
    expect(html).toContain("아직 학습한 주소가 없어요");
  });

  test("포트가 없는 VLAN은 -로 표시하고, 시안에 없는 번호는 번호로 고른 색이다", () => {
    const simulator = createSimulator();
    simulator.load(twoSwitchVlanDocument);
    simulator.dispatch({ type: "vlan/create", deviceId: TWO_SWITCH_VLAN.sw1.id, vlanId: 30, name: "LAB" });

    const html = text(
      <Inspector snapshot={simulator.getSnapshot()} deviceId={TWO_SWITCH_VLAN.sw1.id} onOpenTerminal={() => {}} onDispatch={ignoreDispatch} />,
    );

    expect(html).toMatch(/class="vtag vx2">VLAN 30<\/span>LAB<span class="ip">-<\/span>/);
  });

  test("VLAN 1이 없는 문서에도 VLAN 1이 보인다", () => {
    const document = JSON.parse(JSON.stringify(twoSwitchVlanDocument)) as {
      devices: { name: string; config: { vlans: unknown[] } }[];
    };
    document.devices.find((device) => device.name === "SW1")!.config.vlans = [];

    const html = render(TWO_SWITCH_VLAN.sw1.id, document as unknown as TopologyDocument);

    expect(html).toContain(">VLAN 1</span>default");
  });

  test("터미널 열기 버튼이 있다", () => {
    expect(render(TWO_SWITCH_VLAN.sw1.id)).toMatch(/<button class="open-term">터미널 열기<\/button>/);
  });
});

describe("PC", () => {
  test("인터페이스 한 줄이고 VLAN 구역이 없다", () => {
    const html = render(TWO_SWITCH_VLAN.pc1.id);

    expect(html).toContain('<span class="chip">PC</span>');
    expect(html).toContain("포트 1개 · 1개 연결");
    expect(html).toContain("<h4>인터페이스</h4>");
    expect(html).toMatch(/Eth0<span class="ip">SW1<\/span>/);
    expect(html).not.toContain("VLAN");
    expect(html).not.toContain("MAC");
  });
});

describe("선택이 없을 때 (T0.17 빈 카드)", () => {
  test.each([null, "nope"])("deviceId가 %j면 빈 카드만 나온다", (deviceId) => {
    const html = render(deviceId);

    expect(html).toContain('class="inspector inspector-idle"');
    expect(html).toContain("관제 준비 완료!");
    expect(html).toContain("장비를 선택하면 네트워크 상태와");
    expect(html).not.toContain("터미널 열기");
  });

  test("장비 수와 상한, 장비가 있으면 대기 중", () => {
    const html = render(null);
    const count = twoSwitchVlanDocument.devices.length;

    expect(html).toContain(`<dt>연결된 장비</dt><dd><b>${count}</b> / 50</dd>`);
    expect(html).toContain('<span class="idle-state ready">대기 중</span>');
    expect(html).not.toContain("비어 있음");
  });

  test("장비가 없으면 0과 비어 있음", () => {
    const html = render(null, { ...twoSwitchVlanDocument, devices: [], links: [] });

    expect(html).toContain("<b>0</b> / 50");
    expect(html).toContain('<span class="idle-state empty">비어 있음</span>');
  });
});
