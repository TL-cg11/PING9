import { describe, expect, test } from "vitest";

import {
  checkDeviceName,
  checkGateway,
  checkHostIpv4,
  checkInterfaceAddress,
  checkIpv4,
  checkMask,
  checkTopologyName,
  checkVlanId,
  checkVlanName,
  formatIpv4,
  isSameNetwork,
  isUuid,
  maskToPrefixLength,
  parseIpv4,
  prefixLengthToMask,
  utf8ByteLength,
} from "./values";

describe("IPv4 형식", () => {
  test.each([
    ["0.0.0.0", 0],
    ["192.168.1.10", 3232235786],
    ["255.255.255.255", 4294967295],
    ["10.0.0.1", 167772161],
  ])("%s을 수로 바꾼다", (text, expected) => {
    expect(parseIpv4(text)).toBe(expected);
    expect(formatIpv4(expected)).toBe(text);
  });

  test.each([
    "",
    "1.2.3",
    "1.2.3.4.5",
    "256.1.1.1",
    "1.1.1.256",
    "01.2.3.4",
    "1.2.3.04",
    "1.2.3.-4",
    "1.2.3.4 ",
    " 1.2.3.4",
    "a.b.c.d",
    "1..2.3",
    "1.2.3.4\n",
    "0x1.2.3.4",
    "1e1.2.3.4",
    "1234.1.1.1",
  ])("형식이 틀린 %j을 거부한다", (text) => {
    expect(parseIpv4(text)).toBeNull();
    expect(checkIpv4(text)).toEqual({ code: "INVALID_IPV4", params: { value: text } });
  });
});

describe("장비에 줄 수 있는 주소 (MAL-5)", () => {
  test.each(["1.0.0.1", "10.0.0.1", "126.255.255.254", "128.0.0.1", "192.168.1.1", "223.255.255.254"])(
    "%s은 통과한다",
    (text) => {
      expect(checkHostIpv4(text)).toBeNull();
    },
  );

  test.each(["0.0.0.0", "255.255.255.255", "127.0.0.1", "127.255.255.255", "224.0.0.1", "239.1.2.3", "240.0.0.1"])(
    "특수 주소 %s을 거부한다",
    (text) => {
      expect(checkHostIpv4(text)).toEqual({ code: "RESERVED_IPV4", params: { value: text } });
    },
  );

  test("형식이 틀리면 형식 오류가 먼저다", () => {
    expect(checkHostIpv4("300.1.1.1")?.code).toBe("INVALID_IPV4");
  });
});

describe("마스크", () => {
  test.each([
    ["0.0.0.0", 0],
    ["128.0.0.0", 1],
    ["255.0.0.0", 8],
    ["255.255.255.0", 24],
    ["255.255.255.252", 30],
    ["255.255.255.254", 31],
    ["255.255.255.255", 32],
  ])("%s의 길이는 %i", (mask, length) => {
    expect(maskToPrefixLength(mask)).toBe(length);
    expect(prefixLengthToMask(length)).toBe(mask);
    expect(checkMask(mask)).toBeNull();
  });

  test.each(["255.0.255.0", "0.255.255.255", "255.255.255.1", "255.255.253.0", "1.1.1.1", "abc"])(
    "1이 연속되지 않은 %s을 거부한다",
    (mask) => {
      expect(maskToPrefixLength(mask)).toBeNull();
      expect(checkMask(mask)).toEqual({ code: "INVALID_MASK", params: { value: mask } });
    },
  );

  test.each([-1, 33, 1.5, Number.NaN])("길이 %s은 마스크로 바꿀 수 없다", (length) => {
    expect(prefixLengthToMask(length)).toBeNull();
  });
});

describe("인터페이스 주소와 마스크의 짝", () => {
  test.each([
    ["192.168.1.1", "255.255.255.0"],
    ["192.168.1.254", "255.255.255.0"],
    ["10.0.12.1", "255.255.255.252"],
    ["10.0.12.2", "255.255.255.252"],
    ["10.255.255.254", "255.0.0.0"],
  ])("%s / %s은 통과한다", (ip, mask) => {
    expect(checkInterfaceAddress(ip, mask)).toBeNull();
  });

  test("네트워크 주소를 거부한다", () => {
    expect(checkInterfaceAddress("192.168.1.0", "255.255.255.0")).toEqual({
      code: "IP_IS_NETWORK_ADDRESS",
      params: { ip: "192.168.1.0", mask: "255.255.255.0" },
    });
    expect(checkInterfaceAddress("10.0.12.4", "255.255.255.252")?.code).toBe("IP_IS_NETWORK_ADDRESS");
  });

  test("브로드캐스트 주소를 거부한다", () => {
    expect(checkInterfaceAddress("192.168.1.255", "255.255.255.0")).toEqual({
      code: "IP_IS_BROADCAST_ADDRESS",
      params: { ip: "192.168.1.255", mask: "255.255.255.0" },
    });
    expect(checkInterfaceAddress("10.0.12.3", "255.255.255.252")?.code).toBe("IP_IS_BROADCAST_ADDRESS");
  });

  test.each(["0.0.0.0", "255.255.255.254", "255.255.255.255", "255.0.255.0"])(
    "인터페이스에 쓸 수 없는 마스크 %s을 거부한다",
    (mask) => {
      expect(checkInterfaceAddress("192.168.1.1", mask)).toEqual({
        code: "INVALID_MASK",
        params: { value: mask },
      });
    },
  );

  test("주소가 틀리면 주소 오류가 먼저다", () => {
    expect(checkInterfaceAddress("127.0.0.1", "255.0.255.0")?.code).toBe("RESERVED_IPV4");
  });
});

