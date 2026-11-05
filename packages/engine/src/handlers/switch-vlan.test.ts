// vlan/create, vlan/rename, vlan/remove (FR-31). Simulator.dispatch로 확인한다.
import type { Command, SwitchConfig } from "@ping9/shared";
import {
  TWO_PC_SWITCH,
  TWO_SWITCH_VLAN,
  twoPcSwitchDocument,
  twoSwitchVlanDocument,
} from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../index";
import type { Simulator } from "../index";
import { normalizeSwitchConfig } from "./switch-common";

const SW = TWO_PC_SWITCH.sw1.id;
const PC = TWO_PC_SWITCH.pc1.id;

function start(): Simulator {
  const simulator = createSimulator();
  simulator.load(twoPcSwitchDocument);
  return simulator;
}

function configOf(simulator: Simulator, deviceId: string): SwitchConfig {
  return simulator.getSnapshot().document.devices.find((device) => device.id === deviceId)!
    .config as SwitchConfig;
}

const vlansOf = (simulator: Simulator) => configOf(simulator, SW).vlans;

describe("vlan/create", () => {
  test("번호순으로 들어가고 이름이 없으면 기본 이름이다", () => {
    const simulator = start();

    expect(simulator.dispatch({ type: "vlan/create", deviceId: SW, vlanId: 20, name: "DEV" })).toEqual({
      ok: true,
      notices: [],
    });
    expect(simulator.dispatch({ type: "vlan/create", deviceId: SW, vlanId: 10 })).toEqual({
      ok: true,
      notices: [],
    });

    expect(vlansOf(simulator)).toEqual([
      { id: 1, name: "default" },
      { id: 10, name: "VLAN0010" },
      { id: 20, name: "DEV" },
    ]);
  });

  test("받아들여지면 docVersion이 1 오른다", () => {
    const simulator = start();
    const before = simulator.getSnapshot().docVersion;

    simulator.dispatch({ type: "vlan/create", deviceId: SW, vlanId: 10 });

    expect(simulator.getSnapshot().docVersion).toBe(before + 1);
  });

  test("경계 번호 2와 4094는 만들 수 있다", () => {
    const simulator = start();

    expect(simulator.dispatch({ type: "vlan/create", deviceId: SW, vlanId: 4094 }).ok).toBe(true);
    expect(simulator.dispatch({ type: "vlan/create", deviceId: SW, vlanId: 2 }).ok).toBe(true);
  });

  test("VLAN은 Switch당 64개까지다 (VLAN 1 포함)", () => {
    const simulator = start();
    for (let id = 2; id <= 64; id += 1) {
      expect(simulator.dispatch({ type: "vlan/create", deviceId: SW, vlanId: id }).ok).toBe(true);
    }

    expect(simulator.dispatch({ type: "vlan/create", deviceId: SW, vlanId: 65 })).toEqual({
      ok: false,
      error: { code: "LIMIT_EXCEEDED", params: { limit: "vlans", max: 64 } },
    });
    expect(vlansOf(simulator)).toHaveLength(64);
  });
});

describe("vlan/rename, vlan/remove", () => {
  test("이름을 바꾸고 지울 수 있다", () => {
    const simulator = start();
    simulator.dispatch({ type: "vlan/create", deviceId: SW, vlanId: 10 });

    expect(simulator.dispatch({ type: "vlan/rename", deviceId: SW, vlanId: 10, name: "SALES" })).toEqual({
      ok: true,
      notices: [],
    });
    expect(vlansOf(simulator)).toEqual([
      { id: 1, name: "default" },
      { id: 10, name: "SALES" },
    ]);

    expect(simulator.dispatch({ type: "vlan/remove", deviceId: SW, vlanId: 10 })).toEqual({
      ok: true,
      notices: [],
    });
    expect(vlansOf(simulator)).toEqual([{ id: 1, name: "default" }]);
  });

  test("VLAN을 지워도 그 VLAN을 쓰던 포트의 값은 남는다", () => {
    const simulator = createSimulator();
    simulator.load(twoSwitchVlanDocument);
    const id = TWO_SWITCH_VLAN.sw1.id;

    expect(simulator.dispatch({ type: "vlan/remove", deviceId: id, vlanId: 10 }).ok).toBe(true);

    const config = configOf(simulator, id);
    expect(config.vlans.map((vlan) => vlan.id)).toEqual([1, 20]);
    expect(config.ports["FastEthernet0/1"]).toEqual({ adminUp: true, mode: "access", accessVlan: 10 });
  });

  test("다른 Switch의 구성은 바뀌지 않는다", () => {
    const simulator = createSimulator();
    simulator.load(twoSwitchVlanDocument);
    const before = configOf(simulator, TWO_SWITCH_VLAN.sw2.id);

    simulator.dispatch({ type: "vlan/create", deviceId: TWO_SWITCH_VLAN.sw1.id, vlanId: 30 });

    expect(configOf(simulator, TWO_SWITCH_VLAN.sw2.id)).toBe(before);
  });
});

