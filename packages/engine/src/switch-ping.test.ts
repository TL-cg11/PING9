// T5.2.2: Switch를 지나는 ping. 공개 인터페이스(createSimulator)로만 확인한다.
import type { ConsoleResult, TopologyDocument } from "@ping9/shared";
import { TWO_PC_SWITCH, TWO_SWITCH_VLAN, twoPcSwitchDocument, twoSwitchVlanDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { createSimulator } from "./index";
import type { Simulator } from "./index";

const textOf = (result: ConsoleResult) =>
  result.lines.map((line) => (line.kind === "text" ? line.text : `[${line.kind}]`));

async function ping(simulator: Simulator, deviceId: string, target: string): Promise<ConsoleResult> {
  return simulator.console(deviceId).exec(`ping -n 1 ${target}`);
}

function lastTrace(simulator: Simulator) {
  const summary = simulator.getSnapshot().traces[0];
  if (summary === undefined) throw new Error("no trace");
  const trace = simulator.getTrace(summary.id);
  if (trace === undefined) throw new Error("trace missing");
  return { summary, trace };
}

describe("PC 2대 + Switch 1대", () => {
  const { pc1, pc2, sw1 } = TWO_PC_SWITCH;

  test("PC1 → PC2 ping이 Switch를 지나 성공한다", async () => {
    const simulator = createSimulator();
    simulator.load(twoPcSwitchDocument);

    const result = await ping(simulator, pc1.id, pc2.ip);

    expect(textOf(result).some((line) => line.startsWith(`Reply from ${pc2.ip}`))).toBe(true);
    const { summary, trace } = lastTrace(simulator);
    expect(summary.status).toBe("success");
    const atSwitch = trace.events.filter((event) => event.deviceId === sw1.id).map((event) => event.reason.code);
    expect(atSwitch).toContain("FRAME_FLOODED");
    expect(atSwitch).toContain("FRAME_FORWARDED");
    expect(atSwitch).toContain("MAC_LEARNED");
  });

  test("ping 뒤에 Switch의 MAC 주소 테이블이 화면과 show mac address-table에 나온다", async () => {
    const simulator = createSimulator();
    simulator.load(twoPcSwitchDocument);
    await ping(simulator, pc1.id, pc2.ip);

    const view = simulator.getSnapshot().views[sw1.id];
    expect(view?.kind === "switch" && view.macTable.map((entry) => entry.port)).toEqual([
      "FastEthernet0/1",
      "FastEthernet0/2",
    ]);

    const port = simulator.console(sw1.id);
    await port.exec("enable");
    const shown = textOf(await port.exec("show mac address-table"));
    expect(shown).toHaveLength(3);
    expect(shown[1]).toMatch(/^1 {5}02:00:00:00:[0-9a-f]{2}:[0-9a-f]{2} {2}Fa0\/1$/);
  });

  test("runtime이 바뀌면 스냅샷이 새것이고, 문서를 다시 열면 테이블이 비워진다", async () => {
    const simulator = createSimulator();
    simulator.load(twoPcSwitchDocument);
    const before = simulator.getSnapshot();

    await ping(simulator, pc1.id, pc2.ip);
    const after = simulator.getSnapshot();
    expect(after).not.toBe(before);
    expect(after.runtimeVersion).toBeGreaterThan(before.runtimeVersion);

    simulator.load(twoPcSwitchDocument);
    const view = simulator.getSnapshot().views[sw1.id];
    expect(view?.kind === "switch" && view.macTable).toEqual([]);
  });

  test("포트의 VLAN을 바꾸면 그 포트의 항목이 바로 사라지고 runtimeVersion이 오른다. 관계없는 변경에는 그대로다", async () => {
    const simulator = createSimulator();
    simulator.load(twoPcSwitchDocument);
    await ping(simulator, pc1.id, pc2.ip);
    const before = simulator.getSnapshot().runtimeVersion;

    simulator.dispatch({ type: "device/move", deviceId: sw1.id, position: { x: 10, y: 10 } });
    expect(simulator.getSnapshot().runtimeVersion).toBe(before);

    simulator.dispatch({ type: "switchport/set-access-vlan", deviceId: sw1.id, port: "FastEthernet0/1", vlanId: 10 });

    const snapshot = simulator.getSnapshot();
    expect(snapshot.runtimeVersion).toBe(before + 1);
    const view = snapshot.views[sw1.id];
    expect(view?.kind === "switch" && view.macTable.map((entry) => entry.port)).toEqual(["FastEthernet0/2"]);
  });

  test("Switch를 지우면 runtimeVersion이 오르고 테이블도 사라진다", async () => {
    const simulator = createSimulator();
    simulator.load(twoPcSwitchDocument);
    await ping(simulator, pc1.id, pc2.ip);
    const before = simulator.getSnapshot().runtimeVersion;

    expect(simulator.dispatch({ type: "device/remove", deviceId: sw1.id }).ok).toBe(true);
    expect(simulator.getSnapshot().runtimeVersion).toBe(before + 1);

    // 같은 ID로 다시 만들어도 테이블은 비어 있다
    simulator.dispatch({ type: "device/add", id: sw1.id, kind: "switch", position: { x: 0, y: 0 } });
    const view = simulator.getSnapshot().views[sw1.id];
    expect(view?.kind === "switch" && view.macTable).toEqual([]);
  });
});

describe("IP가 없는 Router 앞의 Switch", () => {
  const { pc1, pc2, sw1 } = TWO_PC_SWITCH;
  // PC1 – SW1 – R1. Router에 IP가 없어 ARP 응답은 없지만 Switch는 출발 MAC을 학습한다.
  const withRouter: TopologyDocument = {
    ...twoPcSwitchDocument,
    devices: twoPcSwitchDocument.devices.map((device) =>
      device.id === pc2.id
        ? {
            ...device,
            kind: "router",
            name: "R1",
            // 인터페이스를 켜 두어야 SW1이 그 포트로 내보낸다 (꺼져 있으면 peer-down이라 닿지 않는다)
            config: { interfaces: { "GigabitEthernet0/0": { adminUp: true } }, staticRoutes: [] },
          }
        : device,
    ),
    links: twoPcSwitchDocument.links.map((link) => ({
      ...link,
      ends: [
        link.ends[0].deviceId === pc2.id ? { deviceId: pc2.id, port: "GigabitEthernet0/0" } : link.ends[0],
        link.ends[1],
      ],
    })),
  };

  test("ARP 실패에도 Switch가 학습한 MAC과 실패 추적은 유지된다", async () => {
    const simulator = createSimulator();
    expect(simulator.load(withRouter)).toEqual({ ok: true });
    const result = await ping(simulator, pc1.id, pc2.ip);

    expect(result.lines.some((line) => line.kind === "error")).toBe(false);
    expect(textOf(result).some(line => line.includes("Destination host unreachable"))).toBe(true);
    const after = simulator.getSnapshot();
    expect(after.traces).toHaveLength(1);
    expect(after.traces[0]?.status).toBe("failed");
    const view = after.views[sw1.id];
    expect(view?.kind === "switch" && view.macTable.map(entry => entry.port)).toEqual(["FastEthernet0/1"]);

    const port = simulator.console(sw1.id);
    await port.exec("enable");
    expect(textOf(await port.exec("show mac address-table"))).toHaveLength(2);
  });
});

describe("VLAN 예시 문서 (SW1 trunk 10·20, SW2 trunk 20)", () => {
  const { pc1, pc2, pc3, pc4, sw1, sw2 } = TWO_SWITCH_VLAN;

  test("같은 VLAN 20의 PC2 → PC4는 trunk를 건너 성공한다", async () => {
    const simulator = createSimulator();
    simulator.load(twoSwitchVlanDocument);

    const result = await ping(simulator, pc2.id, pc4.ip);

    expect(textOf(result).some((line) => line.startsWith(`Reply from ${pc4.ip}`))).toBe(true);
    expect(lastTrace(simulator).summary.status).toBe("success");
  });

  test("VLAN 10의 PC1 → PC3는 SW2의 trunk가 10을 허용하지 않아 실패한다 (시안의 실패 장면)", async () => {
    const simulator = createSimulator();
    simulator.load(twoSwitchVlanDocument);

    const result = await ping(simulator, pc1.id, pc3.ip);

    expect(
      textOf(result).some(
        (line) => line.includes("Destination host unreachable") || line.includes("Request timed out"),
      ),
    ).toBe(true);
    const { summary, trace } = lastTrace(simulator);
    expect(summary.status).toBe("failed");
    const primary = trace.events[trace.result.primaryDropSeq!];
    expect(primary).toMatchObject({ deviceId: sw2.id, inPort: "FastEthernet0/8" });
    expect(primary?.reason).toMatchObject({
      code: "TRUNK_NOT_ALLOWED",
      params: { port: "FastEthernet0/8", vlan: 10 },
    });
  });

  test("같은 서브넷이라도 VLAN이 다른 PC1 → PC2는 실패하고, 원인은 SW1에서 VLAN이 달라 막힌 것이다", async () => {
    const simulator = createSimulator();
    simulator.load(twoSwitchVlanDocument);
    // trunk 선을 끊어 SW2에서 막히는 일이 없게 하고, PC2를 PC1과 같은 서브넷에 둔다 (다른 서브넷이면 PC가 NO_GATEWAY로 먼저 멈춘다)
    const switchIds: readonly string[] = [sw1.id, sw2.id];
    const trunk = twoSwitchVlanDocument.links.find((link) => link.ends.every((end) => switchIds.includes(end.deviceId)))!;
    expect(simulator.dispatch({ type: "link/remove", linkId: trunk.id }).ok).toBe(true);
    expect(
      simulator.dispatch({ type: "pc/set-ip", deviceId: pc2.id, ip: "10.0.10.2", mask: "255.255.255.0", gateway: null }).ok,
    ).toBe(true);

    const result = await ping(simulator, pc1.id, "10.0.10.2");

    expect(textOf(result).some((line) => line.includes("Destination host unreachable"))).toBe(true);
    const { summary, trace } = lastTrace(simulator);
    expect(summary.status).toBe("failed");
    expect(trace.events[trace.result.primaryDropSeq!]).toMatchObject({
      deviceId: sw1.id,
      inPort: "FastEthernet0/1",
      outPort: "FastEthernet0/2",
      reason: { code: "VLAN_BLOCKED", params: { frameVlan: 10, port: "FastEthernet0/2", portVlan: 20 } },
    });
  });

  test("SW2에서 VLAN 10을 허용하면 PC1 → PC3가 성공한다", async () => {
    const simulator = createSimulator();
    simulator.load(twoSwitchVlanDocument);
    const port = simulator.console(sw2.id);
    for (const line of ["enable", "configure terminal", "interface fa0/8", "switchport trunk allowed vlan add 10"]) {
      await port.exec(line);
    }

    await ping(simulator, pc1.id, pc3.ip);

    expect(lastTrace(simulator).summary.status).toBe("success");
  });
});
