// 속성 기반 테스트: 어떤 vlan/* Command 열을 넣어도 Document는 유효하고 정규화된 형태다 (PBT-1).
import { validateDocument } from "@ping9/shared";
import type { Command, TopologyDocument } from "@ping9/shared";
import { TWO_SWITCH_VLAN, twoSwitchVlanDocument } from "@ping9/shared/examples";
import fc from "fast-check";
import { expect, test } from "vitest";

import { createSimulator } from "../index";
import { normalizeSwitchConfig } from "./switch-common";

const deviceId = fc.constantFrom(TWO_SWITCH_VLAN.sw1.id, TWO_SWITCH_VLAN.sw2.id, TWO_SWITCH_VLAN.pc1.id, "nope");
// 유효한 번호와 경계 밖의 번호가 섞이게 한다
const vlanId = fc.oneof(fc.integer({ min: -1, max: 70 }), fc.constantFrom(4094, 4095));
const name = fc.constantFrom("", "A", "SALES", "a b", "N".repeat(32), "N".repeat(33));

/** 가져온 문서를 흉내 낸 것: SW1에 VLAN 1 없이 VLAN이 한도(64개)까지 차 있다 */
const fullWithoutVlan1: TopologyDocument = {
  ...twoSwitchVlanDocument,
  devices: twoSwitchVlanDocument.devices.map((device) =>
    device.id === TWO_SWITCH_VLAN.sw1.id && device.kind === "switch"
      ? {
          ...device,
          config: {
            ...device.config,
            vlans: Array.from({ length: 64 }, (_, index) => ({ id: index + 2, name: `V${index + 2}` })),
          },
        }
      : device,
  ),
};
const startingDocument = fc.constantFrom(twoSwitchVlanDocument, fullWithoutVlan1);

const command: fc.Arbitrary<Command> = fc.oneof(
  fc.record({ deviceId, vlanId }).map((fields): Command => ({ type: "vlan/create", ...fields })),
  fc.record({ deviceId, vlanId, name }).map((fields): Command => ({ type: "vlan/create", ...fields })),
  fc.record({ deviceId, vlanId, name }).map((fields): Command => ({ type: "vlan/rename", ...fields })),
  fc.record({ deviceId, vlanId }).map((fields): Command => ({ type: "vlan/remove", ...fields })),
);

test("vlan/* Command 열을 넣어도 Document는 유효하고, 거부되면 그대로이며, 구성은 정규화된 형태다", () => {
  let accepted = 0;

  fc.assert(
    fc.property(startingDocument, fc.array(command, { maxLength: 40 }), (start, commands) => {
      const simulator = createSimulator();
      expect(simulator.load(start)).toEqual({ ok: true });

      for (const next of commands) {
        const before = simulator.getSnapshot();
        const result = simulator.dispatch(next);

        if (result.ok) accepted += 1;
        else expect(simulator.getSnapshot()).toBe(before);
        expect(validateDocument(simulator.getSnapshot().document).ok).toBe(true);
      }

      for (const device of simulator.getSnapshot().document.devices) {
        if (device.kind === "switch") expect(normalizeSwitchConfig(device.config)).toEqual(device.config);
      }
    }),
    { numRuns: 300, seed: 20261105 },
  );

  // 받아들여진 Command가 없으면 뒷부분을 확인하지 못한 것이다
  expect(accepted).toBeGreaterThan(100);
});
