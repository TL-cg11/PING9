// 오른쪽 패널의 이벤트 탭 (T1.9.2, T1.9.3, T1.10.2). 시뮬레이션 모드에서만 보인다.
// 재생 중인 추적이면 펭귄이 지나간 만큼만 줄이 보이고, 지금 줄이 강조된다. 재생이 끝나면 전부 보이고 결과 상자가 뜬다.
// 시간은 시뮬레이션 시계를 따른다: 멈추면 목록도 서고, 2×면 두 배로 자란다.

import { shortPortName } from "@ping9/shared";
import type { Trace, TraceEvent, TraceSummary, TopologyDocument } from "@ping9/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { causeOf, eventText } from "../messages/events";
import { revealTimes } from "../replay/reveal";
import type { Replay } from "./packet-layer";

export type SideTab = "detail" | "events";

export function SideTabs({ tab, onTab, unread, count }: {
  readonly tab: SideTab;
  readonly onTab: (tab: SideTab) => void;
  readonly unread: boolean;
  readonly count?: number | undefined;
}) {
  return (
    <div className="side-tabs" role="tablist" aria-label="오른쪽 패널">
      <button type="button" role="tab" aria-selected={tab === "detail"} className={tab === "detail" ? "on" : ""}
        onClick={() => onTab("detail")}>상세 정보</button>
      <button type="button" role="tab" aria-selected={tab === "events"} className={tab === "events" ? "on" : ""}
        onClick={() => onTab("events")}>
        이벤트
        {tab === "events" && count !== undefined && <span className="cnt">{count}</span>}
        {tab !== "events" && unread && <span className="badge" aria-label="새 기록" />}
      </button>
    </div>
  );
}

const LAYER_CLASS: Readonly<Record<TraceEvent["layer"], string>> = { L2: "L2", ARP: "ARP", L3: "L3", ICMP: "ICMP", RIP: "RIP", GRE: "L3", IPSEC: "L3" };

function traceLabel(summary: TraceSummary): string {
  if (summary.kind === "rip") return `RIP 경로 교환 #${summary.id}`;
  return `${summary.source.deviceName} → ${summary.targetIp}${summary.hop === undefined ? "" : ` (TTL ${summary.hop})`}`;
}

/** 줄을 눌렀을 때 캔버스에서 강조할 장비와 케이블 */
export interface EventHighlight {
  readonly deviceId: string;
  readonly linkId?: string;
  readonly cause: boolean;
}

/** 이벤트의 프레임이 지나간 케이블: 내보낸 케이블, 없으면 들어온 케이블 */
function linkOf(trace: Trace, event: TraceEvent): string | undefined {
  if (event.linkId !== undefined) return event.linkId;
  let parent = event.parentSeq === undefined ? undefined : trace.events[event.parentSeq];
  while (parent !== undefined) {
    if (parent.linkId !== undefined) return parent.deviceId === event.deviceId ? undefined : parent.linkId;
    parent = parent.parentSeq === undefined ? undefined : trace.events[parent.parentSeq];
  }
  return undefined;
}

export function highlightOf(trace: Trace, seq: number): EventHighlight | undefined {
  const event = trace.events[seq];
  if (event === undefined) return undefined;
  const linkId = linkOf(trace, event);
  return { deviceId: event.deviceId, ...(linkId === undefined ? {} : { linkId }), cause: seq === trace.result.primaryDropSeq };
}

function Details({ event }: { readonly event: TraceEvent }) {
  const { ethernet, arp, ipv4, gre, esp } = event.frame;
  const rows: [string, ReactNode][] = [];
  if (event.inPort !== undefined) rows.push(["받은 포트", shortPortName(event.inPort)]);
  if (event.outPort !== undefined) rows.push(["보낸 포트", shortPortName(event.outPort)]);
  rows.push(["MAC", `${ethernet.sourceMac} → ${ethernet.destinationMac === "ff:ff:ff:ff:ff:ff" ? "모두(브로드캐스트)" : ethernet.destinationMac}`]);
  if (ethernet.vlanTag !== undefined) rows.push(["VLAN 태그", ethernet.vlanTag]);
  if (arp !== undefined) rows.push(["ARP", `${arp.senderIp} → ${arp.targetIp}`]);
  if (ipv4 !== undefined) rows.push(["IP", `${ipv4.sourceIp} → ${ipv4.destinationIp} · TTL ${ipv4.ttl}`]);
  if (gre !== undefined) rows.push(["GRE 안쪽 IP", `${gre.payload.ipv4.sourceIp} → ${gre.payload.ipv4.destinationIp}`]);
  if (esp !== undefined) {
    rows.push(["교육용 ESP", `SPI ${esp.spi} · 순서 ${esp.sequence} · 실제 암호화 없음`]);
    rows.push(["ESP 안쪽 IP", `${esp.payload.ipv4.sourceIp} → ${esp.payload.ipv4.destinationIp}`]);
  }
  return (
    <dl className="ev-more">
      {rows.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}
    </dl>
  );
}

