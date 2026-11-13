import { errorInfo } from "./codes";
import type { ErrorInfo } from "./codes";
import { PORT_NAMES } from "./document";
import type { IpsecProfileConfig, Ipv4Subnet, RouterConfig } from "./document";
import { checkHostIpv4, checkMask, checkIpv4, isSameNetwork, networkAddress, networksOverlap } from "./values";

export const IPSEC_DEFAULT_LIFETIME = 3600;
export const IPSEC_MAX_PROFILES = 4;
export const IPSEC_MAX_SEQUENCE = 0xffffffff;
export const IPSEC_REPLAY_WINDOW = 64;
export const isIpsecName = (name: string): boolean => /^[a-zA-Z0-9_-]{1,32}$/.test(name);
export const inSubnet = (ip: string, subnet: Ipv4Subnet | undefined): boolean => subnet !== undefined && isSameNetwork(ip, subnet.network, subnet.mask);
export const ipsecSelectorMatches = (profile: IpsecProfileConfig, source: string, destination: string): boolean =>
  (profile.adminUp || !profile.bypassWhenDisabled) && inSubnet(source, profile.local) && inSubnet(destination, profile.remote);
export const isCompleteIpsecProfile = (profile: IpsecProfileConfig): boolean => profile.interface !== undefined && profile.peer !== undefined &&
  profile.local !== undefined && profile.remote !== undefined && profile.keyId !== undefined && profile.inboundSpi !== undefined && profile.outboundSpi !== undefined;

export function checkIpsec(config: RouterConfig): ErrorInfo | null {
  const entries = Object.entries(config.ipsec ?? {});
  const invalid = (detail: string) => errorInfo("IPSEC_INVALID_CONFIG", { detail });
  if (entries.length > IPSEC_MAX_PROFILES) return invalid(`Router당 프로필은 ${IPSEC_MAX_PROFILES}개까지입니다`);
  for (const [name, profile] of entries) {
    if (!isIpsecName(name)) return invalid("프로필 이름은 영문자·숫자·-·_로 1~32자입니다");
    if (profile.interface !== undefined && !(PORT_NAMES.router as readonly string[]).includes(profile.interface)) return invalid(`${name}: 물리 인터페이스를 지정하세요`);
    if (profile.peer !== undefined) {
      const error = checkHostIpv4(profile.peer);
      if (error !== null) return error;
      if (Object.values(config.interfaces).some(iface => iface.ip === profile.peer)) return invalid(`${name}: peer는 자기 IP일 수 없습니다`);
    }
    for (const subnet of [profile.local, profile.remote]) {
      if (subnet === undefined) continue;
      const error = checkIpv4(subnet.network) ?? checkMask(subnet.mask);
      if (error !== null) return error;
      if (networkAddress(subnet.network, subnet.mask) !== subnet.network) return invalid(`${name}: subnet은 네트워크 주소로 입력하세요`);
    }
    if (profile.local !== undefined && profile.remote !== undefined && networksOverlap(profile.local.network, profile.local.mask, profile.remote.network, profile.remote.mask)) {
      return invalid(`${name}: local/remote subnet은 겹칠 수 없습니다`);
    }
    if (profile.keyId !== undefined && !isIpsecName(profile.keyId)) return invalid(`${name}: key-id는 공개 실습 식별자(영문자·숫자·-·_, 1~32자)입니다`);
    for (const spi of [profile.inboundSpi, profile.outboundSpi]) {
      if (spi !== undefined && (!Number.isInteger(spi) || spi < 256 || spi > IPSEC_MAX_SEQUENCE)) return invalid(`${name}: SPI는 256~4294967295의 정수입니다`);
    }
    if (profile.lifetimeSeconds !== undefined && (!Number.isInteger(profile.lifetimeSeconds) || profile.lifetimeSeconds < 1 || profile.lifetimeSeconds > 86400)) {
      return invalid(`${name}: lifetime은 가상 시간 1~86400초입니다`);
    }
    for (const [otherName, other] of entries) {
      if (name === otherName) continue;
      if (profile.local !== undefined && profile.remote !== undefined && other.local !== undefined && other.remote !== undefined &&
        networksOverlap(profile.local.network, profile.local.mask, other.local.network, other.local.mask) &&
        networksOverlap(profile.remote.network, profile.remote.mask, other.remote.network, other.remote.mask)) return invalid(`${name}: ${otherName}과 보호 대상이 겹칩니다`);
      if (profile.inboundSpi !== undefined && profile.inboundSpi === other.inboundSpi) return invalid(`${name}: inbound SPI는 Router 안에서 달라야 합니다`);
    }
  }
  return null;
}

/** 기존 교육 모델과 VyOS의 기본 정책 대응값. 실제 협상 결과가 아니다. */
export const IPSEC_DEFAULT_POLICY = JSON.stringify({ ike: "ikev2", ikeEncryption: "aes256", ikeHash: "sha256", dh: "14", espEncryption: "aes256", espHash: "sha256", pfs: "enable" });
