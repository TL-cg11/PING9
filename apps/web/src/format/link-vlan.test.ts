import type { Link, TopologyDocument } from "@ping9/shared";
import { TWO_SWITCH_VLAN, twoPcSwitchDocument, twoSwitchVlanDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { formatAllowedVlans, linkVlan } from "./link-vlan";

const { pc1, pc2, sw1, sw2 } = TWO_SWITCH_VLAN;

/** 두 장비를 잇는 링크 */
function linkBetween(document: TopologyDocument, a: string, b: string): Link {
  const link = document.links.find((candidate) => {
    const ids = candidate.ends.map((end) => end.deviceId);
    return ids.includes(a) && ids.includes(b);
  });
  if (link === undefined) throw new Error("링크가 없음");
  return link;
}

describe("formatAllowedVlans", () => {
  test.each([
    [[[1, 4094]], "전체"],
    [[], "없음"],
    [[[10, 10]], "10"],
    [[[10, 10], [20, 30]], "10, 20-30"],
  ] as const)("%j → %s", (ranges, text) => {
    expect(formatAllowedVlans(ranges)).toBe(text);
  });
});

describe("linkVlan", () => {
  test("access 포트에 연결된 링크는 그 포트의 VLAN", () => {
    expect(linkVlan(twoSwitchVlanDocument, linkBetween(twoSwitchVlanDocument, pc1.id, sw1.id))).toEqual({
      kind: "access",
      vlan: 10,
    });
    expect(linkVlan(twoSwitchVlanDocument, linkBetween(twoSwitchVlanDocument, pc2.id, sw1.id))).toEqual({
      kind: "access",
      vlan: 20,
    });
  });

  test("trunk 포트끼리 이은 링크는 trunk이고, 끝마다 그 끝의 허용 목록이 붙는다", () => {
    const link = linkBetween(twoSwitchVlanDocument, sw1.id, sw2.id);
    const mark = linkVlan(twoSwitchVlanDocument, link);

    // 링크의 두 끝이 어느 순서로 적혀 있든 SW1 쪽이 10, 20이고 SW2 쪽이 20이다
    const bySwitch = Object.fromEntries(link.ends.map((end, index) => [end.deviceId, mark?.kind === "trunk" && mark.ends[index]]));
    expect(mark?.kind).toBe("trunk");
    expect(bySwitch[sw1.id]).toBe("허용 10, 20");
    expect(bySwitch[sw2.id]).toBe("허용 20");
  });

  test("한쪽 끝만 trunk여도 trunk이고, trunk가 아닌 끝에는 글이 없다", () => {
    const document: TopologyDocument = {
      ...twoSwitchVlanDocument,
      devices: twoSwitchVlanDocument.devices.map((device) =>
        device.id === sw2.id && device.kind === "switch" ? { ...device, config: { vlans: [], ports: {} } } : device,
      ),
    };
    const link = linkBetween(document, sw1.id, sw2.id);
    const mark = linkVlan(document, link);

    expect(mark?.kind === "trunk" && mark.ends.filter((text) => text !== undefined)).toEqual(["허용 10, 20"]);
  });

  test("VLAN 1의 access 포트뿐이면 표시가 없다", () => {
    for (const link of twoPcSwitchDocument.links) expect(linkVlan(twoPcSwitchDocument, link)).toBeUndefined();
  });
});
