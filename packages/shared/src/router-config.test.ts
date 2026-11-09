import fc from "fast-check";
import { describe, expect, test } from "vitest";

import { PORT_NAMES } from "./document";
import type { RouterConfig, TopologyDocument } from "./document";
import { checkRouterInterfaceOverlap, normalizeRouterConfig } from "./router-config";
import { validateDocument } from "./validate";
import { formatIpv4, networksOverlap, prefixLengthToMask } from "./values";

describe("IPv4 네트워크 겹침", () => {
  test.each([
    ["10.0.1.1", "255.255.255.0", "10.0.1.254", "255.255.255.0", true],
    ["10.0.1.1", "255.255.255.0", "10.0.2.1", "255.255.255.0", false],
    ["10.0.1.1", "255.255.0.0", "10.0.128.1", "255.255.255.128", true],
    ["128.0.1.1", "255.255.255.0", "128.0.2.1", "255.255.255.0", false],
    ["192.168.1.1", "255.255.255.128", "192.168.1.129", "255.255.255.128", false],
    ["192.168.1.1", "255.255.255.0", "192.168.1.129", "255.255.255.128", true],
    ["10.0.0.1", "0.0.0.0", "192.168.1.1", "255.255.255.255", true],
    ["bad", "255.255.255.0", "10.0.1.1", "255.255.255.0", false],
    ["10.0.1.1", "255.0.255.0", "10.0.1.1", "255.255.255.0", false],
  ])("%s %s와 %s %s의 겹침 → %s", (a, am, b, bm, expected) => {
    expect(networksOverlap(a, am, b, bm)).toBe(expected);
    expect(networksOverlap(b, bm, a, am)).toBe(expected);
  });

  test("임의의 주소·접두사에서도 대칭이고 주소 범위 교차 판정과 같다", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 0xffffffff }), fc.integer({ min: 0, max: 0xffffffff }),
      fc.integer({ min: 0, max: 32 }), fc.integer({ min: 0, max: 32 }), (a, b, ap, bp) => {
        const am = prefixLengthToMask(ap)!;
        const bm = prefixLengthToMask(bp)!;
        expect(networksOverlap(formatIpv4(a), am, formatIpv4(b), bm))
          .toBe(networksOverlap(formatIpv4(b), bm, formatIpv4(a), am));
        const aSize = 2 ** (32 - ap);
        const bSize = 2 ** (32 - bp);
        const aStart = Math.floor(a / aSize) * aSize;
        const bStart = Math.floor(b / bSize) * bSize;
        expect(networksOverlap(formatIpv4(a), am, formatIpv4(b), bm))
          .toBe(aStart <= bStart + bSize - 1 && bStart <= aStart + aSize - 1);
      }), { numRuns: 1000, seed: 20261106 });
  });
});

describe("Router 인터페이스 구성", () => {
  test("생략된 인터페이스도 기본 꺼짐으로 정규화하고 입력을 바꾸지 않는다", () => {
    const config: RouterConfig = {
      interfaces: { [PORT_NAMES.router[1]]: { adminUp: true, ip: "10.0.1.1", mask: "255.255.255.0" } }, staticRoutes: [],
    };
    const normalized = normalizeRouterConfig(config);
    expect(Object.keys(config.interfaces)).toEqual([PORT_NAMES.router[1]]);
    expect(Object.keys(normalized.interfaces)).toEqual(PORT_NAMES.router);
    expect(normalized.interfaces[PORT_NAMES.router[0]]).toEqual({ adminUp: false });
    expect(normalized.interfaces[PORT_NAMES.router[1]]).toEqual(config.interfaces[PORT_NAMES.router[1]]);
    expect(normalizeRouterConfig(normalized)).toEqual(normalized);
  });

  test("같은 포트를 제외하고 꺼진 다른 포트도 검사한다", () => {
    const interfaces = { [PORT_NAMES.router[0]]: { adminUp: false, ip: "10.0.1.1", mask: "255.255.255.0" } };
    expect(checkRouterInterfaceOverlap("r", PORT_NAMES.router[0], "10.0.1.2", "255.255.255.0", interfaces)).toBeNull();
    expect(checkRouterInterfaceOverlap("r", PORT_NAMES.router[1], "10.0.1.2", "255.255.255.0", interfaces))
      .toMatchObject({ code: "INTERFACE_NETWORK_OVERLAP", params: { port: PORT_NAMES.router[1], otherPort: PORT_NAMES.router[0] } });
  });

  test("문서를 불러올 때도 같은 Router 내부의 겹침을 거부한다", () => {
    const document: TopologyDocument = {
      schemaVersion: 1, links: [], devices: [{
        id: "00000000-0000-4000-8000-000000000001", kind: "router", name: "R1", position: { x: 0, y: 0 },
        config: { staticRoutes: [], interfaces: {
          [PORT_NAMES.router[0]]: { adminUp: true, ip: "10.0.1.1", mask: "255.255.0.0" },
          [PORT_NAMES.router[1]]: { adminUp: false, ip: "10.0.2.1", mask: "255.255.255.0" },
        } },
      }],
    };
    expect(validateDocument(document)).toMatchObject({ ok: false, error: { code: "INTERFACE_NETWORK_OVERLAP" } });
  });
});
