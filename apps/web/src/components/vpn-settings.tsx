import { VPN_MODES, vpnModeOf } from "@ping9/shared";
import type { Command, DispatchResult, ErrorInfo, RouterDevice, VpnMode } from "@ping9/shared";
import { useId, useState } from "react";
import { formatError } from "../messages/errors";

const LABELS: Readonly<Record<VpnMode, string>> = {
  off: "사용 안 함 · 일반 통신",
  gre: "GRE · 터널링",
  ipsec: "IPsec · 보호 시뮬레이션",
};

export function VpnSettings({ device, onDispatch }: {
  readonly device: RouterDevice;
  readonly onDispatch: (command: Command) => DispatchResult;
}) {
  const id = useId();
  const mode = vpnModeOf(device.config);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const hasGre = Object.keys(device.config.tunnels ?? {}).length > 0;
  const hasIpsec = Object.keys(device.config.ipsec ?? {}).length > 0;
  const change = (selected: VpnMode) => {
    const result = onDispatch({ type: "router/set-vpn-mode", deviceId: device.id, mode: selected });
    setError(result.ok ? null : result.error);
  };
  return <section className="vpn-settings" aria-label="VPN 설정">
    <label className="vpn-note" htmlFor={`${id}-style`}>라우터 CLI 형식</label>
    <select id={`${id}-style`} value={device.config.cliStyle ?? "ios"} onChange={event => {
      const result = onDispatch({ type: "router/set-cli-style", deviceId: device.id, style: event.target.value === "vyos" ? "vyos" : "ios" });
      setError(result.ok ? null : result.error);
    }}>
      <option value="ios">IOS · 기존 명령어</option>
      <option value="vyos">VyOS 1.4 · VPN 실습</option>
    </select>
    <div className="vpn-note">형식 변경 시 입력 중인 임시 설정을 비워요.</div>
    {device.config.cliStyle === "vyos" ? <div className="vpn-help" role="status">
      configure → set / delete → commit으로 적용해요. 터널·IPsec 정책 설정에 따라 VPN을 사용해요.
      <div className="vpn-note">교육용 시뮬레이션 · 실제 암호화/IKE 없음</div>
    </div> : <>
    <fieldset className="vpn-choice" aria-describedby={`${id}-help`}>
      <legend>VPN 사용</legend>
      {VPN_MODES.map(value => <label key={value} className={value === mode ? "selected" : ""}>
        <input type="radio" name={id} value={value} checked={value === mode} onChange={() => change(value)} />
        {LABELS[value]}
      </label>)}
    </fieldset>
    <div id={`${id}-help`} className="vpn-help" role="status">
      {mode === "off" && "VPN을 사용하지 않고 기존 물리 경로로 전달해요. 목적지까지 일반 라우팅 설정이 필요해요."}
      {mode === "gre" && (hasGre ? "Tunnel 경로로 나가는 패킷을 GRE로 감싸요." : "GRE 터널 설정이 아직 없어요. 터미널에서 Tunnel IP와 상대 주소·경로를 설정해 주세요.")}
      {mode === "ipsec" && (hasIpsec ? "보호 subnet에 일치하는 패킷에 IPsec을 적용해요. 나머지는 일반 통신이에요." : "IPsec 프로필이 아직 없어요. 터미널에서 peer·보호 subnet·키 식별자·SPI를 설정해 주세요.")}
      {mode === "configured" && "기존 CLI의 터널·정책 설정을 따르고 있어요. 위에서 사용할 모드를 선택할 수 있어요."}
    </div>
    <div className="vpn-note">이 라우터에 적용돼요. 상대 라우터에서도 같은 모드를 선택해 주세요.</div>
    {mode === "ipsec" && <div className="vpn-note">교육용 시뮬레이션 · 실제 암호화/IKE 없음</div>}
    </>}
    {error !== null && <div className="vpn-error" role="alert">{formatError(error)}</div>}
  </section>;
}
