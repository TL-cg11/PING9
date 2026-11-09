import { PORT_NAMES, validateDocument } from "@ping9/shared";
import type { Command, RouterDevice } from "@ping9/shared";
import { TWO_PC, twoPcDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../index";
import type { Simulator } from "../index";

const ID = "00000000-0000-4000-8000-000000000100";
const GI0 = PORT_NAMES.router[0];
const GI1 = PORT_NAMES.router[1];
const command = (fields: Record<string, unknown> = {}): Command => ({
  type: "interface/set-ip", deviceId: ID, port: GI0, ip: "10.0.1.1", mask: "255.255.255.0", ...fields,
}) as Command;
const configOf = (simulator: Simulator) => (simulator.getSnapshot().document.devices.find(device => device.id === ID) as RouterDevice).config;

function open() {
  const simulator = createSimulator();
  simulator.load(twoPcDocument);
  simulator.dispatch({ type: "device/add", id: ID, kind: "router", position: { x: 300, y: 100 } });
  return simulator;
}

describe("Router 인터페이스 IP 설정", () => {
  test("꺼진 포트에 IP와 마스크를 설정하고 원본 스냅샷은 보존한다", () => {
    const simulator = open();
    const before = simulator.getSnapshot();
    expect(simulator.dispatch(command())).toEqual({ ok: true, notices: [] });
    expect(configOf(simulator).interfaces[GI0]).toEqual({ adminUp: false, ip: "10.0.1.1", mask: "255.255.255.0" });
    expect((before.document.devices.find(device => device.id === ID) as RouterDevice).config.interfaces[GI0]).toEqual({ adminUp: false });
    expect(simulator.getSnapshot().views[ID]!.ports[0]!.status).toBe("admin-down");
  });

  test("IP를 변경하거나 제거해도 켜짐 상태와 다른 포트 설정을 보존한다", () => {
    const simulator = open();
    simulator.dispatch({ type: "interface/set-admin", deviceId: ID, port: GI0, adminUp: true });
    simulator.dispatch(command({ port: GI1, ip: "10.0.2.1" }));
    simulator.dispatch(command());
    simulator.dispatch(command({ ip: "10.0.1.2" }));
    expect(configOf(simulator).interfaces[GI0]).toEqual({ adminUp: true, ip: "10.0.1.2", mask: "255.255.255.0" });
    expect(simulator.dispatch({ type: "interface/clear-ip", deviceId: ID, port: GI0 })).toEqual({ ok: true, notices: [] });
    expect(configOf(simulator).interfaces[GI0]).toEqual({ adminUp: true });
    expect(configOf(simulator).interfaces[GI1]!.ip).toBe("10.0.2.1");
    expect(validateDocument(simulator.getSnapshot().document).ok).toBe(true);
  });

  test("자기 포트의 IP를 같은 네트워크 안에서 바꾸는 것은 허용한다", () => {
    const simulator = open();
    simulator.dispatch(command());
    expect(simulator.dispatch(command({ ip: "10.0.1.20" })).ok).toBe(true);
  });

  test.each([
    ["10.0.1.1", "255.255.255.0", "10.0.1.2", "255.255.255.0"],
    ["10.0.1.1", "255.255.0.0", "10.0.2.1", "255.255.255.0"],
    ["10.0.2.1", "255.255.255.0", "10.0.1.1", "255.255.0.0"],
  ])("다른 포트의 %s %s와 겹치는 %s %s는 거부한다", (ip, mask, newIp, newMask) => {
    const simulator = open();
    simulator.dispatch(command({ ip, mask }));
    const before = simulator.getSnapshot();
    expect(simulator.dispatch(command({ port: GI1, ip: newIp, mask: newMask }))).toMatchObject({
      ok: false, error: { code: "INTERFACE_NETWORK_OVERLAP", params: { port: GI1, otherPort: GI0 } },
    });
    expect(simulator.getSnapshot()).toBe(before);
    simulator.dispatch({ type: "interface/clear-ip", deviceId: ID, port: GI0 });
    expect(simulator.dispatch(command({ port: GI1, ip: newIp, mask: newMask })).ok).toBe(true);
  });

  test("서로 이웃하지만 겹치지 않는 /25 네트워크는 허용한다", () => {
    const simulator = open();
    simulator.dispatch(command({ ip: "192.168.1.1", mask: "255.255.255.128" }));
    expect(simulator.dispatch(command({ port: GI1, ip: "192.168.1.129", mask: "255.255.255.128" })).ok).toBe(true);
  });

  test("PC와 IP가 같으면 설정하면서 중복 경고를 반환한다", () => {
    const simulator = open();
    expect(simulator.dispatch(command({ ip: TWO_PC.pc1.ip }))).toEqual({
      ok: true, notices: [{ code: "DUPLICATE_IP", params: {
        ip: TWO_PC.pc1.ip, others: [{ deviceId: TWO_PC.pc1.id, deviceName: TWO_PC.pc1.name }],
      } }],
    });
    expect(configOf(simulator).interfaces[GI0]!.ip).toBe(TWO_PC.pc1.ip);
  });

  test("다른 Router와 IP가 같아도 설정하면서 경고한다", () => {
    const simulator = open();
    const secondId = "00000000-0000-4000-8000-000000000101";
    simulator.dispatch({ type: "device/add", id: secondId, kind: "router", position: { x: 500, y: 100 } });
    simulator.dispatch(command());
    expect(simulator.dispatch(command({ deviceId: secondId }))).toMatchObject({
      ok: true, notices: [{ code: "DUPLICATE_IP", params: { others: [{ deviceId: ID, deviceName: "R1" }] } }],
    });
  });

  test.each([
    [{ deviceId: "missing" }, "DEVICE_NOT_FOUND"],
    [{ deviceId: TWO_PC.pc1.id }, "DEVICE_KIND_MISMATCH"],
    [{ port: "gi0/0" }, "UNKNOWN_PORT"],
    [{ port: { toString: 1 } }, "UNKNOWN_PORT"],
    [{ ip: "10.0.1.256" }, "INVALID_IPV4"],
    [{ ip: { toString: 1 } }, "INVALID_IPV4"],
    [{ ip: undefined }, "INVALID_IPV4"],
    [{ ip: "127.0.0.1" }, "RESERVED_IPV4"],
    [{ ip: "224.0.0.1" }, "RESERVED_IPV4"],
    [{ ip: "10.0.1.0" }, "IP_IS_NETWORK_ADDRESS"],
    [{ ip: "10.0.1.255" }, "IP_IS_BROADCAST_ADDRESS"],
    [{ mask: "255.0.255.0" }, "INVALID_MASK"],
    [{ mask: "0.0.0.0" }, "INVALID_MASK"],
    [{ mask: "255.255.255.254" }, "INVALID_MASK"],
    [{ mask: "255.255.255.255" }, "INVALID_MASK"],
    [{ mask: undefined }, "INVALID_MASK"],
  ])("오류 입력 %j는 거부하고 스냅샷을 유지한다", (fields, code) => {
    const simulator = open();
    const before = simulator.getSnapshot();
    expect(simulator.dispatch(command(fields))).toMatchObject({ ok: false, error: { code } });
    expect(simulator.getSnapshot()).toBe(before);
  });

  test.each(["ip", "mask"])("오류의 %s 값은 64자를 넘지 않는다", field => {
    const result = open().dispatch(command({ [field]: "x".repeat(1000) }));
    expect(result).toMatchObject({ ok: false, error: { params: { value: "x".repeat(64) } } });
  });

  test("IP가 없는 포트에서도 제거 명령을 안전하게 처리한다", () => {
    const simulator = open();
    expect(simulator.dispatch({ type: "interface/clear-ip", deviceId: ID, port: GI0 }).ok).toBe(true);
    expect(configOf(simulator).interfaces[GI0]).toEqual({ adminUp: false });
  });
});
