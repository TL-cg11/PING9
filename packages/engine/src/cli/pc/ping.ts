// T1.8.3: PC의 `ping`과 ARP 명령어 정의 (FR-24, FR-38). OS마다 문법과 출력이 다르다.
// 이 명령어들은 Document를 바꾸지 않고 Runtime만 쓴다 (`CommandContext.runtime`).
// os.ts가 OS별 기본 명령 목록 뒤에 이 목록을 붙인다.

import { errorInfo, osOf, parseIpv4 } from "@ping9/shared";
import type { ConsoleLine, ErrorInfo, OsKind, PcDevice } from "@ping9/shared";

import { TTL_BY_OS } from "../../devices/pc/pc-model";
import { customParam, defineCommand, param } from "../ios";
import type { CommandArgs, CommandContext, CommandDefinition, CommandOutcome, ParamValue } from "../ios";
import {
  linuxArpLines,
  linuxNeighLines,
  linuxPingLines,
  loopbackPingLines,
  windowsArpLines,
  windowsPingLines,
} from "./ping-output";

/** 옵션이 없을 때의 횟수. Linux도 Ctrl+C가 없어 4회로 끝낸다 (설계 10절 3) */
export const DEFAULT_PING_COUNT = 4;
/** 횟수 옵션의 범위. 보관하는 추적이 20개라 한 번의 ping이 목록을 다 밀어내지 않게 한다 */
export const PING_COUNT_MIN = 1;
export const PING_COUNT_MAX = 10;

const text = (value: string): ConsoleLine => ({ kind: "text", text: value });
const errorLine = (error: ErrorInfo): ConsoleLine => ({ kind: "error", ...error });

function pcOf(context: CommandContext): PcDevice | undefined {
  return context.device.kind === "pc" ? context.device : undefined;
}

/** `-n 4`, `-c 4`의 횟수 */
export function readCount(value: string): ParamValue {
  const clipped = value.length > 64 ? value.slice(0, 64) : value;
  if (!/^[0-9]+$/.test(value)) return { ok: false, error: errorInfo("CLI_INVALID_VALUE", { token: clipped }) };
  const count = Number(value);
  if (count < PING_COUNT_MIN || count > PING_COUNT_MAX) {
    return {
      ok: false,
      error: errorInfo("PING_COUNT_OUT_OF_RANGE", { value: clipped, min: PING_COUNT_MIN, max: PING_COUNT_MAX }),
    };
  }
  return { ok: true, value: count };
}

/** 255.255.255.255이거나 이 PC 네트워크의 브로드캐스트 주소 (MAL-6) */
export function isBroadcast(target: string, pc: PcDevice): boolean {
  if (target === "255.255.255.255") return true;
  const { ip, mask } = pc.config;
  if (ip === undefined || mask === undefined) return false;
  const address = parseIpv4(ip);
  const bits = parseIpv4(mask);
  const wanted = parseIpv4(target);
  if (address === null || bits === null || wanted === null) return false;
  // 32비트 정수의 비트 연산은 부호가 생기므로 >>> 0으로 양수로 되돌린다
  return ((address | ~bits) >>> 0) === wanted;
}

/** 링크를 지나지 않는 주소: 자기 IP, 127.0.0.0/8 */
export function isLoopback(target: string, pc: PcDevice): boolean {
  return target === pc.config.ip || target.startsWith("127.");
}

function runPing(os: OsKind, args: CommandArgs, context: CommandContext): CommandOutcome {
  const pc = pcOf(context);
  if (pc === undefined || context.runtime === undefined) return {};
  const targetIp = String(args["ip"]);
  const count = args["count"] === undefined ? DEFAULT_PING_COUNT : Number(args["count"]);

  if (isBroadcast(targetIp, pc)) {
    return { lines: [errorLine(errorInfo("PING_BROADCAST_UNSUPPORTED", { ip: targetIp }))] };
  }
  if (isLoopback(targetIp, pc)) {
    return { lines: loopbackPingLines(os, targetIp, count, TTL_BY_OS[osOf(pc.config)]) };
  }

  const run = context.runtime.ping({ deviceId: pc.id, targetIp, count, stopOnUnsent: os === "linux" });
  if (!run.ok) return { lines: [errorLine(run.error)] };
  const ownIp = pc.config.ip;
  return {
    lines: os === "linux" ? linuxPingLines(targetIp, ownIp, run.rounds) : windowsPingLines(targetIp, ownIp, run.rounds),
  };
}

