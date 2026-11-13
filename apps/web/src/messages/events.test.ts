// T1.9.1, T1.10.2: 이벤트 설명과 실패 사유 문구
import { DROP_REASONS, REASON_CODES } from "@ping9/shared";
import type { Reason } from "@ping9/shared";
import { describe, expect, test } from "vitest";

import { CAUSE_TEXT, EVENT_TEXT, causeOf, eventText } from "./events";

const device = { deviceId: "d1", deviceName: "SW2" };
const reason = (code: string, params: Record<string, unknown>) => ({ code, params }) as unknown as Reason;

describe("모든 코드에 문구가 있다 (AD-14)", () => {
  test("이벤트 설명: 모든 ReasonCode", () => {
    expect(Object.keys(EVENT_TEXT).sort()).toEqual([...REASON_CODES].sort());
  });

  test("실패 사유: 모든 DropReason", () => {
    expect(Object.keys(CAUSE_TEXT).sort()).toEqual([...DROP_REASONS].sort());
  });
});

describe("eventText", () => {
  test("포트 이름은 짧게, 값은 문장에 들어간다", () => {
    expect(eventText(reason("FRAME_FLOODED", { device, port: "FastEthernet0/8", vlan: 10, broadcast: true })))
      .toBe("브로드캐스트라 Fa0/8로 내보냄 (VLAN 10)");
    expect(eventText(reason("FRAME_FLOODED", { device, port: "FastEthernet0/8", vlan: 10, broadcast: false })))
      .toBe("목적지를 몰라 Fa0/8로 내보냄 (VLAN 10)");
    expect(eventText(reason("MAC_LEARNED", { device, mac: "02:00:00:00:00:01", port: "FastEthernet0/1", vlan: 10 })))
      .toBe("MAC 표에 기록: 02:00:00:00:00:01 → Fa0/1 (VLAN 10)");
  });

  test("받침에 맞는 조사", () => {
    expect(eventText(reason("TRUNK_NOT_ALLOWED", { device, port: "FastEthernet0/8", vlan: 10 })))
      .toBe("VLAN 10이 Fa0/8 trunk 허용 목록에 없어 버림");
    expect(eventText(reason("TRUNK_NOT_ALLOWED", { device, port: "FastEthernet0/8", vlan: 20 })))
      .toBe("VLAN 20이 Fa0/8 trunk 허용 목록에 없어 버림");
    expect(eventText(reason("VLAN_INACTIVE", { device, port: "FastEthernet0/1", vlan: 30 })))
      .toBe("Fa0/1의 VLAN 30이 없어 버림");
  });
});

describe("causeOf", () => {
  test("장비 이름, 고치는 방법, 그대로 입력할 명령", () => {
    expect(causeOf(reason("TRUNK_NOT_ALLOWED", { device, port: "FastEthernet0/8", vlan: 10 }))).toEqual({
      text: "SW2의 Fa0/8 trunk가 VLAN 10 프레임을 허용하지 않아 버렸어요",
      fix: "SW2에서 허용 목록에 더하세요:",
      command: "switchport trunk allowed vlan add 10",
    });
  });

  test("명령이 없는 사유는 command가 없다", () => {
    const cause = causeOf(reason("NO_GATEWAY", { device: { deviceId: "p", deviceName: "PC1" }, targetIp: "10.0.20.2" }));
    expect(cause?.text).toBe("PC1에 기본 게이트웨이가 없어 다른 네트워크(10.0.20.2)로 보낼 수 없어요");
    expect(cause).not.toHaveProperty("command");
  });

  test("폐기가 아닌 이벤트는 사유가 없다", () => {
    expect(causeOf(reason("FRAME_RECEIVED", { device, port: "FastEthernet0/1" }))).toBeUndefined();
  });
});
