// T1.8.3: PC 모델. 포트 하나(`Ethernet0`)에 ARP 모듈과 IPv4 호스트를 붙인다.
// 구성(IP, OS, 링크)은 복사하지 않고 매번 지금 Document에서 읽는다. 그래서 IP를 바꿔도 모델을 다시 만들 필요가 없다.
// 모델이 들고 있는 것은 Document에 없는 동적 상태(ARP 테이블)뿐이다.

import { PORT_NAMES, osOf } from "@ping9/shared";
import type { DeviceView, PcDevice, TopologyDocument } from "@ping9/shared";

import type { Frame, SimContext, TimerRef } from "../../kernel";
import { ArpModule } from "../../protocols/arp";
import { Ipv4Host } from "../../protocols/ipv4-host";
import type { Ipv4Address } from "../../protocols/ipv4-host";
import { deviceRef, findDevice, portLink, portMac } from "../../topology";
import { computeViews } from "../../views";
import { transmit } from "../link";
import type { ConfigChange, DeviceModel } from "../model";

export const PC_PORT = PORT_NAMES.pc[0];

/** OS별 TTL. Windows 128, Linux 64 (T1.8.2 결정 4) */
export const TTL_BY_OS = { windows: 128, linux: 64 } as const;

function pcIn(document: TopologyDocument, deviceId: string): PcDevice | undefined {
  const device = findDevice(document, deviceId);
  return device?.kind === "pc" ? device : undefined;
}

function addressOf(pc: PcDevice): Ipv4Address | undefined {
  const { ip, mask, gateway } = pc.config;
  if (ip === undefined || mask === undefined) return undefined;
  return gateway === undefined ? { ip, mask } : { ip, mask, gateway };
}

export class PcModel implements DeviceModel {
  readonly deviceId: string;
  readonly arp: ArpModule;
  readonly ipv4: Ipv4Host;
  readonly #getDocument: () => TopologyDocument;

  constructor(deviceId: string, getDocument: () => TopologyDocument) {
    this.deviceId = deviceId;
    this.#getDocument = getDocument;

    const pc = (): PcDevice => {
      const found = pcIn(this.#getDocument(), deviceId);
      if (found === undefined) throw new Error(`PcModel: PC ${deviceId} is not in the document`);
      return found;
    };
    const linkOf = (port: string) => portLink(this.#getDocument(), { deviceId, port })?.linkId;
    const macOf = (port: string) => portMac(pc(), port);

    // device와 ttl은 값이라 getter로 매번 읽는다. 이름과 OS가 바뀌어도 바로 반영된다
    this.arp = new ArpModule({
      get device() {
        return deviceRef(pc());
      },
      ipOf: () => pc().config.ip,
      macOf,
      linkOf,
      transmit: (ctx, port, frame) => {
        transmit(ctx, this.#getDocument(), { deviceId, port }, frame);
      },
    });
    this.ipv4 = new Ipv4Host(
      {
        get device() {
          return deviceRef(pc());
        },
        addressOf: () => addressOf(pc()),
        macOf,
        linkOf,
        get ttl() {
          return TTL_BY_OS[osOf(pc().config)];
        },
      },
      this.arp,
    );
  }

  onFrame(ctx: SimContext, port: string, frame: Frame): void {
    this.ipv4.onFrame(ctx, port, frame);
  }

  onTimer(ctx: SimContext, timer: TimerRef): void {
    this.arp.onTimer(ctx, timer);
  }

  /** 이 PC의 IP·마스크나 포트의 링크가 바뀌면 ARP 테이블을 비운다. 게이트웨이와 이름, OS는 ARP와 상관없다 */
  onConfigChanged(change: ConfigChange): void {
    const before = pcIn(change.previous, this.deviceId);
    const after = pcIn(change.document, this.deviceId);
    if (before === undefined || after === undefined) return;

    const ref = { deviceId: this.deviceId, port: PC_PORT };
    const addressChanged = before.config.ip !== after.config.ip || before.config.mask !== after.config.mask;
    const linkChanged = portLink(change.previous, ref)?.linkId !== portLink(change.document, ref)?.linkId;
    if (addressChanged || linkChanged) this.arp.onPortChanged(PC_PORT);
  }

  /** 회차를 시작할 때 Runtime이 모든 PC에 부른다. 지난 회차의 대기열과 응답 목록을 비운다 */
  startRun(): void {
    this.arp.discardPending();
    this.ipv4.startRun();
  }

  view(): DeviceView {
    const document = this.#getDocument();
    const base = computeViews(document)[this.deviceId];
    if (base?.kind !== "pc") throw new Error(`PcModel: PC ${this.deviceId} is not in the document`);
    return { ...base, arpTable: this.arp.view() };
  }
}
