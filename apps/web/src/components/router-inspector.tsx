// Router 속성 패널의 라우팅 테이블과 경로 교환 (T11.5.1). 값은 스냅샷의 views와 traces, `getRouteChanges`에서 읽는다 (AD-7).
// 화면 시안: 설계안 폴더의 T11.5.1-시안1-패널.png

import { maskToPrefixLength, parseIpv4, shortPortName } from "@ping9/shared";
import type { RipRouteHop, RouteChangeView, RouteEntryView, RouterDevice, RouterView, TopologyDocument, TraceSummary } from "@ping9/shared";

type RipSummary = Extract<TraceSummary, { kind: "rip" }>;

/** 실시간 모드에서 꺼진 재생 버튼의 안내 (T0.13) */
export const PLAY_IN_SIMULATION = "시뮬레이션 모드에서 재생할 수 있어요";

const SOURCE_CODE:Readonly<Record<RouteEntryView["source"], string>> = { connected: "C", static: "S", rip: "R" };

const keyOf = (route: { readonly network: string; readonly mask: string }) => `${route.network}/${route.mask}`;
const destination = (route: { readonly network: string; readonly mask: string }) =>
  `${route.network}/${maskToPrefixLength(route.mask) ?? route.mask}`;

/** `show ip route`와 같은 순서: 작은 네트워크 주소부터, 같으면 긴 마스크부터 */
const byNetwork = (a: RouteEntryView, b: RouteEntryView) =>
  (parseIpv4(a.network)! - parseIpv4(b.network)!) || (parseIpv4(b.mask)! - parseIpv4(a.mask)!);

/** 주소를 가진 장비의 이름 (Router 인터페이스, PC) */
function ownerName(document: TopologyDocument, ip: string): string | undefined {
  return document.devices.find((device) =>
    device.kind === "router" ? Object.values(device.config.interfaces).some((iface) => iface.ip === ip)
      : device.kind === "pc" ? device.config.ip === ip : false)?.name;
}

/** 이 Router에서 마지막 교환에 바뀐 경로의 표시 */
function changeTag(change: RouteChangeView | undefined): "새로" | "바뀜" | undefined {
  if (change?.after === undefined) return undefined;
  return change.before === undefined ? "새로" : "바뀜";
}

export function RouterRoutingTable({ view, changes }: {
  readonly view: RouterView;
  /** 마지막 경로 교환에서 이 Router의 바뀐 경로 */
  readonly changes: readonly RouteChangeView[];
}) {
  const routes = [...view.routingTable].sort(byNetwork);
  const changed = new Map(changes.map((change) => [keyOf(change), change]));
  return (
    <>
      <h4>라우팅 테이블</h4>
      {routes.length === 0 ? (
        <div className="sub">인터페이스에 IP를 넣으면 경로가 생겨요</div>
      ) : (
        <div className="routes">
          {routes.map((route) => {
            const tag = route.source === "rip" ? changeTag(changed.get(keyOf(route))) : undefined;
            const metric = route.source === "connected" ? undefined : `[${route.distance}/${route.metric}]`;
            return (
              <div key={`${route.source}-${keyOf(route)}-${route.nextHop ?? ""}`} className="route-row">
                <span className="route-main">
                  <span className="code">{SOURCE_CODE[route.source]}</span>
                  <span>{destination(route)}</span>
                  <span className="hop">
                    {route.nextHop ?? "직접"} {route.port === undefined ? "" : shortPortName(route.port)}
                  </span>
                </span>
                {(metric !== undefined || tag !== undefined) && (
                  <span className="route-meta">
                    {metric !== undefined && <span className="metric">{metric}</span>}
                    {tag !== undefined && <span className={tag === "새로" ? "route-tag new" : "route-tag changed"}>{tag}</span>}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function hopText(document: TopologyDocument, hop: RipRouteHop): string {
  const name = ownerName(document, hop.nextHop);
  return `${name === undefined ? "" : `${name} `}(${hop.nextHop}) [120/${hop.metric}]`;
}

export function RouteExchange({ document, summary, changes, onPlay }: {
  readonly document: TopologyDocument;
  readonly summary: RipSummary;
  /** 마지막 경로 교환에서 이 Router의 바뀐 경로 */
  readonly changes: readonly RouteChangeView[];
  /** 없으면 실시간 모드다: 버튼을 끄고 시뮬레이션 모드를 안내한다 (T0.13) */
  readonly onPlay?: ((traceId: number) => void) | undefined;
}) {
  return (
    <>
      <h4>경로 교환</h4>
      <div className="exchange">
        <div className="exchange-head">
          마지막 교환 · 추적 #{summary.id}
          {onPlay !== undefined ? (
            <button type="button" className="play" onClick={() => onPlay(summary.id)} aria-label="경로 교환 재생">
              ▶ 재생
            </button>
          ) : (
            // disabled 대신 aria-disabled: 꺼진 버튼에도 안내(title)가 뜨고 키보드로 닿는다
            <button type="button" className="play off" aria-disabled="true" aria-label="경로 교환 재생"
              title={PLAY_IN_SIMULATION}>
              ▶ 재생
            </button>
          )}
        </div>
        <div className="exchange-sum">
          Router {summary.routers}대 · 배운 경로 {summary.learned}
          <br />
          새로 {summary.added} · 바뀜 {summary.changed} · 사라짐 {summary.removed}
        </div>
        {changes.length === 0 ? (
          <div className="exchange-change">이 Router는 바뀐 경로가 없어요</div>
        ) : (
          changes.map((change) => {
            const { before, after } = change;
            const learnedFrom = before === undefined ? undefined : ownerName(document, before.nextHop) ?? before.nextHop;
            return (
              <div key={keyOf(change)} className="exchange-change">
                <span className="net">{destination(change)}</span>
                {after === undefined && <> <span className="gone">사라짐</span></>}
                {before !== undefined && after !== undefined && <><br /><span className="old">{hopText(document, before)}</span></>}
                {after !== undefined && <><br />{before === undefined ? "새로 " : "→ "}{hopText(document, after)}</>}
                {after === undefined && learnedFrom !== undefined && <><br />{learnedFrom}에서 배웠음</>}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

/** 이 Router가 RIP를 켰고 교환 요약이 목록에 남아 있을 때만 경로 교환 묶음을 보인다 */
export function ripSummaryFor(device: RouterDevice, traces: readonly TraceSummary[]): RipSummary | undefined {
  if (device.config.rip === undefined) return undefined;
  return traces.find((summary): summary is RipSummary => summary.kind === "rip");
}
