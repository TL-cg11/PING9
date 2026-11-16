// web과 engine의 경계 (AD-16). web이 engine에 대해 아는 것은 이 파일의 Simulator가 전부다.
// 출처: docs/project-plan/03-system-design.md 3.4절 "공개 인터페이스".

import { EMPTY_DOCUMENT, LIMITS, validateDocument } from "@ping9/shared";
import type {
  Command,
  DispatchResult,
  ErrorInfo,
  RouteChangeView,
  Snapshot,
  TopologyDocument,
  Trace,
} from "@ping9/shared";

import { INITIAL_SESSION } from "./cli/ios";
import type { CliSession, IosConsoleEnv, RuntimeAccess } from "./cli/ios";
import { initialFiles } from "./cli/pc";
import type { PcFiles } from "./cli/pc";
import { createConsolePort } from "./console";
import type { ConsolePort } from "./console";
import { deepFreeze } from "./freeze";
import { reduce } from "./reducer";
import { hasRipRouter, needsRouteExchange } from "./routing-inputs";
import { createRuntime } from "./runtime";
import { computeViews } from "./views";

export type LoadResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: ErrorInfo };

export interface Simulator {
  /**
   * 문서를 연다. Runtime과 Trace 목록을 빈 상태로 새로 만든다.
   * 문서가 `validateDocument()`를 통과하지 못하면 오류를 돌려주고 아무것도 바꾸지 않는다.
   */
  load(document: TopologyDocument): LoadResult;
  /** Document를 바꾼다. 동기식이다. 거부되면 아무것도 바뀌지 않는다 */
  dispatch(command: Command): DispatchResult;
  /** 장비의 콘솔. 같은 장비에는 항상 같은 객체를 돌려준다 */
  console(deviceId: string): ConsolePort;
  /** 현재 상태. 바뀐 것이 없으면 같은 참조를 돌려준다. 값은 얼어 있어 고칠 수 없다 */
  getSnapshot(): Snapshot;
  /** 보관 중인 추적. 없으면 undefined */
  getTrace(traceId: number): Trace | undefined;
  /**
   * 경로 교환 1회 (T11.2.2). RIP를 켠 Router끼리 경로를 처음부터 다시 주고받는다. RIP Router가 없으면 null.
   * RIP 결과가 바뀔 수 있는 dispatch와 load 뒤에는 저절로 돈다 (T11.2.3). Trace는 목록에 보관한다
   */
  exchangeRoutes(): Trace | null;
  /**
   * 그 경로 교환으로 바뀐 RIP 경로 (T11.3.1). 앞의 교환과 비교해 새로 배움(`before` 없음), 사라짐(`after` 없음), 바뀜.
   * 그 교환의 Trace가 목록에 없거나 ping Trace면 undefined
   */
  getRouteChanges(traceId: number): readonly RouteChangeView[] | undefined;
  /** 상태가 바뀔 때마다 불린다. 돌려주는 함수를 부르면 구독이 끝난다 */
  subscribe(listener: () => void): () => void;
}

