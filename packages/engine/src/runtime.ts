// T1.8.3: Runtime. kernel 하나와 장비별 모델, 보관 중인 추적을 들고 있다 (03 문서 3.4절).
// Document는 Simulator가 들고 있고, Runtime은 매번 getDocument()로 읽는다.
// PC·Switch·Router 모델을 함께 보관한다.

import { isIcmpError, LIMITS, parseIpv4, pingRoundKind } from "@ping9/shared";
import type {
  ArpEntryView,
  DeviceView,
  ErrorInfo,
  MacTableEntryView,
  RipRouteHop,
  RouteChangeView,
  RouteEntryView,
  TopologyDocument,
  Trace,
  TraceSummary,
} from "@ping9/shared";
import { errorInfo } from "@ping9/shared";

import { PC_PORT, PcModel } from "./devices/pc/pc-model";
import { deviceRun } from "./devices/link";
import type { DeviceModel } from "./devices/model";
import { RouterModel } from "./devices/router/router-model";
import { SwitchModel } from "./devices/switch/switch-model";
import { createKernel } from "./kernel";
import { deviceRef, findDevice } from "./topology";

/** ping 한 회차의 결과. 결과 줄은 OS별 출력(cli/pc/ping-output)이 만든다 */
export type PingRound =
  | { readonly kind: "icmp-error"; readonly traceId: number; readonly sequence: number; readonly sourceIp: string;
      readonly error: "destination-unreachable" | "time-exceeded" }
  /** 응답을 받음. 시간은 회차 시작부터 응답을 받기까지의 가상 µs, TTL은 받은 응답의 값 */
  | { readonly kind: "reply"; readonly traceId: number; readonly sequence: number; readonly timeUs: number; readonly ttl: number }
  /** 출발 PC의 ARP 요청에 응답이 없음 (ARP_TIMEOUT) */
  | { readonly kind: "unreachable"; readonly traceId: number; readonly sequence: number }
  /** 보냈는데 응답이 오지 않음 */
  | { readonly kind: "timeout"; readonly traceId: number; readonly sequence: number }
  /** 출발 PC가 보내지 못함 (NO_IP, NO_GATEWAY) */
  | { readonly kind: "unsent"; readonly traceId: number; readonly sequence: number };

export type PingRun =
  | { readonly ok: true; readonly rounds: readonly PingRound[] }
  | { readonly ok: false; readonly error: ErrorInfo };

export interface PingRequest {
  readonly deviceId: string;
  readonly targetIp: string;
  readonly count: number;
  /** 보내지 못한 회차가 나오면 거기서 멈춘다 (Linux의 `connect: Network is unreachable`) */
  readonly stopOnUnsent: boolean;
}

export interface Runtime {
  /** 문서를 새로 열었다. kernel 시각과 추적 번호, 모델, 추적 목록을 처음으로 */
  reset(): void;
  /** Document가 바뀌었다. 모델에 알리고 사라진 장비의 모델을 버린다. ARP·MAC 테이블이 바뀌었으면 true */
  configChanged(previous: TopologyDocument, document: TopologyDocument): boolean;
  /** ping. 회차마다 Trace 하나를 보관한다. PC·Switch·Router를 통과한 추적을 보관한다 */
  ping(request: PingRequest, docVersion: number): PingRun;
  arpTable(deviceId: string): readonly ArpEntryView[];
  /** `arp -d`. IP를 주면 그 항목만. 지운 것이 있으면 true */
  clearArp(deviceId: string, ip?: string): boolean;
  /** Switch가 배운 MAC 주소. Switch가 아니거나 아직 아무것도 지나지 않았으면 빈 목록 */
  macTable(deviceId: string): readonly MacTableEntryView[];
  /** Router가 지금 쓰는 라우팅 테이블. 배운 RIP 경로를 포함한다 (T11.2.2). Router가 아니면 빈 목록 */
  routingTable(deviceId: string): readonly RouteEntryView[];
  /**
   * 경로 교환 1회 (T11.2.2). RIP를 켠 Router마다 배운 경로를 지우고 Request부터 다시 주고받는다.
   * RIP를 켠 Router가 없으면 실행하지 않고 null. Trace는 목록에 `kind: "rip"`으로 보관하고, 앞의 RIP Trace를 바꾼다 (T11.2.3)
   */
  exchangeRoutes(docVersion: number): Trace | null;
  /** computeViews의 결과에 모델이 가진 테이블을 채운다 */
  fillViews(views: Record<string, DeviceView>): Record<string, DeviceView>;
  traceSummaries(): readonly TraceSummary[];
  getTrace(traceId: number): Trace | undefined;
  /** 그 경로 교환으로 바뀐 RIP 경로 (T11.3.1). 그 교환의 Trace가 목록에 없거나 ping Trace면 undefined */
  routeChanges(traceId: number): readonly RouteChangeView[] | undefined;
}

