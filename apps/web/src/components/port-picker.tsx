import type { Device, PortRef, TopologyDocument } from "@ping9/shared";

import { availablePorts } from "../format/available-ports";

export function PortPicker({ document, device, first, onPick, onClose }: {
  readonly document: TopologyDocument;
  readonly device: Device;
  readonly first: PortRef | null;
  readonly onPick: (end: PortRef) => void;
  readonly onClose: () => void;
}) {
  const ports = availablePorts(document, device.id);
  const sameDevice = first?.deviceId === device.id;
  return (
    <div className="port-picker" role="dialog" aria-label={`${device.name}의 빈 포트`}>
      <header><strong>{device.name} · 빈 포트</strong><button type="button" aria-label="포트 목록 닫기" onClick={onClose}>×</button></header>
      {sameDevice ? <p>다른 장비를 선택해 두 번째 포트를 골라 주세요.</p> : ports.length === 0
        ? <p>사용할 수 있는 포트가 없어요. 다른 장비를 고르거나 기존 케이블을 삭제해 주세요.</p>
        : <div className="port-options">{ports.map(port => <button key={port} type="button"
          onClick={() => onPick({ deviceId: device.id, port })}>{port}</button>)}</div>}
      <p className="port-step">{first === null ? "첫 번째 포트를 선택하세요" : "두 번째 포트를 선택하면 연결돼요"}</p>
    </div>
  );
}
