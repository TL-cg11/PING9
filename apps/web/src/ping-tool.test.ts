// T0.13: 시뮬레이션 모드의 `▶ ping 실행`에서 출발·목적지·주소 고르기
import type { PcDevice, TopologyDocument } from "@ping9/shared";
import { RIP_SQUARE, fourRouterRipDocument, twoSwitchVlanDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { pickAddress, pickDevice, pingAddresses, pingCommand, pingToolMessage, syncPingTool } from "./ping-tool";

const doc = fourRouterRipDocument;
const deviceOf = (document: TopologyDocument, id: string) => document.devices.find((device) => device.id === id)!;
const pc1 = deviceOf(doc, RIP_SQUARE.pc1.id) as PcDevice;
const linuxPc1 = { ...pc1, config: { ...pc1.config, os: "linux" } } as PcDevice;
const withLinux: TopologyDocument = { ...doc, devices: doc.devices.map((device) => (device.id === pc1.id ? linuxPc1 : device)) };
const switchId = twoSwitchVlanDocument.devices.find((device) => device.kind === "switch")!.id;

describe("명령", () => {
  test("PC는 1회: Windows `-n 1`, Linux `-c 1`. Router는 횟수 옵션이 없다", () => {
    expect(pingCommand(pc1, "10.0.3.10")).toBe("ping -n 1 10.0.3.10");
    expect(pingCommand(linuxPc1, "10.0.3.10")).toBe("ping -c 1 10.0.3.10");
    expect(pingCommand(deviceOf(doc, RIP_SQUARE.r1), "10.0.3.10")).toBe("ping 10.0.3.10");
  });
});

describe("주소", () => {
  test("PC는 IP 하나, Router는 IP가 있는 인터페이스를 포트 순서로", () => {
    expect(pingAddresses(deviceOf(doc, RIP_SQUARE.pc2.id))).toEqual([{ ip: "10.0.3.10" }]);
    expect(pingAddresses(deviceOf(doc, RIP_SQUARE.r3))).toEqual([
      { port: "GigabitEthernet0/0", ip: "10.0.23.2" },
      { port: "GigabitEthernet0/1", ip: "10.0.3.1" },
      { port: "GigabitEthernet0/2", ip: "10.0.34.1" },
    ]);
  });
});

describe("고르기", () => {
  test("PC1 → PC2: 주소가 하나라 바로 PC1 터미널에서 보낸다", () => {
    const target = pickDevice({ stage: "source" }, doc, RIP_SQUARE.pc1.id);
    expect(target).toEqual({ tool: { stage: "target", sourceId: RIP_SQUARE.pc1.id } });

    expect(pickDevice(target.tool!, doc, RIP_SQUARE.pc2.id)).toEqual({
      tool: null,
      send: { sourceId: RIP_SQUARE.pc1.id, command: "ping -n 1 10.0.3.10" },
    });
  });

  test("Linux PC에서 보내면 `-c 1`", () => {
    const step = pickDevice({ stage: "target", sourceId: pc1.id }, withLinux, RIP_SQUARE.pc2.id);
    expect(step.send?.command).toBe("ping -c 1 10.0.3.10");
  });

  test("목적지가 Router면 주소를 고르는 단계, 고르면 보낸다", () => {
    const address = pickDevice({ stage: "target", sourceId: RIP_SQUARE.pc1.id }, doc, RIP_SQUARE.r3);
    expect(address.tool).toEqual({ stage: "address", sourceId: RIP_SQUARE.pc1.id, targetId: RIP_SQUARE.r3 });
    expect(pingToolMessage(address.tool!, doc)).toBe("PC1에서 보냄 · R3의 어느 주소로 보낼지 고르세요");

    expect(pickAddress(address.tool!, doc, "10.0.34.1")).toEqual({
      tool: null,
      send: { sourceId: RIP_SQUARE.pc1.id, command: "ping -n 1 10.0.34.1" },
    });
  });

  test("주소를 고르는 중 다른 장비를 누르면 그 장비가 목적지", () => {
    const step = pickDevice({ stage: "address", sourceId: RIP_SQUARE.pc1.id, targetId: RIP_SQUARE.r3 }, doc, RIP_SQUARE.pc2.id);
    expect(step.send?.command).toBe("ping -n 1 10.0.3.10");
  });

  test("Router에서 출발할 수 있다", () => {
    const step = pickDevice({ stage: "target", sourceId: RIP_SQUARE.r1 }, doc, RIP_SQUARE.pc2.id);
    expect(step.send).toEqual({ sourceId: RIP_SQUARE.r1, command: "ping 10.0.3.10" });
  });

  test("Switch는 출발할 수 없고, IP가 없는 장비는 목적지가 될 수 없다. 단계는 그대로", () => {
    const fromSwitch = pickDevice({ stage: "source" }, twoSwitchVlanDocument, switchId);
    expect(fromSwitch.tool).toEqual({ stage: "source" });
    expect(fromSwitch.notice).toMatch(/IP가 없어 ping을 보낼 수 없어요/);

    const noIp: TopologyDocument = { ...doc, devices: doc.devices.map((device) =>
      device.id === RIP_SQUARE.pc2.id ? { ...device, config: {} } as PcDevice : device) };
    const toNoIp = pickDevice({ stage: "target", sourceId: RIP_SQUARE.pc1.id }, noIp, RIP_SQUARE.pc2.id);
    expect(toNoIp.tool).toEqual({ stage: "target", sourceId: RIP_SQUARE.pc1.id });
    expect(toNoIp.notice).toBe("PC2에는 IP가 없어요. 다른 장비를 누르세요");
  });

  test("자기 자신도 목적지가 될 수 있다 (실제 OS처럼 응답)", () => {
    expect(pickDevice({ stage: "target", sourceId: RIP_SQUARE.pc1.id }, doc, RIP_SQUARE.pc1.id).send?.command)
      .toBe("ping -n 1 10.0.1.10");
  });

  test("안내 띠 문장", () => {
    expect(pingToolMessage({ stage: "source" }, doc)).toBe("ping 실행 · 출발 장비를 누르세요 (PC, Router)");
    expect(pingToolMessage({ stage: "target", sourceId: RIP_SQUARE.r1 }, doc)).toBe("R1에서 보냄 · 목적지 장비를 누르세요");
  });
});

describe("장비가 지워지면", () => {
  const without = (id: string): TopologyDocument => ({ ...doc, devices: doc.devices.filter((device) => device.id !== id) });

  test("출발 장비가 없으면 처음으로, 목적지가 없으면 목적지 고르기로", () => {
    expect(syncPingTool({ stage: "target", sourceId: RIP_SQUARE.pc1.id }, without(RIP_SQUARE.pc1.id))).toEqual({ stage: "source" });
    expect(syncPingTool({ stage: "address", sourceId: RIP_SQUARE.pc1.id, targetId: RIP_SQUARE.r3 }, without(RIP_SQUARE.r3)))
      .toEqual({ stage: "target", sourceId: RIP_SQUARE.pc1.id });
    expect(syncPingTool(null, doc)).toBeNull();
  });
});
