// T11.4.1: PC의 traceroute 명령어. Windows `tracert`, Linux `traceroute`.
// ping처럼 Document를 바꾸지 않고 Runtime만 쓴다. os.ts가 OS별 명령 목록 뒤에 붙인다.

import { errorInfo } from "@ping9/shared";
import type { ConsoleLine, OsKind, PcDevice } from "@ping9/shared";

import { customParam, defineCommand, param } from "../ios";
import type { CommandArgs, CommandContext, CommandDefinition, CommandOutcome, ParamValue } from "../ios";
import { isBroadcast, isLoopback } from "./ping";
import { linuxTracerouteLines, windowsTracertLines } from "./traceroute-output";

/** 옵션이 없을 때의 최대 hop. 실제 Windows·Linux와 같다 */
export const DEFAULT_MAX_HOPS = 30;
/** 최대 hop 옵션의 범위. 실제는 255까지지만 hop마다 추적이 하나라 기본값까지만 받는다 */
export const MAX_HOPS_MIN = 1;
export const MAX_HOPS_MAX = 30;

/** `-h 5`, `-m 5`의 hop 수 */
export function readMaxHops(value: string): ParamValue {
  const clipped = value.length > 64 ? value.slice(0, 64) : value;
  if (!/^[0-9]+$/.test(value)) return { ok: false, error: errorInfo("CLI_INVALID_VALUE", { token: clipped }) };
  const hops = Number(value);
  if (hops < MAX_HOPS_MIN || hops > MAX_HOPS_MAX) {
    return {
      ok: false,
      error: errorInfo("TRACEROUTE_HOPS_OUT_OF_RANGE", { value: clipped, min: MAX_HOPS_MIN, max: MAX_HOPS_MAX }),
    };
  }
  return { ok: true, value: hops };
}

function runTraceroute(os: OsKind, numeric: boolean, args: CommandArgs, context: CommandContext): CommandOutcome {
  const pc: PcDevice | undefined = context.device.kind === "pc" ? context.device : undefined;
  if (pc === undefined || context.runtime === undefined) return {};
  const targetIp = String(args["ip"]);
  const maxHops = args["hops"] === undefined ? DEFAULT_MAX_HOPS : Number(args["hops"]);
  const lines = (hops: Parameters<typeof windowsTracertLines>[3]): ConsoleLine[] =>
    os === "linux"
      ? linuxTracerouteLines(targetIp, pc.config.ip, maxHops, numeric, hops)
      : windowsTracertLines(targetIp, pc.config.ip, maxHops, hops);

  if (isBroadcast(targetIp, pc)) {
    return { lines: [{ kind: "error", ...errorInfo("PING_BROADCAST_UNSUPPORTED", { ip: targetIp }) }] };
  }
  if (isLoopback(targetIp, pc)) return { lines: lines({ kind: "loopback", targetIp }) };

  const run = context.runtime.traceroute({ deviceId: pc.id, targetIp, maxHops });
  if (!run.ok) return { lines: [{ kind: "error", ...run.error }] };
  return { lines: lines(run.rounds) };
}

const ipParam = param("ip", "ipv4", "Destination IPv4 address");
const hopsParam = customParam("hops", `Maximum number of hops (${MAX_HOPS_MIN}-${MAX_HOPS_MAX})`, readMaxHops);

const pcCommand = (tokens: CommandDefinition["tokens"], help: string, run: CommandDefinition["run"]) =>
  defineCommand({ modes: ["user"], devices: ["pc"], tokens, help, run });

// 이름 풀이가 없어 `-d`, `-n`이 있어도 없어도 주소로 쓴다. Windows는 출력이 같고, Linux는 `(주소)`를 뺀다
const windows = (args: CommandArgs, context: CommandContext) => runTraceroute("windows", true, args, context);
const linux = (args: CommandArgs, context: CommandContext) => runTraceroute("linux", false, args, context);
const linuxNumeric = (args: CommandArgs, context: CommandContext) => runTraceroute("linux", true, args, context);

export const WINDOWS_TRACE_COMMANDS: readonly CommandDefinition[] = [
  pcCommand(["tracert", ipParam], "Show the routers on the way (up to 30 hops)", windows),
  pcCommand(["tracert", "-d", ipParam], "Same as tracert (PING9 has no name lookup)", windows),
  pcCommand(["tracert", "-h", hopsParam, ipParam], "Trace up to the given number of hops", windows),
  pcCommand(["tracert", "-d", "-h", hopsParam, ipParam], "Trace up to the given number of hops", windows),
  pcCommand(["tracert", "-h", hopsParam, "-d", ipParam], "Trace up to the given number of hops", windows),
];

export const LINUX_TRACE_COMMANDS: readonly CommandDefinition[] = [
  pcCommand(["traceroute", ipParam], "Show the routers on the way (up to 30 hops)", linux),
  pcCommand(["traceroute", "-n", ipParam], "Print addresses only", linuxNumeric),
  pcCommand(["traceroute", "-m", hopsParam, ipParam], "Trace up to the given number of hops", linux),
  pcCommand(["traceroute", "-n", "-m", hopsParam, ipParam], "Trace up to the given number of hops", linuxNumeric),
  pcCommand(["traceroute", "-m", hopsParam, "-n", ipParam], "Trace up to the given number of hops", linuxNumeric),
];
