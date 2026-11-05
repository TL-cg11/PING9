import { expect, test } from "vitest";

import { PORT_NAMES } from "./document";
import { shortPortName } from "./port-name";

test.each([
  ["FastEthernet0/1", "Fa0/1"],
  ["FastEthernet0/8", "Fa0/8"],
  ["GigabitEthernet0/3", "Gi0/3"],
  ["Ethernet0", "Eth0"],
  // 모르는 이름은 그대로 둔다
  ["Serial0/0", "Serial0/0"],
  ["", ""],
])("%j → %j", (full, short) => {
  expect(shortPortName(full)).toBe(short);
});

test("모든 장비의 포트 이름이 줄어들고 서로 겹치지 않는다", () => {
  for (const names of Object.values(PORT_NAMES)) {
    const short = names.map(shortPortName);

    expect(new Set(short).size).toBe(names.length);
    for (const [index, name] of names.entries()) expect(short[index]!.length).toBeLessThan(name.length);
  }
});
