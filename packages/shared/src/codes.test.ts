import { describe, expect, test } from "vitest";

import {
  DROP_REASONS,
  ERROR_CODES,
  EVENT_CODES,
  NOTICE_CODES,
  REASON_CODES,
  errorInfo,
} from "./codes";
import type { ErrorInfo } from "./codes";
import { COMMAND_TYPES } from "./command";
import type { Command, CommandOf } from "./command";

describe("코드 목록", () => {
  test.each([
    ["오류", ERROR_CODES],
    ["알림", NOTICE_CODES],
    ["폐기 사유", DROP_REASONS],
    ["이벤트 설명", EVENT_CODES],
    ["Command", COMMAND_TYPES],
  ])("%s 코드는 겹치지 않고 비어 있지 않다", (_name, codes) => {
    expect(codes.length).toBeGreaterThan(0);
    expect(new Set(codes).size).toBe(codes.length);
  });

  // VLAN_INACTIVE는 FR-47의 표에 없다. 포트의 VLAN이 지워진 경우를 따로 나타내려고 T5.2.1에서 더했다
  test("폐기 사유는 02 문서 FR-47의 표에 VLAN_INACTIVE를 더한 것이다", () => {
    expect([...DROP_REASONS].sort()).toEqual(
      [
        "ARP_TIMEOUT",
        "IF_DOWN",
        "LOOP_GUARD",
        "NOT_FOR_ME",
        "NO_GATEWAY",
        "NO_IP",
        "NO_LINK",
        "NO_ROUTE",
        "TRUNK_NOT_ALLOWED",
        "TTL_EXPIRED",
        "VLAN_BLOCKED",
        "VLAN_INACTIVE",
      ].sort(),
    );
  });

  test("이벤트 설명 코드는 이벤트 코드와 폐기 사유를 합친 것이다", () => {
    expect(REASON_CODES).toEqual([...EVENT_CODES, ...DROP_REASONS]);
    expect(new Set(REASON_CODES).size).toBe(REASON_CODES.length);
  });

  test("Command는 03 문서 3.4절의 MVP 목록 19개와 2차의 RIP 구성 5개다 (T11.2.1)", () => {
    const rip = ["rip/enable", "rip/disable", "rip/add-network", "rip/remove-network", "rip/set-passive"];
    expect(COMMAND_TYPES.filter((type) => !rip.includes(type))).toHaveLength(19);
    expect(COMMAND_TYPES).toEqual(expect.arrayContaining(rip));
    expect(COMMAND_TYPES).toContain("pc/set-ip");
    expect(COMMAND_TYPES).toContain("link/add");
  });
});

describe("코드와 params의 짝 (타입)", () => {
  test("errorInfo는 코드에 맞는 params만 받는다", () => {
    const error = errorInfo("PORT_IN_USE", { deviceId: "d", port: "Ethernet0" });
    expect(error).toEqual({ code: "PORT_IN_USE", params: { deviceId: "d", port: "Ethernet0" } });

    // @ts-expect-error params의 이름이 틀리면 타입 오류다
    errorInfo("PORT_IN_USE", { device: "d" });
    // @ts-expect-error 없는 코드는 타입 오류다
    errorInfo("NOT_A_CODE", {});
  });

  test("코드로 좁히면 params의 타입이 정해진다", () => {
    const describeError = (error: ErrorInfo): string => {
      switch (error.code) {
        case "LIMIT_EXCEEDED":
          return `${error.params.limit}:${error.params.max}`;
        case "DUPLICATE_DEVICE_NAME":
          return error.params.name;
        default:
          return error.code;
      }
    };

    expect(describeError(errorInfo("LIMIT_EXCEEDED", { limit: "devices", max: 50 }))).toBe("devices:50");
    expect(describeError(errorInfo("DUPLICATE_DEVICE_NAME", { name: "PC1" }))).toBe("PC1");
  });

  test("Command는 type으로 좁혀진다", () => {
    const setIp: CommandOf<"pc/set-ip"> = {
      type: "pc/set-ip",
      deviceId: "d",
      ip: "192.168.1.1",
      mask: "255.255.255.0",
      gateway: null,
    };
    const command: Command = setIp;

    expect(command.type === "pc/set-ip" ? command.ip : null).toBe("192.168.1.1");
  });
});
