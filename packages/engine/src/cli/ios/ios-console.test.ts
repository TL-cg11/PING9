import { twoPcSwitchDocument } from "@ping9/shared/examples";
import { beforeEach, describe, expect, test } from "vitest";

import { reduce } from "../../reducer";
import { defineCommand } from "./define";
import type { CliSession } from "./define";
import { iosExec, iosPrompt } from "./ios-console";
import type { IosConsoleEnv } from "./ios-console";
import { INITIAL_SESSION, linesFromDispatch } from "./session";

const sw = twoPcSwitchDocument.devices.find((device) => device.kind === "switch")!;

const DEFS = [
  defineCommand({
    modes: ["user"],
    tokens: ["up"],
    help: "h",
    run: () => ({ session: { mode: "privileged" } }),
  }),
  defineCommand({
    modes: ["privileged"],
    tokens: ["boom"],
    help: "h",
    run: (_args, context) => ({
      lines: linesFromDispatch(context.dispatch({ type: "device/remove", deviceId: "x" })),
    }),
  }),
];

/** 문서를 바꾸지 않는 env. dispatch는 reducer의 결과를 그대로 돌려준다 */
function makeEnv(): IosConsoleEnv {
  const sessions = new Map<string, CliSession>();
  return {
    getDocument: () => twoPcSwitchDocument,
    dispatch: (command) => {
      const result = reduce(twoPcSwitchDocument, command);
      return result.ok ? { ok: true, notices: result.notices } : result;
    },
    getSession: (deviceId) => sessions.get(deviceId) ?? INITIAL_SESSION,
    setSession: (deviceId, session) => {
      sessions.set(deviceId, session);
    },
  };
}

describe("iosExec", () => {
  let env: IosConsoleEnv;
  beforeEach(() => {
    env = makeEnv();
  });

  test("명령을 실행하고 세션과 프롬프트를 바꾼다", () => {
    expect(iosExec("up", sw, DEFS, env)).toEqual({ lines: [], prompt: "SW1#" });
    expect(env.getSession(sw.id)).toEqual({ mode: "privileged" });
    expect(iosPrompt(sw, env)).toBe("SW1#");
  });

  test("빈 줄과 !로 시작하는 줄은 아무것도 하지 않는다", () => {
    expect(iosExec("   ", sw, DEFS, env)).toEqual({ lines: [], prompt: "SW1>" });
    expect(iosExec("! comment", sw, DEFS, env)).toEqual({ lines: [], prompt: "SW1>" });
    expect(env.getSession(sw.id)).toEqual({ mode: "user" });
  });

  test("해석 오류는 위치가 든 오류 줄이 된다", () => {
    expect(iosExec(" nope", sw, DEFS, env)).toEqual({
      lines: [{ kind: "error", code: "CLI_UNKNOWN_COMMAND", params: { token: "nope" }, position: 1 }],
      prompt: "SW1>",
    });
  });

  test("위치가 없는 오류에는 position 필드가 없다", () => {
    const result = iosExec("up", sw, [defineCommand({ ...DEFS[0]!, tokens: ["up", "now"] })], env);

    expect(result.lines).toEqual([{ kind: "error", code: "CLI_INCOMPLETE_COMMAND", params: {} }]);
    expect(Object.hasOwn(result.lines[0]!, "position")).toBe(false);
  });

  test("dispatch가 거부되면 오류 줄이 되고 모드는 그대로다", () => {
    env.setSession(sw.id, { mode: "privileged" });

    expect(iosExec("boom", sw, DEFS, env)).toEqual({
      lines: [{ kind: "error", code: "UNKNOWN_COMMAND", params: { type: "device/remove" } }],
      prompt: "SW1#",
    });
  });

  test("대상이 사라진 세션은 config 모드로 보고 실행한다", () => {
    // 이 Switch에는 VLAN 10이 없다
    env.setSession(sw.id, { mode: "config-vlan", targetVlan: 10 });

    expect(iosPrompt(sw, env)).toBe("SW1(config)#");
    expect(iosExec("", sw, DEFS, env).prompt).toBe("SW1(config)#");
  });
});
