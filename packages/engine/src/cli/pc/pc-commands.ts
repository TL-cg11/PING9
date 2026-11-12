// Windows PC의 명령 정의 목록 (T1.6.1, FR-24). console.ts가 OS가 Windows인 PC의 콘솔에 이 목록을 쓴다 (T0.7).
// 정의 형태와 해석기는 cli/ios의 것을 그대로 쓴다 (AD-8: 명령 트리 하나).
// PC에는 모드 전환이 없어 모든 정의가 `user` 모드 하나에만 있고, 프롬프트는 늘 `이름>`이다.
// `help`와 `?`는 T3.2.2에서 모든 장비 공용으로 만든다.

import { PORT_NAMES } from "@ping9/shared";
import type { ConsoleLine, PcDevice, PortStatus } from "@ping9/shared";

import { macAddressFor } from "../../mac";
import { computeViews } from "../../views";
import { defineCommand, linesFromDispatch, param } from "../ios";
import type { CommandArgs, CommandContext, CommandDefinition, CommandOutcome } from "../ios";
import { pcRoutes, portStatusOf } from "./routes";

const PC_PORT = PORT_NAMES.pc[0];

const text = (value: string): ConsoleLine => ({ kind: "text", text: value });

/** `   IPv4 Address. . . . . . . . . . . : 값` 형태의 한 줄. 값이 없으면 콜론에서 끝난다 */
function row(label: string, value: string | undefined): ConsoleLine {
  return text(value === undefined || value === "" ? `   ${label} :` : `   ${label} : ${value}`);
}

// 라벨은 콜론의 위치가 맞도록 점으로 채운 고정 문자열이다
const LABEL = {
  hostName: "Host Name . . . . . . . . . . . .",
  mediaState: "Media State . . . . . . . . . . .",
  physical: "Physical Address. . . . . . . . .",
  ipv4: "IPv4 Address. . . . . . . . . . .",
  mask: "Subnet Mask . . . . . . . . . . .",
  gateway: "Default Gateway . . . . . . . . .",
} as const;

const MEDIA_STATE: Readonly<Record<PortStatus, string>> = {
  up: "Connected",
  "no-link": "Media disconnected",
  "admin-down": "Disconnected",
  "peer-down": "Disconnected",
};

function pcOf(context: CommandContext): PcDevice | undefined {
  return context.device.kind === "pc" ? context.device : undefined;
}

function addressLines(pc: PcDevice): ConsoleLine[] {
  const { ip, mask, gateway } = pc.config;
  return [
    row(LABEL.physical, macAddressFor(pc.id, 0)),
    ...(ip === undefined
      ? [row(LABEL.ipv4, "(not configured)")]
      : [row(LABEL.ipv4, ip), row(LABEL.mask, mask)]),
    row(LABEL.gateway, gateway),
  ];
}

function showIpconfig(_args: CommandArgs, context: CommandContext): CommandOutcome {
  const pc = pcOf(context);
  if (pc === undefined) return {};
  return { lines: [text(`Ethernet adapter ${PC_PORT}:`), text(""), ...addressLines(pc)] };
}

function showIpconfigAll(_args: CommandArgs, context: CommandContext): CommandOutcome {
  const pc = pcOf(context);
  if (pc === undefined) return {};

  // 포트 상태는 화면과 같은 값을 쓴다 (AD-7)
  const view = computeViews(context.document)[pc.id];
  const status = view?.ports.find((port) => port.name === PC_PORT)?.status ?? "no-link";

  return {
    lines: [
      text(`Ethernet adapter ${PC_PORT}:`),
      text(""),
      row(LABEL.hostName, pc.name),
      row(LABEL.mediaState, MEDIA_STATE[status]),
      ...addressLines(pc),
    ],
  };
}

/** 설정 패널과 같은 Command를 낸다 (AD-3). 성공하면 출력이 없고, 알림과 오류만 줄로 옮긴다 */
function setIp(args: CommandArgs, context: CommandContext): CommandOutcome {
  const result = context.dispatch({
    type: "pc/set-ip",
    deviceId: context.device.id,
    ip: String(args["ip"]),
    mask: String(args["mask"]),
    gateway: args["gateway"] === undefined ? null : String(args["gateway"]),
  });
  return { lines: linesFromDispatch(result) };
}

