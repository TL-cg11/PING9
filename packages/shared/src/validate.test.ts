import { describe, expect, test } from "vitest";

import type { ErrorCode } from "./codes";
import { DEFAULT_OS, EMPTY_DOCUMENT, PORT_NAMES, osOf } from "./document";
import { LIMITS } from "./limits";
import {
  documentByteSize,
  migrateDocument,
  parseDocumentJson,
  validateDocument,
} from "./validate";

const ID = (n: number): string => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

// 깨진 문서를 만들려고 값을 마음대로 고치므로 타입을 풀어 둔다
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = any;

/** 테스트마다 새로 만드는 유효한 문서: Router, Switch, PC와 링크 둘 */
function validDocument(): Doc {
  return {
    schemaVersion: 1,
    devices: [
      {
        id: ID(1),
        kind: "router",
        name: "R1",
        position: { x: 320, y: 120 },
        config: {
          interfaces: {
            "GigabitEthernet0/0": { adminUp: true, ip: "10.0.1.1", mask: "255.255.255.0" },
            "GigabitEthernet0/1": { adminUp: false },
          },
          staticRoutes: [{ network: "10.0.2.0", mask: "255.255.255.0", nextHop: "10.0.12.2" }],
        },
      },
      {
        id: ID(2),
        kind: "switch",
        name: "SW1",
        position: { x: 320, y: 280 },
        config: {
          vlans: [
            { id: 1, name: "default" },
            { id: 10, name: "sales" },
          ],
          ports: {
            "FastEthernet0/1": { adminUp: true, mode: "access", accessVlan: 10 },
            "FastEthernet0/8": {
              adminUp: true,
              mode: "trunk",
              allowedVlans: [
                [1, 1],
                [10, 20],
              ],
            },
          },
        },
      },
      {
        id: ID(3),
        kind: "pc",
        name: "PC1",
        position: { x: 320, y: 440 },
        config: { ip: "10.0.1.10", mask: "255.255.255.0", gateway: "10.0.1.1" },
      },
    ],
    links: [
      {
        id: ID(101),
        ends: [
          { deviceId: ID(1), port: "GigabitEthernet0/0" },
          { deviceId: ID(2), port: "FastEthernet0/8" },
        ],
      },
      {
        id: ID(102),
        ends: [
          { deviceId: ID(3), port: "Ethernet0" },
          { deviceId: ID(2), port: "FastEthernet0/1" },
        ],
      },
    ],
  };
}

/** 유효한 문서를 고친 뒤 검증해 오류 코드를 돌려준다. 통과하면 null */
function codeAfter(mutate: (doc: Doc) => void): ErrorCode | null {
  const doc = validDocument();
  mutate(doc);
  const result = validateDocument(doc);
  return result.ok ? null : result.error.code;
}

describe("validateDocument: 유효한 문서", () => {
  test("빈 문서를 받아들인다", () => {
    expect(validateDocument(EMPTY_DOCUMENT)).toEqual({ ok: true, document: EMPTY_DOCUMENT });
  });

  test("세 종류의 장비와 링크가 있는 문서를 받아들인다", () => {
    const doc = validDocument();
    expect(validateDocument(doc)).toEqual({ ok: true, document: doc });
  });

  test("IP가 없는 PC를 받아들인다", () => {
    expect(codeAfter((doc) => void (doc.devices[2]!.config = {} as never))).toBeNull();
  });

  test("PC의 OS를 받아들이고 돌려준 문서에 남긴다 (T0.7)", () => {
    for (const os of ["windows", "linux"] as const) {
      const doc = validDocument();
      (doc.devices[2]!.config as { os?: string }).os = os;
      expect(validateDocument(doc)).toEqual({ ok: true, document: doc });
    }
  });

  test("OS 칸이 없는 PC는 DEFAULT_OS다", () => {
    expect(osOf({})).toBe(DEFAULT_OS);
    expect(DEFAULT_OS).toBe("windows");
    expect(osOf({ os: "linux" })).toBe("linux");
  });

  test("PC의 포트 켜짐을 받아들이고 돌려준 문서에 남긴다 (T0.14)", () => {
    for (const adminUp of [true, false]) {
      const doc = validDocument();
      (doc.devices[2]!.config as { adminUp?: boolean }).adminUp = adminUp;
      expect(validateDocument(doc)).toEqual({ ok: true, document: doc });
    }
  });

  test("IP 없이 OS만 있는 PC를 받아들인다", () => {
    expect(codeAfter((doc) => void (doc.devices[2]!.config = { os: "linux" } as never))).toBeNull();
  });

  test("정의되지 않은 필드는 돌려준 문서에 없다", () => {
    const doc = validDocument() as Doc & { extra?: unknown };
    doc.extra = "x";
    (doc.devices[2] as Record<string, unknown>).onclick = "alert(1)";
    (doc.devices[2]!.config as Record<string, unknown>).note = "<script>";

    const result = validateDocument(doc);

    // toEqual은 남는 필드가 있으면 실패한다
    expect(result).toEqual({ ok: true, document: validDocument() });
    expect(JSON.stringify(result)).not.toContain("alert");
    expect(JSON.stringify(result)).not.toContain("script");
  });

  test("넣은 값을 바꾸지 않는다", () => {
    const doc = validDocument();
    const before = JSON.stringify(doc);
    validateDocument(doc);
    expect(JSON.stringify(doc)).toBe(before);
  });
});

