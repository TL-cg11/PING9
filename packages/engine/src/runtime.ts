// T1.8.3: Runtime. kernel 하나와 장비별 모델, 보관 중인 추적을 들고 있다 (03 문서 3.4절).
// Document는 Simulator가 들고 있고, Runtime은 매번 getDocument()로 읽는다.
// PC 모델(T1.8.3)과 Switch 모델(T5.2.2)이 있다. Router 모델은 E4에서 더한다.

import { LIMITS, pingRoundKind } from "@ping9/shared";
import type {
  ArpEntryView,
  DeviceKind,
  DeviceView,
  ErrorInfo,
  MacTableEntryView,
  TopologyDocument,
  Trace,
  TraceSummary,
} from "@ping9/shared";
import { errorInfo } from "@ping9/shared";

import { PC_PORT, PcModel } from "./devices/pc/pc-model";
import { deviceRun } from "./devices/link";
import type { DeviceModel } from "./devices/model";
import { SwitchModel } from "./devices/switch/switch-model";
import { createKernel } from "./kernel";
import { deviceRef, findDevice } from "./topology";

/** ping 한 회차의 결과. 결과 줄은 OS별 출력(cli/pc/ping-output)이 만든다 */
export type PingRound =
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
  /** ping. 회차마다 Trace 하나를 보관한다. 아직 모델이 없는 장비를 지나면 오류를 돌려주고 추적을 남기지 않는다 */
  ping(request: PingRequest, docVersion: number): PingRun;
  arpTable(deviceId: string): readonly ArpEntryView[];
  /** `arp -d`. IP를 주면 그 항목만. 지운 것이 있으면 true */
  clearArp(deviceId: string, ip?: string): boolean;
  /** Switch가 배운 MAC 주소. Switch가 아니거나 아직 아무것도 지나지 않았으면 빈 목록 */
  macTable(deviceId: string): readonly MacTableEntryView[];
  /** computeViews의 결과에 모델이 가진 테이블을 채운다 */
  fillViews(views: Record<string, DeviceView>): Record<string, DeviceView>;
  traceSummaries(): readonly TraceSummary[];
  getTrace(traceId: number): Trace | undefined;
}

interface StoredTrace {
  readonly trace: Trace;
  readonly summary: TraceSummary;
}

/** 아직 모델이 없는 장비 종류 */
type UnsupportedKind = Exclude<DeviceKind, "pc" | "switch">;

/** 프레임이 아직 모델이 없는 장비에 도착했다. Runtime이 잡아 PING_DEVICE_UNSUPPORTED로 바꾼다 */
class UnsupportedDevice extends Error {
  constructor(
    readonly kind: UnsupportedKind,
    readonly deviceName: string,
  ) {
    super(`No device model for ${kind} ${deviceName} yet`);
  }
}

/**
 * Router 자리. 프레임이 도착하면 조용히 버리지 않고 실행을 멈춘다.
 * 조용히 버리면 평범한 실패로 보여 학습자가 자기 설정이 틀렸다고 잘못 배운다 (설계 10절 12)
 */
class MissingModel implements DeviceModel {
  constructor(
    readonly deviceId: string,
    readonly kind: UnsupportedKind,
    readonly deviceName: string,
  ) {}

  // 매개변수가 없어도 DeviceModel의 onFrame·onTimer 자리에 맞는다
  onFrame(): void {
    throw new UnsupportedDevice(this.kind, this.deviceName);
  }

  onTimer(): void {
    throw new UnsupportedDevice(this.kind, this.deviceName);
  }

  onConfigChanged(): void {}

  view(): DeviceView {
    throw new Error("MissingModel has no view");
  }
}

