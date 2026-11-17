import { LIMITS, PORT_NAMES, errorInfo } from "@ping9/shared";
import type { ConsoleLine, ConsoleResult, HelpEntry, RouterDevice } from "@ping9/shared";
import type { IosConsoleEnv } from "../ios";
import { iosExec } from "../ios";
import { ROUTER_COMMANDS } from "../router";
import { computeViews } from "../../views";
import { compile, RULES, cidr, settingsOf, tunnelPort } from "./config";
import type { Settings } from "./config";

export function vyosPrompt(device: RouterDevice, env: IosConsoleEnv): string {
  return `vyos@${device.name}${env.getSession(device.id).mode === "vyos-config" ? "#" : ":~$"}`;
}
function words(line: string): string[] {
  const tokens = line.match(/'[^'\n]*'|"[^"\n]*"|[^\s'"]+/g) ?? [];
  if (tokens.join(" ") !== line.trim().replace(/\s+/g, " ") || /[;|&`]/.test(line)) throw new Error("한 줄에 명령 하나와 올바른 인용부호를 사용하세요");
  return tokens.map(token => token.replace(/^(['"])(.*)\1$/, "$2"));
}
const commands = (settings: Settings): string[] => Object.entries(settings).sort(([a], [b]) => a.localeCompare(b)).map(([path, value]) => `set ${path}${value === "" ? "" : ` '${value}'`}`);

export function vyosExec(line: string, device: RouterDevice, env: IosConsoleEnv): ConsoleResult {
  const result = (lines: readonly ConsoleLine[]): ConsoleResult => ({ lines, prompt: vyosPrompt(device, env) });
  const say = (...lines: string[]) => result(lines.map(text => ({ kind: "text", text })));
  const session = env.getSession(device.id); const configuring = session.mode === "vyos-config";
  try {
    const tokens = words(line); const [verb, ...args] = tokens; const path = args.join(" ");
    if (verb === undefined || verb.startsWith("!")) return say();
    if (verb === "configure" && args.length === 0 && !configuring) {
      env.setSession(device.id, { mode: "vyos-config", vyosCandidate: settingsOf(device.config), vyosBase: JSON.stringify(device.config) });
      return say("[edit]", "VyOS 1.4 VPN subset · educational simulation, no encryption/IKE. set/delete changes take effect at commit.");
    }
    if (verb === "exit" && args.length === 0) {
      if (configuring && commands(session.vyosCandidate ?? {}).join("\n") !== commands(settingsOf(device.config)).join("\n")) return say("Uncommitted changes. Commit them or use 'exit discard'.");
      env.setSession(device.id, { mode: "user" }); return say();
    }
    if (configuring && verb === "exit" && path === "discard") { env.setSession(device.id, { mode: "user" }); return say("Discarded candidate changes."); }
    if (configuring && verb === "discard" && !args.length) { env.setSession(device.id, { mode: "vyos-config", vyosCandidate: settingsOf(device.config), vyosBase: JSON.stringify(device.config) }); return say("Candidate reset to active configuration."); }
    if (configuring && ["set", "delete"].includes(verb!)) {
      const candidate = { ...session.vyosCandidate };
      if (verb === "set") {
        const rule = RULES.find(rule => rule.pattern.test(path));
        if (rule === undefined) throw new Error("이 VyOS 1.4 실습 범위에서 지원하지 않는 설정 경로입니다");
        const key = rule.flag ? path : args.slice(0, -1).join(" ");
        const value = rule.flag ? "" : args.at(-1)!;
        if (key.length > 256 || value.length > 64 || Object.keys(candidate).length >= 512 && candidate[key] === undefined) throw new Error("설정 길이/항목 한도를 넘었습니다");
        // prototype 계열 경로도 문서 경계의 금지 키가 되지 않게 한다.
        if (args.some(token => ["__proto__", "constructor", "prototype"].includes(token))) throw new Error("사용할 수 없는 설정 이름입니다");
        candidate[key] = value;
      } else {
        const found = Object.keys(candidate).filter(key => key === path || `${key} ${candidate[key]}` === path || key.startsWith(`${path} `));
        if (!path || found.length === 0) throw new Error("삭제할 candidate 설정이 없습니다");
        for (const key of found) delete candidate[key];
      }
      env.setSession(device.id, { ...session, vyosCandidate: candidate }); return say();
    }
    if (configuring && verb === "commit" && !args.length) {
      if (session.vyosBase !== JSON.stringify(device.config)) throw new Error("활성 설정이 다른 곳에서 변경됐습니다. discard 후 다시 설정하세요");
      const config = compile(session.vyosCandidate ?? {}, device.config);
      const applied = env.dispatch({ type: "router/commit-vyos", deviceId: device.id, config });
      if (!applied.ok) return result([{ kind: "error", ...applied.error }]);
      const current = env.getDocument().devices.find(item => item.id === device.id) as RouterDevice;
      env.setSession(device.id, { mode: "vyos-config", vyosCandidate: settingsOf(current.config), vyosBase: JSON.stringify(current.config) });
      return say("Commit complete. Educational policy model applied; no encryption/IKE.");
    }
    if (configuring && verb === "show" && !args.length) return say(...commands(session.vyosCandidate ?? {}));
    let operational = tokens;
    if (configuring) {
      if (verb !== "run") throw new Error("configure 모드에서는 set/delete/commit/show를 사용하세요. 조회·ping은 run으로 실행합니다");
      operational = args;
    }
    const op = operational.join(" ");
    if (op === "show configuration commands") return say(...commands(settingsOf(device.config)));
    if (op === "show vpn ipsec sa" || op === "show vpn ipsec connections") return delegate("show crypto ipsec sa");
    const ethernet = /^show interfaces ethernet (eth[0-3])$/.exec(op);
    if (op === "show interfaces" || ethernet !== null) {
      const ports = computeViews(env.getDocument())[device.id]?.ports ?? [];
      const rows = PORT_NAMES.router.flatMap((port, index) => {
        if (ethernet !== null && ethernet[1] !== `eth${index}`) return [];
        const iface = device.config.interfaces[port];
        return [`eth${index}  ${iface?.ip === undefined ? "unassigned" : cidr(iface.ip, iface.mask!)}  ${ports.find(item => item.name === port)?.status ?? "admin-down"}`];
      });
      return say("Interface  Address  Status", ...rows);
    }
    const tunnel = /^show interfaces tunnel (tun[0-3])$/.exec(op);
    if (tunnel) return delegate(`show interfaces ${tunnelPort(tunnel[1]!)}`);
    if (["show ip route", "show arp"].includes(op) || /^ping \d+\.\d+\.\d+\.\d+$/.test(op)) return delegate(op);
    throw new Error("지원하지 않는 VyOS 실습 명령어입니다. ?로 지원 범위를 확인하세요");
    function delegate(command: string): ConsoleResult {
      const executed = iosExec(command, device, ROUTER_COMMANDS, { ...env, getSession: () => ({ mode: "privileged" }), setSession: () => {} });
      return result(executed.lines.map(line => line.kind !== "text" ? line : { ...line, text: line.text
        .replace(/GigabitEthernet0\/([0-3])/g, "eth$1").replace(/Tunnel([0-3])/g, "tun$1") }));
    }
  } catch (error) {
    return result([{ kind: "text", text: `% ${error instanceof Error ? error.message : "Invalid VyOS command"}` },
      { kind: "error", ...errorInfo("CLI_INVALID_VALUE", { token: "VyOS configuration" }) }]);
  }
}

const SET_PATHS = [
  ...["ethernet eth0", "tunnel tun0"].flatMap(iface => [`interfaces ${iface} address <IPv4/prefix>`, `interfaces ${iface} disable`]),
  ...["encapsulation gre", "source-address <IPv4>", "remote <IPv4>"].map(path => `interfaces tunnel tun0 ${path}`),
  "protocols static route <prefix> next-hop <IPv4>", "vpn ipsec interface eth1",
  "vpn ipsec authentication psk <name> id <peer-id>", "vpn ipsec authentication psk <name> secret <lab-secret>",
  ...["key-exchange ikev2", "lifetime <seconds>", "proposal 10 encryption aes256", "proposal 10 hash sha256", "proposal 10 dh-group 14"].map(path => `vpn ipsec ike-group <name> ${path}`),
  ...["mode tunnel", "lifetime <seconds>", "pfs enable", "proposal 10 encryption aes256", "proposal 10 hash sha256"].map(path => `vpn ipsec esp-group <name> ${path}`),
  ...["local-address <IPv4>", "remote-address <IPv4>", "authentication mode pre-shared-secret", "authentication local-id <peer-id>", "authentication remote-id <peer-id>", "ike-group <name>", "default-esp-group <name>", "tunnel 0 local prefix <prefix>", "tunnel 0 remote prefix <prefix>", "tunnel 0 disable"].map(path => `vpn ipsec site-to-site peer <name> ${path}`),
];
function suggestions(device: RouterDevice, env: IosConsoleEnv, line: string): string[] {
  const session = env.getSession(device.id);
  const op = ["show configuration commands", "show vpn ipsec sa", "show vpn ipsec connections", "show interfaces", "show interfaces ethernet eth0", "show interfaces tunnel tun0", "show ip route", "show arp", "ping <IPv4>"];
  if (session.mode !== "vyos-config") return ["configure", ...op];
  const entered = line.split(" ");
  const paths = SET_PATHS.map(path => `set ${path}`.split(" ").map((token, i) => {
    const actual = entered[i];
    if (actual && (token === "<name>" || token === "<prefix>" || /^eth[0-3]$/.test(token) && /^eth[0-3]$/.test(actual) || /^tun[0-3]$/.test(token) && /^tun[0-3]$/.test(actual))) return actual;
    return token;
  }).join(" "));
  return ["commit", "discard", "exit", "exit discard", "show", ...op.map(command => `run ${command}`),
    ...paths, ...Object.keys(session.vyosCandidate ?? {}).map(key => `delete ${key}`)];
}
export function vyosHelp(line: string, device: RouterDevice, env: IosConsoleEnv): HelpEntry[] {
  if (line.length > LIMITS.maxConsoleLineLength) return [];
  const options = suggestions(device, env, line).filter(candidate => candidate.startsWith(line));
  return [...new Set(options.map(candidate => candidate.slice(line.length).trim().split(" ")[0] ?? "<Enter>"))].sort().map(token => ({ token: token || "<Enter>", description: "VyOS 1.4 supported VPN subset" }));
}
export function vyosComplete(line: string, device: RouterDevice, env: IosConsoleEnv): string | null {
  if (line.length > LIMITS.maxConsoleLineLength) return null;
  const options = suggestions(device, env, line).filter(candidate => candidate.startsWith(line));
  if (!options.length) return null;
  let common = options[0]!;
  for (const option of options) { let i = 0; while (i < common.length && common[i] === option[i]) i++; common = common.slice(0, i); }
  return common.length <= line.length ? null : options.length === 1 && !common.includes("<") ? `${common} ` : common;
}
