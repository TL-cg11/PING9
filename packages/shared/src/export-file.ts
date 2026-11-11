// 토폴로지를 파일로 내보낼 때의 겉 포장 (T7.1.1, FR-7). 가져오기(T7.1.2)가 같은 모양을 읽는다.
// 출처: docs/project-plan/04-tasks/epic-7-share.md T7.1.1 "파일 내용: { kind: "topology-export", name, document }"

import type { TopologyDocument } from "./document";

export const TOPOLOGY_EXPORT_KIND = "topology-export";

export interface TopologyExport {
  readonly kind: typeof TOPOLOGY_EXPORT_KIND;
  /** 토폴로지 이름. Document가 아니라 바깥(서버, 지금은 화면)이 가진 값이라 따로 둔다 */
  readonly name: string;
  readonly document: TopologyDocument;
}
