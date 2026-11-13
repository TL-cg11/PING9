import { IPSEC_DEFAULT_POLICY, PORT_NAMES, checkHostIpv4, checkIpv4, checkMask, isIpsecName, maskToPrefixLength, networkAddress, prefixLengthToMask } from "@ping9/shared";
import type { GreTunnelConfig, IpsecProfileConfig, RouterConfig, RouterInterfaceConfig, StaticRoute } from "@ping9/shared";

export type Settings = Readonly<Record<string, string>>;
const NAME = "[A-Za-z0-9_-]{1,32}";
export const RULES: readonly { pattern: RegExp; flag: boolean; sample: string }[] = [
  { pattern: /^interfaces (?:tunnel tun[0-3]|ethernet eth[0-3]) address \S+$/, flag: true, sample: "interfaces tunnel tun0 address <IPv4/prefix>" },
  { pattern: /^interfaces (?:tunnel tun[0-3]|ethernet eth[0-3]) disable$/, flag: true, sample: "interfaces tunnel tun0 disable" },
  { pattern: /^interfaces tunnel tun[0-3] (?:encapsulation|source-address|remote) \S+$/, flag: false, sample: "interfaces tunnel tun0 encapsulation gre" },
  { pattern: /^protocols static route \S+ next-hop \S+$/, flag: true, sample: "protocols static route <prefix> next-hop <IPv4>" },
  { pattern: /^vpn ipsec interface eth[0-3]$/, flag: true, sample: "vpn ipsec interface eth1" },
  { pattern: new RegExp(`^vpn ipsec authentication psk ${NAME} id \\S+$`), flag: true, sample: "vpn ipsec authentication psk LAB id <peer-id>" },
  { pattern: new RegExp(`^vpn ipsec authentication psk ${NAME} secret \\S+$`), flag: false, sample: "vpn ipsec authentication psk LAB secret <lab-secret>" },
  { pattern: new RegExp(`^vpn ipsec ike-group ${NAME} (?:key-exchange|lifetime) \\S+$`), flag: false, sample: "vpn ipsec ike-group IKE key-exchange ikev2" },
  { pattern: new RegExp(`^vpn ipsec ike-group ${NAME} proposal 10 (?:encryption|hash|dh-group) \\S+$`), flag: false, sample: "vpn ipsec ike-group IKE proposal 10 encryption aes256" },
  { pattern: new RegExp(`^vpn ipsec esp-group ${NAME} (?:mode|lifetime|pfs) \\S+$`), flag: false, sample: "vpn ipsec esp-group ESP mode tunnel" },
  { pattern: new RegExp(`^vpn ipsec esp-group ${NAME} proposal 10 (?:encryption|hash) \\S+$`), flag: false, sample: "vpn ipsec esp-group ESP proposal 10 encryption aes256" },
  { pattern: new RegExp(`^vpn ipsec site-to-site peer ${NAME} (?:local-address|remote-address|ike-group|default-esp-group) \\S+$`), flag: false, sample: "vpn ipsec site-to-site peer R2 remote-address <IPv4>" },
  { pattern: new RegExp(`^vpn ipsec site-to-site peer ${NAME} authentication (?:mode|local-id|remote-id) \\S+$`), flag: false, sample: "vpn ipsec site-to-site peer R2 authentication mode pre-shared-secret" },
  { pattern: new RegExp(`^vpn ipsec site-to-site peer ${NAME} tunnel 0 (?:local|remote) prefix \\S+$`), flag: false, sample: "vpn ipsec site-to-site peer R2 tunnel 0 local prefix <subnet>" },
  { pattern: new RegExp(`^vpn ipsec site-to-site peer ${NAME} tunnel 0 disable$`), flag: true, sample: "vpn ipsec site-to-site peer R2 tunnel 0 disable" },
];
const ensure = (ok: unknown, message: string): void => { if (!ok) throw new Error(message); };
export const physicalPort = (eth: string): string => PORT_NAMES.router[Number(eth.slice(3))]!;
export const tunnelPort = (tun: string): string => `Tunnel${tun.slice(3)}`;
export const cidr = (ip: string, mask: string): string => `${ip}/${maskToPrefixLength(mask)}`;
export function subnet(value: string) {
  const [network, prefix, extra] = value.split("/");
  ensure(extra === undefined && network !== undefined && /^\d{1,2}$/.test(prefix ?? ""), `IPv4/prefix 값이 필요합니다: ${value}`);
  const mask = prefixLengthToMask(Number(prefix));
  ensure(mask !== null && checkIpv4(network!) === null && checkMask(mask) === null, `잘못된 prefix: ${value}`);
  return { network: network!, mask: mask! };
}
function duration(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  ensure(/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 86400, "lifetime은 1~86400초입니다");
  return Number(value);
}
function names(settings: Settings, prefix: string): string[] {
  return [...new Set(Object.keys(settings).filter(key => key.startsWith(`${prefix} `)).map(key => key.slice(prefix.length + 1).split(" ")[0]!))].sort();
}
function spi(source: string, target: string): number {
  // 교육용 결정적 식별 번호이며 암호학적 함수나 실제 IKE가 아니다.
  let hash = 2166136261;
  for (const ch of `${source}>${target}`) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
  return 256 + hash % (0xffffffff - 255);
}
export function settingsOf(config: RouterConfig): Settings {
  if (config.vyos !== undefined) return { ...config.vyos };
  const result: Record<string, string> = {};
  for (const [index, port] of PORT_NAMES.router.entries()) {
    const iface = config.interfaces[port];
    if (iface?.ip !== undefined) result[`interfaces ethernet eth${index} address ${cidr(iface.ip, iface.mask!)}`] = "";
    if (!iface?.adminUp) result[`interfaces ethernet eth${index} disable`] = "";
  }
  for (const [name, tunnel] of Object.entries(config.tunnels ?? {})) {
    const root = `interfaces tunnel tun${name.slice(6)}`;
    result[`${root} encapsulation`] = "gre";
    if (tunnel.ip !== undefined) result[`${root} address ${cidr(tunnel.ip, tunnel.mask!)}`] = "";
    if (tunnel.source !== undefined && config.interfaces[tunnel.source]?.ip !== undefined) result[`${root} source-address`] = config.interfaces[tunnel.source]!.ip!;
    if (tunnel.destination !== undefined) result[`${root} remote`] = tunnel.destination;
    if (!tunnel.adminUp) result[`${root} disable`] = "";
  }
  for (const route of config.staticRoutes) {
    ensure(route.distance === undefined || route.distance === 1, "이 VyOS 지원 범위에서는 AD가 지정된 정적 경로를 변환할 수 없습니다");
    result[`protocols static route ${cidr(route.network, route.mask)} next-hop ${route.nextHop}`] = "";
  }
  for (const [name, profile] of Object.entries(config.ipsec ?? {})) {
    ensure(profile.local !== undefined && profile.remote !== undefined && profile.interface !== undefined && profile.peer !== undefined && profile.keyId !== undefined, "미완성 기존 IPsec 프로필을 먼저 완성하거나 삭제하세요");
    const source = config.interfaces[profile.interface!]?.ip;
    ensure(source !== undefined, "기존 IPsec source 인터페이스에 IP가 필요합니다");
    const policy = JSON.parse(profile.policy ?? IPSEC_DEFAULT_POLICY) as Record<string, string>;
    const index = Object.keys(config.ipsec ?? {}).indexOf(name);
    const ike = `IKE_${index}`, esp = `ESP_${index}`, psk = `PSK_${index}`;
    result[`vpn ipsec interface eth${PORT_NAMES.router.indexOf(profile.interface! as typeof PORT_NAMES.router[number])}`] = "";
    result[`vpn ipsec ike-group ${ike} key-exchange`] = policy.ike!;
    result[`vpn ipsec ike-group ${ike} lifetime`] = "28800";
    for (const [field, value] of [["encryption", policy.ikeEncryption!], ["hash", policy.ikeHash!], ["dh-group", policy.dh!]]) result[`vpn ipsec ike-group ${ike} proposal 10 ${field}`] = value!;
    result[`vpn ipsec esp-group ${esp} mode`] = "tunnel";
    result[`vpn ipsec esp-group ${esp} lifetime`] = String(profile.lifetimeSeconds ?? 3600);
    result[`vpn ipsec esp-group ${esp} pfs`] = policy.pfs!;
    result[`vpn ipsec esp-group ${esp} proposal 10 encryption`] = policy.espEncryption!;
    result[`vpn ipsec esp-group ${esp} proposal 10 hash`] = policy.espHash!;
    result[`vpn ipsec authentication psk ${psk} id ${profile.localId ?? source}`] = "";
    result[`vpn ipsec authentication psk ${psk} id ${profile.remoteId ?? profile.peer}`] = "";
    result[`vpn ipsec authentication psk ${psk} secret`] = profile.keyId!;
    const root = `vpn ipsec site-to-site peer ${name}`;
    result[`${root} local-address`] = source!; result[`${root} remote-address`] = profile.peer!;
    result[`${root} authentication mode`] = "pre-shared-secret";
    if (profile.localId !== undefined) result[`${root} authentication local-id`] = profile.localId;
    if (profile.remoteId !== undefined) result[`${root} authentication remote-id`] = profile.remoteId;
    result[`${root} ike-group`] = ike; result[`${root} default-esp-group`] = esp;
    result[`${root} tunnel 0 local prefix`] = cidr(profile.local!.network, profile.local!.mask);
    result[`${root} tunnel 0 remote prefix`] = cidr(profile.remote!.network, profile.remote!.mask);
    if (!profile.adminUp) result[`${root} tunnel 0 disable`] = "";
  }
  return result;
}

