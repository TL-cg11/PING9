// `▶ ping 실행`에서 목적지 장비의 주소가 여럿일 때 고르는 창 (T0.13). 포트 고르는 창과 같은 모양이다.

import type { Device } from "@ping9/shared";

import { addressLabel } from "../ping-tool";
import type { PingAddress } from "../ping-tool";

export function PingAddressPicker({ device, addresses, onPick, onClose }: {
  readonly device: Device;
  readonly addresses: readonly PingAddress[];
  readonly onPick: (ip: string) => void;
  readonly onClose: () => void;
}) {
  return (
    <div className="port-picker" role="dialog" aria-label={`${device.name}의 주소`}>
      <header>
        <strong>{device.name}의 어느 주소로?</strong>
        <button type="button" aria-label="주소 목록 닫기" onClick={onClose}>×</button>
      </header>
      <div className="port-options">
        {addresses.map((address) => (
          <button key={address.ip} type="button" onClick={() => onPick(address.ip)}>{addressLabel(address)}</button>
        ))}
      </div>
    </div>
  );
}