const RULE = "=".repeat(75);

/** Metric. 실제 1Gbps 유선의 흔한 값으로 고정한다 (T0.14) */
const METRIC = { gateway: 25, onLink: 281 } as const;

/**
 * 경로 한 줄. 실제 Windows처럼 칸을 오른쪽에 맞춘다.
 * `On-link`는 뒤에 빈칸이 하나 붙어 IP 게이트웨이보다 한 칸 앞에서 끝난다 (실제 출력과 같음)
 */
function routeRow(destination: string, mask: string, gateway: string | null, iface: string, metric: number): ConsoleLine {
  const gatewayText = gateway === null ? "On-link " : gateway;
  return text(
    `${destination.padStart(17)}${mask.padStart(17)}${gatewayText.padStart(17)}${iface.padStart(17)}${String(metric).padStart(7)}`,
  );
}

/**
 * `route print` (T0.14). 실제 출력의 IPv4 부분에서 기본 게이트웨이·내 네트워크·내 주소 줄만 보인다.
 * loopback·멀티캐스트·브로드캐스트 줄과 IPv6 부분은 뺀다 (결정 2). `route add`가 없어 Persistent Routes는 늘 None
 */
function showRoutePrint(_args: CommandArgs, context: CommandContext): CommandOutcome {
  const pc = pcOf(context);
  if (pc === undefined) return {};
  const routes = pcRoutes(pc, portStatusOf(pc, context));
  const mac = macAddressFor(pc.id, 0).replaceAll(":", " ");
  return {
    lines: [
      text(RULE),
      text("Interface List"),
      text(`  2...${mac} ......${PC_PORT}`),
      text(RULE),
      text(""),
      text("IPv4 Route Table"),
      text(RULE),
      text("Active Routes:"),
      text("Network Destination        Netmask          Gateway       Interface  Metric"),
      ...(routes === null
        ? []
        : [
            ...(routes.gateway === undefined
              ? []
              : [routeRow("0.0.0.0", "0.0.0.0", routes.gateway, routes.ip, METRIC.gateway)]),
            routeRow(routes.network, routes.mask, null, routes.ip, METRIC.onLink),
            routeRow(routes.ip, "255.255.255.255", null, routes.ip, METRIC.onLink),
          ]),
      text(RULE),
      text("Persistent Routes:"),
      text("  None"),
    ],
  };
}

const ipParam = param("ip", "ipv4", "IPv4 address");
const maskParam = param("mask", "mask", "Subnet mask");
const gatewayParam = param("gateway", "ipv4", "Default gateway");

export const WINDOWS_PC_COMMANDS: readonly CommandDefinition[] = [
  defineCommand({
    modes: ["user"],
    devices: ["pc"],
    tokens: ["ipconfig"],
    help: "Show the IP configuration",
    run: showIpconfig,
  }),
  defineCommand({
    modes: ["user"],
    devices: ["pc"],
    tokens: ["ipconfig", "/all"],
    help: "Show the full IP configuration",
    run: showIpconfigAll,
  }),
  // 정의 형태에 선택 매개변수가 없어 게이트웨이가 없는 형태와 있는 형태를 따로 둔다
  defineCommand({
    modes: ["user"],
    devices: ["pc"],
    tokens: ["ipconfig", ipParam, maskParam],
    help: "Set the IP address and subnet mask",
    run: setIp,
  }),
  defineCommand({
    modes: ["user"],
    devices: ["pc"],
    tokens: ["ipconfig", ipParam, maskParam, gatewayParam],
    help: "Set the IP address, subnet mask and default gateway",
    run: setIp,
  }),
  defineCommand({
    modes: ["user"],
    devices: ["pc"],
    tokens: ["route", "print"],
    help: "Show the IPv4 routing table (default gateway and own network only)",
    run: showRoutePrint,
  }),
];
