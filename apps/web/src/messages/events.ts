// 이벤트 설명과 실패 사유의 한국어 문구 (T1.9.1, T1.10.2). engine은 `{ code, params }`만 남기고 문장은 여기서 만든다 (AD-14).
// 모든 코드를 다루는 Record라서, 코드를 더하고 문구를 빠뜨리면 타입 검사가 실패한다.

import { shortPortName } from "@ping9/shared";
import type { DropParamsByReason, DropReason, Reason, ReasonCode, ReasonParamsByCode } from "@ping9/shared";

import { withSubject, withTopic } from "./particles";

const p = shortPortName;
const ICMP_ERROR_LABEL = { "destination-unreachable": "닿을 수 없음", "time-exceeded": "TTL 만료" } as const;

/** 목록 한 줄의 설명. 장비 이름은 줄의 장비 칸에 따로 나온다 */
export const EVENT_TEXT: { readonly [C in ReasonCode]: (params: ReasonParamsByCode[C]) => string } = {
  ICMP_ERROR_SENT: ({ targetIp, error }) => `${targetIp}에 ICMP 오류(${ICMP_ERROR_LABEL[error]})를 보냄`,
  ICMP_ERROR_RECEIVED: ({ sourceIp, error }) => `${sourceIp}에서 ICMP 오류(${ICMP_ERROR_LABEL[error]})를 받음`,
  IPV4_RECEIVED: ({ sourceIp }) => `${sourceIp}에서 온 IP 패킷을 받음`,
  IPV4_FORWARDED: ({ targetIp, port, nextHop, ttl }) => `${targetIp}행 패킷을 ${p(port)}로 보냄 (다음 ${nextHop}, TTL ${ttl})`,
  ARP_REQUEST_SENT: ({ targetIp }) => `${targetIp}의 MAC을 묻는 ARP 요청을 모두에게 보냄`,
  ARP_REQUEST_RECEIVED: ({ targetIp, forMe }) =>
    forMe ? `내 IP(${targetIp})를 묻는 ARP 요청을 받음` : `${targetIp}를 묻는 ARP 요청을 받음`,
  ARP_REPLY_SENT: ({ ip }) => `"${withTopic(ip)} 나"라고 ARP 응답을 보냄`,
  ARP_REPLY_RECEIVED: ({ ip }) => `${ip}의 ARP 응답을 받음`,
  ARP_ENTRY_LEARNED: ({ ip, mac }) => `ARP 표에 기록: ${ip} = ${mac}`,
  ICMP_ECHO_REQUEST_SENT: ({ targetIp }) => `${targetIp}로 ping 요청(echo)을 보냄`,
  ICMP_ECHO_REQUEST_RECEIVED: ({ sourceIp }) => `${sourceIp}의 ping 요청을 받음`,
  ICMP_ECHO_REPLY_SENT: ({ targetIp }) => `${targetIp}로 ping 응답을 보냄`,
  ICMP_ECHO_REPLY_RECEIVED: ({ sourceIp }) => `${sourceIp}의 ping 응답을 받음`,
  FRAME_RECEIVED: ({ port }) => `${p(port)}로 프레임을 받음`,
  MAC_LEARNED: ({ mac, port, vlan }) => `MAC 표에 기록: ${mac} → ${p(port)} (VLAN ${vlan})`,
  FRAME_FORWARDED: ({ port }) => `MAC 표를 보고 ${p(port)}로만 보냄`,
  FRAME_FLOODED: ({ port, vlan, broadcast }) =>
    `${broadcast ? "브로드캐스트라" : "목적지를 몰라"} ${p(port)}로 내보냄 (VLAN ${vlan})`,
  RIP_REQUEST_SENT: ({ port }) => `${p(port)}로 RIP 요청을 보냄`,
  RIP_REQUEST_RECEIVED: ({ sourceIp }) => `${sourceIp}의 RIP 요청을 받음`,
  RIP_RESPONSE_SENT: ({ port, routes }) => `${p(port)}로 경로 ${routes}개를 보냄`,
  RIP_RESPONSE_RECEIVED: ({ sourceIp, routes }) => `${sourceIp}에서 경로 ${routes}개를 받음`,
  RIP_ROUTE_LEARNED: ({ network, mask, metric }) => `새 경로를 배움: ${network} ${mask} (거리 ${metric})`,
  RIP_ROUTE_CHANGED: ({ network, mask, metric }) => `경로를 바꿈: ${network} ${mask} (거리 ${metric})`,
  // 폐기
  NO_LINK: ({ port }) => `${p(port)}에 케이블이 없어 버림`,
  IF_DOWN: ({ port }) => `${p(port)}가 꺼져 있어 버림`,
  NO_IP: () => "IP 주소가 없어 보낼 수 없음",
  NO_GATEWAY: ({ targetIp }) => `${withTopic(targetIp)} 다른 네트워크인데 게이트웨이가 없음`,
  ARP_TIMEOUT: ({ targetIp }) => `${targetIp}의 ARP 응답이 없어 포기`,
  VLAN_BLOCKED: ({ frameVlan, port, portVlan }) => `VLAN ${frameVlan} 프레임이 VLAN ${portVlan} 포트 ${p(port)}로 못 감`,
  TRUNK_NOT_ALLOWED: ({ port, vlan }) => `VLAN ${withSubject(vlan)} ${p(port)} trunk 허용 목록에 없어 버림`,
  VLAN_INACTIVE: ({ port, vlan }) => `${p(port)}의 VLAN ${withSubject(vlan)} 없어 버림`,
  NO_ROUTE: ({ targetIp }) => `${targetIp}로 가는 경로가 없어 버림`,
  TTL_EXPIRED: () => "TTL이 0이 되어 버림",
  RIP_SOURCE_NOT_ON_LINK: ({ sourceIp }) => `${sourceIp}의 RIP가 다른 네트워크에서 와서 버림`,
  NOT_FOR_ME: () => "나에게 온 것이 아니라 버림 (정상)",
  LOOP_GUARD: () => "이벤트가 너무 많아 계산을 멈춤",
};

