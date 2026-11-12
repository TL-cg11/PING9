// Linux PC의 명령 정의 목록 (T0.7). console.ts가 OS가 Linux인 PC의 콘솔에 이 목록을 쓴다.
// 정의 형태와 해석기는 Windows 목록과 같은 cli/ios의 것이다 (AD-8).
// 주소와 기본 게이트웨이: `ip`, 옛 명령 `ifconfig`와 `route`.
// 라우팅 조회(`ip route`, `route -n`), 링크 보기(`ip link`)와 포트 끄고 켜기(`ip link set`, `ifconfig eth0 down/up`)는 T0.14.
// ping과 `ip neigh`는 ping.ts에 있다.
// Linux의 인터페이스 이름 `eth0`은 콘솔에서만 쓴다. 문서 안의 포트 이름은 `Ethernet0`이다.

import {
  PORT_NAMES,
  errorInfo,
  formatIpv4,
  isSameNetwork,
  maskToPrefixLength,
  parseIpv4,
  prefixLengthToMask,
} from "@ping9/shared";
import type { ConsoleLine, PcDevice, PortStatus } from "@ping9/shared";

import { macAddressFor } from "../../mac";
import { computeViews } from "../../views";
import { customParam, defineCommand, linesFromDispatch, param } from "../ios";
import type { CommandArgs, CommandContext, CommandDefinition, CommandOutcome, ParamValue } from "../ios";
import { pcRoutes, portStatusOf } from "./routes";

/** 콘솔에 보이는 인터페이스 이름 */
export const LINUX_INTERFACE = "eth0";

const PC_PORT = PORT_NAMES.pc[0];

const text = (value: string): ConsoleLine => ({ kind: "text", text: value });

function pcOf(context: CommandContext): PcDevice | undefined {
  return context.device.kind === "pc" ? context.device : undefined;
}

/** 오류에 담는 입력 글의 최대 길이. 해석기의 다른 오류와 같다 */
const clip = (value: string): string => (value.length > 64 ? value.slice(0, 64) : value);

/**
 * `10.0.0.2/24`를 읽는다. 값은 `주소/길이` 그대로 돌려주고, 나누는 것은 `splitCidr`가 한다.
 * 주소는 형식만 본다. 특수 주소나 네트워크 주소 같은 규칙은 reducer가 판정한다 (AD-3)
 */
export function readCidr(textValue: string): ParamValue {
  const slash = textValue.indexOf("/");
  const address = slash < 0 ? textValue : textValue.slice(0, slash);
  if (parseIpv4(address) === null) {
    return { ok: false, error: errorInfo("INVALID_IPV4", { value: clip(address) }) };
  }
  const length = slash < 0 ? "" : textValue.slice(slash + 1);
  if (!/^[0-9]{1,2}$/.test(length) || prefixLengthToMask(Number(length)) === null) {
    return { ok: false, error: errorInfo("CLI_INVALID_VALUE", { token: clip(textValue) }) };
  }
  return { ok: true, value: `${address}/${Number(length)}` };
}

/** `ifconfig`의 주소 자리. `10.0.0.5`와 `10.0.0.5/24`를 모두 받는다 */
export function readAddress(textValue: string): ParamValue {
  if (textValue.includes("/")) return readCidr(textValue);
  return parseIpv4(textValue) === null
    ? { ok: false, error: errorInfo("INVALID_IPV4", { value: clip(textValue) }) }
    : { ok: true, value: textValue };
}

/** `readCidr`·`readAddress`가 받아들인 값을 주소와 마스크로 나눈다. 길이가 없으면 마스크는 null */
function splitCidr(value: string | number | undefined): { ip: string; mask: string | null } {
  const [ip = "", length] = String(value).split("/");
  return { ip, mask: length === undefined ? null : (prefixLengthToMask(Number(length)) ?? null) };
}

/** 게이트웨이가 새 주소의 네트워크 안이면 남기고 아니면 지운다 */
function keptGateway(pc: PcDevice, ip: string, mask: string | null): string | null {
  const { gateway } = pc.config;
  if (gateway === undefined || mask === null || maskToPrefixLength(mask) === null) return null;
  return isSameNetwork(gateway, ip, mask) ? gateway : null;
}

/** 링크 상태 줄. 상태는 화면과 같은 값을 쓴다 (AD-7) */
const LINK_STATE: Readonly<Record<PortStatus, string>> = {
  up: "<BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 state UP",
  "no-link": "<NO-CARRIER,BROADCAST,MULTICAST,UP> mtu 1500 state DOWN",
  "peer-down": "<NO-CARRIER,BROADCAST,MULTICAST,UP> mtu 1500 state DOWN",
  "admin-down": "<BROADCAST,MULTICAST> mtu 1500 state DOWN",
};