describe("거부", () => {
  test.each([
    [{ type: "vlan/create", deviceId: SW, vlanId: 0 }, { code: "INVALID_VLAN_ID", params: { value: 0 } }],
    [{ type: "vlan/create", deviceId: SW, vlanId: 4095 }, { code: "INVALID_VLAN_ID", params: { value: 4095 } }],
    [{ type: "vlan/create", deviceId: SW, vlanId: 1.5 }, { code: "INVALID_VLAN_ID", params: { value: 1.5 } }],
    [
      { type: "vlan/create", deviceId: SW, vlanId: 1 },
      { code: "DUPLICATE_VLAN", params: { deviceId: SW, vlanId: 1 } },
    ],
    [
      { type: "vlan/create", deviceId: SW, vlanId: 10, name: "a b" },
      { code: "INVALID_VLAN_NAME", params: { value: "a b" } },
    ],
    [
      { type: "vlan/create", deviceId: SW, vlanId: 10, name: "" },
      { code: "INVALID_VLAN_NAME", params: { value: "" } },
    ],
    [
      { type: "vlan/create", deviceId: PC, vlanId: 10 },
      { code: "DEVICE_KIND_MISMATCH", params: { deviceId: PC, expected: "switch", actual: "pc" } },
    ],
    [
      { type: "vlan/create", deviceId: "nope", vlanId: 10 },
      { code: "DEVICE_NOT_FOUND", params: { deviceId: "nope" } },
    ],
    [
      { type: "vlan/rename", deviceId: SW, vlanId: 1, name: "X" },
      { code: "DEFAULT_VLAN_READONLY", params: { deviceId: SW } },
    ],
    [
      { type: "vlan/rename", deviceId: SW, vlanId: 30, name: "X" },
      { code: "VLAN_NOT_FOUND", params: { deviceId: SW, vlanId: 30 } },
    ],
    [
      { type: "vlan/rename", deviceId: PC, vlanId: 30, name: "X" },
      { code: "DEVICE_KIND_MISMATCH", params: { deviceId: PC, expected: "switch", actual: "pc" } },
    ],
    [
      { type: "vlan/remove", deviceId: SW, vlanId: 1 },
      { code: "DEFAULT_VLAN_READONLY", params: { deviceId: SW } },
    ],
    [
      { type: "vlan/remove", deviceId: SW, vlanId: 30 },
      { code: "VLAN_NOT_FOUND", params: { deviceId: SW, vlanId: 30 } },
    ],
    [{ type: "vlan/remove", deviceId: SW, vlanId: 4095 }, { code: "INVALID_VLAN_ID", params: { value: 4095 } }],
  ])("%j는 거부되고 아무것도 바뀌지 않는다", (command, error) => {
    const simulator = start();
    const before = simulator.getSnapshot();

    expect(simulator.dispatch(command as Command)).toEqual({ ok: false, error });
    expect(simulator.getSnapshot()).toBe(before);
  });

  test("있는 VLAN의 이름을 틀린 이름으로 바꿀 수 없다", () => {
    const simulator = start();
    simulator.dispatch({ type: "vlan/create", deviceId: SW, vlanId: 10 });

    expect(simulator.dispatch({ type: "vlan/rename", deviceId: SW, vlanId: 10, name: "x".repeat(33) })).toEqual({
      ok: false,
      error: { code: "INVALID_VLAN_NAME", params: { value: "x".repeat(33) } },
    });
    expect(vlansOf(simulator)[1]).toEqual({ id: 10, name: "VLAN0010" });
  });

  test("deviceId가 문자열이 아니어도 예외 없이 거부한다", () => {
    const simulator = start();

    expect(simulator.dispatch({ type: "vlan/create", deviceId: 42, vlanId: 10 } as unknown as Command)).toEqual({
      ok: false,
      error: { code: "DEVICE_NOT_FOUND", params: { deviceId: "42" } },
    });
  });
});

describe("normalizeSwitchConfig", () => {
  test("예시 문서의 Switch 구성은 이미 정규화된 형태다", () => {
    for (const device of twoSwitchVlanDocument.devices) {
      if (device.kind === "switch") expect(normalizeSwitchConfig(device.config)).toEqual(device.config);
    }
  });

  test("기본값과 같은 설정을 지우고 VLAN 1을 채우고 번호순으로 놓는다", () => {
    expect(
      normalizeSwitchConfig({
        vlans: [
          { id: 20, name: "B" },
          { id: 10, name: "A" },
        ],
        ports: {
          "FastEthernet0/1": { adminUp: true, mode: "access", accessVlan: 1, allowedVlans: [[1, 4094]] },
          "FastEthernet0/2": { adminUp: false, mode: "access" },
          "FastEthernet0/3": { adminUp: true, mode: "trunk" },
          "FastEthernet0/4": { adminUp: true, mode: "access", accessVlan: 10 },
          "FastEthernet0/5": { adminUp: true, mode: "access", allowedVlans: [[10, 20]] },
        },
      }),
    ).toEqual({
      vlans: [
        { id: 1, name: "default" },
        { id: 10, name: "A" },
        { id: 20, name: "B" },
      ],
      ports: {
        "FastEthernet0/2": { adminUp: false, mode: "access" },
        "FastEthernet0/3": { adminUp: true, mode: "trunk" },
        "FastEthernet0/4": { adminUp: true, mode: "access", accessVlan: 10 },
        "FastEthernet0/5": { adminUp: true, mode: "access", allowedVlans: [[10, 20]] },
      },
    });
  });

  test("두 번 적용해도 결과가 같다", () => {
    const once = normalizeSwitchConfig({
      vlans: [{ id: 30, name: "C" }],
      ports: { "FastEthernet0/1": { adminUp: true, mode: "access", accessVlan: 1 } },
    });

    expect(normalizeSwitchConfig(once)).toEqual(once);
  });
});
