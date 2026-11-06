// 오른쪽 속성 패널. 시안의 selectDevice가 만드는 마크업과 클래스를 따른다.
// 구성 값은 스냅샷의 Document에서, 포트 상태와 테이블은 스냅샷의 views에서 읽는다 (AD-7).

import { shortPortName } from "@ping9/shared";
import type { DeviceKind, PortView, Snapshot, TopologyDocument } from "@ping9/shared";

import { SwitchMacTable, SwitchPortTag, SwitchVlanList, trunkAllowedText } from "./switch-inspector";

const KIND_LABEL: Readonly<Record<DeviceKind, string>> = { pc: "PC", switch: "Switch", router: "Router" };

/** 링크 반대쪽 장비의 이름. 링크가 없으면 undefined */
function peerName(document: TopologyDocument, deviceId: string, port: PortView): string | undefined {
  const link = document.links.find((candidate) => candidate.id === port.linkId);
  const peer = link?.ends.find((end) => end.deviceId !== deviceId);
  return document.devices.find((device) => device.id === peer?.deviceId)?.name;
}

export function Inspector({
  snapshot,
  deviceId,
  onOpenTerminal,
}: {
  readonly snapshot: Snapshot;
  readonly deviceId: string | null;
  readonly onOpenTerminal: (deviceId: string) => void;
}) {
  const { document } = snapshot;
  const device = document.devices.find((candidate) => candidate.id === deviceId);
  const view = device === undefined ? undefined : snapshot.views[device.id];

  if (device === undefined || view === undefined) {
    return (
      <aside className="inspector">
        <div className="sub">장비를 누르면 여기에 정보가 보여요</div>
      </aside>
    );
  }

  const linked = view.ports.filter((port) => port.linkId !== undefined).length;

  return (
    <aside className="inspector">
      <div className="title">
        <h3>{device.name}</h3>
        <span className="chip">{KIND_LABEL[device.kind]}</span>
      </div>
      <div className="sub">
        포트 {view.ports.length}개 · {linked}개 연결
      </div>

      {device.kind === "switch" && <SwitchVlanList config={device.config} />}

      <h4>{device.kind === "switch" ? "포트" : "인터페이스"}</h4>
      {view.ports.map((port) => (
        <div key={port.name} className="if-row">
          <span className={port.status === "up" ? "dot" : "dot off"} />
          {shortPortName(port.name)}
          {device.kind === "switch" && <SwitchPortTag config={device.config} port={port.name} />}
          <span className="ip">
            {(device.kind === "switch" ? trunkAllowedText(device.config, port.name) : undefined) ??
              peerName(document, device.id, port) ??
              "연결 없음"}
          </span>
        </div>
      ))}

      {view.kind === "switch" && <SwitchMacTable view={view} />}

      <button className="open-term" onClick={() => onOpenTerminal(device.id)}>
        터미널 열기
      </button>
    </aside>
  );
}
