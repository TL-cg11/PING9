import type { Device, TopologyDocument } from "@ping9/shared";
import { TWO_PC, TWO_PC_SWITCH, twoPcDocument, twoPcSwitchDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { deviceRef, findDevice, isAdminUp, portLink, portMac } from "./topology";

const { pc1, pc2, sw1, link1Id, link2Id } = TWO_PC_SWITCH;

const switchWith = (ports: Record<string, { adminUp: boolean }>): Device => ({
  id: sw1.id,
  kind: "switch",
  name: sw1.name,
  position: { x: 0, y: 0 },
  config: { vlans: [], ports: Object.fromEntries(Object.entries(ports).map(([port, { adminUp }]) => [port, { adminUp, mode: "access" }])) },
});

const router: Device = {
  id: "00000000-0000-4000-8000-0000000000ee",
  kind: "router",
  name: "R1",
  position: { x: 0, y: 0 },
  config: { interfaces: { "GigabitEthernet0/1": { adminUp: true } }, staticRoutes: [] },
};

describe("findDevice와 deviceRef", () => {
  test("ID로 장비를 찾는다. 없으면 undefined", () => {
    expect(findDevice(twoPcDocument, TWO_PC.pc2.id)?.name).toBe("PC2");
    expect(findDevice(twoPcDocument, "missing")).toBeUndefined();
  });

  test("deviceRef는 ID와 그 시점의 이름이다", () => {
    expect(deviceRef(twoPcDocument.devices[0]!)).toEqual({ deviceId: TWO_PC.pc1.id, deviceName: "PC1" });
  });
});

describe("portLink", () => {
  test("포트에 연결된 링크와 상대 포트를 양쪽 방향으로 찾는다", () => {
    expect(portLink(twoPcSwitchDocument, { deviceId: pc1.id, port: "Ethernet0" })).toEqual({
      linkId: link1Id,
      peer: { deviceId: sw1.id, port: "FastEthernet0/1" },
    });
    expect(portLink(twoPcSwitchDocument, { deviceId: sw1.id, port: "FastEthernet0/2" })).toEqual({
      linkId: link2Id,
      peer: { deviceId: pc2.id, port: "Ethernet0" },
    });
  });

  test("링크가 없는 포트는 undefined", () => {
    expect(portLink(twoPcSwitchDocument, { deviceId: sw1.id, port: "FastEthernet0/3" })).toBeUndefined();
    expect(portLink(twoPcSwitchDocument, { deviceId: "missing", port: "Ethernet0" })).toBeUndefined();
  });

  test("같은 장비의 다른 포트에 걸린 링크를 돌려주지 않는다", () => {
    const document: TopologyDocument = {
      ...twoPcDocument,
      links: [{ id: TWO_PC.linkId, ends: [{ deviceId: sw1.id, port: "FastEthernet0/1" }, { deviceId: pc1.id, port: "Ethernet0" }] }],
    };
    expect(portLink(document, { deviceId: sw1.id, port: "FastEthernet0/2" })).toBeUndefined();
  });
});

describe("isAdminUp", () => {
  test("PC 포트는 항상 켜져 있다", () => {
    expect(isAdminUp(twoPcDocument.devices[0]!, "Ethernet0")).toBe(true);
  });

  test("Switch 포트는 구성에 없으면 켜져 있고, shutdown이면 꺼져 있다", () => {
    const device = switchWith({ "FastEthernet0/2": { adminUp: false }, "FastEthernet0/3": { adminUp: true } });
    expect(isAdminUp(device, "FastEthernet0/1")).toBe(true);
    expect(isAdminUp(device, "FastEthernet0/2")).toBe(false);
    expect(isAdminUp(device, "FastEthernet0/3")).toBe(true);
  });

  test("Router 인터페이스는 구성에 없으면 꺼져 있다 (FR-17)", () => {
    expect(isAdminUp(router, "GigabitEthernet0/0")).toBe(false);
    expect(isAdminUp(router, "GigabitEthernet0/1")).toBe(true);
  });
});

describe("portMac", () => {
  test("예시 자료의 MAC 주소와 같다", () => {
    expect(portMac(twoPcDocument.devices[0]!, "Ethernet0")).toBe(TWO_PC.pc1.mac);
    expect(portMac(twoPcDocument.devices[1]!, "Ethernet0")).toBe(TWO_PC.pc2.mac);
  });

  test("포트 순번이 마지막 바이트다", () => {
    const device = switchWith({});
    expect(portMac(device, "FastEthernet0/1")).toMatch(/:00$/);
    expect(portMac(device, "FastEthernet0/8")).toMatch(/:07$/);
  });

  test("그 장비 종류에 없는 포트 이름이면 예외를 던진다", () => {
    expect(() => portMac(twoPcDocument.devices[0]!, "FastEthernet0/1")).toThrow(RangeError);
  });
});
