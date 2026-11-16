// Firewall 콘솔의 명령어 (T14.2.1). Firewall은 Linux 장비라 `ip`, `ping`, `iptables`를 쓴다.
// 인터페이스와 경로는 Router와 같은 Command(`interface/*`, `route/*`)를 낸다 (AD-3).
// `iptables`는 옵션 순서가 자유로워 console.ts가 따로 읽는다 (iptables-run.ts). 여기의 정의는 도움말과 Tab 완성에 쓴다.

import {
  PORT_NAMES,
  cidrToNetworkAndMask,
  errorInfo,
  firewallInterfaceName,
  firewallPortOf,
  isSameNetwork,
  maskToPrefixLength,
  parseIpv4,
  prefixLengthToMask,
} from "@ping9/shared";
import type { ArpEntryView, ConsoleLine, ErrorInfo, FirewallDevice, PortStatus, RouteEntryView } from "@ping9/shared";

import { FIREWALL_TTL } from "../../devices/firewall/firewall-model";
import { portMac } from "../../topology";
import { computeViews } from "../../views";
import { customParam, defineCommand, linesFromDispatch, param } from "../ios";
import type { CommandArgs, CommandContext, CommandDefinition, CommandOutcome, ParamValue } from "../ios";
import { LINK_STATE, readCidr } from "../pc/linux-commands";
import { DEFAULT_PING_COUNT, PING_COUNT_MAX, PING_COUNT_MIN, readCount } from "../pc/ping";
import { linuxPingLines, loopbackPingLines } from "../pc/ping-output";
import { IPTABLES_USAGE } from "./iptables-run";

const text = (value: string): ConsoleLine => ({ kind: "text", text: value });
const errorLine = (error: ErrorInfo): ConsoleLine => ({ kind: "error", ...error });

function firewallOf(context: CommandContext): FirewallDevice | undefined {
  return context.device.kind === "firewall" ? context.device : undefined;
}

/** 프롬프트. iptables는 root로 쓴다 */
export function firewallPrompt(device: FirewallDevice): string {
  return `root@${device.name}:~#`;
}

/** `eth0`~`eth3`을 포트의 전체 이름으로 읽는다 */
function readInterface(textValue: string): ParamValue {
  const port = firewallPortOf(textValue);
  return port === undefined
    ? { ok: false, error: errorInfo("CLI_INVALID_VALUE", { token: textValue.length > 64 ? textValue.slice(0, 64) : textValue }) }
    : { ok: true, value: port };
}

function statusOf(device: FirewallDevice, context: CommandContext, port: string): PortStatus {
  return computeViews(context.document)[device.id]?.ports.find((view) => view.name === port)?.status ?? "no-link";
}

function interfaceLines(device: FirewallDevice, context: CommandContext, port: string, withAddress: boolean): ConsoleLine[] {
  const name = firewallInterfaceName(port);
  const iface = device.config.interfaces[port];
  const prefix = iface?.mask === undefined ? null : maskToPrefixLength(iface.mask);
  return [
    text(`${PORT_NAMES.firewall.indexOf(port as (typeof PORT_NAMES.firewall)[number]) + 2}: ${name}: ${LINK_STATE[statusOf(device, context, port)]}`),
    text(`    link/ether ${portMac(device, port)} brd ff:ff:ff:ff:ff:ff`),
    ...(withAddress && iface?.ip !== undefined && prefix !== null ? [text(`    inet ${iface.ip}/${prefix} scope global ${name}`)] : []),
  ];
}

function show(withAddress: boolean) {
  return (args: CommandArgs, context: CommandContext): CommandOutcome => {
    const device = firewallOf(context);
    if (device === undefined) return {};
    const only = args["iface"] === undefined ? undefined : String(args["iface"]);
    const loopback = [
      text("1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 state UNKNOWN"),
      text(withAddress ? "    inet 127.0.0.1/8 scope host lo" : "    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00"),
    ];
    return {
      lines: [
        ...(only === undefined ? loopback : []),
        ...PORT_NAMES.firewall.filter((port) => only === undefined || port === only)
          .flatMap((port) => interfaceLines(device, context, port, withAddress)),
      ],
    };
  };
}