export function createRuntime(getDocument: () => TopologyDocument): Runtime {
  const kernel = createKernel();
  const pcs = new Map<string, PcModel>();
  const switches = new Map<string, SwitchModel>();
  // 가장 최근 것이 앞. 최대 LIMITS.maxTraces개
  let traces: readonly StoredTrace[] = [];

  /** 문서의 PC마다 모델이 있게 한다. 모델은 처음 쓸 때 만든다 */
  const pcModel = (deviceId: string): PcModel | undefined => {
    let model = pcs.get(deviceId);
    if (model === undefined && findDevice(getDocument(), deviceId)?.kind === "pc") {
      model = new PcModel(deviceId, getDocument);
      pcs.set(deviceId, model);
    }
    return model;
  };

  /** Switch 모델도 처음 쓸 때 만든다. 화면용 테이블의 만료 판단에 kernel의 시각을 쓴다 */
  const switchModel = (deviceId: string): SwitchModel | undefined => {
    let model = switches.get(deviceId);
    if (model === undefined && findDevice(getDocument(), deviceId)?.kind === "switch") {
      model = new SwitchModel(deviceId, getDocument, () => kernel.now());
      switches.set(deviceId, model);
    }
    return model;
  };

  /** 이번 실행에 쓸 장비별 모델. 아직 모델이 없는 종류(Router)는 MissingModel이다 */
  const runModels = (): Map<string, DeviceModel> => {
    const models = new Map<string, DeviceModel>();
    for (const device of getDocument().devices) {
      switch (device.kind) {
        case "pc":
          models.set(device.id, pcModel(device.id)!);
          break;
        case "switch":
          models.set(device.id, switchModel(device.id)!);
          break;
        case "router":
          models.set(device.id, new MissingModel(device.id, device.kind, device.name));
          break;
      }
    }
    return models;
  };

  const store = (stored: StoredTrace): void => {
    traces = [stored, ...traces].slice(0, LIMITS.maxTraces);
  };

  return {
    reset() {
      kernel.reset();
      pcs.clear();
      switches.clear();
      traces = [];
    },

    configChanged(previous, document) {
      let changed = false;
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
      const model = pcModel(request.deviceId);
      if (source === undefined || model === undefined) {
        return { ok: false, error: errorInfo("DEVICE_NOT_FOUND", { deviceId: request.deviceId }) };
      }

      const rounds: PingRound[] = [];
      const made: StoredTrace[] = [];
      for (let sequence = 1; sequence <= request.count; sequence += 1) {
        const models = runModels();
        // 실행이 중간에 멈추면 Switch가 그 사이에 배운 것도 되돌린다. 남기지 않는 ping의 흔적이다
        const restoreSwitches = [...switches.values()].map((model) => model.checkpoint());
        let trace: Trace;
        try {
          trace = kernel.run(deviceRun({
            docVersion,
            models,
            start: (ctx) => {
              for (const pc of pcs.values()) pc.startRun();
              model.ipv4.sendEcho(ctx, PC_PORT, request.targetIp, sequence);
            },
            outcome: () => (model.ipv4.repliesReceived().includes(sequence) ? "success" : "failed"),
          }));
        } catch (error) {
          if (!(error instanceof UnsupportedDevice)) throw error;
          for (const restore of restoreSwitches) restore();
          // 이번 ping의 추적은 하나도 남기지 않는다. 앞 회차가 있었어도 결과가 반쪽이라 보이지 않는다
          return {
            ok: false,
            error: errorInfo("PING_DEVICE_UNSUPPORTED", { kind: error.kind, deviceName: error.deviceName }),
          };
        }

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
        const round = roundOf(trace, request.deviceId, sequence);
        rounds.push(round);
        if (round.kind === "unsent" && request.stopOnUnsent) break;
      }

      for (const stored of made) store(stored);
      return { ok: true, rounds };
    },

    arpTable(deviceId) {
      return pcs.get(deviceId)?.arp.view() ?? [];
    },

    clearArp(deviceId, ip) {
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

    fillViews(views) {
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
  };
}

/** Trace에서 그 회차의 결과를 읽는다. 종류는 shared의 규칙(web과 같음), 시간과 TTL은 받은 응답 이벤트의 값이다 */
function roundOf(trace: Trace, sourceId: string, sequence: number): PingRound {
  const traceId = trace.id;
  const kind = pingRoundKind(trace, sourceId, sequence);
  if (kind !== "reply") return { kind, traceId, sequence };
  const reply = trace.events.find(
    (event) =>
      event.deviceId === sourceId &&
      event.reason.code === "ICMP_ECHO_REPLY_RECEIVED" &&
      event.frame.icmp?.sequence === sequence,
  );
  return { kind, traceId, sequence, timeUs: reply?.time ?? 0, ttl: reply?.frame.ipv4?.ttl ?? 0 };
}