function showAddresses(_args: CommandArgs, context: CommandContext): CommandOutcome {
  const pc = pcOf(context);
  if (pc === undefined) return {};

  const view = computeViews(context.document)[pc.id];
  const status = view?.ports.find((port) => port.name === PC_PORT)?.status ?? "no-link";
  const { ip, mask } = pc.config;
  const prefix = mask === undefined ? null : maskToPrefixLength(mask);

  return {
    lines: [
      text("1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 state UNKNOWN"),
      text("    inet 127.0.0.1/8 scope host lo"),
      text(`2: ${LINUX_INTERFACE}: ${LINK_STATE[status]}`),
      text(`    link/ether ${macAddressFor(pc.id, 0)} brd ff:ff:ff:ff:ff:ff`),
      ...(ip === undefined || prefix === null
        ? []
        : [text(`    inet ${ip}/${prefix} scope global ${LINUX_INTERFACE}`)]),
    ],
  };
}

/** 설정 패널과 같은 Command를 낸다 (AD-3). 성공하면 출력이 없고, 알림과 오류만 줄로 옮긴다 */
function dispatchAddress(
  context: CommandContext,
  ip: string | null,
  mask: string | null,
  gateway: string | null,
): CommandOutcome {
  const result = context.dispatch({ type: "pc/set-ip", deviceId: context.device.id, ip, mask, gateway });
  return { lines: linesFromDispatch(result) };
}

/**
 * `ip addr add`. PC의 주소는 하나라 지금 주소를 바꾼다.
 * 게이트웨이가 새 네트워크 밖이 되면 지운다. 실제 Linux도 주소가 바뀌면 그 주소로 가던 경로가 사라진다
 */
function addAddress(args: CommandArgs, context: CommandContext): CommandOutcome {
  const pc = pcOf(context);
  if (pc === undefined) return {};
  const { ip, mask } = splitCidr(args["cidr"]);
  return dispatchAddress(context, ip, mask, keptGateway(pc, ip, mask));
}

/**
 * `ifconfig eth0 <주소>[/길이] [netmask <마스크>]`. `netmask`가 있으면 그것을, 없으면 길이를 쓴다.
 * 둘 다 없으면 지금 마스크를 쓰고, 그것도 없으면 reducer가 마스크가 빠졌다고 거부한다
 */
function ifconfigSet(args: CommandArgs, context: CommandContext): CommandOutcome {
  const pc = pcOf(context);
  if (pc === undefined) return {};
  const { ip, mask: fromLength } = splitCidr(args["address"]);
  const mask = args["mask"] === undefined ? (fromLength ?? pc.config.mask ?? null) : String(args["mask"]);
  return dispatchAddress(context, ip, mask, keptGateway(pc, ip, mask));
}

/** `ip addr del`. 지금 주소와 길이가 같을 때만 지운다. 게이트웨이도 함께 사라진다 */
function deleteAddress(args: CommandArgs, context: CommandContext): CommandOutcome {
  const pc = pcOf(context);
  if (pc === undefined) return {};
  const { ip, mask } = splitCidr(args["cidr"]);
  if (pc.config.ip !== ip || pc.config.mask !== mask) {
    return {
      lines: [
        { kind: "error", ...errorInfo("PC_ADDRESS_NOT_FOUND", { deviceId: pc.id, ip: String(args["cidr"]) }) },
      ],
    };
  }
  return dispatchAddress(context, null, null, null);
}

function flushAddresses(_args: CommandArgs, context: CommandContext): CommandOutcome {
  return dispatchAddress(context, null, null, null);
}

/** `ip route add default via`. 주소가 없으면 reducer가 `PC_ADDRESS_INCOMPLETE`로 거부한다 */
function addDefaultRoute(args: CommandArgs, context: CommandContext): CommandOutcome {
  const pc = pcOf(context);
  if (pc === undefined) return {};
  const { ip = null, mask = null } = pc.config;
  return dispatchAddress(context, ip, mask, String(args["gateway"]));
}

function deleteDefaultRoute(_args: CommandArgs, context: CommandContext): CommandOutcome {
  const pc = pcOf(context);
  if (pc === undefined) return {};
  const { ip = null, mask = null } = pc.config;
  return dispatchAddress(context, ip, mask, null);
}