interface StoredTrace {
  readonly trace: Trace;
  readonly summary: TraceSummary;
  /** 경로 교환일 때 바뀐 RIP 경로 */
  readonly routeChanges?: readonly RouteChangeView[];
}

/** Router별, 네트워크별 RIP 경로. 키는 `network/mask` */
type RipRoutes = ReadonlyMap<string, ReadonlyMap<string, RipRouteHop>>;

export function createRuntime(getDocument: () => TopologyDocument): Runtime {
  const kernel = createKernel();
  const pcs = new Map<string, PcModel>();
  const routers = new Map<string, RouterModel>();
  const switches = new Map<string, SwitchModel>();
  // 가장 최근 것이 앞. 최대 LIMITS.maxTraces개
  let traces: readonly StoredTrace[] = [];
  // 마지막 경로 교환 뒤의 RIP 경로. 다음 교환과 비교한다 (T11.3.1)
  let lastRipRoutes: RipRoutes = new Map();

  /** 문서의 PC마다 모델이 있게 한다. 모델은 처음 쓸 때 만든다 */
  const pcModel = (deviceId: string): PcModel | undefined => {
    let model = pcs.get(deviceId);
    if (model === undefined && findDevice(getDocument(), deviceId)?.kind === "pc") {
      model = new PcModel(deviceId, getDocument);
      pcs.set(deviceId, model);
    }
    return model;
  };

  const routerModel = (deviceId: string): RouterModel | undefined => {
    let model = routers.get(deviceId);
    if (model === undefined && findDevice(getDocument(), deviceId)?.kind === "router") {
      model = new RouterModel(deviceId, getDocument);
      routers.set(deviceId, model);
    }
    return model;
  };

  const switchModel = (deviceId: string): SwitchModel | undefined => {
    let model = switches.get(deviceId);
    if (model === undefined && findDevice(getDocument(), deviceId)?.kind === "switch") {
      model = new SwitchModel(deviceId, getDocument, () => kernel.now());
      switches.set(deviceId, model);
    }
    return model;
  };

  /** 이번 실행에 쓸 PC·Switch·Router 모델 */
  const runModels = (): Map<string, DeviceModel> => {
    const models = new Map<string, DeviceModel>();
    for (const device of getDocument().devices) {
      if (device.kind === "pc") models.set(device.id, pcModel(device.id)!);
      else if (device.kind === "router") models.set(device.id, routerModel(device.id)!);
      else models.set(device.id, switchModel(device.id)!);
    }
    return models;
  };

  /** 문서의 모든 Router가 지금 라우팅 테이블에 쓰는 RIP 경로. RIP를 끈 Router도 넣어 사라진 경로가 보이게 한다 */
  const currentRipRoutes = (): RipRoutes => {
    const result = new Map<string, ReadonlyMap<string, RipRouteHop>>();
    for (const device of getDocument().devices) {
      if (device.kind !== "router") continue;
      const routes = new Map<string, RipRouteHop>();
      for (const route of routerModel(device.id)!.routingTable()) {
        if (route.source !== "rip") continue;
        routes.set(`${route.network}/${route.mask}`, { nextHop: route.nextHop!, port: route.port!, metric: route.metric });
      }
      result.set(device.id, routes);
    }
    return result;
  };

  const store = (stored: StoredTrace): void => {
    traces = [stored, ...traces].slice(0, LIMITS.maxTraces);
  };

  return {
    reset() {
      kernel.reset();
      pcs.clear();
      routers.clear();
      switches.clear();
      traces = [];
      lastRipRoutes = new Map();
    },

    configChanged(previous, document) {
      let changed = false;
      for (const [deviceId, model] of routers) {
        const before = model.arpTable();
        if (findDevice(document, deviceId)?.kind !== "router") { routers.delete(deviceId); changed ||= before.length > 0; continue; }
        model.onConfigChanged({ previous, document });
        changed ||= model.arpTable().length !== before.length;
      }
      for (const [deviceId, model] of pcs) {
        if (findDevice(document, deviceId)?.kind !== "pc") {
          pcs.delete(deviceId);
          // 지운 장비의 ARP 항목은 화면에서도 사라진다
          changed ||= model.arp.view().length > 0;
          continue;
        }
        const before = model.arp.view();
        model.onConfigChanged({ previous, document });
        changed ||= model.arp.view().length !== before.length;
      }
      for (const [deviceId, model] of switches) {
        if (findDevice(document, deviceId)?.kind !== "switch") {
          switches.delete(deviceId);
          changed ||= model.macTable().length > 0;
          continue;
        }
        const before = model.macTable();
        model.onConfigChanged({ previous, document });
        changed ||= model.macTable().length !== before.length;
      }
      return changed;
    },

    ping(request, docVersion) {
      const document = getDocument();
      const source = findDevice(document, request.deviceId);
      const model = pcModel(request.deviceId) ?? routerModel(request.deviceId);
      if (source === undefined || model === undefined) {
        return { ok: false, error: errorInfo("DEVICE_NOT_FOUND", { deviceId: request.deviceId }) };
      }

      const rounds: PingRound[] = [];
      const made: StoredTrace[] = [];
      for (let sequence = 1; sequence <= request.count; sequence += 1) {
        const models = runModels();
        const trace = kernel.run(deviceRun({
            docVersion,
            models,
            start: (ctx) => {
              for (const pc of pcs.values()) pc.startRun();
              for (const router of routers.values()) router.startRun();
              if (model instanceof PcModel) model.ipv4.sendEcho(ctx, PC_PORT, request.targetIp, sequence);
              else model.sendEcho(ctx, request.targetIp, sequence);
            },
            outcome: () => ((model instanceof PcModel ? model.ipv4.repliesReceived() : model.repliesReceived()).includes(sequence) ? "success" : "failed"),
          }));

        made.push({
          trace,
          summary: {
            id: trace.id,
            docVersion,
            kind: "ping",
            status: trace.result.status,
            eventCount: trace.events.length,
            source: deviceRef(source),
            targetIp: request.targetIp,
          },
        });
        const round = roundOf(trace, request.deviceId, sequence, request.targetIp);
        rounds.push(round);
        if (round.kind === "unsent" && request.stopOnUnsent) break;
      }

      for (const stored of made) store(stored);
      return { ok: true, rounds };
    },

    arpTable(deviceId) {
      return pcs.get(deviceId)?.arp.view() ?? routers.get(deviceId)?.arpTable() ?? [];
    },

    clearArp(deviceId, ip) {
      const router = routers.get(deviceId);
      if (router !== undefined) {
        const before = router.arpTable(); router.clearArp(ip);
        return router.arpTable().length !== before.length;
      }
      const model = pcs.get(deviceId);
      if (model === undefined) return false;
      const before = model.arp.view();
      if (ip !== undefined && !before.some((entry) => entry.ip === ip)) return false;
      model.arp.clear(ip);
      return before.length > 0;
    },

    macTable(deviceId) {
      return switches.get(deviceId)?.macTable() ?? [];
    },

    routingTable(deviceId) {
      return routerModel(deviceId)?.routingTable() ?? [];
    },

    exchangeRoutes(docVersion) {
      const ripRouters = getDocument().devices.filter(device => device.kind === "router" && device.config.rip !== undefined);
      if (ripRouters.length === 0) return null;
      const models = runModels();
      const trace = kernel.run(deviceRun({
        docVersion,
        models,
        start: (ctx) => {
          for (const pc of pcs.values()) pc.startRun();
          for (const router of routers.values()) router.startRun();
          for (const device of ripRouters) routerModel(device.id)!.startRipExchange(ctx);
        },
        outcome: () => "success",
      }));
      const learned = ripRouters.reduce((sum, device) =>
        sum + routerModel(device.id)!.routingTable().filter(route => route.source === "rip").length, 0);
      const ripRoutes = currentRipRoutes();
      const routeChanges = diffRipRoutes(getDocument(), lastRipRoutes, ripRoutes);
      lastRipRoutes = ripRoutes;
      // 목록에 RIP Trace는 가장 최근 것 하나만 둔다. 설정을 칠 때마다 ping 기록이 밀려나지 않게 한다 (결정 4)
      traces = traces.filter(stored => stored.summary.kind !== "rip");
      store({
        trace,
        summary: {
          id: trace.id, docVersion, kind: "rip", status: trace.result.status, eventCount: trace.events.length,
          routers: ripRouters.length, learned,
          added: routeChanges.filter(change => change.before === undefined).length,
          removed: routeChanges.filter(change => change.after === undefined).length,
          changed: routeChanges.filter(change => change.before !== undefined && change.after !== undefined).length,
        },
        routeChanges,
      });
      return trace;
    },

    fillViews(views) {
      for (const [deviceId, model] of routers) {
        const view = views[deviceId];
        if (view?.kind === "router") views[deviceId] = { ...view, arpTable: model.arpTable(), routingTable: model.routingTable() };
      }
      for (const [deviceId, model] of pcs) {
        const view = views[deviceId];
        if (view?.kind === "pc") views[deviceId] = { ...view, arpTable: model.arp.view() };
      }
      for (const [deviceId, model] of switches) {
        const view = views[deviceId];
        if (view?.kind === "switch") views[deviceId] = { ...view, macTable: model.macTable() };
      }
      return views;
    },

    traceSummaries() {
      return traces.map((stored) => stored.summary);
    },

    getTrace(traceId) {
      return traces.find((stored) => stored.trace.id === traceId)?.trace;
    },

    routeChanges(traceId) {
      return traces.find((stored) => stored.trace.id === traceId)?.routeChanges;
    },
  };
}

