import { ERROR_CODES, NOTICE_CODES } from "@ping9/shared";
import { describe, expect, test } from "vitest";

import { ERROR_MESSAGES, formatError } from "./errors";
import { NOTICE_MESSAGES, formatNotice } from "./notices";

describe("오류 문구", () => {
  test.each(ERROR_CODES)("%s: 문구가 있다", (code) => {
    expect(typeof ERROR_MESSAGES[code]).toBe("function");
  });

  test("목록에 없는 코드를 담고 있지 않다", () => {
    expect(Object.keys(ERROR_MESSAGES).sort()).toEqual([...ERROR_CODES].sort());
  });

  test("값이 문구에 들어간다", () => {
    expect(formatError({ code: "INVALID_VLAN_ID", params: { value: 4095 } })).toBe(
      "VLAN 번호는 1~4094여야 해요: 4095",
    );
    expect(formatError({ code: "LIMIT_EXCEEDED", params: { limit: "vlans", max: 64 } })).toBe(
      "VLAN은 Switch 하나에 64개까지 만들 수 있어요",
    );
    expect(formatError({ code: "CLI_UNKNOWN_COMMAND", params: { token: "ipconfig" } })).toBe(
      "알 수 없는 명령어예요: ipconfig",
    );
    expect(formatError({ code: "DEFAULT_VLAN_READONLY", params: { deviceId: "d" } })).toBe(
      "VLAN 1은 지우거나 이름을 바꿀 수 없어요",
    );
    expect(formatError({ code: "CLI_INCOMPLETE_COMMAND", params: {} })).toBe("명령어가 끝나지 않았어요");
  });

  test("PC의 IP 구성에서 빠진 값에 따라 문구가 다르다", () => {
    expect(formatError({ code: "PC_ADDRESS_INCOMPLETE", params: { deviceId: "d", missing: "ip" } })).toBe(
      "IP 주소가 빠졌어요",
    );
    expect(formatError({ code: "PC_ADDRESS_INCOMPLETE", params: { deviceId: "d", missing: "mask" } })).toBe(
      "서브넷 마스크가 빠졌어요",
    );
  });

  test("한도의 종류마다 문구가 다르다", () => {
    const limits = ["devices", "links", "staticRoutes", "vlans", "allowedVlanRanges"] as const;

    const texts = limits.map((limit) => formatError({ code: "LIMIT_EXCEEDED", params: { limit, max: 7 } }));

    expect(new Set(texts).size).toBe(limits.length);
    for (const text of texts) expect(text).toContain("7");
  });

  test("문구에 HTML을 만들지 않는다 (값은 글자 그대로 들어간다)", () => {
    expect(formatError({ code: "CLI_UNKNOWN_COMMAND", params: { token: "<b>x</b>" } })).toBe(
      "알 수 없는 명령어예요: <b>x</b>",
    );
  });
});

describe("알림 문구", () => {
  test.each(NOTICE_CODES)("%s: 문구가 있다", (code) => {
    expect(typeof NOTICE_MESSAGES[code]).toBe("function");
  });

  test("값이 문구에 들어간다", () => {
    expect(
      formatNotice({
        code: "VLAN_AUTO_CREATED",
        params: { device: { deviceId: "d", deviceName: "SW1" }, vlanId: 10 },
      }),
    ).toBe("VLAN 10이 없어서 새로 만들었어요");
    expect(
      formatNotice({
        code: "DUPLICATE_IP",
        params: { ip: "10.0.10.1", others: [{ deviceId: "a", deviceName: "PC2" }, { deviceId: "b", deviceName: "PC3" }] },
      }),
    ).toBe("10.0.10.1은 PC2, PC3도 쓰고 있어요. 이대로 두면 통신이 제대로 안 될 수 있어요");
  });
});