describe("validateDocument: 깨진 문서는 구별되는 코드로 거부한다", () => {
  const cases: readonly (readonly [string, (doc: Doc) => void, ErrorCode])[] = [
    // 수용 기준 (Story 1.2): 링크 끝이 없는 장비, 포트 하나에 링크 둘, 이름 중복
    ["링크 끝이 없는 장비를 가리킴", (d) => void (d.links[0]!.ends[0]!.deviceId = ID(999)), "LINK_DEVICE_NOT_FOUND"],
    ["링크 끝이 없는 포트를 가리킴", (d) => void (d.links[0]!.ends[0]!.port = "GigabitEthernet0/9"), "LINK_PORT_NOT_FOUND"],
    ["링크 끝이 다른 종류의 포트 이름", (d) => void (d.links[1]!.ends[0]!.port = "FastEthernet0/1"), "LINK_PORT_NOT_FOUND"],
    ["포트 하나에 링크가 둘", (d) => void (d.links[1]!.ends[1]!.port = "FastEthernet0/8"), "PORT_IN_USE"],
    ["장비 이름이 겹침", (d) => void (d.devices[2]!.name = "R1"), "DUPLICATE_DEVICE_NAME"],
    ["링크의 양 끝이 같은 장비", (d) => void (d.links[0]!.ends[0] = { deviceId: ID(2), port: "FastEthernet0/2" }), "LINK_SAME_DEVICE"],

    // ID (SEC-7)
    ["장비 ID가 UUID가 아님", (d) => void (d.devices[0]!.id = "d1"), "INVALID_ID"],
    ["링크 ID가 UUID가 아님", (d) => void (d.links[0]!.id = "l1"), "INVALID_ID"],
    ["장비 ID가 겹침", (d) => void (d.devices[1]!.id = ID(1)), "DUPLICATE_ID"],
    ["링크 ID가 장비 ID와 겹침", (d) => void (d.links[0]!.id = ID(3)), "DUPLICATE_ID"],
    ["링크 ID가 겹침", (d) => void (d.links[1]!.id = ID(101)), "DUPLICATE_ID"],

    // 이름과 값
    ["장비 이름에 허용되지 않는 문자", (d) => void (d.devices[0]!.name = "R 1"), "INVALID_DEVICE_NAME"],
    ["장비 이름이 빔", (d) => void (d.devices[0]!.name = ""), "INVALID_DEVICE_NAME"],
    ["PC의 IP 형식이 틀림", (d) => void (d.devices[2]!.config.ip = "10.0.1"), "INVALID_IPV4"],
    ["PC의 IP가 특수 주소", (d) => void (d.devices[2]!.config.ip = "127.0.0.1"), "RESERVED_IPV4"],
    ["PC의 마스크가 연속되지 않음", (d) => void (d.devices[2]!.config.mask = "255.0.255.0"), "INVALID_MASK"],
    ["PC의 IP가 네트워크 주소", (d) => void (d.devices[2]!.config.ip = "10.0.1.0"), "IP_IS_NETWORK_ADDRESS"],
    ["PC의 IP가 브로드캐스트 주소", (d) => void (d.devices[2]!.config.ip = "10.0.1.255"), "IP_IS_BROADCAST_ADDRESS"],
    ["PC의 게이트웨이가 다른 네트워크", (d) => void (d.devices[2]!.config.gateway = "10.0.2.1"), "GATEWAY_NOT_IN_NETWORK"],
    ["PC에 IP 없이 마스크만 있음", (d) => void delete (d.devices[2]!.config as { ip?: string }).ip, "DOCUMENT_INVALID_SHAPE"],
    ["PC의 OS가 정해진 값이 아님", (d) => void ((d.devices[2]!.config as { os?: string }).os = "macos"), "DOCUMENT_INVALID_SHAPE"],
    ["PC의 포트 켜짐이 참거짓이 아님 (T0.14)", (d) => void ((d.devices[2]!.config as { adminUp?: unknown }).adminUp = "down"), "DOCUMENT_INVALID_SHAPE"],
    ["PC에 마스크 없이 IP만 있음", (d) => void delete (d.devices[2]!.config as { mask?: string }).mask, "DOCUMENT_INVALID_SHAPE"],

    // Switch
    ["Switch에 없는 포트 이름", (d) => void ((d.devices[1]!.config.ports as Record<string, unknown>)["FastEthernet0/9"] = { adminUp: true, mode: "access" }), "UNKNOWN_PORT"],
    ["VLAN 번호가 범위 밖", (d) => void (d.devices[1]!.config.vlans![0]!.id = 4095), "INVALID_VLAN_ID"],
    ["VLAN 번호가 겹침", (d) => void (d.devices[1]!.config.vlans![1]!.id = 1), "DUPLICATE_VLAN"],
    ["VLAN 이름에 허용되지 않는 문자", (d) => void (d.devices[1]!.config.vlans![1]!.name = "sales team"), "INVALID_VLAN_NAME"],
    ["access VLAN이 범위 밖", (d) => void (d.devices[1]!.config.ports!["FastEthernet0/1"]!.accessVlan = 0), "INVALID_VLAN_ID"],
    ["허용 VLAN 범위가 뒤집힘", (d) => void (d.devices[1]!.config.ports!["FastEthernet0/8"]!.allowedVlans = [[20, 10]]), "DOCUMENT_INVALID_SHAPE"],
    ["허용 VLAN이 범위 밖", (d) => void (d.devices[1]!.config.ports!["FastEthernet0/8"]!.allowedVlans = [[1, 5000]]), "INVALID_VLAN_ID"],

    // Router
    ["Router에 없는 인터페이스 이름", (d) => void ((d.devices[0]!.config.interfaces as Record<string, unknown>)["Ethernet0"] = { adminUp: true }), "UNKNOWN_PORT"],
    ["Router 인터페이스에 마스크 없이 IP만 있음", (d) => void delete (d.devices[0]!.config.interfaces!["GigabitEthernet0/0"] as { mask?: string }).mask, "DOCUMENT_INVALID_SHAPE"],
    ["Router 인터페이스의 IP가 특수 주소", (d) => void (d.devices[0]!.config.interfaces!["GigabitEthernet0/0"]!.ip = "224.0.0.5"), "RESERVED_IPV4"],
    ["경로의 네트워크 형식이 틀림", (d) => void (d.devices[0]!.config.staticRoutes![0]!.network = "10.0.2"), "INVALID_IPV4"],
    ["경로의 마스크가 연속되지 않음", (d) => void (d.devices[0]!.config.staticRoutes![0]!.mask = "255.0.0.255"), "INVALID_MASK"],
    ["경로의 다음 홉이 특수 주소", (d) => void (d.devices[0]!.config.staticRoutes![0]!.nextHop = "0.0.0.0"), "RESERVED_IPV4"],

    // 형태
    ["devices가 배열이 아님", (d) => void ((d as Record<string, unknown>).devices = {}), "DOCUMENT_INVALID_SHAPE"],
    ["links가 없음", (d) => void delete (d as Partial<Doc>).links, "DOCUMENT_INVALID_SHAPE"],
    ["모르는 장비 종류", (d) => void ((d.devices[0] as Record<string, unknown>).kind = "firewall"), "DOCUMENT_INVALID_SHAPE"],
    ["좌표가 수가 아님", (d) => void ((d.devices[0]!.position as Record<string, unknown>).x = "320"), "DOCUMENT_INVALID_SHAPE"],
    ["좌표가 범위 밖", (d) => void (d.devices[0]!.position.x = LIMITS.maxPosition + 1), "DOCUMENT_INVALID_SHAPE"],
    ["좌표가 무한대", (d) => void (d.devices[0]!.position.y = Number.POSITIVE_INFINITY), "DOCUMENT_INVALID_SHAPE"],
    ["링크의 끝이 셋", (d) => void (d.links[0]!.ends as unknown[]).push({ deviceId: ID(3), port: "Ethernet0" }), "DOCUMENT_INVALID_SHAPE"],
    ["문자열이 64자를 넘음", (d) => void (d.devices[0]!.name = "A".repeat(65)), "DOCUMENT_INVALID_SHAPE"],
    ["adminUp이 불리언이 아님", (d) => void ((d.devices[0]!.config.interfaces!["GigabitEthernet0/1"] as Record<string, unknown>).adminUp = "yes"), "DOCUMENT_INVALID_SHAPE"],

    // 버전
    ["schemaVersion이 없음", (d) => void delete (d as Partial<Doc>).schemaVersion, "DOCUMENT_INVALID_SHAPE"],
    ["schemaVersion이 문자열", (d) => void ((d as Record<string, unknown>).schemaVersion = "1"), "DOCUMENT_INVALID_SHAPE"],
    ["schemaVersion이 0", (d) => void (d.schemaVersion = 0), "DOCUMENT_UNSUPPORTED_VERSION"],
    ["schemaVersion이 미래 버전", (d) => void (d.schemaVersion = 2), "DOCUMENT_UNSUPPORTED_VERSION"],
    ["schemaVersion이 정수가 아님", (d) => void (d.schemaVersion = 1.5), "DOCUMENT_UNSUPPORTED_VERSION"],
  ];

  test.each(cases)("%s → %s", (_name, mutate, expected) => {
    expect(codeAfter(mutate)).toBe(expected);
  });

  test("오류에는 문제가 된 값이 담긴다", () => {
    const doc = validDocument();
    doc.links[1]!.ends[1]!.port = "FastEthernet0/8";

    expect(validateDocument(doc)).toEqual({
      ok: false,
      error: { code: "PORT_IN_USE", params: { deviceId: ID(2), port: "FastEthernet0/8" } },
    });
  });

  test("형태 오류는 위치를 담는다", () => {
    const doc = validDocument();
    (doc.devices[1]!.position as Record<string, unknown>).y = null;

    expect(validateDocument(doc)).toEqual({
      ok: false,
      error: { code: "DOCUMENT_INVALID_SHAPE", params: { path: "devices.1.position.y" } },
    });
  });
});

