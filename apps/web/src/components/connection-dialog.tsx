import type { DispatchResult, ErrorInfo, PortRef, TopologyDocument } from "@ping9/shared";
import { useEffect, useRef, useState } from "react";

import { availablePorts } from "../format/available-ports";
import { formatError } from "../messages/errors";

export interface ConnectionDialogProps {
  readonly document: TopologyDocument;
  readonly initialDeviceId: string | null;
  readonly onConnect: (ends: readonly [PortRef, PortRef]) => DispatchResult;
  readonly onClose: () => void;
}

export function ConnectionDialog({ document, initialDeviceId, onConnect, onClose }: ConnectionDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [firstId, setFirstId] = useState(initialDeviceId ?? "");
  const [secondId, setSecondId] = useState("");
  const [firstPort, setFirstPort] = useState("");
  const [secondPort, setSecondPort] = useState("");
  const [error, setError] = useState<ErrorInfo | null>(null);

  // 기본 모달 동작으로 창 안에서 키보드 포커스를 유지하고 Escape로 취소한다.
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  const first = document.devices.find(device => device.id === firstId) ??
    document.devices.find(device => availablePorts(document, device.id).length > 0) ?? document.devices[0];
  const candidates = document.devices.filter(device => device.id !== first?.id);
  const second = candidates.find(device => device.id === secondId) ??
    candidates.find(device => availablePorts(document, device.id).length > 0) ?? candidates[0];
  const firstPorts = first === undefined ? [] : availablePorts(document, first.id);
  const secondPorts = second === undefined ? [] : availablePorts(document, second.id);
  const chosenFirst = firstPorts.includes(firstPort) ? firstPort : firstPorts[0] ?? "";
  const chosenSecond = secondPorts.includes(secondPort) ? secondPort : secondPorts[0] ?? "";
  const ready = first !== undefined && second !== undefined && chosenFirst !== "" && chosenSecond !== "";

  return (
    <dialog className="connection-dialog" ref={ref} aria-labelledby="connection-title"
      onCancel={event => { event.preventDefault(); onClose(); }}>
      <form onSubmit={event => {
        event.preventDefault();
        if (!ready) return;
        const result = onConnect([
          { deviceId: first.id, port: chosenFirst },
          { deviceId: second.id, port: chosenSecond },
        ]);
        setError(result.ok ? null : result.error);
      }}>
        <header>
          <h2 id="connection-title">케이블 연결</h2>
          <button type="button" aria-label="연결 창 닫기" onClick={onClose}>×</button>
        </header>
        <p>장비 두 대와 사용하지 않는 포트를 골라 주세요. 꺼진 포트에도 연결할 수 있어요.</p>
        {error !== null && <p className="connection-error" role="alert">{formatError(error)}</p>}
        <fieldset>
          <legend>첫 번째 연결점</legend>
          <label htmlFor="connection-first-device">첫 번째 장비</label>
          <select id="connection-first-device" autoFocus value={first?.id ?? ""}
            onChange={event => { setFirstId(event.target.value); setFirstPort(""); setError(null); }}>
            {document.devices.map(device => <option key={device.id} value={device.id}>{device.name}</option>)}
          </select>
          <label htmlFor="connection-first-port">첫 번째 포트</label>
          <select id="connection-first-port" value={chosenFirst} disabled={firstPorts.length === 0}
            onChange={event => { setFirstPort(event.target.value); setError(null); }}>
            {firstPorts.length === 0 && <option value="">빈 포트 없음</option>}
            {firstPorts.map(port => <option key={port} value={port}>{port}</option>)}
          </select>
        </fieldset>
        <fieldset>
          <legend>두 번째 연결점</legend>
          <label htmlFor="connection-second-device">두 번째 장비</label>
          <select id="connection-second-device" value={second?.id ?? ""}
            onChange={event => { setSecondId(event.target.value); setSecondPort(""); setError(null); }}>
            {candidates.map(device => <option key={device.id} value={device.id}>{device.name}</option>)}
          </select>
          <label htmlFor="connection-second-port">두 번째 포트</label>
          <select id="connection-second-port" value={chosenSecond} disabled={secondPorts.length === 0}
            onChange={event => { setSecondPort(event.target.value); setError(null); }}>
            {secondPorts.length === 0 && <option value="">빈 포트 없음</option>}
            {secondPorts.map(port => <option key={port} value={port}>{port}</option>)}
          </select>
        </fieldset>
        {!ready && <p className="connection-error">빈 포트가 있는 다른 장비를 고르거나 기존 케이블을 삭제해 주세요.</p>}
        <div className="connection-actions">
          <button type="button" onClick={onClose}>취소</button>
          <button type="submit" className="primary" disabled={!ready}>연결</button>
        </div>
      </form>
    </dialog>
  );
}