/** Trace에서 그 회차의 결과를 읽는다. 종류는 web과 같은 shared 규칙을 쓴다 */
function roundOf(trace: Trace, sourceId: string, sequence: number, targetIp: string): PingRound {
  const traceId = trace.id;
  const kind = pingRoundKind(trace, sourceId, sequence);
  if (kind === "icmp-error") {
    const failure = trace.events.find(event => event.deviceId === sourceId &&
      event.reason.code === "ICMP_ERROR_RECEIVED" && isIcmpError(event.frame.icmp) &&
      event.frame.icmp.original.destinationIp === targetIp && event.frame.icmp.original.sequence === sequence);
    if (failure !== undefined && isIcmpError(failure.frame.icmp)) {
      return { kind, traceId, sequence, sourceIp: failure.frame.ipv4!.sourceIp, error: failure.frame.icmp.type };
    }
    return { kind: "timeout", traceId, sequence };
  }
  if (kind !== "reply") return { kind, traceId, sequence };
  const reply = trace.events.find(
    (event) =>
      event.deviceId === sourceId &&
      event.reason.code === "ICMP_ECHO_REPLY_RECEIVED" &&
      event.frame.icmp?.sequence === sequence,
  );
  return { kind: "reply", traceId, sequence, timeUs: reply?.time ?? 0, ttl: reply?.frame.ipv4?.ttl ?? 0 };
}

