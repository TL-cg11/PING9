import { twoPcDocument, twoPcSwitchDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import type { CliSession } from "./define";
import { INITIAL_SESSION, effectiveSession, linesFromDispatch, promptFor } from "./session";

describe("promptFor", () => {
  test.each([
    [{ mode: "user" }, "SW1>"],
    [{ mode: "privileged" }, "SW1#"],
    [{ mode: "config" }, "SW1(config)#"],
    [{ mode: "config-if", targetPort: "FastEthernet0/1" }, "SW1(config-if)#"],
    [{ mode: "config-vlan", targetVlan: 10 }, "SW1(config-vlan)#"],
  ])("%j의 프롬프트는 %s", (session, prompt) => {
    expect(promptFor("SW1", session as CliSession)).toBe(prompt);
  });

  test("처음 세션은 user 모드다", () => {
    expect(INITIAL_SESSION).toEqual({ mode: "user" });
  });
});

describe("effectiveSession", () => {
  // 이 예시의 Switch에는 VLAN 1만 있다
  const sw = twoPcSwitchDocument.devices.find((device) => device.kind === "switch")!;

  test("대상 VLAN이 사라지면 config 모드로 돌아간다", () => {
    expect(effectiveSession({ mode: "config-vlan", targetVlan: 10 }, sw)).toEqual({ mode: "config" });
  });

  test("대상 VLAN이 있으면 그대로다", () => {
    const session: CliSession = { mode: "config-vlan", targetVlan: 1 };

    expect(effectiveSession(session, sw)).toBe(session);
  });

  test("다른 모드는 그대로다", () => {
    const session: CliSession = { mode: "privileged" };

    expect(effectiveSession(session, sw)).toBe(session);
  });

  test("Switch가 아닌 장비에는 대상 VLAN이 없는 것으로 본다", () => {
    const pc = twoPcDocument.devices[0]!;

    expect(effectiveSession({ mode: "config-vlan", targetVlan: 1 }, pc)).toEqual({ mode: "config" });
  });
});

describe("linesFromDispatch", () => {
  test("성공이면 알림마다 notice 줄이 된다", () => {
    expect(linesFromDispatch({ ok: true, notices: [] })).toEqual([]);
    expect(
      linesFromDispatch({
        ok: true,
        notices: [{ code: "VLAN_AUTO_CREATED", params: { device: { deviceId: "d", deviceName: "SW1" }, vlanId: 10 } }],
      }),
    ).toEqual([
      {
        kind: "notice",
        code: "VLAN_AUTO_CREATED",
        params: { device: { deviceId: "d", deviceName: "SW1" }, vlanId: 10 },
      },
    ]);
  });

  test("실패면 오류 줄 하나가 된다", () => {
    expect(
      linesFromDispatch({ ok: false, error: { code: "UNKNOWN_COMMAND", params: { type: "x" } } }),
    ).toEqual([{ kind: "error", code: "UNKNOWN_COMMAND", params: { type: "x" } }]);
  });
});