export function EventPanel({ header, document, traces, getTrace, traceId, onPickTrace, replay, time, paused, selectedSeq, onSelectSeq }: {
  readonly header: ReactNode;
  readonly document: TopologyDocument;
  readonly traces: readonly TraceSummary[];
  readonly getTrace: (traceId: number) => Trace | undefined;
  /** 보여 줄 추적 */
  readonly traceId: number | undefined;
  readonly onPickTrace: (traceId: number) => void;
  /** 이 추적을 지금 재생 중이면 그 재생 */
  readonly replay: Replay | undefined;
  readonly time: () => number;
  readonly paused: boolean;
  readonly selectedSeq: number | null;
  readonly onSelectSeq: (seq: number | null) => void;
}) {
  const trace = traceId === undefined ? undefined : getTrace(traceId);
  const reveal = useMemo(() => (trace !== undefined && replay !== undefined ? revealTimes(trace, replay.timeline) : undefined),
    [trace, replay]);

  // 재생 중인 동안만 매 프레임 다시 그린다
  const [now, setNow] = useState(time);
  useEffect(() => {
    if (replay === undefined) return;
    setNow(time());
    if (paused) return;
    let frame = 0;
    const tick = () => {
      const current = time();
      setNow(current);
      if (current - replay.startedAt < replay.timeline.durationMs + 50) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [replay, paused, time]);

  const elapsed = replay === undefined ? Infinity : now - replay.startedAt;
  const playing = replay !== undefined && elapsed < replay.timeline.durationMs;
  const shown = trace === undefined ? 0 : reveal === undefined || !playing ? trace.events.length
    : reveal.filter((at) => at <= elapsed).length;

  // 재생 중에는 지금 줄이 보이게 따라 내려간다
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (!playing) return;
    listRef.current?.querySelector(".ev-row.now")?.scrollIntoView({ block: "nearest" });
  }, [shown, playing]);
  const goTo = (seq: number) => {
    onSelectSeq(seq);
    requestAnimationFrame(() => listRef.current?.querySelector(`[data-seq="${seq}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  };

  const primary = trace?.result.primaryDropSeq;
  const cause = primary === undefined || trace === undefined ? undefined : causeOf(trace.events[primary]!.reason);
  const nameOf = (deviceId: string) => document.devices.find((device) => device.id === deviceId)?.name ?? "?";

  return (
    <aside className="inspector side-events">
      {header}
      {traces.length === 0 || trace === undefined ? (
        <div className="ev-empty">
          <p className="t">아직 기록이 없어요</p>
          <p>PC 콘솔에서 <code>ping</code>을 실행하면<br />장비들이 한 일을 순서대로 보여 줘요.</p>
        </div>
      ) : (
        <>
          <label className="ev-trace">
            <span className={`st ${playing ? "run" : trace.result.status === "success" ? "ok" : "fail"}`} />
            <select value={trace.id} onChange={(event) => onPickTrace(Number(event.target.value))} aria-label="추적 선택">
              {traces.map((summary) => (
                <option key={summary.id} value={summary.id}>
                  {traceLabel(summary)} · #{summary.id} · {summary.status === "success" ? "성공" : "실패"}
                </option>
              ))}
            </select>
          </label>

          {playing ? (
            <div className="ev-run">{paused ? "⏸ 멈춤" : "▶ 재생 중"} · 펭귄이 지나간 만큼 기록이 나와요</div>
          ) : trace.result.status === "success" ? (
            <div className="ev-ok">✅ 성공 · 응답을 받았어요</div>
          ) : (
            <button type="button" className="ev-cause" onClick={() => primary !== undefined && goTo(primary)}>
              <span className="h">❌ 실패한 이유</span>
              <span className="m">{cause?.text ?? (trace.result.status === "loop-guard" ? "프레임이 끝없이 돌아 계산을 멈췄어요" : "원인을 찾지 못했어요")}</span>
              {cause !== undefined && <span className="fix">{cause.fix}{cause.command !== undefined && <> <code>{cause.command}</code></>}</span>}
              {primary !== undefined && <span className="go">원인 이벤트 #{primary + 1} 보기 →</span>}
            </button>
          )}

          <div className="ev-head"><span>이벤트 {shown}{playing ? ` / ${trace.events.length}` : "개"}</span><span>누르면 캔버스에 표시</span></div>
          <ol className="ev-list" ref={listRef}>
            {trace.events.slice(0, shown).map((event, index) => {
              const isCause = event.seq === primary;
              const isDrop = event.action === "drop";
              const className = ["ev-row", isCause ? "cause" : isDrop ? "drop" : "", playing && index === shown - 1 ? "now" : "",
                selectedSeq === event.seq ? "sel" : ""].filter(Boolean).join(" ");
              return (
                <li key={event.seq} data-seq={event.seq} className={className}>
                  <button type="button" onClick={() => onSelectSeq(selectedSeq === event.seq ? null : event.seq)}>
                    <span className="n">{event.seq + 1}</span>
                    <span className="d">{nameOf(event.deviceId)}</span>
                    <span className="txt"><i className={`l ${LAYER_CLASS[event.layer]}`}>{event.layer}</i>
                      {isDrop && <span className="x">✕ </span>}{eventText(event.reason)}</span>
                  </button>
                  {selectedSeq === event.seq && <Details event={event} />}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </aside>
  );
}
