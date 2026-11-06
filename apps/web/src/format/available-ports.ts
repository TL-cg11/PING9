import { PORT_NAMES } from "@ping9/shared";
import type { TopologyDocument } from "@ping9/shared";

/** 켜짐/꺼짐과 관계없이 케이블에 사용되지 않은 포트만, 장비의 포트 순서대로 반환한다. */
export function availablePorts(document: TopologyDocument, deviceId: string): readonly string[] {
  const device = document.devices.find(candidate => candidate.id === deviceId);
  if (device === undefined) return [];
  const used = new Set(document.links.flatMap(link => link.ends)
    .filter(end => end.deviceId === deviceId).map(end => end.port));
  return PORT_NAMES[device.kind].filter(port => !used.has(port));
}