/** `ifconfig`의 상태 줄. flags 값은 실제 Linux의 것이다 */
const IFCONFIG_FLAGS: Readonly<Record<PortStatus, string>> = {
  up: "flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500",
  "no-link": "flags=4099<UP,BROADCAST,MULTICAST>  mtu 1500",
  "peer-down": "flags=4099<UP,BROADCAST,MULTICAST>  mtu 1500",
  "admin-down": "flags=4098<BROADCAST,MULTICAST>  mtu 1500",
};

/** 주소와 마스크의 브로드캐스트 주소. 둘 중 하나를 읽지 못하면 null */
function broadcastOf(ip: string, mask: string): string | null {
  const address = parseIpv4(ip);
  const bits = parseIpv4(mask);
  if (address === null || bits === null) return null;
  // 32비트 정수의 비트 연산은 부호가 생기므로 >>> 0으로 양수로 되돌린다
  return formatIpv4(((address | ~bits) >>> 0));
}

function eth0Lines(pc: PcDevice, context: CommandContext): ConsoleLine[] {
  const view = computeViews(context.document)[pc.id];
  const status = view?.ports.find((port) => port.name === PC_PORT)?.status ?? "no-link";
  const { ip, mask } = pc.config;
  const broadcast = ip === undefined || mask === undefined ? null : broadcastOf(ip, mask);
  return [
    text(`${LINUX_INTERFACE}: ${IFCONFIG_FLAGS[status]}`),
    ...(ip === undefined || mask === undefined
      ? []
      : [text(`        inet ${ip}  netmask ${mask}${broadcast === null ? "" : `  broadcast ${broadcast}`}`)]),
    text(`        ether ${macAddressFor(pc.id, 0)}  txqueuelen 1000  (Ethernet)`),
  ];
}

function ifconfigShowAll(_args: CommandArgs, context: CommandContext): CommandOutcome {
  const pc = pcOf(context);
  if (pc === undefined) return {};
  return {
    lines: [
      ...eth0Lines(pc, context),
      text(""),
      text("lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536"),
      text("        inet 127.0.0.1  netmask 255.0.0.0"),
      text("        loop  txqueuelen 1000  (Local Loopback)"),
    ],
  };
}

function ifconfigShowEth0(_args: CommandArgs, context: CommandContext): CommandOutcome {
  const pc = pcOf(context);
  return pc === undefined ? {} : { lines: eth0Lines(pc, context) };
}

/** `ip link`의 eth0 두 줄. 첫 줄은 `ip addr`과 같은 상태 줄이다 */
function linkLines(pc: PcDevice, context: CommandContext): ConsoleLine[] {
  return [
    text(`2: ${LINUX_INTERFACE}: ${LINK_STATE[portStatusOf(pc, context)]}`),
    text(`    link/ether ${macAddressFor(pc.id, 0)} brd ff:ff:ff:ff:ff:ff`),
  ];
}

function showLinks(_args: CommandArgs, context: CommandContext): CommandOutcome {
  const pc = pcOf(context);
  if (pc === undefined) return {};
  return {
    lines: [
      text("1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 state UNKNOWN"),
      text("    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00"),
      ...linkLines(pc, context),
    ],
  };
}

function showLinkEth0(_args: CommandArgs, context: CommandContext): CommandOutcome {
  const pc = pcOf(context);
  return pc === undefined ? {} : { lines: linkLines(pc, context) };
}

/** 포트를 끄고 켠다. 설정 패널의 토글과 같은 Command다 (AD-3). 성공하면 출력이 없다. 이미 그 상태여도 오류가 없다 */
function setLink(adminUp: boolean) {
  return (_args: CommandArgs, context: CommandContext): CommandOutcome => {
    const result = context.dispatch({ type: "interface/set-admin", deviceId: context.device.id, port: PC_PORT, adminUp });
    return { lines: linesFromDispatch(result) };
  };
}

/**
 * `ip route`. 케이블이 없거나 상대가 꺼져 신호가 없으면 줄 끝에 `linkdown` (실제와 같음).
 * 포트가 꺼져 있으면 아무 줄도 없다 (결정 4)
 */
function showIpRoute(_args: CommandArgs, context: CommandContext): CommandOutcome {
  const pc = pcOf(context);
  if (pc === undefined) return {};
  const routes = pcRoutes(pc, portStatusOf(pc, context));
  if (routes === null) return { lines: [] };
  const linkdown = routes.status === "up" ? "" : " linkdown";
  return {
    lines: [
      ...(routes.gateway === undefined ? [] : [text(`default via ${routes.gateway} dev ${LINUX_INTERFACE}${linkdown}`)]),
      text(`${routes.network}/${routes.prefix} dev ${LINUX_INTERFACE} proto kernel scope link src ${routes.ip}${linkdown}`),
    ],
  };
}

