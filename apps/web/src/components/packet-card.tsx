// 펭귄을 누르면 뜨는 패킷 카드 (T6.3.1). 그 순간의 프레임을 바깥(L2)부터 안쪽으로 겹친 상자로 보인다.
// 값은 추적 이벤트의 `frame`에서 그대로 읽는다. 주소 옆의 회색 글씨는 그 주소를 가진 장비·포트다.

import { macAddressFor } from "@ping9/engine";
import {
  BROADCAST_MAC, PORT_NAMES, RIP_MULTICAST_IP, RIP_MULTICAST_MAC, UNKNOWN_MAC, isIcmpError, portIndex, shortPortName, switchPort,
} from "@ping9/shared";
import type { Device, IcmpMessage, TopologyDocument, TraceEvent } from "@ping9/shared";
import { useState } from "react";
import type { ReactNode } from "react";

import { frameKind } from "../replay/steps";
import type { FrameKind } from "../replay/steps";

const TITLE: Readonly<Record<FrameKind, string>> = {
  "arp-request": "ARP 요청",
  "arp-reply": "ARP 응답",
  "icmp-request": "ping 요청",
  "icmp-reply": "ping 응답",
  "icmp-error": "ICMP 오류",
  "rip-request": "RIP 요청",
  "rip-response": "RIP 응답",
  "gre-request": "GRE로 감싼 ping 요청",
  "gre-reply": "GRE로 감싼 ping 응답",
  "esp": "IPsec ESP",
  "tcp-request": "TCP 요청",
  "tcp-response": "TCP 응답",
  "udp-request": "UDP 요청",
  "udp-response": "UDP 응답",
};

const COLOR: Readonly<Record<FrameKind, string>> = {
  "arp-request": "#3BB36B",
  "arp-reply": "#3BB36B",
  "icmp-request": "#4A8CF0",
  "icmp-reply": "#E8B21E",
  "icmp-error": "#E5484D",
  "rip-request": "#A452C7",
  "rip-response": "#A452C7",
  // 펭귄 물고기 색과 같다: 요청은 파랑, 응답은 노랑
  "gre-request": "#4A8CF0",
  "gre-reply": "#E8B21E",
  "esp": "#4A8CF0",
  "tcp-request": "#4A8CF0",
  "tcp-response": "#E8B21E",
  "udp-request": "#4A8CF0",
  "udp-response": "#E8B21E",
};

/** 주소 → 장비·포트 이름 */
interface Owners {
  readonly mac: ReadonlyMap<string, string>;
  readonly ip: ReadonlyMap<string, string>;
}

function ownersOf(document: TopologyDocument): Owners {
  const mac = new Map<string, string>();
  const ip = new Map<string, string>();
  for (const device of document.devices) {
    for (const port of PORT_NAMES[device.kind]) {
      mac.set(macAddressFor(device.id, portIndex(device.kind, port)),
        device.kind === "pc" ? device.name : `${device.name} ${shortPortName(port)}`);
    }
    if (device.kind === "pc" && device.config.ip !== undefined) ip.set(device.config.ip, device.name);
    if (device.kind === "router") {
      for (const iface of Object.values(device.config.interfaces)) if (iface.ip !== undefined) ip.set(iface.ip, device.name);
    }
  }
  mac.set(BROADCAST_MAC, "모두");
  mac.set(RIP_MULTICAST_MAC, "RIP 라우터 모두");
  mac.set(UNKNOWN_MAC, "모름");
  ip.set(RIP_MULTICAST_IP, "RIP 라우터 모두");
  return { mac, ip };
}

/** 이 링크의 양 끝 가운데 Switch의 access 포트가 있는지 */
function touchesAccessPort(document: TopologyDocument, linkId: string | undefined): boolean {
  const link = linkId === undefined ? undefined : document.links.find((candidate) => candidate.id === linkId);
  if (link === undefined) return false;
  return link.ends.some((end) => {
    const device: Device | undefined = document.devices.find((candidate) => candidate.id === end.deviceId);
    return device?.kind === "switch" && switchPort(device.config, end.port).mode === "access";
  });
}

function Value({ value, owner }: { readonly value: ReactNode; readonly owner?: string | undefined }) {
  return <dd>{value}{owner !== undefined && <small>{owner}</small>}</dd>;
}

function Box({ layer, tag, title, children }: {
  readonly layer: string; readonly tag: string; readonly title: string; readonly children: ReactNode;
}) {
  return (
    <div className={`pkt-box pkt-${layer}`}>
      <div className="pkt-box-title"><span className="pkt-tag">{tag}</span>{title}</div>
      {children}
    </div>
  );
}