/** `readCidr`가 받아들인 `주소/길이`를 주소와 마스크로 */
function splitCidr(value: string | number | undefined): { readonly ip: string; readonly mask: string } {
  const [ip = "", length = ""] = String(value).split("/");
  return { ip, mask: prefixLengthToMask(Number(length)) ?? "" };
}

function addAddress(args: CommandArgs, context: CommandContext): CommandOutcome {
  const device = firewallOf(context);
  if (device === undefined) return {};
  const { ip, mask } = splitCidr(args["cidr"]);
  return { lines: linesFromDispatch(context.dispatch({ type: "interface/set-ip", deviceId: device.id, port: String(args["iface"]), ip, mask })) };
}

function deleteAddress(args: CommandArgs, context: CommandContext): CommandOutcome {
  const device = firewallOf(context);
  if (device === undefined) return {};
  const port = String(args["iface"]);
  const { ip, mask } = splitCidr(args["cidr"]);
  const iface = device.config.interfaces[port];
  // 실제 iproute2의 문구. 그 인터페이스에 없는 주소다
  if (iface?.ip !== ip || iface.mask !== mask) return { lines: [text("Error: ipv4: Address not found.")] };
  return { lines: linesFromDispatch(context.dispatch({ type: "interface/clear-ip", deviceId: device.id, port })) };
}

function flushAddress(args: CommandArgs, context: CommandContext): CommandOutcome {
  const device = firewallOf(context);
  if (device === undefined) return {};
  return { lines: linesFromDispatch(context.dispatch({ type: "interface/clear-ip", deviceId: device.id, port: String(args["iface"]) })) };
}

function setLink(adminUp: boolean) {
  return (args: CommandArgs, context: CommandContext): CommandOutcome => {
    const device = firewallOf(context);
    if (device === undefined) return {};
    return { lines: linesFromDispatch(context.dispatch({ type: "interface/set-admin", deviceId: device.id, port: String(args["iface"]), adminUp })) };
  };
}

/** 지금 쓰는 경로. 화면의 라우팅 테이블과 같은 값이다 */
function routesOf(device: FirewallDevice, context: CommandContext): readonly RouteEntryView[] {
  if (context.runtime !== undefined) return context.runtime.routingTable(device.id);
  const view = computeViews(context.document)[device.id];
  return view?.kind === "firewall" ? view.routingTable : [];
}

/** `ip route`. 기본 경로가 먼저, 나머지는 작은 네트워크 주소부터 */
function showRoutes(_args: CommandArgs, context: CommandContext): CommandOutcome {
  const device = firewallOf(context);
  if (device === undefined) return {};
  const isDefault = (route: RouteEntryView) => route.mask === "0.0.0.0";
  const routes = [...routesOf(device, context)].sort((a, b) =>
    (Number(isDefault(b)) - Number(isDefault(a))) || ((parseIpv4(a.network) ?? 0) - (parseIpv4(b.network) ?? 0)));
  return {
    lines: routes.map((route) => {
      const dev = route.port === undefined ? "" : ` dev ${firewallInterfaceName(route.port)}`;
      const destination = isDefault(route) ? "default" : `${route.network}/${maskToPrefixLength(route.mask) ?? route.mask}`;
      if (route.source !== "connected") return text(`${destination} via ${route.nextHop ?? ""}${dev}`);
      const source = route.port === undefined ? undefined : device.config.interfaces[route.port]?.ip;
      return text(`${destination}${dev} proto kernel scope link${source === undefined ? "" : ` src ${source}`}`);
    }),
  };
}

/** 경로 명령의 목적지: `default`(args에 `cidr`가 없음)이거나 `네트워크/길이` */
function destinationOf(args: CommandArgs): { readonly network: string; readonly mask: string } | null {
  return args["cidr"] === undefined ? { network: "0.0.0.0", mask: "0.0.0.0" } : cidrToNetworkAndMask(String(args["cidr"]));
}

function addRoute(args: CommandArgs, context: CommandContext): CommandOutcome {
  const device = firewallOf(context);
  const destination = destinationOf(args);
  if (device === undefined || destination === null) return {};
  return { lines: linesFromDispatch(context.dispatch({ type: "route/add", deviceId: device.id, ...destination, nextHop: String(args["gateway"]) })) };
}