export function compile(settings: Settings, base: RouterConfig): RouterConfig {
  ensure(Object.keys(settings).length <= 512, "설정은 512항목까지입니다");
  for (const [key, value] of Object.entries(settings)) ensure(RULES.some(rule => rule.pattern.test(value === "" ? key : `${key} ${value}`) && rule.flag === (value === "")), `미지원 설정 경로: ${key}`);
  // 참조되지 않은 그룹의 오타도 성공한 설정으로 남기지 않는다.
  for (const [key, value] of Object.entries(settings)) {
    if (/^vpn ipsec ike-group \S+ key-exchange$/.test(key)) ensure(["ikev1", "ikev2"].includes(value), "key-exchange는 ikev1/ikev2입니다");
    if (/^vpn ipsec (?:ike|esp)-group \S+ proposal 10 encryption$/.test(key)) ensure(["aes128", "aes256"].includes(value), "encryption은 aes128/aes256입니다");
    if (/^vpn ipsec (?:ike|esp)-group \S+ proposal 10 hash$/.test(key)) ensure(["sha1", "sha256"].includes(value), "hash는 sha1/sha256입니다");
    if (/^vpn ipsec ike-group \S+ proposal 10 dh-group$/.test(key)) ensure(["14", "19"].includes(value), "dh-group은 14/19입니다");
    if (/^vpn ipsec esp-group \S+ pfs$/.test(key)) ensure(["enable", "disable"].includes(value), "pfs는 enable/disable입니다");
    if (/^vpn ipsec esp-group \S+ mode$/.test(key)) ensure(value === "tunnel", "ESP tunnel mode만 지원합니다");
    if (/^vpn ipsec (?:ike|esp)-group \S+ lifetime$/.test(key)) duration(value, 3600);
    if (/^vpn ipsec authentication psk \S+ secret$/.test(key)) ensure(isIpsecName(value), "교육용 PSK는 영문·숫자·-·_로 1~32자입니다");
  }
  const interfaces: Record<string, RouterInterfaceConfig> = {};
  for (const [index, port] of PORT_NAMES.router.entries()) {
    const root = `interfaces ethernet eth${index}`;
    const addresses = Object.keys(settings).filter(key => key.startsWith(`${root} address `));
    ensure(addresses.length <= 1, "물리 포트당 IPv4 주소 하나만 지원합니다");
    const address = addresses[0] === undefined ? undefined : subnet(addresses[0].slice(`${root} address `.length));
    interfaces[port] = { adminUp: settings[`${root} disable`] === undefined, ...(address === undefined ? {} : { ip: address.network, mask: address.mask }) };
  }
  const tunnels: Record<string, GreTunnelConfig> = {};
  for (const name of names(settings, "interfaces tunnel")) {
    const root = `interfaces tunnel ${name}`;
    const addresses = Object.keys(settings).filter(key => key.startsWith(`${root} address `));
    const sourceIp = settings[`${root} source-address`], destination = settings[`${root} remote`];
    const source = PORT_NAMES.router.find(port => interfaces[port]?.ip === sourceIp);
    ensure(settings[`${root} encapsulation`] === "gre" && sourceIp !== undefined && source !== undefined && addresses.length === 1 && destination !== undefined && checkHostIpv4(destination) === null, `${name}: GRE 형식·로컬 source IP·remote·주소 하나가 필요합니다`);
    const address = subnet(addresses[0]!.slice(`${root} address `.length));
    tunnels[tunnelPort(name)] = { mode: "gre", adminUp: settings[`${root} disable`] === undefined, source: source!, destination: destination!, ip: address.network, mask: address.mask };
  }
  const staticRoutes: StaticRoute[] = [];
  for (const key of Object.keys(settings)) if (key.startsWith("protocols static route ")) {
    const match = /^protocols static route (\S+) next-hop (\S+)$/.exec(key)!;
    const address = subnet(match[1]!);
    ensure(networkAddress(address.network, address.mask) === address.network && checkHostIpv4(match[2]!) === null, "정적 경로의 prefix/next-hop이 잘못되었습니다");
    staticRoutes.push({ network: address.network, mask: address.mask, nextHop: match[2]! });
  }
  const ipsec: Record<string, IpsecProfileConfig> = {};
  for (const name of names(settings, "vpn ipsec site-to-site peer")) {
    const root = `vpn ipsec site-to-site peer ${name}`;
    const required = (key: string): string => { const value = settings[`${root} ${key}`]; ensure(value !== undefined, `${name}: ${key}가 필요합니다`); return value!; };
    const local = required("local-address"), peer = required("remote-address");
    const port = PORT_NAMES.router.find(port => interfaces[port]?.ip === local);
    ensure(port !== undefined && checkHostIpv4(peer) === null, `${name}: local-address는 자기 물리 IP여야 합니다`);
    ensure(settings[`vpn ipsec interface eth${PORT_NAMES.router.indexOf(port!)}`] !== undefined, `${name}: vpn ipsec interface 설정이 필요합니다`);
    ensure(required("authentication mode") === "pre-shared-secret", "PSK 방식만 지원합니다");
    const keys = names(settings, "vpn ipsec authentication psk").filter(psk => {
      const prefix = `vpn ipsec authentication psk ${psk}`;
      return settings[`${prefix} id ${settings[`${root} authentication local-id`] ?? local}`] !== undefined && settings[`${prefix} id ${settings[`${root} authentication remote-id`] ?? peer}`] !== undefined;
    });
    ensure(keys.length === 1, `${name}: 양쪽 id와 일치하는 PSK 하나가 필요합니다`);
    const secret = settings[`vpn ipsec authentication psk ${keys[0]} secret`];
    ensure(secret !== undefined && isIpsecName(secret), "교육용 PSK는 영문·숫자·-·_로 1~32자입니다");
    const ike = `vpn ipsec ike-group ${required("ike-group")}`, esp = `vpn ipsec esp-group ${required("default-esp-group")}`;
    const get = (path: string): string => { const value = settings[path]; ensure(value !== undefined, `${path}가 필요합니다`); return value!; };
    const policy = { ike: get(`${ike} key-exchange`), ikeEncryption: get(`${ike} proposal 10 encryption`), ikeHash: get(`${ike} proposal 10 hash`), dh: get(`${ike} proposal 10 dh-group`), espEncryption: get(`${esp} proposal 10 encryption`), espHash: get(`${esp} proposal 10 hash`), pfs: settings[`${esp} pfs`] ?? "enable" };
    ensure(["ikev1", "ikev2"].includes(policy.ike) && ["aes128", "aes256"].includes(policy.ikeEncryption) && ["aes128", "aes256"].includes(policy.espEncryption) && ["sha1", "sha256"].includes(policy.ikeHash) && ["sha1", "sha256"].includes(policy.espHash) && ["14", "19"].includes(policy.dh) && ["enable", "disable"].includes(policy.pfs) && get(`${esp} mode`) === "tunnel", "미지원 IKE/ESP 정책 값입니다");
    duration(settings[`${ike} lifetime`], 28800);
    const old = base.ipsec?.[name];
    ipsec[name] = { bypassWhenDisabled: true, adminUp: settings[`${root} tunnel 0 disable`] === undefined, interface: port!, peer, keyId: secret!,
      localId: settings[`${root} authentication local-id`] ?? local, remoteId: settings[`${root} authentication remote-id`] ?? peer,
      local: subnet(required("tunnel 0 local prefix")), remote: subnet(required("tunnel 0 remote prefix")),
      inboundSpi: old?.peer === peer && old.interface === port ? old.inboundSpi ?? spi(peer, local) : spi(peer, local),
      outboundSpi: old?.peer === peer && old.interface === port ? old.outboundSpi ?? spi(local, peer) : spi(local, peer),
      lifetimeSeconds: duration(settings[`${esp} lifetime`], 3600), policy: JSON.stringify(policy) };
  }
  return { ...base, cliStyle: "vyos", vpnMode: undefined, interfaces, staticRoutes,
    tunnels: Object.keys(tunnels).length ? tunnels : undefined, ipsec: Object.keys(ipsec).length ? ipsec : undefined,
    vyos: Object.fromEntries(Object.entries(settings).sort(([a], [b]) => a.localeCompare(b))) };
}
