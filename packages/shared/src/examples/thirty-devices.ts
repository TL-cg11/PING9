// 예시: 장비 30대. Switch 5대를 한 줄로 잇고 Switch마다 PC 5대를 붙였다.
// 성능 테스트(T1.11.2, NFR-2)가 이 문서에서 ping 1회의 계산 시간을 잰다.

import type { Device, Link, TopologyDocument } from "../document";

const SWITCH_COUNT = 5;
const PCS_PER_SWITCH = 5;

function exampleId(group: number, index: number): string {
  const suffix = (group * 256 + index).toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${suffix}`;
}

export function thirtyDeviceSwitchId(switchIndex: number): string {
  return exampleId(1, switchIndex);
}

export function thirtyDevicePcId(pcIndex: number): string {
  return exampleId(2, pcIndex);
}

function build(): TopologyDocument {
  const devices: Device[] = [];
  const links: Link[] = [];
  let linkCount = 0;
  const nextLinkId = (): string => {
    linkCount += 1;
    return exampleId(3, linkCount);
  };

  for (let s = 1; s <= SWITCH_COUNT; s += 1) {
    devices.push({
      id: thirtyDeviceSwitchId(s),
      kind: "switch",
      name: `SW${s}`,
      position: { x: s * 260, y: 120 },
      config: { vlans: [{ id: 1, name: "default" }], ports: {} },
    });

    // 포트 1~5에 PC, 포트 7은 앞 Switch로, 포트 8은 다음 Switch로
    for (let p = 1; p <= PCS_PER_SWITCH; p += 1) {
      const pcIndex = (s - 1) * PCS_PER_SWITCH + p;
      devices.push({
        id: thirtyDevicePcId(pcIndex),
        kind: "pc",
        name: `PC${pcIndex}`,
        position: { x: s * 260 + (p - 3) * 48, y: 320 },
        config: { ip: `192.168.1.${pcIndex}`, mask: "255.255.255.0" },
      });
      links.push({
        id: nextLinkId(),
        ends: [
          { deviceId: thirtyDevicePcId(pcIndex), port: "Ethernet0" },
          { deviceId: thirtyDeviceSwitchId(s), port: `FastEthernet0/${p}` },
        ],
      });
    }

    if (s > 1) {
      links.push({
        id: nextLinkId(),
        ends: [
          { deviceId: thirtyDeviceSwitchId(s - 1), port: "FastEthernet0/8" },
          { deviceId: thirtyDeviceSwitchId(s), port: "FastEthernet0/7" },
        ],
      });
    }
  }

  return { schemaVersion: 1, devices, links };
}

/** 장비 30대(Switch 5, PC 25), 링크 29개. PC는 모두 192.168.1.0/24에 있다 */
export const thirtyDeviceDocument: TopologyDocument = build();
