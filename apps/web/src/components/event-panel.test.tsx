// T1.9.2, T1.9.3, T1.10.2: 오른쪽 패널의 이벤트 탭
import { createSimulator } from "@ping9/engine";
import type { Trace, TraceSummary } from "@ping9/shared";
import { TWO_SWITCH_VLAN as LAB, twoSwitchVlanDocument } from "@ping9/shared/examples";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { revealTimes } from "../replay/reveal";
import { previewTimeline } from "../replay/timeline";
import { EventPanel, SideTabs, highlightOf } from "./event-panel";
import type { Replay } from "./packet-layer";

// 서버 렌더링은 글자 사이에 주석 표시를 넣으므로 빼고 비교한다
const text = (node: ReactElement) => renderToString(node).replaceAll("<!-- -->", "");
const rows = (html: string) => html.match(/<li [^>]*class="ev-row/g)?.length ?? 0;

/** PC1 → PC3는 SW2의 trunk에서 막히고(VLAN 10 불허), PC2 → PC4는 된다 */
async function lab() {
  const sim = createSimulator();
  expect(sim.load(twoSwitchVlanDocument).ok).toBe(true);
  await sim.console(LAB.pc2.id).exec(`ping -n 1 ${LAB.pc4.ip}`);
  await sim.console(LAB.pc1.id).exec(`ping -n 1 ${LAB.pc3.ip}`);
  const traces = sim.getSnapshot().traces;
  const [failed, passed] = traces.map((summary) => sim.getTrace(summary.id)!) as [Trace, Trace];
  return { sim, traces, failed, passed };
}

function panel(traces: readonly TraceSummary[], trace: Trace | undefined, options: {
  readonly replay?: Replay; readonly now?: number; readonly selectedSeq?: number | null;
} = {}) {
  return text(
    <EventPanel header={<div className="hdr" />} document={twoSwitchVlanDocument} traces={traces}
      getTrace={(id) => (id === trace?.id ? trace : undefined)} traceId={trace?.id} onPickTrace={() => {}}
      replay={options.replay} time={() => options.now ?? 0} paused={false}
      selectedSeq={options.selectedSeq ?? null} onSelectSeq={() => {}} />,
  );
}

describe("SideTabs", () => {
  test("두 탭, 지금 탭이 선택됨. 이벤트 탭에서는 이벤트 수", () => {
    const html = text(<SideTabs tab="events" onTab={() => {}} unread={false} count={10} />);
    expect(html).toContain('aria-selected="true" class="on">이벤트<span class="cnt">10</span>');
    expect(html).toContain('aria-selected="false" class="">상세 정보');
  });

  test("상세 정보를 보는 동안 새 기록이 생기면 이벤트 탭에 점", () => {
    expect(text(<SideTabs tab="detail" onTab={() => {}} unread count={3} />)).toContain('class="badge" aria-label="새 기록"');
    expect(text(<SideTabs tab="detail" onTab={() => {}} unread={false} />)).not.toContain("badge");
  });
});

describe("EventPanel", () => {
  test("기록이 없으면 안내", () => {
    const html = panel([], undefined);
    expect(html).toContain("아직 기록이 없어요");
    expect(html).toContain('<div class="hdr"></div>');
  });

  test("실패한 추적: 모든 이벤트가 순서대로, 원인 줄은 빨갛게, 위에 실패 사유와 명령", async () => {
    const { traces, failed } = await lab();
    const html = panel(traces, failed);

    expect(rows(html)).toBe(failed.events.length);
    expect(html).toContain(`이벤트 ${failed.events.length}개`);
    const order = [...html.matchAll(/data-seq="(\d+)"/g)].map((match) => Number(match[1]));
    expect(order).toEqual(failed.events.map((event) => event.seq));

    const primary = failed.result.primaryDropSeq!;
    expect(html).toContain(`data-seq="${primary}" class="ev-row cause"`);
    expect(html).toContain("SW2의 Fa0/8 trunk가 VLAN 10 프레임을 허용하지 않아 버렸어요");
    expect(html).toContain("<code>switchport trunk allowed vlan add 10</code>");
    expect(html).toContain(`원인 이벤트 #${primary + 1} 보기 →`);
    // 추적 선택 목록: 최근 추적 모두, 성공·실패 표시
    expect(html).toContain(`PC1 → ${LAB.pc3.ip} · #${failed.id} · 실패`);
    expect(html).toContain(`PC2 → ${LAB.pc4.ip}`);
  });

  test("성공한 추적: 성공 상자, 원인 줄 없음", async () => {
    const { traces, passed } = await lab();
    const html = panel(traces, passed);

    expect(html).toContain("✅ 성공 · 응답을 받았어요");
    expect(html).not.toContain("ev-cause");
    expect(html).not.toContain("ev-row cause");
    expect(rows(html)).toBe(passed.events.length);
  });

  test("재생 중이면 펭귄이 지나간 만큼만 보이고 마지막 줄이 지금 줄", async () => {
    const { traces, failed } = await lab();
    const timeline = previewTimeline(failed);
    const replay: Replay = { key: "r", timeline, startedAt: 1000, traceId: failed.id };
    const elapsed = timeline.walks.at(-1)!.start; // 마지막 펭귄이 출발한 때. 폐기와 재시도는 아직
    const html = panel(traces, failed, { replay, now: 1000 + elapsed });
    const expected = revealTimes(failed, timeline).filter((at) => at <= elapsed).length;

    expect(expected).toBeGreaterThan(0);
    expect(expected).toBeLessThan(failed.events.length);
    expect(rows(html)).toBe(expected);
    expect(html).toContain(`이벤트 ${expected} / ${failed.events.length}`);
    expect(html).toContain("▶ 재생 중");
    expect(html).not.toContain("ev-cause");
    expect(html.match(/ev-row[^"]* now/g)).toHaveLength(1);

    // 재생이 끝나면 전부
    const done = panel(traces, failed, { replay, now: 1000 + timeline.durationMs });
    expect(rows(done)).toBe(failed.events.length);
    expect(done).toContain("ev-cause");
  });

  test("고른 줄은 자세한 값이 펼쳐진다", async () => {
    const { traces, failed } = await lab();
    const html = panel(traces, failed, { selectedSeq: 0 });

    expect(html).toContain('class="ev-row sel"');
    expect(html).toContain('<dl class="ev-more">');
    expect(html).toContain("모두(브로드캐스트)");
  });
});

describe("highlightOf", () => {
  test("원인 이벤트: 그 장비와 프레임이 들어온 케이블, 빨간 강조", async () => {
    const { failed } = await lab();
    const primary = failed.result.primaryDropSeq!;
    const highlight = highlightOf(failed, primary)!;

    expect(highlight.deviceId).toBe(LAB.sw2.id);
    expect(highlight.cause).toBe(true);
    expect(twoSwitchVlanDocument.links.find((link) => link.id === highlight.linkId)?.ends.map((end) => end.deviceId).sort())
      .toEqual([LAB.sw1.id, LAB.sw2.id].sort());
  });

  test("프레임을 내보낸 이벤트는 그 케이블, 원인이 아니면 파란 강조. 없는 번호는 undefined", async () => {
    const { failed } = await lab();
    const sent = failed.events.find((event) => event.linkId !== undefined)!;

    expect(highlightOf(failed, sent.seq)).toEqual({ deviceId: sent.deviceId, linkId: sent.linkId, cause: false });
    expect(highlightOf(failed, 999)).toBeUndefined();
  });
});
