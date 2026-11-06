// IOS 방식 CLI의 기본 명령어: 모드를 오가는 명령과 hostname.
// 장비 종류를 가리지 않는다. Switch와 Router의 정의 목록이 모두 이 목록으로 시작한다.

import { defineCommand, param } from "./define";
import type { CliMode, CommandDefinition } from "./define";
import { linesFromDispatch } from "./session";

/** `exit`는 한 단계 위로 간다. user 모드에서는 그대로다 */
const EXIT_TO: Readonly<Record<CliMode, CliMode>> = {
  user: "user",
  privileged: "user",
  config: "privileged",
  "config-if": "config",
  "config-vlan": "config",
};

export const BASE_COMMANDS: readonly CommandDefinition[] = [
  defineCommand({
    modes: ["user"],
    tokens: ["enable"],
    help: "Enter privileged mode",
    run: () => ({ session: { mode: "privileged" } }),
  }),
  defineCommand({
    modes: ["privileged"],
    tokens: ["disable"],
    help: "Return to user mode",
    run: () => ({ session: { mode: "user" } }),
  }),
  defineCommand({
    modes: ["privileged"],
    tokens: ["configure", "terminal"],
    help: "Enter configuration mode",
    run: () => ({ session: { mode: "config" } }),
  }),
  defineCommand({
    modes: ["user", "privileged", "config", "config-if", "config-vlan"],
    tokens: ["exit"],
    help: "Leave the current mode",
    run: (_args, context) => ({ session: { mode: EXIT_TO[context.session.mode] } }),
  }),
  defineCommand({
    modes: ["privileged", "config", "config-if", "config-vlan"],
    tokens: ["end"],
    help: "Return to privileged mode",
    run: () => ({ session: { mode: "privileged" } }),
  }),
  defineCommand({
    modes: ["config"],
    tokens: ["hostname", param("name", "word", "Device name")],
    help: "Set the device name",
    run: (args, context) => ({
      lines: linesFromDispatch(
        context.dispatch({ type: "device/rename", deviceId: context.device.id, name: String(args.name) }),
      ),
    }),
  }),
];