function showArp(os: OsKind, format: "arp" | "neigh") {
  return (_args: CommandArgs, context: CommandContext): CommandOutcome => {
    const pc = pcOf(context);
    if (pc === undefined || context.runtime === undefined) return {};
    const entries = context.runtime.arpTable(pc.id);
    if (os === "windows") return { lines: windowsArpLines(pc.config.ip, entries) };
    return { lines: format === "neigh" ? linuxNeighLines(entries) : linuxArpLines(entries) };
  };
}

function clearAllArp(_args: CommandArgs, context: CommandContext): CommandOutcome {
  const pc = pcOf(context);
  if (pc === undefined || context.runtime === undefined) return {};
  context.runtime.clearArp(pc.id);
  return {};
}

/** 한 항목만 지운다. 없으면 OS의 문구를 낸다 */
function clearOneArp(os: OsKind) {
  return (args: CommandArgs, context: CommandContext): CommandOutcome => {
    const pc = pcOf(context);
    if (pc === undefined || context.runtime === undefined) return {};
    const ip = String(args["ip"]);
    if (context.runtime.clearArp(pc.id, ip)) return {};
    return { lines: [text(os === "linux" ? `No ARP entry for ${ip}` : "The specified entry was not found.")] };
  };
}

const ipParam = param("ip", "ipv4", "Destination IPv4 address");
const countParam = customParam("count", `Number of echo requests (${PING_COUNT_MIN}-${PING_COUNT_MAX})`, readCount);

const pcCommand = (tokens: CommandDefinition["tokens"], help: string, run: CommandDefinition["run"]) =>
  defineCommand({ modes: ["user"], devices: ["pc"], tokens, help, run });

const windowsPing = (args: CommandArgs, context: CommandContext) => runPing("windows", args, context);
const linuxPing = (args: CommandArgs, context: CommandContext) => runPing("linux", args, context);

export const WINDOWS_NETWORK_COMMANDS: readonly CommandDefinition[] = [
  pcCommand(["ping", ipParam], "Send 4 echo requests", windowsPing),
  pcCommand(["ping", "-n", countParam, ipParam], "Send the given number of echo requests", windowsPing),
  pcCommand(["ping", ipParam, "-n", countParam], "Send the given number of echo requests", windowsPing),
  pcCommand(["arp", "-a"], "Show the ARP table", showArp("windows", "arp")),
  pcCommand(["arp", "-d"], "Delete all ARP entries", clearAllArp),
  pcCommand(["arp", "-d", "*"], "Delete all ARP entries", clearAllArp),
  pcCommand(["arp", "-d", ipParam], "Delete one ARP entry", clearOneArp("windows")),
];

export const LINUX_NETWORK_COMMANDS: readonly CommandDefinition[] = [
  pcCommand(["ping", ipParam], "Send 4 echo requests (no Ctrl+C here)", linuxPing),
  pcCommand(["ping", "-c", countParam, ipParam], "Send the given number of echo requests", linuxPing),
  pcCommand(["ping", ipParam, "-c", countParam], "Send the given number of echo requests", linuxPing),
  pcCommand(["ip", "neigh"], "Show the neighbour (ARP) table", showArp("linux", "neigh")),
  pcCommand(["ip", "neigh", "show"], "Show the neighbour (ARP) table", showArp("linux", "neigh")),
  pcCommand(["ip", "neigh", "flush", "all"], "Delete all neighbour entries", clearAllArp),
  // 옛 명령 (net-tools). ifconfig, route와 같이 둔다 (설계 10절 8)
  pcCommand(["arp", "-a"], "Show the ARP table", showArp("linux", "arp")),
  pcCommand(["arp", "-d", ipParam], "Delete one ARP entry", clearOneArp("linux")),
];
