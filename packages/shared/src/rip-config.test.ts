// RIP 구성의 클래스풀 계산, 정규화, 문서 검증 (T11.2.1)
import { describe, expect, test } from "vitest";

import { PORT_NAMES } from "./document";
import type { RouterConfig, TopologyDocument } from "./document";
import { LIMITS } from "./limits";
import { checkRipConfig, classfulNetwork, normalizeRipConfig } from "./router-config";
import { validateDocument } from "./validate";

describe("classfulNetwork", () => {
  test.each([
    ["10.0.1.0", "10.0.0.0"],
    ["1.2.3.4", "1.0.0.0"],
    ["126.255.255.255", "126.0.0.0"],
    ["128.0.5.1", "128.0.0.0"],
    ["172.16.5.1", "172.16.0.0"],
    ["191.255.1.1", "191.255.0.0"],
    ["192.0.0.9", "192.0.0.0"],
    ["192.168.1.77", "192.168.1.0"],
    ["223.255.255.1", "223.255.255.0"],
  ])("%s → %s", (input, expected) => {
    expect(classfulNetwork(input)).toBe(expected);
  });

  test.each(["0.1.2.3", "127.0.0.1", "224.0.0.9", "240.0.0.1", "255.255.255.255", "10.0.0", "abc", ""])(
    "%s는 넣을 수 없다",
    (input) => {
      expect(classfulNetwork(input)).toBeNull();
    },
  );
});

describe("normalizeRipConfig", () => {
  test("네트워크는 작은 주소부터, passive는 포트 순서, 겹침은 하나로", () => {
    expect(
      normalizeRipConfig({
        networks: ["192.168.1.0", "10.0.0.0", "172.16.0.0", "10.0.0.0"],
        passiveInterfaces: [PORT_NAMES.router[2]!, PORT_NAMES.router[0]!],
      }),
    ).toEqual({
      networks: ["10.0.0.0", "172.16.0.0", "192.168.1.0"],
      passiveInterfaces: [PORT_NAMES.router[0], PORT_NAMES.router[2]],
    });
  });
});

describe("checkRipConfig", () => {
  test("클래스풀이 아닌 네트워크, 한도, 없는 포트를 거부한다", () => {
    expect(checkRipConfig("r", { networks: ["10.0.1.0"], passiveInterfaces: [] })).toMatchObject({
      code: "RIP_NETWORK_INVALID",
    });
    const many = Array.from({ length: LIMITS.maxRipNetworks + 1 }, (_, index) => `${index + 1}.0.0.0`);
    expect(checkRipConfig("r", { networks: many, passiveInterfaces: [] })).toEqual({
      code: "LIMIT_EXCEEDED",
      params: { limit: "ripNetworks", max: LIMITS.maxRipNetworks },
    });
    expect(checkRipConfig("r", { networks: [], passiveInterfaces: ["Ethernet0"] })).toMatchObject({
      code: "UNKNOWN_PORT",
    });
    expect(checkRipConfig("r", { networks: ["10.0.0.0"], passiveInterfaces: [PORT_NAMES.router[1]!] })).toBeNull();
  });
});

describe("문서 검증", () => {
  const ID = "00000000-0000-4000-8000-000000000100";
  const documentWith = (rip: unknown): unknown => ({
    schemaVersion: 1,
    links: [],
    devices: [
      {
        id: ID,
        name: "R1",
        kind: "router",
        position: { x: 0, y: 0 },
        config: { interfaces: {}, staticRoutes: [], ...(rip === undefined ? {} : { rip }) },
      },
    ],
  });
  const ripOf = (document: TopologyDocument) => (document.devices[0]!.config as RouterConfig).rip;

  test("rip이 없는 옛 문서는 그대로 읽힌다", () => {
    const result = validateDocument(documentWith(undefined));
    expect(result.ok).toBe(true);
    if (result.ok) expect(ripOf(result.document)).toBeUndefined();
  });

  test("올바른 rip은 통과한다", () => {
    const result = validateDocument(documentWith({ networks: ["10.0.0.0"], passiveInterfaces: [PORT_NAMES.router[0]] }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(ripOf(result.document)).toEqual({ networks: ["10.0.0.0"], passiveInterfaces: [PORT_NAMES.router[0]] });
  });

  test.each([
    ["클래스풀이 아님", { networks: ["10.0.1.0"], passiveInterfaces: [] }, "RIP_NETWORK_INVALID"],
    ["겹친 네트워크", { networks: ["10.0.0.0", "10.0.0.0"], passiveInterfaces: [] }, "DOCUMENT_INVALID_SHAPE"],
    ["없는 포트", { networks: [], passiveInterfaces: ["Fa0/9"] }, "UNKNOWN_PORT"],
    ["형태가 틀림", { networks: "10.0.0.0" }, "DOCUMENT_INVALID_SHAPE"],
  ])("%s은 거부한다", (_name, rip, code) => {
    expect(validateDocument(documentWith(rip))).toMatchObject({ ok: false, error: { code } });
  });
});
