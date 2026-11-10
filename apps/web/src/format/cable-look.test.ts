// T0.8: 케이블을 어떤 모양으로 그릴지. 문서만 보고 정하는 순수 함수다.
import type { Device, Link, RouterConfig, SwitchPortConfig, TopologyDocument } from "@ping9/shared";
import { twoPcDocument, twoSwitchVlanDocument, TWO_SWITCH_VLAN } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { cableLook } from "./cable-look";

const A = "00000000-0000-4000-8000-0000000000c1";
const B = "00000000-0000-4000-8000-0000000000c2";
const LINK = "00000000-0000-4000-8000-0000000000c9";

function switchDevice(id: string, name: string, port: SwitchPortConfig | undefined): Device {
  return {
    id, kind: "switch", name, position: { x: 0, y: 0 },
    config: { vlans: [], ports: port === undefined ? {} : { "FastEthernet0/1": port } },
  };
}

function routerDevice(id: string, name: string, interfaces: RouterConfig["interfaces"] = {}): Device {
  return { id, kind: "router", name, position: { x: 0, y: 0 }, config: { interfaces, staticRoutes: [] } };
}

/** 장비 둘을 각자의 첫 포트로 잇는 문서와 그 링크 */
function pair(first: Device, second: Device): { document: TopologyDocument; link: Link } {
  const port = (device: Device) => (device.kind === "router" ? "GigabitEthernet0/0" : "FastEthernet0/1");
  const link: Link = { id: LINK, ends: [{ deviceId: first.id, port: port(first) }, { deviceId: second.id, port: port(second) }] };
  return { document: { schemaVersion: 1, devices: [first, second], links: [link] }, link };
}

const trunk = (allowedVlans?: SwitchPortConfig["allowedVlans"]): SwitchPortConfig =>
  allowedVlans === undefined ? { adminUp: true, mode: "trunk" } : { adminUp: true, mode: "trunk", allowedVlans };

describe("cableLook", () => {
  test("PC끼리는 기본 눈길", () => {
    expect(cableLook(twoPcDocument, twoPcDocument.links[0]!)).toEqual({ shape: "road", down: false });
  });

  test("access VLAN이 1이 아니면 그 VLAN을 담는다", () => {
    const link = twoSwitchVlanDocument.links.find((candidate) =>
      candidate.ends.some((end) => end.deviceId === TWO_SWITCH_VLAN.pc1.id))!;
    expect(cableLook(twoSwitchVlanDocument, link)).toEqual({ shape: "road", down: false, vlan: 10 });
  });

  test("한쪽 끝이라도 trunk면 넓은 길. 다른 끝이 허용하지 않는 VLAN은 그 끝에서 막힌다", () => {
    const { document, link } = pair(
      switchDevice(A, "SW1", trunk([[10, 10], [20, 20]])),
      switchDevice(B, "SW2", trunk([[20, 20]])),
    );
    expect(cableLook(document, link)).toEqual({
      shape: "trunk", down: false, lanes: [{ vlan: 10, blockedAt: 1 }, { vlan: 20 }],
    });
  });

  test("모든 trunk 끝이 전체 허용이면 무지개", () => {
    const { document, link } = pair(switchDevice(A, "SW1", trunk()), switchDevice(B, "SW2", trunk()));
    expect(cableLook(document, link).lanes).toBe("all");
  });

  test("차선이 4개를 넘으면 무지개", () => {
    const { document, link } = pair(switchDevice(A, "SW1", trunk([[10, 14]])), switchDevice(B, "SW2", trunk()));
    expect(cableLook(document, link).lanes).toBe("all");
  });

  test("허용 목록이 비면 차선 없는 넓은 길", () => {
    const { document, link } = pair(switchDevice(A, "SW1", trunk([])), switchDevice(B, "SW2", trunk([])));
    expect(cableLook(document, link)).toEqual({ shape: "trunk", down: false, lanes: [] });
  });

  test("한쪽 포트가 꺼지면 down", () => {
    const { document, link } = pair(
      switchDevice(A, "SW1", { adminUp: false, mode: "access" }),
      switchDevice(B, "SW2", undefined),
    );
    expect(cableLook(document, link)).toEqual({ shape: "road", down: true });
  });

  test("Router끼리는 다리. 설정한 적 없는 인터페이스는 켜진 것으로 그린다", () => {
    const { document, link } = pair(routerDevice(A, "R1"), routerDevice(B, "R2"));
    expect(cableLook(document, link)).toEqual({ shape: "bridge", down: false });
  });

  test("Router 인터페이스를 끄면 금 간 다리", () => {
    const { document, link } = pair(
      routerDevice(A, "R1", { "GigabitEthernet0/0": { adminUp: false } }),
      routerDevice(B, "R2"),
    );
    expect(cableLook(document, link)).toEqual({ shape: "bridge", down: true });
  });
});
