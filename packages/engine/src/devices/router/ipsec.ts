import { IPSEC_DEFAULT_LIFETIME, IPSEC_DEFAULT_POLICY, IPSEC_MAX_SEQUENCE, IPSEC_REPLAY_WINDOW, inSubnet, ipsecSelectorMatches, isCompleteIpsecProfile, ipsecEnabled } from "@ping9/shared";
import type { EspPacket, IcmpMessage, IpsecSaView, Ipv4Header, PortView, RouterConfig, RouterDevice } from "@ping9/shared";

type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly detail: string };
const failed = (detail: string): Result<never> => ({ ok: false, detail });

interface Sa {
  readonly startedAt: number;
  txSequence: number;
  rxHighest: number;
  readonly received: Set<number>;
  encapsulated: number;
  decapsulated: number;
  rejected: number;
}

/** 실제 IKE/암호화/무결성 인증이 없는 수동 SA 교육 모델. 모델 밖의 통신을 보호하지 않는다. */
export class IpsecModule {
  readonly #device: () => RouterDevice;
  readonly #sas = new Map<string, Sa>();

  constructor(device: () => RouterDevice) { this.#device = device; }

  outbound(ipv4: Ipv4Header): string | undefined {
    if (!ipsecEnabled(this.#device().config)) return undefined;
    return Object.entries(this.#device().config.ipsec ?? {}).find(([, profile]) =>
      ipsecSelectorMatches(profile, ipv4.sourceIp, ipv4.destinationIp))?.[0];
  }

  requiredInbound(ipv4: Ipv4Header): string | undefined {
    if (!ipsecEnabled(this.#device().config)) return undefined;
    return Object.entries(this.#device().config.ipsec ?? {}).find(([, profile]) =>
      ipsecSelectorMatches(profile, ipv4.destinationIp, ipv4.sourceIp))?.[0];
  }

  /** Router 출발 실습 ping도 보호 subnet에 속하는 자기 주소를 사용한다. */
  sourceFor(target: string): string | undefined {
    const device = this.#device();
    if (!ipsecEnabled(device.config)) return undefined;
    const profile = Object.values(device.config.ipsec ?? {}).find(profile => (profile.adminUp || !profile.bypassWhenDisabled) && inSubnet(target, profile.remote));
    if (profile === undefined) return undefined;
    return Object.values(device.config.interfaces).find(iface => iface.adminUp && iface.ip !== undefined && inSubnet(iface.ip, profile.local))?.ip;
  }

  #sa(name: string, now: number): Sa {
    let sa = this.#sas.get(name);
    if (sa === undefined) {
      sa = { startedAt: now, txSequence: 0, rxHighest: 0, received: new Set(), encapsulated: 0, decapsulated: 0, rejected: 0 };
      this.#sas.set(name, sa);
    }
    return sa;
  }

  #expired(name: string, sa: Sa, now: number): boolean {
    const lifetime = this.#device().config.ipsec?.[name]?.lifetimeSeconds ?? IPSEC_DEFAULT_LIFETIME;
    return now - sa.startedAt >= lifetime * 1_000_000;
  }

  reject(name: string, now: number): void { if (this.#device().config.ipsec?.[name] !== undefined) this.#sa(name, now).rejected++; }

  protect(name: string, ipv4: Ipv4Header, icmp: IcmpMessage | undefined, now: number): Result<EspPacket> {
    const profile = this.#device().config.ipsec?.[name];
    if (!ipsecEnabled(this.#device().config)) return failed("IPsec 사용 모드가 꺼져 있습니다");
    if (profile === undefined || !profile.adminUp || !isCompleteIpsecProfile(profile)) return failed("프로필이 꺼져 있거나 SA 설정이 미완성입니다");
    const sa = this.#sa(name, now);
    if (this.#expired(name, sa, now)) return failed("SA lifetime expired; 새 SPI/키 식별자로 재설정하세요");
    if (sa.txSequence >= IPSEC_MAX_SEQUENCE) return failed("SA sequence exhausted; 새 SPI/키 식별자가 필요합니다");
    if (ipv4.protocol !== undefined || icmp === undefined) return failed("IPv4 ICMP 단독 보호만 지원합니다 (GRE+IPsec 제외)");
    if (!ipsecSelectorMatches(profile, ipv4.sourceIp, ipv4.destinationIp)) return failed("송신 보호 정책과 맞지 않습니다");
    sa.txSequence++;
    sa.encapsulated++;
    return { ok: true, value: { spi: profile.outboundSpi!, sequence: sa.txSequence,
      simulation: { kind: "educational-no-encryption", keyId: profile.keyId!, ...(profile.policy === undefined ? {} : { policy: profile.policy }),
        ...(profile.localId === undefined ? {} : { senderId: profile.localId }), ...(profile.remoteId === undefined ? {} : { receiverId: profile.remoteId }) }, payload: { ipv4, icmp } } };
  }

  inbound(outer: Ipv4Header, esp: EspPacket, port: string): string | undefined {
    const device = this.#device();
    return Object.entries(device.config.ipsec ?? {}).find(([, profile]) => profile.interface === port &&
      device.config.interfaces[port]?.ip === outer.destinationIp && profile.peer === outer.sourceIp && profile.inboundSpi === esp.spi)?.[0];
  }

  unprotect(name: string, outer: Ipv4Header, esp: EspPacket, port: string, now: number): Result<EspPacket["payload"]> {
    const profile = this.#device().config.ipsec?.[name];
    if (!ipsecEnabled(this.#device().config)) return failed("IPsec 사용 모드가 꺼져 있습니다");
    if (profile === undefined || !profile.adminUp || !isCompleteIpsecProfile(profile)) return failed("수신 SA가 꺼져 있거나 미완성입니다");
    if (this.inbound(outer, esp, port) !== name || outer.protocol !== 50) return failed("peer/외부 주소/인터페이스/SPI 불일치");
    const sa = this.#sa(name, now);
    if (this.#expired(name, sa, now)) return failed("SA lifetime expired");
    if (esp.simulation.kind !== "educational-no-encryption" || esp.simulation.keyId !== profile.keyId) return failed("실습 키 식별자가 일치하지 않습니다");
    if ((esp.simulation.senderId ?? outer.sourceIp) !== (profile.remoteId ?? profile.peer) ||
      (esp.simulation.receiverId ?? outer.destinationIp) !== (profile.localId ?? outer.destinationIp)) return failed("인증 local-id/remote-id가 일치하지 않습니다");
    if ((esp.simulation.policy ?? IPSEC_DEFAULT_POLICY) !== (profile.policy ?? IPSEC_DEFAULT_POLICY)) return failed("IKE/ESP 교육용 정책이 일치하지 않습니다");
    if (esp.payload.ipv4.protocol !== undefined || !ipsecSelectorMatches(profile, esp.payload.ipv4.destinationIp, esp.payload.ipv4.sourceIp)) {
      return failed("복원한 안쪽 패킷이 수신 보호 정책과 맞지 않습니다");
    }
    const seq = esp.sequence;
    if (!Number.isInteger(seq) || seq <= 0 || seq > IPSEC_MAX_SEQUENCE || seq <= sa.rxHighest - IPSEC_REPLAY_WINDOW || sa.received.has(seq)) {
      return failed("anti-replay: 중복·오래된·잘못된 sequence");
    }
    // 키/정책 검증을 모두 통과한 뒤에만 수신 창을 갱신한다.
    sa.rxHighest = Math.max(sa.rxHighest, seq);
    sa.received.add(seq);
    for (const old of sa.received) if (old <= sa.rxHighest - IPSEC_REPLAY_WINDOW) sa.received.delete(old);
    sa.decapsulated++;
    return { ok: true, value: esp.payload };
  }

  /** 바뀐 정책의 SA만 무효화한다. 링크·배치·일반 경로 변경으로 sequence를 되돌리지 않는다. */
  configChanged(previous: RouterConfig): void {
    // 관리 상태만 토글해도 같은 SPI의 sequence가 1로 돌아가면 상대가 replay로 거절한다.
    const identity = (config: RouterConfig, name: string) => {
      const profile = config.ipsec?.[name];
      return profile === undefined ? undefined : JSON.stringify({ ...profile, adminUp: undefined });
    };
    for (const name of this.#sas.keys()) if (identity(previous, name) !== identity(this.#device().config, name)) {
      this.#sas.delete(name);
    }
  }

  view(ports: readonly PortView[], now: number): readonly IpsecSaView[] {
    const device = this.#device();
    return Object.entries(device.config.ipsec ?? {}).map(([name, profile]) => {
      const sa = this.#sas.get(name);
      const up = profile.interface !== undefined && ports.some(port => port.name === profile.interface && port.status === "up") &&
        device.config.interfaces[profile.interface]?.ip !== undefined;
      const status = !ipsecEnabled(device.config) || !profile.adminUp ? "disabled" : !isCompleteIpsecProfile(profile) ? "incomplete" :
        !up ? "down" : sa === undefined ? "configured" : this.#expired(name, sa, now) ? "expired" : "active";
      return { name, status, peer: profile.peer, inboundSpi: profile.inboundSpi, outboundSpi: profile.outboundSpi,
        txSequence: sa?.txSequence ?? 0, rxHighest: sa?.rxHighest ?? 0, encapsulated: sa?.encapsulated ?? 0,
        decapsulated: sa?.decapsulated ?? 0, rejected: sa?.rejected ?? 0 };
    });
  }
}
