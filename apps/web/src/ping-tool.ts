// 시뮬레이션 모드의 `▶ ping 실행` (T0.13): 출발 장비 → 목적지 장비(주소가 여럿이면 주소)를 차례로 고르고,
// 출발 장비의 터미널에서 ping 명령을 친 것처럼 실행한다. 엔진은 터미널 입력과 같은 길로만 쓴다.
// 순수 함수라 DOM 없이 테스트한다. 화면 상태와 실행은 app.tsx가 한다.

import { osOf, PORT_NAMES, shortPortName } from "@ping9/shared";
import type { Device, TopologyDocument } from "@ping9/shared";

export type PingTool =
  | { readonly stage: "source" }
  | { readonly stage: "target"; readonly sourceId: string }
  | { readonly stage: "address"; readonly sourceId: string; readonly targetId: string };

export interface PingAddress {
  /** Router 인터페이스. PC는 없다 */
  readonly port?: string;
  readonly ip: string;
}

/** 다음 상태. `send`가 있으면 그 장비의 터미널에서 명령을 실행하고 도구를 끈다 */
export interface PingStep {
  readonly tool: PingTool | null;
  /** 고를 수 없는 장비를 눌렀을 때의 안내 */
  readonly notice?: string;
  readonly send?: { readonly sourceId: string; readonly command: string };
}

const deviceOf = (document: TopologyDocument, id: string) => document.devices.find((device) => device.id === id);

/** ping을 보낼 수 있는 장비: PC와 Router. Switch는 IP가 없다 */
export const canSendPing = (device: Device) => device.kind === "pc" || device.kind === "router";

/** 장비가 가진 IPv4 주소. Router는 포트 순서 */
export function pingAddresses(device: Device): readonly PingAddress[] {
  if (device.kind === "pc") return device.config.ip === undefined ? [] : [{ ip: device.config.ip }];
  if (device.kind !== "router") return [];
  return PORT_NAMES.router.flatMap((port) => {
    const ip = device.config.interfaces[port]?.ip;
    return ip === undefined ? [] : [{ port, ip }];
  });
}

/** 주소 고르는 창의 한 줄: `Gi0/0 · 10.0.23.2` */
export const addressLabel = (address: PingAddress) =>
  address.port === undefined ? address.ip : `${shortPortName(address.port)} · ${address.ip}`;

/** 출발 장비에서 1회 보내는 명령. PING9의 Router `ping`은 횟수 옵션이 없어 4회다 (실제 IOS는 5회) */
export function pingCommand(source: Device, ip: string): string {
  if (source.kind === "pc") return osOf(source.config) === "linux" ? `ping -c 1 ${ip}` : `ping -n 1 ${ip}`;
  return `ping ${ip}`;
}

/** 안내 띠의 문장 */
export function pingToolMessage(tool: PingTool, document: TopologyDocument): string {
  if (tool.stage === "source") return "ping 실행 · 출발 장비를 누르세요 (PC, Router)";
  const source = deviceOf(document, tool.sourceId)?.name ?? "장비";
  if (tool.stage === "target") return `${source}에서 보냄 · 목적지 장비를 누르세요`;
  const target = deviceOf(document, tool.targetId)?.name ?? "장비";
  return `${source}에서 보냄 · ${target}의 어느 주소로 보낼지 고르세요`;
}

function send(document: TopologyDocument, sourceId: string, ip: string): PingStep {
  const source = deviceOf(document, sourceId);
  return source === undefined ? { tool: null } : { tool: null, send: { sourceId, command: pingCommand(source, ip) } };
}

/** 캔버스에서 장비를 눌렀을 때 */
export function pickDevice(tool: PingTool, document: TopologyDocument, deviceId: string): PingStep {
  const device = deviceOf(document, deviceId);
  if (device === undefined) return { tool };
  if (tool.stage === "source") {
    if (!canSendPing(device)) return { tool, notice: `${device.name}은(는) IP가 없어 ping을 보낼 수 없어요. PC나 Router를 누르세요` };
    return { tool: { stage: "target", sourceId: device.id } };
  }
  const addresses = pingAddresses(device);
  if (addresses.length === 0) return { tool: { stage: "target", sourceId: tool.sourceId }, notice: `${device.name}에는 IP가 없어요. 다른 장비를 누르세요` };
  if (addresses.length === 1) return send(document, tool.sourceId, addresses[0]!.ip);
  return { tool: { stage: "address", sourceId: tool.sourceId, targetId: device.id } };
}

/** 주소 고르는 창에서 주소를 골랐을 때 */
export function pickAddress(tool: PingTool, document: TopologyDocument, ip: string): PingStep {
  return tool.stage === "address" ? send(document, tool.sourceId, ip) : { tool };
}

/** 장비가 지워지면 그 장비를 가리키던 단계는 처음으로 */
export function syncPingTool(tool: PingTool | null, document: TopologyDocument): PingTool | null {
  if (tool === null || tool.stage === "source") return tool;
  if (deviceOf(document, tool.sourceId) === undefined) return { stage: "source" };
  if (tool.stage === "address" && deviceOf(document, tool.targetId) === undefined) return { stage: "target", sourceId: tool.sourceId };
  return tool;
}