/** `route -n`의 한 줄. 칸 너비는 net-tools의 것이다 */
function routeNRow(destination: string, gateway: string, mask: string, flags: string): ConsoleLine {
  return text(`${destination.padEnd(15)} ${gateway.padEnd(15)} ${mask.padEnd(15)} ${flags.padEnd(5)} 0      0        0 ${LINUX_INTERFACE}`);
}

/** `route -n`. `ip route`와 같은 경로를 옛 형식으로. 경로가 없으면 머리 두 줄만 */
function showRouteN(_args: CommandArgs, context: CommandContext): CommandOutcome {
  const pc = pcOf(context);
  if (pc === undefined) return {};
  const routes = pcRoutes(pc, portStatusOf(pc, context));
  return {
    lines: [
      text("Kernel IP routing table"),
      text("Destination     Gateway         Genmask         Flags Metric Ref    Use Iface"),
      ...(routes === null
        ? []
        : [
            ...(routes.gateway === undefined ? [] : [routeNRow("0.0.0.0", routes.gateway, "0.0.0.0", "UG")]),
            routeNRow(routes.network, "0.0.0.0", routes.mask, "U"),
          ]),
    ],
  };
}

const cidrParam = customParam("cidr", "Address and prefix length, e.g. 10.0.0.2/24", readCidr);
const addressParam = customParam("address", "Address, optionally with prefix length, e.g. 10.0.0.2/24", readAddress);
const maskParam = param("mask", "mask", "Subnet mask");
const gatewayParam = param("gateway", "ipv4", "Default gateway");

const linux = (tokens: CommandDefinition["tokens"], help: string, run: CommandDefinition["run"]) =>
  defineCommand({ modes: ["user"], devices: ["pc"], tokens, help, run });

export const LINUX_PC_COMMANDS: readonly CommandDefinition[] = [
  linux(["ip", "addr"], "Show addresses", showAddresses),
  linux(["ip", "a"], "Show addresses", showAddresses),
  linux(["ip", "addr", "show"], "Show addresses", showAddresses),
  linux(["ip", "addr", "show", LINUX_INTERFACE], "Show addresses of eth0", showAddresses),
  linux(
    ["ip", "addr", "add", cidrParam, "dev", LINUX_INTERFACE],
    "Set the address (saved in the topology, unlike a real reboot)",
    addAddress,
  ),
  linux(["ip", "addr", "del", cidrParam, "dev", LINUX_INTERFACE], "Remove the address", deleteAddress),
  linux(["ip", "addr", "flush", "dev", LINUX_INTERFACE], "Remove all addresses", flushAddresses),
  linux(["ip", "route", "add", "default", "via", gatewayParam], "Set the default gateway", addDefaultRoute),
  linux(["ip", "route", "del", "default"], "Remove the default gateway", deleteDefaultRoute),
  // 옛 명령 (net-tools). 요즘 배포판에는 기본 설치가 안 된 경우도 있지만 교재에서 많이 쓴다
  linux(["ifconfig"], "Show interfaces", ifconfigShowAll),
  linux(["ifconfig", LINUX_INTERFACE], "Show eth0", ifconfigShowEth0),
  linux(["ifconfig", LINUX_INTERFACE, addressParam], "Set the address", ifconfigSet),
  linux(["ifconfig", LINUX_INTERFACE, addressParam, "netmask", maskParam], "Set the address and subnet mask", ifconfigSet),
  linux(["ip", "route"], "Show the routing table", showIpRoute),
  linux(["ip", "route", "show"], "Show the routing table", showIpRoute),
  linux(["ip", "link"], "Show links", showLinks),
  linux(["ip", "link", "show"], "Show links", showLinks),
  linux(["ip", "link", "show", LINUX_INTERFACE], "Show the link of eth0", showLinkEth0),
  linux(["ip", "link", "set", LINUX_INTERFACE, "down"], "Turn eth0 off", setLink(false)),
  linux(["ip", "link", "set", LINUX_INTERFACE, "up"], "Turn eth0 on", setLink(true)),
  linux(["ifconfig", LINUX_INTERFACE, "down"], "Turn eth0 off", setLink(false)),
  linux(["ifconfig", LINUX_INTERFACE, "up"], "Turn eth0 on", setLink(true)),
  linux(["route", "-n"], "Show the routing table", showRouteN),
  linux(["route", "add", "default", "gw", gatewayParam], "Set the default gateway", addDefaultRoute),
  linux(["route", "del", "default"], "Remove the default gateway", deleteDefaultRoute),
];
