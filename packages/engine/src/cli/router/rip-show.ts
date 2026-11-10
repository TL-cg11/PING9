// `show ip protocols` (T11.2.4). 실제 IOS 출력에서 PING9에서도 참인 줄만 남긴다.
// PING9는 30초 타이머 없이 설정이 바뀔 때 경로를 교환하므로(T11.2.3) 타이머 줄은 그 사실로 바꾸고,
// `Last Update` 대신 그 이웃에게서 배운 경로 수를 보인다.

import { classfulNetwork, DEFAULT_DISTANCE } from "@ping9/shared";
import type { ConsoleLine } from "@ping9/shared";

import { defineCommand } from "../ios";
import type { CommandDefinition } from "../ios";
import { tableLines } from "../ios/table";
import { routesOf } from "./show-commands";

const text = (value: string): ConsoleLine => ({ kind: "text", text: value });
const indent = (spaces: number) => (line: string) => `${" ".repeat(spaces)}${line}`;

export const ROUTER_RIP_SHOW_COMMANDS: readonly CommandDefinition[] = [
  defineCommand({
    modes: ["privileged"], devices: ["router"], tokens: ["show", "ip", "protocols"],
    help: "Show the routing protocol (RIP) settings and neighbors",
    run: (_args, context) => {
      const device = context.device;
      if (device.kind !== "router" || device.config.rip === undefined) return {};
      const { networks, passiveInterfaces } = device.config.rip;
      const routes = routesOf(context);
      // 켜져 있고 IP의 클래스풀 네트워크가 `network`에 있으며 passive가 아닌 인터페이스. 포트 순서
      const sending = routes
        .filter(route => route.source === "connected" && route.port !== undefined && !passiveInterfaces.includes(route.port))
        .map(route => route.port!)
        .filter(port => networks.includes(classfulNetwork(device.config.interfaces[port]?.ip ?? "") ?? ""));
      const ports = [...new Set(sending)];
      // 이웃(다음 홉)별로 지금 테이블에 있는 RIP 경로 수
      const sources = new Map<string, number>();
      for (const route of routes) {
        if (route.source === "rip" && route.nextHop !== undefined) sources.set(route.nextHop, (sources.get(route.nextHop) ?? 0) + 1);
      }
      const lines = [
        'Routing Protocol is "rip"',
        "  Sending updates when the topology changes (PING9 does not use timers)",
        "  Default version control: send version 2, receive version 2",
        ...tableLines(["Interface", "Send", "Recv"], ports.map(port => [port, "2", "2"])).map(indent(4)),
        "  Automatic network summarization is not in effect",
        "  Routing for Networks:",
        ...networks.map(indent(4)),
        ...(passiveInterfaces.length === 0 ? [] : ["  Passive Interface(s):", ...passiveInterfaces.map(indent(4))]),
        "  Routing Information Sources:",
        ...tableLines(["Gateway", "Distance", "Routes"],
          [...sources].map(([gateway, count]) => [gateway, String(DEFAULT_DISTANCE.rip), String(count)])).map(indent(4)),
        `  Distance: (default is ${DEFAULT_DISTANCE.rip})`,
      ];
      return { lines: lines.map(text) };
    },
  }),
];