describe("validateDocument: 한도 (SEC-15)", () => {
  const pc = (n: number) => ({
    id: ID(n),
    kind: "pc" as const,
    name: `PC${n}`,
    position: { x: 0, y: 0 },
    config: {},
  });

  test("장비 50대까지 받아들이고 51대는 거부한다", () => {
    const devices = Array.from({ length: LIMITS.maxDevices }, (_, i) => pc(i + 1));
    expect(validateDocument({ schemaVersion: 1, devices, links: [] }).ok).toBe(true);

    expect(validateDocument({ schemaVersion: 1, devices: [...devices, pc(51)], links: [] })).toEqual({
      ok: false,
      error: { code: "LIMIT_EXCEEDED", params: { limit: "devices", max: 50 } },
    });
  });

  test("링크 101개는 거부한다", () => {
    const links = Array.from({ length: LIMITS.maxLinks + 1 }, (_, i) => ({
      id: ID(1000 + i),
      ends: [
        { deviceId: ID(1), port: "Ethernet0" },
        { deviceId: ID(2), port: "Ethernet0" },
      ],
    }));

    expect(validateDocument({ schemaVersion: 1, devices: [pc(1), pc(2)], links })).toEqual({
      ok: false,
      error: { code: "LIMIT_EXCEEDED", params: { limit: "links", max: 100 } },
    });
  });

  test("Switch의 VLAN 65개는 거부한다", () => {
    expect(
      codeAfter((doc) => {
        doc.devices[1]!.config.vlans = Array.from({ length: 65 }, (_, i) => ({ id: i + 1, name: `v${i + 1}` }));
      }),
    ).toBe("LIMIT_EXCEEDED");
  });

  test("Router의 Static route 101개는 거부한다", () => {
    expect(
      codeAfter((doc) => {
        doc.devices[0]!.config.staticRoutes = Array.from({ length: 101 }, (_, i) => ({
          network: `10.${i}.0.0`,
          mask: "255.255.0.0",
          nextHop: "10.0.12.2",
        }));
      }),
    ).toBe("LIMIT_EXCEEDED");
  });

  test("수 한도까지 채운 가장 큰 문서가 크기 한도 512KB 안에 든다 (SEC-12)", () => {
    // 가장 큰 장비는 경로 100개를 가진 Router다. 모든 문자열을 가장 긴 유효한 값으로 채운다
    const longName = (n: number): string => `R${n}`.padEnd(LIMITS.maxDeviceNameLength, "x");
    const devices = Array.from({ length: LIMITS.maxDevices }, (_, i) => ({
      id: ID(i + 1),
      kind: "router" as const,
      name: longName(i + 1),
      position: { x: -LIMITS.maxPosition + 0.123456789, y: -LIMITS.maxPosition + 0.123456789 },
      config: {
        interfaces: Object.fromEntries(
          PORT_NAMES.router.map((port, p) => [
            port,
            { adminUp: false, ip: `${130 + i}.${110 + p}.100.101`, mask: "255.255.255.252" },
          ]),
        ),
        staticRoutes: Array.from({ length: LIMITS.maxStaticRoutesPerRouter }, (_, r) => ({
          network: `${100 + r}.100.100.100`,
          mask: "255.255.255.255",
          nextHop: "223.255.255.254",
        })),
      },
    }));
    // 링크 100개: Router마다 포트 4개, 서로 다른 두 장비를 잇는다
    const links = Array.from({ length: LIMITS.maxLinks }, (_, i) => ({
      id: ID(5000 + i),
      ends: [
        { deviceId: ID(Math.floor(i / 2) + 1), port: PORT_NAMES.router[i % 2] },
        { deviceId: ID(((Math.floor(i / 2) + 1) % LIMITS.maxDevices) + 1), port: PORT_NAMES.router[2 + (i % 2)] },
      ],
    }));
    const doc = { schemaVersion: 1, devices, links };

    const result = validateDocument(doc);

    expect(result).toMatchObject({ ok: true });
    const size = result.ok ? documentByteSize(result.document) : 0;
    expect(size).toBeGreaterThan(300 * 1024);
    expect(size).toBeLessThan(LIMITS.maxDocumentBytes);
  });
});

