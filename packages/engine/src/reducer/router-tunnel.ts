import { errorInfo, isTunnelName } from "@ping9/shared";
import type { GreTunnelConfig, RouterDevice, TopologyDocument } from "@ping9/shared";
import type { CommandHandler, ReduceResult } from "../reducer";
import { findRouter, withRouterConfig } from "./router-common";

export function updateTunnel(document: TopologyDocument, device: RouterDevice, name: string, patch: Partial<GreTunnelConfig>): ReduceResult {
  const current = device.config.tunnels?.[name];
  if (current === undefined) return { ok: false, error: errorInfo("TUNNEL_INVALID_CONFIG", { detail: `${name}: 먼저 interface tunnel을 생성하세요` }) };
  return withRouterConfig(document, device, {
    ...device.config, tunnels: { ...device.config.tunnels, [name]: { ...current, ...patch } },
  });
}

export const setTunnel: CommandHandler<"tunnel/set"> = (document, command) => {
  const found = findRouter(document, command.deviceId);
  if (!found.ok) return found;
  if (typeof command.name !== "string" || !isTunnelName(command.name)) {
    return { ok: false, error: errorInfo("TUNNEL_INVALID_CONFIG", { detail: "Tunnel0~Tunnel3만 지원합니다" }) };
  }
  // 검증 전에 정규화하지 않는다. 경계 밖의 잘못된 config도 공통 schema가 거부한다.
  return withRouterConfig(document, found.device, {
    ...found.device.config, tunnels: { ...found.device.config.tunnels, [command.name]: command.config },
  });
};

export const removeTunnel: CommandHandler<"tunnel/remove"> = (document, command) => {
  const found = findRouter(document, command.deviceId);
  if (!found.ok) return found;
  if (typeof command.name !== "string" || !isTunnelName(command.name)) {
    return { ok: false, error: errorInfo("TUNNEL_INVALID_CONFIG", { detail: "Tunnel0~Tunnel3만 지원합니다" }) };
  }
  const tunnels = Object.fromEntries(Object.entries(found.device.config.tunnels ?? {}).filter(([name]) => name !== command.name));
  return withRouterConfig(document, found.device, { ...found.device.config, tunnels });
};