function IcmpBox({ icmp, ipOwner }: { readonly icmp: IcmpMessage; readonly ipOwner: (ip: string) => string | undefined }) {
  const error = isIcmpError(icmp);
  return (
    <Box layer={error ? "icmp-error" : "icmp"} tag="ICMP" title={icmp.type}>
      <dl><dt>종류</dt><dd>{icmp.type}</dd><dt>순번</dt><dd>{icmp.sequence}</dd></dl>
      {error && (
        <Box layer="original" tag="원래 패킷" title="">
          <dl>
            <dt>출발 IP</dt><Value value={icmp.original.sourceIp} owner={ipOwner(icmp.original.sourceIp)} />
            <dt>도착 IP</dt><Value value={icmp.original.destinationIp} owner={ipOwner(icmp.original.destinationIp)} />
            {icmp.original.protocol !== undefined
              ? <><dt>{icmp.original.protocol.toUpperCase()}</dt><dd>도착 포트 {icmp.original.destinationPort}</dd></>
              : <><dt>순번</dt><dd>{icmp.original.sequence}</dd></>}
          </dl>
        </Box>
      )}
    </Box>
  );
}

export function PacketCard({ event, document, linkId, onClose }: {
  readonly event: TraceEvent;
  readonly document: TopologyDocument;
  /** 펭귄이 있는 케이블 */
  readonly linkId: string | undefined;
  readonly onClose: () => void;
}) {
  const { ethernet, arp, ipv4, icmp, udp, tcp, rip, application, gre, esp } = event.frame;
  const kind = frameKind(event);
  const [help, setHelp] = useState(false);
  const owners = ownersOf(document);
  const macOwner = (value: string) => owners.mac.get(value);
  const ipOwner = (value: string) => owners.ip.get(value);

  // 안쪽부터 쌓는다
  let inner: ReactNode = null;
  if (application !== undefined) {
    inner = (
      <Box layer="app" tag="L7" title={application.service.toUpperCase()}>
        <dl>
          <dt>내용</dt><dd>{application.message}</dd>
          {application.data !== undefined && <><dt>본문</dt><dd className="pkt-data">{application.data}</dd></>}
        </dl>
      </Box>
    );
  }
  if (rip !== undefined) {
    inner = (
      <Box layer="rip" tag="RIP" title={rip.command}>
        {rip.entries.length === 0 ? <div className="pkt-empty">경로 없음</div> : (
          <table className="pkt-routes">
            <thead><tr><th>대역</th><th>마스크</th><th>거리</th></tr></thead>
            <tbody>{rip.entries.map((entry) =>
              <tr key={`${entry.network}/${entry.mask}`}><td>{entry.network}</td><td>{entry.mask}</td><td>{entry.metric}</td></tr>)}</tbody>
          </table>
        )}
      </Box>
    );
  }
  if (udp !== undefined) {
    inner = (
      <Box layer="l4" tag="L4" title="UDP">
        <dl><dt>출발 포트</dt><dd>{udp.sourcePort}</dd><dt>도착 포트</dt><dd>{udp.destinationPort}</dd></dl>
        {inner}
      </Box>
    );
  }
  if (tcp !== undefined) {
    inner = (
      <Box layer="l4" tag="L4" title="TCP">
        <dl>
          <dt>출발 포트</dt><dd>{tcp.sourcePort}</dd><dt>도착 포트</dt><dd>{tcp.destinationPort}</dd>
          <dt>플래그</dt><dd>{tcp.flags}</dd>
        </dl>
        {inner}
      </Box>
    );
  }
  // GRE·ESP는 안쪽 IPv4와 ICMP를 따로 싸고 있다. 바깥 ICMP는 그리지 않는다
  const tunnel = gre ?? esp;
  if (tunnel !== undefined) {
    const { payload } = tunnel;
    inner = (
      <Box layer="tunnel" tag={gre !== undefined ? "GRE" : "ESP"}
        title={esp !== undefined ? `SPI ${esp.spi} · 순번 ${esp.sequence} (암호화 없음)` : "감싼 패킷"}>
        <Box layer="l3" tag="L3" title="안쪽 IPv4">
          <dl>
            <dt>출발 IP</dt><Value value={payload.ipv4.sourceIp} owner={ipOwner(payload.ipv4.sourceIp)} />
            <dt>도착 IP</dt><Value value={payload.ipv4.destinationIp} owner={ipOwner(payload.ipv4.destinationIp)} />
            <dt>TTL</dt><dd>{payload.ipv4.ttl}</dd>
          </dl>
          <IcmpBox icmp={payload.icmp} ipOwner={ipOwner} />
        </Box>
      </Box>
    );
  }
  if (icmp !== undefined && tunnel === undefined) {
    inner = <IcmpBox icmp={icmp} ipOwner={ipOwner} />;
  }
  if (ipv4 !== undefined) {
    inner = (
      <Box layer="l3" tag="L3" title="IPv4">
        <dl>
          <dt>출발 IP</dt><Value value={ipv4.sourceIp} owner={ipOwner(ipv4.sourceIp)} />
          <dt>도착 IP</dt><Value value={ipv4.destinationIp} owner={ipOwner(ipv4.destinationIp)} />
          <dt>TTL</dt><dd>{ipv4.ttl}</dd>
        </dl>
        {inner}
      </Box>
    );
  }
  if (arp !== undefined) {
    inner = (
      <Box layer="arp" tag="ARP" title={arp.operation}>
        <dl>
          <dt>연산</dt><dd>{arp.operation}</dd>
          <dt>보낸 MAC</dt><Value value={arp.senderMac} owner={macOwner(arp.senderMac)} />
          <dt>보낸 IP</dt><Value value={arp.senderIp} owner={ipOwner(arp.senderIp)} />
          <dt>{arp.operation === "request" ? "찾는 MAC" : "받는 MAC"}</dt><Value value={arp.targetMac} owner={macOwner(arp.targetMac)} />
          <dt>{arp.operation === "request" ? "찾는 IP" : "받는 IP"}</dt><Value value={arp.targetIp} owner={ipOwner(arp.targetIp)} />
        </dl>
      </Box>
    );
  }
  const noTag = touchesAccessPort(document, linkId) ? "없음 (access 포트)" : "없음";

  return (
    <>
    <div className="pkt-card" role="dialog" aria-label={`${TITLE[kind]} 패킷`}
      onPointerDown={(pointer) => pointer.stopPropagation()} onClick={(click) => click.stopPropagation()}>
      <div className="pkt-head">
        <span className="pkt-dot" style={{ background: COLOR[kind] }} />
        <b>{TITLE[kind]}</b>
        <span className="pkt-num">프레임 #{event.frameId} · 이벤트 #{event.seq}</span>
        <button type="button" className={`pkt-help${help ? " on" : ""}`} aria-label="카드 읽는 법" aria-expanded={help}
          onMouseEnter={() => setHelp(true)} onMouseLeave={() => setHelp(false)}
          onFocus={() => setHelp(true)} onBlur={() => setHelp(false)}>?</button>
        <button type="button" className="pkt-close" aria-label="닫고 계속 재생" onClick={onClose}>✕</button>
      </div>
      <Box layer="l2" tag="L2" title="Ethernet">
        <dl>
          <dt>출발 MAC</dt><Value value={ethernet.sourceMac} owner={macOwner(ethernet.sourceMac)} />
          <dt>도착 MAC</dt><Value value={ethernet.destinationMac} owner={macOwner(ethernet.destinationMac)} />
          <dt>VLAN 태그</dt>{ethernet.vlanTag !== undefined ? <dd>{ethernet.vlanTag}</dd> : <dd><small className="pkt-none">{noTag}</small></dd>}
        </dl>
        {inner}
      </Box>
    </div>
    {help && (
      <div className="pkt-tip" role="tooltip">
        <b>카드 읽는 법</b>
        <p>바깥 상자(L2)부터 안쪽으로 패킷이 싸여 있는 순서예요.</p>
        <ul className="pkt-tip-layers">
          <li><i className="pkt-sw pkt-l2" />L2 Ethernet</li><li><i className="pkt-sw pkt-arp" />ARP</li>
          <li><i className="pkt-sw pkt-l3" />L3 IPv4</li><li><i className="pkt-sw pkt-l4" />L4 TCP·UDP</li>
          <li><i className="pkt-sw pkt-icmp" />ICMP</li><li><i className="pkt-sw pkt-icmp-error" />ICMP 오류</li>
          <li><i className="pkt-sw pkt-rip" />RIP</li><li><i className="pkt-sw pkt-tunnel" />GRE·ESP</li>
          <li><i className="pkt-sw pkt-app" />L7 서비스</li>
        </ul>
        <dl>
          <dt>회색 글씨</dt><dd>그 주소를 가진 장비·포트</dd>
          <dt>프레임 #</dt><dd>같은 패킷을 따라가는 번호</dd>
          <dt>이벤트 #</dt><dd>이벤트 목록의 줄 번호</dd>
        </dl>
      </div>
    )}
    </>
  );
}
