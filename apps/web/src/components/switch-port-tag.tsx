// 속성 패널의 Switch 포트 줄에 붙는 것: VLAN 또는 trunk 표시, trunk의 허용 목록.
// 포트의 모드와 VLAN은 shared의 구성 읽기 함수로 읽는다 (AD-7).

import { switchPort } from "@ping9/shared";
import type { SwitchConfig } from "@ping9/shared";

import { formatAllowedVlans } from "../format/link-vlan";
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