describe("validateDocument: 금지 키와 깊이 (SEC-8)", () => {
  test.each(["__proto__", "constructor", "prototype"])("금지 키 %s을 거부한다", (key) => {
    const doc = JSON.parse(JSON.stringify(validDocument()).replace('"name":"PC1"', `"name":"PC1","${key}":{"x":1}`));

    expect(validateDocument(doc)).toEqual({
      ok: false,
      error: { code: "DOCUMENT_FORBIDDEN_KEY", params: { key } },
    });
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  test("금지 키는 깊은 곳에 있어도 찾는다", () => {
    const doc = JSON.parse(
      JSON.stringify(validDocument()).replace('"gateway":"10.0.1.1"', '"gateway":"10.0.1.1","a":[{"__proto__":1}]'),
    );
    expect(validateDocument(doc)).toMatchObject({ ok: false, error: { code: "DOCUMENT_FORBIDDEN_KEY" } });
  });

  test("깊이 한도를 넘는 중첩을 거부한다", () => {
    let nested: unknown = 1;
    for (let i = 0; i < LIMITS.maxDocumentDepth + 1; i += 1) nested = [nested];

    expect(validateDocument({ schemaVersion: 1, devices: nested, links: [] })).toEqual({
      ok: false,
      error: { code: "DOCUMENT_TOO_DEEP", params: { limit: LIMITS.maxDocumentDepth } },
    });
  });

  test("순환 참조가 있어도 끝난다", () => {
    const doc: Record<string, unknown> = { schemaVersion: 1, devices: [], links: [] };
    doc.self = doc;

    expect(validateDocument(doc)).toMatchObject({ ok: false, error: { code: "DOCUMENT_TOO_DEEP" } });
  });
});

describe("validateDocument: 문서가 아닌 값", () => {
  test.each([
    ["null", null],
    ["undefined", undefined],
    ["수", 42],
    ["문자열", "document"],
    ["배열", []],
    ["빈 객체", {}],
    ["함수", () => 1],
    ["Symbol", Symbol("x")],
    ["BigInt", 10n],
    ["Date", new Date(0)],
    ["Map", new Map()],
  ])("%s을 예외 없이 거부한다", (_name, value) => {
    const result = validateDocument(value);
    expect(result.ok).toBe(false);
  });

  test("읽을 때 예외를 던지는 값도 거부로 끝난다", () => {
    const hostile = {
      schemaVersion: 1,
      links: [],
      get devices(): never {
        throw new Error("boom");
      },
    };
    const proxy = new Proxy(
      {},
      {
        ownKeys: () => {
          throw new Error("boom");
        },
      },
    );

    expect(validateDocument(hostile)).toMatchObject({ ok: false });
    expect(validateDocument(proxy)).toMatchObject({ ok: false });
  });
});

describe("parseDocumentJson: 가져오기와 저장의 공통 절차 (SEC-8)", () => {
  test("유효한 문서의 JSON을 받아들인다", () => {
    const doc = validDocument();
    expect(parseDocumentJson(JSON.stringify(doc))).toEqual({ ok: true, document: doc });
    expect(parseDocumentJson(JSON.stringify(doc, null, 2))).toEqual({ ok: true, document: doc });
  });

  test.each(["", "{", "{'a':1}", "undefined", "{\"a\":1,}", "[1,2", "NaN"])(
    "JSON이 아닌 %j을 거부한다",
    (text) => {
      expect(parseDocumentJson(text)).toEqual({
        ok: false,
        error: { code: "DOCUMENT_INVALID_JSON", params: {} },
      });
    },
  );

  test.each(["null", "1", '"x"', "[]", "true"])("문서가 아닌 JSON %s을 거부한다", (text) => {
    expect(parseDocumentJson(text)).toMatchObject({ ok: false, error: { code: "DOCUMENT_INVALID_SHAPE" } });
  });

  test("크기 한도를 넘는 글자는 해석하지 않고 거부한다", () => {
    const text = `{"schemaVersion":1,"devices":[],"links":[],"pad":"${"x".repeat(LIMITS.maxImportBytes)}"}`;

    expect(parseDocumentJson(text)).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_TOO_LARGE", params: { limit: LIMITS.maxImportBytes } },
    });
  });

  test("금지 키는 형태 확인보다 먼저 걸린다", () => {
    expect(parseDocumentJson('{"__proto__":{"polluted":true},"schemaVersion":1}')).toEqual({
      ok: false,
      error: { code: "DOCUMENT_FORBIDDEN_KEY", params: { key: "__proto__" } },
    });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  test("아주 깊은 중첩은 예외 없이 거부한다", () => {
    const text = `${"[".repeat(200_000)}${"]".repeat(200_000)}`;
    expect(parseDocumentJson(text).ok).toBe(false);
  });

  test("버전이 틀리면 변환과 검증 전에 거부한다", () => {
    expect(parseDocumentJson('{"schemaVersion":99,"devices":[],"links":[]}')).toEqual({
      ok: false,
      error: { code: "DOCUMENT_UNSUPPORTED_VERSION", params: { current: 1 } },
    });
  });

  test("문자열이 아닌 값을 넣어도 예외가 나지 않는다", () => {
    expect(parseDocumentJson(null as unknown as string).ok).toBe(false);
    expect(parseDocumentJson({} as unknown as string).ok).toBe(false);
  });
});

describe("migrateDocument", () => {
  test("버전 1의 문서는 그대로 돌려준다", () => {
    const doc = validDocument();
    expect(migrateDocument(doc)).toBe(doc);
  });
});