/**
 * 교환 전후의 RIP 경로를 비교한다 (T11.3.1). 지금 문서에 있는 Router만, 문서 순서와 네트워크 주소 순.
 * 지운 Router의 경로는 넣지 않는다
 */
function diffRipRoutes(document: TopologyDocument, before: RipRoutes, after: RipRoutes): RouteChangeView[] {
  const changes: RouteChangeView[] = [];
  for (const device of document.devices) {
    if (device.kind !== "router") continue;
    const old = before.get(device.id) ?? new Map<string, RipRouteHop>();
    const now = after.get(device.id) ?? new Map<string, RipRouteHop>();
    const keys = [...new Set([...old.keys(), ...now.keys()])].sort(byNetwork);
    for (const key of keys) {
      const was = old.get(key);
      const is = now.get(key);
      if (was !== undefined && is !== undefined && was.nextHop === is.nextHop && was.port === is.port && was.metric === is.metric) continue;
      const [network, mask] = key.split("/") as [string, string];
      changes.push({
        device: deviceRef(device), network, mask,
        ...(was === undefined ? {} : { before: was }),
        ...(is === undefined ? {} : { after: is }),
      });
    }
  }
  return changes;
}

/** `network/mask` 키를 네트워크 주소, 긴 마스크 순으로 */
function byNetwork(a: string, b: string): number {
  const [networkA, maskA] = a.split("/") as [string, string];
  const [networkB, maskB] = b.split("/") as [string, string];
  return (parseIpv4(networkA)! - parseIpv4(networkB)!) || (parseIpv4(maskB)! - parseIpv4(maskA)!);
}