describe("게이트웨이", () => {
  test("같은 네트워크면 통과한다", () => {
    expect(checkGateway("192.168.1.254", "192.168.1.10", "255.255.255.0")).toBeNull();
    expect(isSameNetwork("192.168.1.254", "192.168.1.10", "255.255.255.0")).toBe(true);
  });

  test("다른 네트워크면 거부한다", () => {
    expect(checkGateway("192.168.2.1", "192.168.1.10", "255.255.255.0")).toEqual({
      code: "GATEWAY_NOT_IN_NETWORK",
      params: { gateway: "192.168.2.1", ip: "192.168.1.10", mask: "255.255.255.0" },
    });
    expect(isSameNetwork("192.168.2.1", "192.168.1.10", "255.255.255.0")).toBe(false);
  });

  test("특수 주소와 틀린 형식을 거부한다", () => {
    expect(checkGateway("0.0.0.0", "192.168.1.10", "255.255.255.0")?.code).toBe("RESERVED_IPV4");
    expect(checkGateway("gw", "192.168.1.10", "255.255.255.0")?.code).toBe("INVALID_IPV4");
  });

  test("형식이 틀린 값끼리는 같은 네트워크가 아니다", () => {
    expect(isSameNetwork("x", "192.168.1.10", "255.255.255.0")).toBe(false);
    expect(isSameNetwork("192.168.1.1", "192.168.1.10", "255.0.255.0")).toBe(false);
  });
});

describe("VLAN 번호", () => {
  test.each([1, 2, 10, 4094])("%i은 통과한다", (id) => {
    expect(checkVlanId(id)).toBeNull();
  });

  test.each([0, -1, 4095, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("%s을 거부한다", (id) => {
    expect(checkVlanId(id)).toEqual({ code: "INVALID_VLAN_ID", params: { value: id } });
  });
});

describe("이름", () => {
  test.each(["PC1", "SW-1", "core_router", "a", "A".repeat(32)])("장비 이름 %s은 통과한다", (name) => {
    expect(checkDeviceName(name)).toBeNull();
    expect(checkVlanName(name)).toBeNull();
  });

  test.each(["", "PC 1", "PC1!", "한글", "A".repeat(33), "a\nb", "<b>", "a.b"])(
    "장비 이름 %j을 거부한다",
    (name) => {
      expect(checkDeviceName(name)?.code).toBe("INVALID_DEVICE_NAME");
      expect(checkVlanName(name)?.code).toBe("INVALID_VLAN_NAME");
    },
  );

  test("오류에 담는 값은 64자로 자른다", () => {
    const error = checkDeviceName("!".repeat(500));
    expect(error?.params.value).toHaveLength(64);
  });

  test.each(["실습 1", "a", "x".repeat(100), "Lab #2 (VLAN)"])("토폴로지 이름 %j은 통과한다", (name) => {
    expect(checkTopologyName(name)).toBeNull();
  });

  test.each(["", "x".repeat(101), "a\nb", "a\u0000b", "tab\there", "a\u007fb", "a\u0085b"])(
    "토폴로지 이름 %j을 거부한다",
    (name) => {
      expect(checkTopologyName(name)).toEqual({
        code: "INVALID_TOPOLOGY_NAME",
        params: { length: name.length },
      });
    },
  );
});

describe("UUID", () => {
  test.each([
    "00000000-0000-4000-8000-000000000001",
    "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    "ffffffff-ffff-4fff-bfff-ffffffffffff",
  ])("%s은 통과한다", (id) => {
    expect(isUuid(id)).toBe(true);
  });

  test.each([
    "",
    "d1",
    "00000000-0000-4000-8000-00000000000",
    "00000000-0000-4000-8000-0000000000001",
    "00000000-0000-0000-8000-000000000001",
    "00000000-0000-4000-7000-000000000001",
    "3F2504E0-4F89-41D3-9A0C-0305E82C3301",
    "00000000000040008000000000000001",
    "00000000-0000-4000-8000-00000000000g",
  ])("%j을 거부한다", (id) => {
    expect(isUuid(id)).toBe(false);
  });
});

describe("UTF-8 바이트 수", () => {
  test.each([
    ["", 0],
    ["abc", 3],
    ["é", 2],
    ["한글", 6],
    ["😀", 4],
    ["a한😀", 8],
  ])("%j은 %i바이트", (text, bytes) => {
    expect(utf8ByteLength(text)).toBe(bytes);
  });
});
