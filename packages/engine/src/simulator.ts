// web과 engine의 경계 (AD-16). web이 engine에 대해 아는 것은 이 파일의 Simulator가 전부다.
// 출처: docs/project-plan/03-system-design.md 3.4절 "공개 인터페이스".

import { EMPTY_DOCUMENT, LIMITS, validateDocument } from "@ping9/shared";
import type {
  Command,
  DispatchResult,
  ErrorInfo,
  Snapshot,
  TopologyDocument,
  Trace,
  TraceSummary,
} from "@ping9/shared";

import { createConsolePort } from "./console";
import type { ConsolePort } from "./console";
import { deepFreeze } from "./freeze";
import { reduce } from "./reducer";
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
  /** 상태가 바뀔 때마다 불린다. 돌려주는 함수를 부르면 구독이 끝난다 */
  subscribe(listener: () => void): () => void;
}

/** 추적 선택 목록에 보일 요약. kernel(T1.7.1)이 Trace를 만들 때 출발 장비와 목적지를 함께 넘긴다 */
interface StoredTrace {
  readonly trace: Trace;
  readonly summary: TraceSummary;
}

export function createSimulator(): Simulator {
  let document: TopologyDocument = deepFreeze(EMPTY_DOCUMENT);
  let docVersion = 0;
  let runtimeVersion = 0;
  // 가장 최근 것이 앞. 최대 LIMITS.maxTraces개
  let traces: readonly StoredTrace[] = [];
  let snapshot: Snapshot | null = null;

  const listeners = new Set<() => void>();
  const consoles = new Map<string, ConsolePort>();

  const changed = (): void => {
    snapshot = null;
    for (const listener of [...listeners]) listener();
  };

  return {
    load(input) {
      const result = validateDocument(input);
      if (!result.ok) return result;

      // 검증 함수가 돌려준 값을 쓴다. 넣은 값과 다른 객체라 호출한 쪽의 값은 얼지 않는다
      document = deepFreeze(result.document);
      docVersion += 1;
      runtimeVersion += 1;
      traces = [];
      changed();
      return { ok: true };
    },

    dispatch(command) {
      const result = reduce(document, command);
      if (!result.ok) return result;

      document = deepFreeze(result.document);
      docVersion += 1;
      changed();
      return { ok: true, notices: result.notices };
    },

    console(deviceId) {
      let port = consoles.get(deviceId);
      if (port === undefined) {
        port = createConsolePort(deviceId, () => document);
        consoles.set(deviceId, port);
      }
      return port;
    },

    getSnapshot() {
      snapshot ??= deepFreeze({
        document,
        docVersion,
        runtimeVersion,
        views: computeViews(document),
        traces: traces.slice(0, LIMITS.maxTraces).map((stored) => stored.summary),
      });
      return snapshot;
    },

    getTrace(traceId) {
      return traces.find((stored) => stored.trace.id === traceId)?.trace;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