function deleteRoute(args: CommandArgs, context: CommandContext): CommandOutcome {
  const device = firewallOf(context);
  const destination = destinationOf(args);
  if (device === undefined || destination === null) return {};
  // `via`를 주지 않으면 그 목적지의 첫 경로를 지운다
  const nextHop = args["gateway"] === undefined
    ? device.config.staticRoutes.find((route) => route.network === destination.network && route.mask === destination.mask)?.nextHop
    : String(args["gateway"]);
  // 실제 iproute2의 문구
  if (nextHop === undefined) return { lines: [text("RTNETLINK answers: No such process")] };
  return { lines: linesFromDispatch(context.dispatch({ type: "route/remove", deviceId: device.id, ...destination, nextHop })) };
}

function showNeighbours(format: "neigh" | "arp") {
  return (_args: CommandArgs, context: CommandContext): CommandOutcome => {
    const device = firewallOf(context);
    if (device === undefined || context.runtime === undefined) return {};
    const name = (entry: ArpEntryView) => firewallInterfaceName(entry.port);
    return {
      lines: context.runtime.arpTable(device.id).map((entry) => text(format === "neigh"
        ? `${entry.ip} dev ${name(entry)} lladdr ${entry.mac} REACHABLE`
        : `? (${entry.ip}) at ${entry.mac} [ether] on ${name(entry)}`)),
    };
  };
}

function flushNeighbours(_args: CommandArgs, context: CommandContext): CommandOutcome {
  const device = firewallOf(context);
  if (device !== undefined) context.runtime?.clearArp(device.id);
  return {};
}

/** 255.255.255.255이거나 이 장비 인터페이스 네트워크의 브로드캐스트 주소 (MAL-6) */
function isBroadcast(target: string, device: FirewallDevice): boolean {
  if (target === "255.255.255.255") return true;
  const wanted = parseIpv4(target);
  return Object.values(device.config.interfaces).some((iface) => {
    const address = iface.ip === undefined ? null : parseIpv4(iface.ip);
    const bits = iface.mask === undefined ? null : parseIpv4(iface.mask);
    // 32비트 정수의 비트 연산은 부호가 생기므로 >>> 0으로 양수로 되돌린다
    return address !== null && bits !== null && ((address | ~bits) >>> 0) === wanted;
  });
}

/** `ping`. 보낸 요청은 OUTPUT 체인을, 돌아온 응답은 INPUT 체인을 지난다 */
function runPing(args: CommandArgs, context: CommandContext): CommandOutcome {
  const device = firewallOf(context);
  if (device === undefined || context.runtime === undefined) return {};
  const targetIp = String(args["ip"]);
  const count = args["count"] === undefined ? DEFAULT_PING_COUNT : Number(args["count"]);
  const interfaces = Object.values(device.config.interfaces);

  if (isBroadcast(targetIp, device)) return { lines: [errorLine(errorInfo("PING_BROADCAST_UNSUPPORTED", { ip: targetIp }))] };
  // 자기 주소와 127.x는 링크를 지나지 않는다. 필터도 보지 않는다
  if (targetIp.startsWith("127.") || interfaces.some((iface) => iface.ip === targetIp)) {
    return { lines: loopbackPingLines("linux", targetIp, count, FIREWALL_TTL) };
  }

  const run = context.runtime.ping({ deviceId: device.id, targetIp, count, stopOnUnsent: true });
  if (!run.ok) return { lines: [errorLine(run.error)] };
  const ownIp = (interfaces.find((iface) => iface.ip !== undefined && iface.mask !== undefined && isSameNetwork(targetIp, iface.ip, iface.mask)) ??
    interfaces.find((iface) => iface.ip !== undefined))?.ip;
  return { lines: linuxPingLines(targetIp, ownIp, run.rounds) };
}

const ifaceParam = customParam("iface", "Interface: eth0, eth1, eth2 or eth3", readInterface);
const cidrParam = customParam("cidr", "Address and prefix length, e.g. 10.0.0.1/24", readCidr);
const gatewayParam = param("gateway", "ipv4", "Next hop address");
const ipParam = param("ip", "ipv4", "Destination IPv4 address");
const countParam = customParam("count", `Number of echo requests (${PING_COUNT_MIN}-${PING_COUNT_MAX})`, readCount);

/** Linux처럼 대소문자를 구분한다 */
const linux = (tokens: CommandDefinition["tokens"], help: string, run: CommandDefinition["run"]) =>
  defineCommand({ modes: ["user"], devices: ["firewall"], tokens, help, caseSensitive: true, run });

