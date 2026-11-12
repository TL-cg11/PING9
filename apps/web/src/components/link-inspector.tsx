import type { Link, TopologyDocument } from "@ping9/shared";
import type { ReactNode } from "react";

export function LinkInspector({ document, link, onRemove, header }: {
  readonly document: TopologyDocument;
  readonly link: Link;
  readonly onRemove: () => void;
  /** 시뮬레이션 모드의 상세 정보 / 이벤트 탭 (T1.9.2) */
  readonly header?: ReactNode;
}) {
  return (
    <aside className="inspector">
      {header}
      <div className="title"><h3>케이블 연결</h3></div>
      {link.ends.map((end, index) => (
        <div className="link-end" key={`${end.deviceId} ${end.port}`}>
          <h4>{index === 0 ? "첫 번째 연결점" : "두 번째 연결점"}</h4>
          <strong>{document.devices.find(device => device.id === end.deviceId)?.name ?? end.deviceId}</strong>
          <p>{end.port}</p>
        </div>
      ))}
      <button type="button" className="remove-link" onClick={onRemove}>케이블 삭제</button>
    </aside>
  );
}
