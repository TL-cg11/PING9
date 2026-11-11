// 오른쪽 속성 패널. 시안의 selectDevice가 만드는 마크업과 클래스를 따른다.
// 구성 값은 스냅샷의 Document에서, 포트 상태와 테이블은 스냅샷의 views에서 읽는다 (AD-7).

import { shortPortName } from "@ping9/shared";
import type { Command, DeviceKind, DispatchResult, PortView, RouteChangeView, Snapshot, TopologyDocument } from "@ping9/shared";

import { DeviceName } from "./device-name";
import { PcSettings } from "./pc-settings";
import { ripSummaryFor, RouteExchange, RouterRoutingTable } from "./router-inspector";
import { SwitchMacTable, SwitchVlanList } from "./switch-inspector";
import { SwitchPortTag, trunkAllowedText } from "./switch-port-tag";

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
  onDispatch,
  onRemove,
  removeAsk = false,
  onConfirmRemove,
  onCancelRemove,
  routeChangesOf = () => undefined,
  onPlayExchange,
}: {
  readonly snapshot: Snapshot;
  readonly deviceId: string | null;
  readonly onOpenTerminal: (deviceId: string) => void;
  /** 설정 입력을 Document에 반영하는 길. Simulator의 dispatch다 (AD-3) */
  readonly onDispatch: (command: Command) => DispatchResult;
  /** "장비 삭제"를 눌렀을 때. 없으면 버튼을 그리지 않는다 (T1.3.3, FR-11) */
  readonly onRemove?: (deviceId: string) => void;
  /** 케이블이 연결된 장비라 지우기 전에 한 번 더 묻는 중이다 (T1.4.3) */
  readonly removeAsk?: boolean;
  readonly onConfirmRemove?: () => void;
  readonly onCancelRemove?: () => void;
  /** 경로 교환 Trace에서 바뀐 경로 (`Simulator.getRouteChanges`, T11.5.1) */
  readonly routeChangesOf?: (traceId: number) => readonly RouteChangeView[] | undefined;
  /** 경로 교환 Trace를 캔버스에서 재생한다. 없으면(실시간 모드) 재생 버튼이 꺼진다 (T0.13) */
  readonly onPlayExchange?: ((traceId: number) => void) | undefined;
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
  const rip = device.kind === "router" ? ripSummaryFor(device, snapshot.traces) : undefined;
  const changes = rip === undefined ? [] :
    (routeChangesOf(rip.id) ?? []).filter((change) => change.device.deviceId === device.id);

  return (
    <aside className="inspector">
      {/* 바로 아래 PcSettings도 장비 ID를 key로 쓴다. 형제끼리 key가 겹치지 않게 앞에 말을 붙인다 */}
      <DeviceName key={`name ${device.id}`} device={device} kindLabel={KIND_LABEL[device.kind]} onDispatch={onDispatch} />
      <div className="sub">
        포트 {view.ports.length}개 · {linked}개 연결
      </div>

      {device.kind === "pc" && <PcSettings key={device.id} device={device} onDispatch={onDispatch} />}
      {device.kind === "switch" && <SwitchVlanList config={device.config} />}

      <h4>{device.kind === "switch" ? "포트" : "인터페이스"}</h4>
      {view.ports.map((port) => (
        <div key={port.name} className="if-row">
          <span className={port.status === "up" ? "dot" : "dot off"} />
          {shortPortName(port.name)}
          {device.kind === "router" && <span className="port-state">{port.status}</span>}
          {device.kind === "switch" && <SwitchPortTag config={device.config} port={port.name} />}
          <span className="ip">
            {(device.kind === "switch" ? trunkAllowedText(device.config, port.name) : undefined) ??
              peerName(document, device.id, port) ??
              "연결 없음"}
          </span>
        </div>
      ))}

      {view.kind === "switch" && <SwitchMacTable view={view} />}
      {view.kind === "router" && <RouterRoutingTable view={view} changes={changes} />}
      {rip !== undefined && <RouteExchange document={document} summary={rip} changes={changes} onPlay={onPlayExchange} />}

      <button className="open-term" onClick={() => onOpenTerminal(device.id)}>
        터미널 열기
      </button>
      {onRemove !== undefined && (removeAsk ? (
        <div className="remove-ask" role="group" aria-label="장비 삭제 확인">
          <p>{device.name}에 연결된 케이블 {linked}개도 함께 지워요. 되돌릴 수 없어요.</p>
          {/* Enter를 누르고 있어서 반복된 입력이 "장비 삭제"에 이어 이 버튼까지 누르지 않게 한다 */}
          <button type="button" className="remove-device" autoFocus onClick={onConfirmRemove}
            onKeyDown={(event) => { if (event.repeat) event.preventDefault(); }}>삭제</button>
          <button type="button" className="remove-cancel" onClick={onCancelRemove}>취소</button>
        </div>
      ) : (
        <button type="button" className="remove-device" onClick={() => onRemove(device.id)}>장비 삭제</button>
      ))}
    </aside>
  );
}