/** 명령 정의의 쓰는 형태. 매개변수 자리는 `<ip>`처럼 보인다 */
function usageOf(definition: CommandDefinition): string {
  return definition.tokens.map((token) => (typeof token === "string" ? token : `<${token.param}>`)).join(" ");
}

/** `help`: 칠 수 있는 명령어 전체와 iptables의 쓰는 법 */
function showHelp(): CommandOutcome {
  const rows = FIREWALL_COMMANDS
    .filter((definition) => definition.tokens[0] !== "iptables")
    .map((definition) => ({ usage: usageOf(definition), help: definition.help }))
    .sort((left, right) => (left.usage < right.usage ? -1 : left.usage > right.usage ? 1 : 0));
  const width = Math.max(...rows.map((row) => row.usage.length));
  return {
    lines: [
      ...rows.map((row) => text(`  ${row.usage.padEnd(width)}  ${row.help}`)),
      text(""),
      ...IPTABLES_USAGE.map(text),
    ],
  };
}

export const FIREWALL_COMMANDS: readonly CommandDefinition[] = [
  linux(["ip", "addr"], "Show addresses", show(true)),
  linux(["ip", "a"], "Show addresses", show(true)),
  linux(["ip", "addr", "show"], "Show addresses", show(true)),
  linux(["ip", "addr", "show", ifaceParam], "Show the address of one interface", show(true)),
  linux(["ip", "addr", "show", "dev", ifaceParam], "Show the address of one interface", show(true)),
  linux(["ip", "addr", "add", cidrParam, "dev", ifaceParam], "Set the address (saved in the topology, unlike a real reboot)", addAddress),
  linux(["ip", "addr", "del", cidrParam, "dev", ifaceParam], "Remove the address", deleteAddress),
  linux(["ip", "addr", "flush", "dev", ifaceParam], "Remove the address of the interface", flushAddress),
  linux(["ip", "link"], "Show links", show(false)),
  linux(["ip", "link", "show"], "Show links", show(false)),
  linux(["ip", "link", "show", ifaceParam], "Show the link of one interface", show(false)),
  linux(["ip", "link", "set", ifaceParam, "up"], "Turn the interface on", setLink(true)),
  linux(["ip", "link", "set", ifaceParam, "down"], "Turn the interface off", setLink(false)),
  linux(["ip", "link", "set", "dev", ifaceParam, "up"], "Turn the interface on", setLink(true)),
  linux(["ip", "link", "set", "dev", ifaceParam, "down"], "Turn the interface off", setLink(false)),
  linux(["ip", "route"], "Show the routing table", showRoutes),
  linux(["ip", "route", "show"], "Show the routing table", showRoutes),
  linux(["ip", "route", "add", cidrParam, "via", gatewayParam], "Add a static route", addRoute),
  linux(["ip", "route", "add", "default", "via", gatewayParam], "Add the default route", addRoute),
  linux(["ip", "route", "del", cidrParam], "Remove a static route", deleteRoute),
  linux(["ip", "route", "del", cidrParam, "via", gatewayParam], "Remove a static route", deleteRoute),
  linux(["ip", "route", "del", "default"], "Remove the default route", deleteRoute),
  linux(["ip", "route", "del", "default", "via", gatewayParam], "Remove the default route", deleteRoute),
  linux(["ip", "neigh"], "Show the neighbour (ARP) table", showNeighbours("neigh")),
  linux(["ip", "neigh", "show"], "Show the neighbour (ARP) table", showNeighbours("neigh")),
  linux(["ip", "neigh", "flush", "all"], "Delete all neighbour entries", flushNeighbours),
  linux(["arp", "-a"], "Show the ARP table", showNeighbours("arp")),
  linux(["ping", ipParam], "Send 4 echo requests (no Ctrl+C here)", runPing),
  linux(["ping", "-c", countParam, ipParam], "Send the given number of echo requests", runPing),
  linux(["ping", ipParam, "-c", countParam], "Send the given number of echo requests", runPing),
  // 실행은 console.ts가 iptables-run으로 넘긴다. 이 정의는 `?`와 Tab이 명령을 알게 한다
  linux(["iptables"], "Packet filter rules (iptables -h)", () => ({ lines: IPTABLES_USAGE.map(text) })),
  linux(["help"], "Show all commands", showHelp),
];
