// T6.1.1: 추적을 재생 단계로 나누기. 실제 engine의 추적으로 확인한다.
import { createSimulator } from "@ping9/engine";
import type { TopologyDocument, Trace } from "@ping9/shared";
import { TWO_PC, TWO_PC_SWITCH, TWO_SWITCH_VLAN, twoPcDocument, twoPcSwitchDocument, twoSwitchVlanDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { firstAttempt, replaySteps } from "./steps";

async function tracesOf(document: TopologyDocument, from: string, command: string): Promise<Trace[]> {
  const simulator = createSimulator();
  simulator.load(document);
  await simulator.console(from).exec(command);
  return simulator.getSnapshot().traces.map((summary) => simulator.getTrace(summary.id)!).sort((a, b) => a.id - b.id);
}

const nameOf = (document: TopologyDocument) => (id: string) => document.devices.find((device) => device.id === id)?.name;

describe("replaySteps", () => {
  test("Switch를 지나는 첫 회차: ARP 왕복 다음 ICMP 왕복, 단계마다 걸음 하나", async () => {
    const [first] = await tracesOf(twoPcSwitchDocument, TWO_PC_SWITCH.pc1.id, "ping -n 1 192.168.1.2");
    const name = nameOf(twoPcSwitchDocument);
    const steps = replaySteps(first!);

    expect(steps.map((step) => step.hops.map((hop) => `${name(hop.fromDeviceId)} ${hop.kind}`))).toEqual([
      ["PC1 arp-request"],
      ["SW1 arp-request"],
      ["PC2 arp-reply"],
      ["SW1 arp-reply"],
      ["PC1 icmp-request"],
      ["SW1 icmp-request"],
      ["PC2 icmp-reply"],
      ["SW1 icmp-reply"],
    ]);
    expect(steps.every((step) => step.falls.length === 0)).toBe(true);
    // 단계는 시간 순서이고 시간마다 하나
    expect(new Set(steps.map((step) => step.time)).size).toBe(steps.length);
  });

  test("2회차는 ARP 없이 ICMP 왕복만", async () => {
    const [, second] = await tracesOf(twoPcSwitchDocument, TWO_PC_SWITCH.pc1.id, "ping -n 2 192.168.1.2");
    expect(replaySteps(second!).flatMap((step) => step.hops.map((hop) => hop.kind))).toEqual([
      "icmp-request", "icmp-request", "icmp-reply", "icmp-reply",
    ]);
  });

  test("flooding: Switch가 여러 포트로 내보낸 ARP 요청은 한 단계의 여러 걸음", async () => {
    // 예시의 Switch에 PC3을 하나 더 붙인다. PC1의 ARP 요청이 Fa0/2와 Fa0/3으로 동시에 나간다
    const sw = twoPcSwitchDocument.devices.find((device) => device.kind === "switch")!;
    const pc3 = { id: "00000000-0000-4000-8000-0000000000aa", kind: "pc", name: "PC3", position: { x: 300, y: 400 },
      config: { ip: "192.168.1.3", mask: "255.255.255.0" } } as const;
    const document: TopologyDocument = {
      ...twoPcSwitchDocument,
      devices: [...twoPcSwitchDocument.devices, pc3],
      links: [...twoPcSwitchDocument.links, { id: "00000000-0000-4000-8000-0000000000ab",
        ends: [{ deviceId: pc3.id, port: "Ethernet0" }, { deviceId: sw.id, port: "FastEthernet0/3" }] }],
    };
    const [first] = await tracesOf(document, TWO_PC_SWITCH.pc1.id, "ping -n 1 192.168.1.2");
    const steps = replaySteps(first!);
    const name = nameOf(document);

    expect(steps[1]!.hops.map((hop) => `${name(hop.fromDeviceId)} ${hop.kind}`)).toEqual(["SW1 arp-request", "SW1 arp-request"]);
    expect(new Set(steps[1]!.hops.map((hop) => hop.linkId)).size).toBe(2);
    // PC3은 자기 주소가 아니라 버린다 (정상 폐기)
    expect(steps[2]!.falls.map((fall) => [name(fall.deviceId), fall.primary])).toEqual([["PC3", false]]);
  });

  test("원인 폐기와, 재시도가 같은 곳에서 같은 이유로 버려진 것이 primary. 들어온 링크를 안다 (trunk에서 막힘)", async () => {
    const [trace] = await tracesOf(twoSwitchVlanDocument, TWO_SWITCH_VLAN.pc1.id, "ping -n 1 10.0.10.3");
    const falls = replaySteps(trace!).flatMap((step) => step.falls);
    const name = nameOf(twoSwitchVlanDocument);

    const primary = falls.filter((fall) => fall.primary);
    // ARP 요청과 그 재시도가 둘 다 SW2의 trunk에서 막힌다
    expect(primary).toHaveLength(2);
    expect(primary.map((fall) => trace!.events[fall.seq]!.dropReason)).toEqual(["TRUNK_NOT_ALLOWED", "TRUNK_NOT_ALLOWED"]);
    expect(primary[0]!.seq).toBe(trace!.result.primaryDropSeq);
    expect(name(primary[0]!.deviceId)).toBe("SW2");
    expect(primary[0]!.linkId).toBe(trace!.events[primary[0]!.seq - 1]!.linkId);
    expect(primary[0]!.kind).toBe("arp-request");
    // 출발 PC의 ARP 타이머는 링크가 없는 폐기다
    const timeout = falls.find((fall) => trace!.events[fall.seq]!.dropReason === "ARP_TIMEOUT");
    expect(timeout?.linkId).toBeUndefined();
    expect(name(timeout!.deviceId)).toBe("PC1");
  });

  test("NOT_FOR_ME는 정상 폐기라 primary가 아니다", async () => {
    const [trace] = await tracesOf(twoPcDocument, TWO_PC.pc1.id, "ping -n 1 192.168.1.99");
    const falls = replaySteps(trace!).flatMap((step) => step.falls);
    const notForMe = falls.filter((fall) => trace!.events[fall.seq]!.dropReason === "NOT_FOR_ME");

    expect(notForMe.length).toBeGreaterThan(0);
    expect(notForMe.every((fall) => !fall.primary && fall.linkId !== undefined)).toBe(true);
    expect(falls.filter((fall) => fall.primary).map((fall) => trace!.events[fall.seq]!.dropReason)).toEqual(["ARP_TIMEOUT"]);
  });

  test("같은 추적은 언제나 같은 단계 (AD-6)", async () => {
    const [trace] = await tracesOf(twoPcSwitchDocument, TWO_PC_SWITCH.pc1.id, "ping -n 1 192.168.1.2");
    expect(replaySteps(trace!)).toEqual(replaySteps(trace!));
  });
});

describe("firstAttempt", () => {
  test("trunk에서 막힘: 첫 ARP 요청이 막히는 데까지만. 재시도와 타이머는 버린다", async () => {
    const [trace] = await tracesOf(twoSwitchVlanDocument, TWO_SWITCH_VLAN.pc1.id, "ping -n 1 10.0.10.3");
    const steps = firstAttempt(replaySteps(trace!));
    const name = nameOf(twoSwitchVlanDocument);

    expect(steps.flatMap((step) => step.hops.map((hop) => name(hop.fromDeviceId)))).toEqual(["PC1", "SW1"]);
    expect(steps.flatMap((step) => step.falls).map((fall) => [name(fall.deviceId), fall.primary])).toEqual([["SW2", true]]);
  });

  test("없는 주소: 첫 ARP 요청이 마지막으로 닿은 곳(상대 PC)에서 놓친다. 출발 PC의 타이머는 그리지 않는다", async () => {
    const [trace] = await tracesOf(twoPcDocument, TWO_PC.pc1.id, "ping -n 1 192.168.1.99");
    const steps = firstAttempt(replaySteps(trace!));
    const name = nameOf(twoPcDocument);

    expect(steps.flatMap((step) => step.hops)).toHaveLength(1);
    expect(steps.flatMap((step) => step.falls).map((fall) => [name(fall.deviceId), fall.primary])).toEqual([["PC2", true]]);
  });

  test("없는 주소, Switch 둘 너머: trunk를 건너 같은 VLAN의 PC4에서 놓친다", async () => {
    const [trace] = await tracesOf(twoSwitchVlanDocument, TWO_SWITCH_VLAN.pc2.id, "ping -n 1 10.0.20.99");
    const steps = firstAttempt(replaySteps(trace!));
    const name = nameOf(twoSwitchVlanDocument);

    expect(steps.flatMap((step) => step.hops.map((hop) => name(hop.fromDeviceId)))).toEqual(["PC2", "SW1", "SW2"]);
    expect(steps.flatMap((step) => step.falls).map((fall) => [name(fall.deviceId), fall.primary])).toEqual([["PC4", true]]);
  });

  test("재시도가 없는 추적은 그대로", async () => {
    const [trace] = await tracesOf(twoPcSwitchDocument, TWO_PC_SWITCH.pc1.id, "ping -n 1 192.168.1.2");
    expect(firstAttempt(replaySteps(trace!))).toEqual(replaySteps(trace!));
  });
});