export function createSimulator(): Simulator {
  let document: TopologyDocument = deepFreeze(EMPTY_DOCUMENT);
  let docVersion = 0;
  let runtimeVersion = 0;
  let snapshot: Snapshot | null = null;
  // kernel, 장비 모델(ARP 테이블), 보관 중인 추적 (T1.8.3)
  const runtime = createRuntime(() => document);

  const listeners = new Set<() => void>();
  const consoles = new Map<string, ConsolePort>();
  // 장비별 CLI 세션 (현재 모드, 설정 중인 대상). 스냅샷에 담지 않으며 바뀌어도 구독자를 부르지 않는다
  const sessions = new Map<string, CliSession>();
  // PC의 파일 트리 (T0.19). Runtime에만 있고 문서를 다시 열면 비운다
  const files = new Map<string, PcFiles>();

  const changed = (): void => {
    snapshot = null;
    for (const listener of [...listeners]) listener();
  };

  const dispatch = (command: Command): DispatchResult => {
    const result = reduce(document, command);
    if (!result.ok) return result;

    if (command.type === "router/set-cli-style") sessions.delete(command.deviceId);
    const previous = document;
    document = deepFreeze(result.document);
    docVersion += 1;
    // IP나 링크가 바뀐 PC의 ARP 테이블과 VLAN·링크가 바뀐 Switch 포트의 MAC 항목을 비운다.
    // 실제로 지워졌을 때만 Runtime이 바뀐 것이다
    if (runtime.configChanged(previous, document)) runtimeVersion += 1;
    // RIP 결과가 바뀔 수 있으면 경로 교환 1회 (T11.2.3). dispatch 하나에 많아야 1회
    if (needsRouteExchange(previous, document) && runtime.exchangeRoutes(docVersion) !== null) runtimeVersion += 1;
    changed();
    return { ok: true, notices: result.notices };
  };

  const runtimeChanged = (): void => {
    runtimeVersion += 1;
    changed();
  };

  // 콘솔의 ping과 ARP 명령어가 쓰는 것. Document는 바꾸지 않고 Runtime만 바꾼다
  const runtimeAccess: RuntimeAccess = {
    ping(request) {
      const run = runtime.ping(request, docVersion);
      if (run.ok && run.rounds.length > 0) runtimeChanged();
      return run;
    },
    traceroute(request) {
      const run = runtime.traceroute(request, docVersion);
      if (run.ok && run.rounds.length > 0) runtimeChanged();
      return run;
    },
    arpTable: (deviceId) => runtime.arpTable(deviceId),
    macTable: (deviceId) => runtime.macTable(deviceId),
    routingTable: (deviceId) => runtime.routingTable(deviceId),
    ipsecSa: (deviceId) => runtime.ipsecSa(deviceId),
    exchangeRoutes() {
      const trace = runtime.exchangeRoutes(docVersion);
      if (trace !== null) runtimeChanged();
      return trace !== null;
    },
    clearArp(deviceId, ip) {
      const cleared = runtime.clearArp(deviceId, ip);
      if (cleared) runtimeChanged();
      return cleared;
    },
  };

  // 콘솔이 Simulator에서 받아 쓰는 것. CLI의 설정 명령어도 공개 dispatch와 같은 경로로 Document를 바꾼다 (AD-3)
  const consoleEnv: IosConsoleEnv = {
    getDocument: () => document,
    dispatch,
    getSession: (deviceId) => sessions.get(deviceId) ?? INITIAL_SESSION,
    setSession: (deviceId, session) => {
      sessions.set(deviceId, session);
    },
    getFiles: (deviceId, os) => {
      const stored = files.get(deviceId);
      return stored !== undefined && stored.os === os ? stored : initialFiles(os);
    },
    setFiles: (deviceId, tree) => {
      files.set(deviceId, tree);
    },
    runtime: runtimeAccess,
  };

  return {
    load(input) {
      const result = validateDocument(input);
      if (!result.ok) return result;

      // 검증 함수가 돌려준 값을 쓴다. 넣은 값과 다른 객체라 호출한 쪽의 값은 얼지 않는다
      document = deepFreeze(result.document);
      docVersion += 1;
      runtimeVersion += 1;
      runtime.reset();
      sessions.clear();
      files.clear();
      // 배운 경로는 저장하지 않는다. 열자마자 다시 배운다 (T11.2.3 결정 2)
      if (hasRipRouter(document)) runtime.exchangeRoutes(docVersion);
      changed();
      return { ok: true };
    },

    dispatch,

    console(deviceId) {
      let port = consoles.get(deviceId);
      if (port === undefined) {
        port = createConsolePort(deviceId, consoleEnv);
        consoles.set(deviceId, port);
      }
      return port;
    },

    getSnapshot() {
      snapshot ??= deepFreeze({
        document,
        docVersion,
        runtimeVersion,
        views: runtime.fillViews(computeViews(document)),
        traces: runtime.traceSummaries().slice(0, LIMITS.maxTraces),
      });
      return snapshot;
    },

    getTrace(traceId) {
      return runtime.getTrace(traceId);
    },

    getRouteChanges(traceId) {
      return runtime.routeChanges(traceId);
    },

    exchangeRoutes() {
      const trace = runtime.exchangeRoutes(docVersion);
      if (trace !== null) runtimeChanged();
      return trace;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
