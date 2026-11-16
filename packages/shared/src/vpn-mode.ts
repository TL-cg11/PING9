import type { RouterConfig, VpnMode } from "./document";

/** 옛 문서/CLI 구성은 그대로 해석한다. 두 설정이 모두 있으면 UI에서 기존 설정 상태를 보여 준다. */
export function vpnModeOf(config: RouterConfig): VpnMode | "configured" {
  if (config.vpnMode !== undefined) return config.vpnMode;
  const gre = Object.keys(config.tunnels ?? {}).length > 0;
  const ipsec = Object.keys(config.ipsec ?? {}).length > 0;
  return gre && ipsec ? "configured" : gre ? "gre" : ipsec ? "ipsec" : "off";
}

export const greEnabled = (config: RouterConfig): boolean => config.vpnMode === undefined || config.vpnMode === "gre";
export const ipsecEnabled = (config: RouterConfig): boolean => config.vpnMode === undefined || config.vpnMode === "ipsec";