export function eventText(reason: Reason): string {
  return (EVENT_TEXT[reason.code] as (params: unknown) => string)(reason.params);
}

/** 실패 사유 상자: 무엇이 문제인지와 고치는 방법. `command`는 그대로 입력할 수 있는 명령 */
export interface Cause {
  readonly text: string;
  readonly fix: string;
  readonly command?: string;
}

const dev = (params: { readonly device: { readonly deviceName: string } }) => params.device.deviceName;

export const CAUSE_TEXT: { readonly [R in DropReason]: (params: DropParamsByReason[R]) => Cause } = {
  NO_LINK: (q) => ({ text: `${dev(q)}의 ${p(q.port)}에 케이블이 연결되어 있지 않아요`, fix: `케이블 도구로 ${p(q.port)}를 연결하세요` }),
  IF_DOWN: (q) => ({ text: `${dev(q)}의 ${p(q.port)}가 꺼져 있어요`, fix: `${dev(q)}에서 인터페이스를 켜세요:`, command: `interface ${q.port} → no shutdown` }),
  NO_IP: (q) => ({ text: `${dev(q)}에 IP 주소가 없어요`, fix: `${dev(q)}를 누르고 상세 정보에서 IP를 설정하세요` }),
  NO_GATEWAY: (q) => ({ text: `${dev(q)}에 기본 게이트웨이가 없어 다른 네트워크(${q.targetIp})로 보낼 수 없어요`, fix: `${dev(q)}의 상세 정보에서 게이트웨이를 설정하세요` }),
  ARP_TIMEOUT: (q) => ({ text: `${q.targetIp}에서 ARP 응답이 오지 않았어요`, fix: "그 주소를 쓰는 장비가 있는지, 케이블과 VLAN이 맞는지 확인하세요" }),
  VLAN_BLOCKED: (q) => ({ text: `${dev(q)}의 ${withTopic(p(q.port))} VLAN ${q.portVlan} 포트라 VLAN ${q.frameVlan} 프레임을 보낼 수 없어요`, fix: "두 PC를 같은 VLAN의 포트에 연결하세요" }),
  TRUNK_NOT_ALLOWED: (q) => ({ text: `${dev(q)}의 ${p(q.port)} trunk가 VLAN ${q.vlan} 프레임을 허용하지 않아 버렸어요`, fix: `${dev(q)}에서 허용 목록에 더하세요:`, command: `switchport trunk allowed vlan add ${q.vlan}` }),
  VLAN_INACTIVE: (q) => ({ text: `${dev(q)}에 VLAN ${withSubject(q.vlan)} 없어 ${p(q.port)}가 통신할 수 없어요`, fix: `${dev(q)}에서 VLAN을 만드세요:`, command: `vlan ${q.vlan}` }),
  NO_ROUTE: (q) => ({ text: `${dev(q)}에 ${q.targetIp}로 가는 경로가 없어요`, fix: `${dev(q)}에서 경로를 더하세요:`, command: "ip route <네트워크> <마스크> <다음 주소>" }),
  TTL_EXPIRED: (q) => ({ text: `${dev(q)}에서 TTL이 0이 됐어요. 경로가 고리처럼 돌고 있어요`, fix: "Router들의 라우팅 표를 확인하세요" }),
  RIP_SOURCE_NOT_ON_LINK: (q) => ({ text: `${dev(q)}가 다른 네트워크에서 온 RIP(${q.sourceIp})를 버렸어요`, fix: "양쪽 인터페이스의 IP가 같은 네트워크인지 확인하세요" }),
  NOT_FOR_ME: (q) => ({ text: `${dev(q)}에게 온 프레임이 아니에요`, fix: "목적지 주소를 확인하세요" }),
  LOOP_GUARD: () => ({ text: "프레임이 끝없이 돌아 계산을 멈췄어요. 케이블이 고리를 이루고 있어요", fix: "고리를 이루는 케이블 하나를 지우세요" }),
};

export function causeOf(reason: Reason): Cause | undefined {
  if (!(reason.code in CAUSE_TEXT)) return undefined;
  return (CAUSE_TEXT[reason.code as DropReason] as (params: unknown) => Cause)(reason.params);
}
