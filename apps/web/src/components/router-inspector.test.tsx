// T11.5.1: Router 속성 패널의 라우팅 테이블과 경로 교환. 사각형 RIP 실습(fourRouterRipDocument)으로 본다
import { createSimulator } from "@ping9/engine";
import type { RouterDevice } from "@ping9/shared";
import { RIP_SQUARE, ROUTER_LAB, fourRouterRipDocument, switchedStaticRoutingLabDocument } from "@ping9/shared/examples";
import type { TopologyDocument } from "@ping9/shared";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { Inspector } from "./inspector";

const ignoreDispatch = () => ({ ok: true, notices: [] }) as const;
const text = (html: string) => html.replaceAll("<!-- -->", "");

function open(document: TopologyDocument) {
  const simulator = createSimulator();
  expect(simulator.load(document)).toEqual({ ok: true });
  return simulator;
}

function render(simulator: ReturnType<typeof createSimulator>, deviceId: string, onPlayExchange = () => {}) {
  return text(renderToString(
    <Inspector snapshot={simulator.getSnapshot()} deviceId={deviceId} onOpenTerminal={() => {}} onDispatch={ignoreDispatch}
      routeChangesOf={simulator.getRouteChanges} onPlayExchange={onPlayExchange} />,
  ));
}

/** 라우팅 테이블 줄을 글자로: 태그를 빼고 칸 사이를 공백 하나로 */
function routeRows(html: string): string[] {
  return [...html.matchAll(/<div class="route-row">(.*?)<\/div>/g)].map(([, row]) =>
    row!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

describe("라우팅 테이블", () => {
  test("처음 연 사각형: 주소 순, 출처 글자, 다음 홉, 줄인 포트. RIP 경로에만 [AD/metric]과 `새로`", () => {
    const html = render(open(fourRouterRipDocument), RIP_SQUARE.r1);

    expect(html).toContain("<h4>라우팅 테이블</h4>");
    expect(routeRows(html)).toEqual([
      "C 10.0.1.0/24 직접 Gi0/0",
      "R 10.0.3.0/24 10.0.12.2 Gi0/1 [120/2] 새로",
      "C 10.0.12.0/30 직접 Gi0/1",
      "C 10.0.14.0/30 직접 Gi0/2",
      "R 10.0.23.0/30 10.0.12.2 Gi0/1 [120/1] 새로",
      "R 10.0.34.0/30 10.0.14.2 Gi0/2 [120/1] 새로",
    ]);
    expect(html).toContain('class="route-tag new"');
  });

  test("R1–R2를 끊은 뒤: R4 쪽으로 바뀐 두 경로에 `바뀜`, 그대로인 경로는 표시 없음", () => {
    const simulator = open(fourRouterRipDocument);
    expect(simulator.dispatch({ type: "link/remove", linkId: RIP_SQUARE.links.r1R2 }).ok).toBe(true);

    expect(routeRows(render(simulator, RIP_SQUARE.r1))).toEqual([
      "C 10.0.1.0/24 직접 Gi0/0",
      "R 10.0.3.0/24 10.0.14.2 Gi0/2 [120/2] 바뀜",
      "C 10.0.14.0/30 직접 Gi0/2",
      "R 10.0.23.0/30 10.0.14.2 Gi0/2 [120/2] 바뀜",
      "R 10.0.34.0/30 10.0.14.2 Gi0/2 [120/1]",
    ]);
  });

  test("Static 경로도 [AD/metric]을 보인다. RIP가 없으면 경로 교환 묶음이 없다", () => {
    const html = render(open(switchedStaticRoutingLabDocument), ROUTER_LAB.r1);

    expect(routeRows(html)).toContain("S 192.168.2.0/24 10.0.12.2 Gi0/1 [1/0]");
    expect(html).not.toContain("경로 교환");
  });

  test("IP가 없으면 안내 문구", () => {
    const empty: TopologyDocument = {
      ...fourRouterRipDocument,
      devices: fourRouterRipDocument.devices.map((device) => device.id !== RIP_SQUARE.r1 ? device :
        { ...device, config: { ...(device as RouterDevice).config, interfaces: {} } } as RouterDevice),
    };
    expect(render(open(empty), RIP_SQUARE.r1)).toContain("인터페이스에 IP를 넣으면 경로가 생겨요");
  });
});

describe("경로 교환", () => {
  test("요약 개수와 이 Router의 바뀐 경로: 이전은 지우고 이후는 → . 다음 홉 옆에 장비 이름", () => {
    const simulator = open(fourRouterRipDocument);
    simulator.dispatch({ type: "link/remove", linkId: RIP_SQUARE.links.r1R2 });
    const html = render(simulator, RIP_SQUARE.r1);
    const id = simulator.getSnapshot().traces.find((summary) => summary.kind === "rip")!.id;

    expect(html).toContain("<h4>경로 교환</h4>");
    expect(html).toContain(`마지막 교환 · 추적 #${id}`);
    expect(html).toContain("Router 4대 · 배운 경로 12<br/>새로 0 · 바뀜 5 · 사라짐 2");
    expect(html).toContain('<span class="net">10.0.3.0/24</span><br/><span class="old">R2 (10.0.12.2) [120/2]</span><br/>→ R4 (10.0.14.2) [120/2]');
    expect(html).toContain('<span class="net">10.0.23.0/30</span><br/><span class="old">R2 (10.0.12.2) [120/1]</span><br/>→ R4 (10.0.14.2) [120/2]');
  });

  test("사라진 경로는 표에 없고 묶음에만: 어디서 배웠는지와 함께", () => {
    const simulator = open(fourRouterRipDocument);
    simulator.dispatch({ type: "link/remove", linkId: RIP_SQUARE.links.r1R2 });
    // R1–R2 링크의 네트워크(10.0.12.0/30)가 없어져, R4는 R1에서 배운 그 경로를 잃는다
    const html = render(simulator, RIP_SQUARE.r4);

    expect(html).toContain('<span class="net">10.0.12.0/30</span> <span class="gone">사라짐</span><br/>R1에서 배웠음');
    expect(routeRows(html).some((row) => row.includes("10.0.12.0/30"))).toBe(false);
  });

  test("바뀐 경로가 없으면: 다시 교환해도 같은 경로 (`clear ip route *`)", async () => {
    const simulator = open(fourRouterRipDocument);
    const port = simulator.console(RIP_SQUARE.r1);
    await port.exec("enable");
    await port.exec("clear ip route *");
    const html = render(simulator, RIP_SQUARE.r1);

    expect(html).toContain("새로 0 · 바뀜 0 · 사라짐 0");
    expect(html).toContain("이 Router는 바뀐 경로가 없어요");
    expect(html).not.toContain("route-tag");
  });

  test("RIP를 켜지 않은 Router에는 묶음이 없다", () => {
    const off: TopologyDocument = {
      ...fourRouterRipDocument,
      devices: fourRouterRipDocument.devices.map((device) => {
        if (device.id !== RIP_SQUARE.r4) return device;
        const config = { ...(device as RouterDevice).config };
        delete config.rip;
        return { ...device, config } as RouterDevice;
      }),
    };
    const simulator = open(off);
    expect(render(simulator, RIP_SQUARE.r1)).toContain("<h4>경로 교환</h4>");
    expect(render(simulator, RIP_SQUARE.r4)).not.toContain("경로 교환");
  });

  test("재생 버튼이 있다 (누르면 캔버스에서 재생하는 것은 화면에서 확인)", () => {
    const html = render(open(fourRouterRipDocument), RIP_SQUARE.r1);
    expect(html).toContain('aria-label="경로 교환 재생"');
    expect(html).toContain("▶ 재생");
  });
});
