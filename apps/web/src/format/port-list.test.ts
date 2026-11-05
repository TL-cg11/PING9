import { PORT_NAMES } from "@ping9/shared";
import { expect, test } from "vitest";

import { formatPortList } from "./port-list";

const fa = (...numbers: number[]) => numbers.map((number) => `FastEthernet0/${number}`);

test.each([
  [fa(3, 4, 5, 6, 7), "Fa0/3~7"],
  [fa(1), "Fa0/1"],
  [fa(1, 3), "Fa0/1, Fa0/3"],
  [fa(1, 2), "Fa0/1~2"],
  [fa(1, 2, 4, 5, 6, 8), "Fa0/1~2, Fa0/4~6, Fa0/8"],
  [[...PORT_NAMES.switch], "Fa0/1~8"],
  [[...PORT_NAMES.router], "Gi0/0~3"],
  [["Ethernet0"], "Eth0"],
  // 앞부분이 다르면 잇지 않는다
  [["FastEthernet0/1", "GigabitEthernet0/2"], "Fa0/1, Gi0/2"],
  [["FastEthernet0/1", "FastEthernet1/2"], "Fa0/1, Fa1/2"],
  // 끝이 수가 아닌 이름은 그대로 둔다
  [["Console", "Aux"], "Console, Aux"],
  [[], "-"],
])("%j → %s", (ports, expected) => {
  expect(formatPortList(ports)).toBe(expected);
});
