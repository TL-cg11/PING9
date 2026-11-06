// 속성 패널에서 Switch에만 있는 구역: VLAN 목록과 MAC 주소 테이블.
// VLAN 목록과 소속 포트는 shared의 구성 읽기 함수로 읽는다. 화면이 기본값 규칙이나 소속을 직접 계산하지 않는다 (AD-7).

import { shortPortName, switchPort, switchVlans, vlanAccessPorts } from "@ping9/shared";
import type { SwitchConfig, SwitchView } from "@ping9/shared";

import { formatAllowedVlans } from "../format/link-vlan";
import { formatPortList } from "../format/port-list";
import { vlanColor } from "../format/vlan-color";

/** 포트 줄에 붙는 표시: access 포트는 그 VLAN, trunk 포트는 trunk (시안의 vtag) */
export function SwitchPortTag({ config, port }: { readonly config: SwitchConfig; readonly port: string }) {
  const settings = switchPort(config, port);
  return settings.mode === "trunk" ? (
    <span className={`vtag ${vlanColor("trunk").className}`}>trunk</span>
  ) : (
    <span className={`vtag ${vlanColor(settings.accessVlan).className}`}>VLAN {settings.accessVlan}</span>
  );
}

/** trunk 포트의 줄에 연결된 장비 대신 보일 글 (시안: `허용 10, 20`). trunk가 아니면 undefined */
export function trunkAllowedText(config: SwitchConfig, port: string): string | undefined {
  const settings = switchPort(config, port);
  return settings.mode === "trunk" ? `허용 ${formatAllowedVlans(settings.allowedVlans)}` : undefined;
}

export function SwitchVlanList({ config }: { readonly config: SwitchConfig }) {
  return (
    <>
      <h4>VLAN</h4>
      {switchVlans(config).map((vlan) => (
        <div key={vlan.id} className="if-row">
          <span className={`vtag ${vlanColor(vlan.id).className}`}>VLAN {vlan.id}</span>
          {vlan.name}
          <span className="ip">{formatPortList(vlanAccessPorts(config, vlan.id))}</span>
        </div>
      ))}
    </>
  );
}

export function SwitchMacTable({ view }: { readonly view: SwitchView }) {
  return (
    <>
      <h4>MAC 주소 테이블</h4>
      {view.macTable.length === 0 ? (
        <div className="sub">아직 학습한 주소가 없어요</div>
      ) : (
        <div className="mac">
          {view.macTable.map((entry) => (
            <MacRow key={`${entry.vlan} ${entry.mac}`} vlan={entry.vlan} mac={entry.mac} port={entry.port} />
          ))}
        </div>
      )}
    </>
  );
}

function MacRow({ vlan, mac, port }: { readonly vlan: number; readonly mac: string; readonly port: string }) {
  return (
    <>
      <span>{vlan}</span>
      <span>{mac}</span>
      <span>{shortPortName(port)}</span>
    </>
  );
}
