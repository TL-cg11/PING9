import { describe, expect, test } from "vitest";

import { PORT_NAMES } from "./document";
import type { SwitchConfig } from "./document";
import { twoSwitchVlanDocument } from "./examples/index";
import {
  ALL_VLANS,
  DEFAULT_VLAN_ID,
  DEFAULT_VLAN_NAME,
  defaultVlanName,
  switchPort,
  switchPorts,
  switchVlans,
  vlanAccessPorts,
} from "./switch-config";
import { checkVlanName } from "./values";

const sw1 = twoSwitchVlanDocument.devices.find((device) => device.name === "SW1")!.config as SwitchConfig;
const bare: SwitchConfig = { vlans: [], ports: {} };

describe("switchPort", () => {
  test("구성에 없는 포트는 켜짐, access, VLAN 1, 전부 허용이다", () => {
    expect(switchPort(bare, "FastEthernet0/3")).toEqual({
      name: "FastEthernet0/3",
      adminUp: true,
      mode: "access",
      accessVlan: 1,
      allowedVlans: [[1, 4094]],
    });
  });

  test("구성에 있는 값은 그대로, 없는 값만 기본값으로 채운다", () => {
    expect(switchPort(sw1, "FastEthernet0/1")).toEqual({
      name: "FastEthernet0/1",
      adminUp: true,
      mode: "access",
      accessVlan: 10,
      allowedVlans: [[1, 4094]],
    });
    expect(switchPort(sw1, "FastEthernet0/8")).toEqual({
      name: "FastEthernet0/8",
      adminUp: true,
      mode: "trunk",
      accessVlan: 1,
      allowedVlans: [
        [10, 10],
        [20, 20],
      ],
    });
  });

  test("빈 허용 목록은 아무 VLAN도 허용하지 않는다는 뜻으로 그대로 둔다", () => {
    const config: SwitchConfig = {
      vlans: [],
      ports: { "FastEthernet0/8": { adminUp: false, mode: "trunk", allowedVlans: [] } },
    };

    expect(switchPort(config, "FastEthernet0/8")).toMatchObject({ adminUp: false, allowedVlans: [] });
  });

  test("기본값 상수", () => {
    expect(DEFAULT_VLAN_ID).toBe(1);
    expect(DEFAULT_VLAN_NAME).toBe("default");
    expect(ALL_VLANS).toEqual([[1, 4094]]);
  });
});

describe("switchPorts", () => {
  test("8개를 포트 순서로 돌려준다", () => {
    expect(switchPorts(sw1).map((port) => port.name)).toEqual(PORT_NAMES.switch);
    expect(switchPorts(bare)).toHaveLength(8);
  });
});

describe("switchVlans", () => {
  test("VLAN 1이 없는 문서에도 VLAN 1이 있다", () => {
    expect(switchVlans(bare)).toEqual([{ id: 1, name: "default" }]);
  });

  test("번호 오름차순으로 돌려준다", () => {
    const config: SwitchConfig = {
      vlans: [
        { id: 20, name: "B" },
        { id: 10, name: "A" },
      ],
      ports: {},
    };

    expect(switchVlans(config)).toEqual([
      { id: 1, name: "default" },
      { id: 10, name: "A" },
      { id: 20, name: "B" },
    ]);
  });

  test("문서에 있는 VLAN 1의 이름은 그대로 둔다", () => {
    expect(switchVlans({ vlans: [{ id: 1, name: "CORE" }], ports: {} })).toEqual([{ id: 1, name: "CORE" }]);
  });

  test("받은 구성을 고치지 않는다", () => {
    const vlans = Object.freeze([Object.freeze({ id: 20, name: "B" }), Object.freeze({ id: 10, name: "A" })]);

    expect(() => switchVlans({ vlans, ports: {} })).not.toThrow();
    expect(vlans.map((vlan) => vlan.id)).toEqual([20, 10]);
  });
});

describe("vlanAccessPorts", () => {
  test("access 포트만 들어간다 (trunk 포트는 어느 VLAN에도 나오지 않는다)", () => {
    expect(vlanAccessPorts(sw1, 10)).toEqual(["FastEthernet0/1"]);
    expect(vlanAccessPorts(sw1, 20)).toEqual(["FastEthernet0/2"]);
    expect(vlanAccessPorts(sw1, 1)).toEqual([
      "FastEthernet0/3",
      "FastEthernet0/4",
      "FastEthernet0/5",
      "FastEthernet0/6",
      "FastEthernet0/7",
    ]);
  });

  test("포트가 없는 VLAN은 빈 목록이다", () => {
    expect(vlanAccessPorts(sw1, 30)).toEqual([]);
  });

  test("새 Switch는 8개 포트가 모두 VLAN 1이다", () => {
    expect(vlanAccessPorts(bare, 1)).toEqual(PORT_NAMES.switch);
  });
});

describe("defaultVlanName", () => {
  test.each([
    [1, "VLAN0001"],
    [10, "VLAN0010"],
    [4094, "VLAN4094"],
  ])("%i → %s", (id, name) => {
    expect(defaultVlanName(id)).toBe(name);
    expect(checkVlanName(name)).toBeNull();
  });
});
