// 속성 패널에서 서버로 쓰는 PC에만 있는 구역 (T0.20): 서비스 켜고 끄기와 DNS 이름.
// 스위치는 누르는 즉시 pc/set-service를, DNS 이름은 "추가"·"삭제"로 pc/add-dns-record·pc/remove-dns-record를 dispatch한다 (AD-3).
// 모양은 포트 스위치(T0.14)와 IP 설정(T1.5.2)의 것을 그대로 쓴다. 문구는 카탈로그에서 만든다 (AD-14).

import { MAX_HOST_NAME_LENGTH, SERVICE_KINDS, SERVICE_PORTS, dnsRecordsOf, servicesOf } from "@ping9/shared";
import type { Command, DispatchResult, ErrorInfo, PcDevice, ServiceKind } from "@ping9/shared";
import { useId, useState } from "react";

import { formatError } from "../messages/errors";

export const SERVICE_LABELS: Readonly<Record<ServiceKind, string>> = { http: "HTTP", dns: "DNS", ntp: "NTP", ftp: "FTP" };

/** 스위치를 눌렀을 때 낼 Command */
export function serviceCommand(deviceId: string, service: ServiceKind, enabled: boolean): Command {
  return { type: "pc/set-service", deviceId, service, enabled };
}

/** 서비스 하나의 스위치. 색만으로 구별하지 않도록 "켜짐"·"꺼짐" 글자를 함께 쓴다 */
function ServiceSwitch({ service, enabled, onChange }: {
  readonly service: ServiceKind;
  readonly enabled: boolean;
  readonly onChange: (enabled: boolean) => void;
}) {
  const { protocol, port } = SERVICE_PORTS[service];
  return (
    <div className={enabled ? "port-row" : "port-row off"}>
      <span className="port-name">{SERVICE_LABELS[service]}</span>
      <span className="key">{protocol}/{port}</span>
      <button
        type="button"
        className="port-switch"
        role="switch"
        aria-checked={enabled}
        aria-label={`${SERVICE_LABELS[service]} 서비스`}
        onClick={() => onChange(!enabled)}
      >
        <span className="state">{enabled ? "켜짐" : "꺼짐"}</span>
        <span className="track" aria-hidden="true">
          <span className="knob" />
        </span>
      </button>
    </div>
  );
}

export function ServerServices({ device, onDispatch }: {
  readonly device: PcDevice;
  readonly onDispatch: (command: Command) => DispatchResult;
}) {
  const id = useId();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<ErrorInfo | null>(null);
  const enabled = servicesOf(device.config);
  const records = dnsRecordsOf(device.config);

  const add = () => {
    const result = onDispatch({ type: "pc/add-dns-record", deviceId: device.id, name: name.trim(), address: address.trim() });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setName("");
    setAddress("");
  };

  return (
    <>
      <h4>서비스</h4>
      {SERVICE_KINDS.map((service) => (
        <ServiceSwitch key={service} service={service} enabled={enabled.includes(service)}
          onChange={(next) => onDispatch(serviceCommand(device.id, service, next))} />
      ))}

      <h4>DNS 이름</h4>
      {records.length === 0 && <div className="sub">아직 넣은 이름이 없어요</div>}
      {records.map((record) => (
        <div key={record.name} className="if-row">
          {record.name}
          <span className="ip">{record.address}</span>
          <button type="button" className="dns-remove" aria-label={`${record.name} 삭제`}
            onClick={() => onDispatch({ type: "pc/remove-dns-record", deviceId: device.id, name: record.name })}>
            ×
          </button>
        </div>
      ))}
      <form className="pc-form dns-form" onSubmit={(event) => { event.preventDefault(); add(); }}>
        <div className="field">
          <label htmlFor={`${id}-name`}>이름</label>
          <input id={`${id}-name`} type="text" autoComplete="off" spellCheck={false} maxLength={MAX_HOST_NAME_LENGTH}
            placeholder="www.ping9.test" value={name}
            onChange={(event) => { setName(event.target.value); setError(null); }} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-address`}>주소</label>
          <input id={`${id}-address`} type="text" inputMode="decimal" autoComplete="off" spellCheck={false} maxLength={15}
            placeholder="10.0.2.10" value={address}
            onChange={(event) => { setAddress(event.target.value); setError(null); }} />
        </div>
        {error !== null && <div className="form-err" role="alert">{formatError(error)}</div>}
        <button type="submit" className="apply">추가</button>
      </form>
    </>
  );
}
