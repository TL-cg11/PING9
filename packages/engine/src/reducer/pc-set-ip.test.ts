import { validateDocument } from "@ping9/shared";
import type { Command, CommandOf, RouterDevice, TopologyDocument } from "@ping9/shared";
import { TWO_PC, TWO_PC_SWITCH, twoPcDocument, twoPcSwitchDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../index";
import { reduce } from "../reducer";
import type { ReduceResult } from "../reducer";

const { pc1, pc2 } = TWO_PC;

function setIp(
  fields: Partial<Omit<CommandOf<"pc/set-ip">, "type">>,
  document: TopologyDocument = twoPcDocument,
): ReduceResult {
  return reduce(document, {
    type: "pc/set-ip",
    deviceId: pc1.id,
    ip: null,
    mask: null,
    gateway: null,
    ...fields,
  });
}

/** 성공 결과에서 PC의 구성을 꺼낸다 */
function configOf(result: ReduceResult, deviceId: string = pc1.id): unknown {
  if (!result.ok) throw new Error(`실패: ${JSON.stringify(result.error)}`);
  return result.document.devices.find((device) => device.id === deviceId)?.config;
}

function errorOf(result: ReduceResult): unknown {
  if (result.ok) throw new Error("성공해 버림");
  return result.error;
}

const ROUTER_ID = "00000000-0000-4000-8000-0000000000f1";

/** PC 2대 문서에 Router 1대를 더한다. Router의 인터페이스 하나가 `ip`를 쓴다 */
function withRouter(ip: string): TopologyDocument {
  const router: RouterDevice = {
    id: ROUTER_ID,
    kind: "router",
    name: "R1",
    position: { x: 350, y: 400 },
    config: {
      interfaces: {
        "GigabitEthernet0/0": { adminUp: true },
        "GigabitEthernet0/1": { adminUp: true, ip, mask: "255.255.255.0" },
      },
      staticRoutes: [],
    },
  };
  return { ...twoPcDocument, devices: [...twoPcDocument.devices, router] };
}

describe("pc/set-ip: 성공", () => {
  test("IP와 마스크를 바꾸고, 받은 Document는 고치지 않는다", () => {
    const before = JSON.stringify(twoPcDocument);

    const result = setIp({ ip: "10.0.0.1", mask: "255.255.255.0" });

    expect(result).toMatchObject({ ok: true, notices: [] });
    expect(configOf(result)).toEqual({ ip: "10.0.0.1", mask: "255.255.255.0" });
    expect(configOf(result, pc2.id)).toEqual({ ip: pc2.ip, mask: TWO_PC.mask });
    expect(JSON.stringify(twoPcDocument)).toBe(before);
  });

  test("게이트웨이를 함께 저장한다", () => {
    const result = setIp({ ip: "10.0.0.1", mask: "255.255.255.0", gateway: "10.0.0.254" });

    expect(configOf(result)).toEqual({ ip: "10.0.0.1", mask: "255.255.255.0", gateway: "10.0.0.254" });
  });

  test("게이트웨이를 null로 다시 설정하면 gateway 키가 사라진다", () => {
    const first = setIp({ ip: "10.0.0.1", mask: "255.255.255.0", gateway: "10.0.0.254" });
    if (!first.ok) throw new Error("준비 실패");

    const result = setIp({ ip: "10.0.0.1", mask: "255.255.255.0" }, first.document);

    expect(configOf(result)).toEqual({ ip: "10.0.0.1", mask: "255.255.255.0" });
    expect(Object.keys(configOf(result) as object)).not.toContain("gateway");
  });

  test("세 칸을 모두 null로 보내면 설정을 지운다", () => {
    const result = setIp({});

    expect(result).toMatchObject({ ok: true, notices: [] });
    expect(configOf(result)).toEqual({});
  });

  test("undefined는 null과 같게 본다", () => {
    const result = reduce(twoPcDocument, { type: "pc/set-ip", deviceId: pc1.id } as unknown as Command);

    expect(configOf(result)).toEqual({});
  });

  test.each([
    ["/24의 첫 호스트", "10.0.0.1", "255.255.255.0"],
    ["/24의 마지막 호스트", "10.0.0.254", "255.255.255.0"],
    ["/30의 첫 호스트", "10.0.12.1", "255.255.255.252"],
    ["/30의 마지막 호스트", "10.0.12.2", "255.255.255.252"],
    ["/1", "10.0.0.1", "128.0.0.0"],
  ])("경계값: %s", (_name, ip, mask) => {
    expect(configOf(setIp({ ip, mask }))).toEqual({ ip, mask });
  });

  test("지금과 같은 값을 다시 설정해도 성공한다", () => {
    const result = setIp({ ip: pc1.ip, mask: TWO_PC.mask });

    expect(result).toMatchObject({ ok: true, notices: [] });
    expect(configOf(result)).toEqual({ ip: pc1.ip, mask: TWO_PC.mask });
  });
});

describe("pc/set-ip: OS는 그대로 (T0.7)", () => {
  const linuxPc1: TopologyDocument = {
    ...twoPcDocument,
    devices: twoPcDocument.devices.map((device) =>
      device.id === pc1.id && device.kind === "pc" ? { ...device, config: { ...device.config, os: "linux" } } : device,
    ),
  };

  test("IP를 바꿔도 OS가 남는다", () => {
    expect(configOf(setIp({ ip: "10.0.0.50", mask: "255.255.255.0" }, linuxPc1))).toEqual({
      ip: "10.0.0.50",
      mask: "255.255.255.0",
      os: "linux",
    });
  });

  test("IP를 지워도 OS가 남는다", () => {
    expect(configOf(setIp({}, linuxPc1))).toEqual({ os: "linux" });
  });

  test("OS가 없던 PC에는 OS 칸을 만들지 않는다", () => {
    expect(configOf(setIp({}))).toEqual({});
  });
});

describe("pc/set-ip: 포트의 켜짐·꺼짐은 그대로 (T0.14)", () => {
  const withPc1Port = (adminUp: boolean): TopologyDocument => ({
    ...twoPcDocument,
    devices: twoPcDocument.devices.map((device) =>
      device.id === pc1.id && device.kind === "pc" ? { ...device, config: { ...device.config, adminUp } } : device,
    ),
  });

  test("IP를 바꿔도 꺼 둔 포트가 켜지지 않는다", () => {
    expect(configOf(setIp({ ip: "10.0.0.50", mask: "255.255.255.0" }, withPc1Port(false)))).toEqual({
      ip: "10.0.0.50",
      mask: "255.255.255.0",
      adminUp: false,
    });
  });

  test("IP를 지워도 꺼짐이 남는다", () => {
    expect(configOf(setIp({}, withPc1Port(false)))).toEqual({ adminUp: false });
  });

  test("껐다 켠 PC의 켜짐 값도 남는다", () => {
    expect(configOf(setIp({ ip: "10.0.0.50", mask: "255.255.255.0" }, withPc1Port(true)))).toEqual({
      ip: "10.0.0.50",
      mask: "255.255.255.0",
      adminUp: true,
    });
  });
});

describe("pc/set-ip: 중복 IP 알림 (FR-27)", () => {
  test("다른 PC와 같은 IP면 설정하면서 알린다", () => {
    const result = setIp({ ip: pc2.ip, mask: TWO_PC.mask });

    expect(configOf(result)).toEqual({ ip: pc2.ip, mask: TWO_PC.mask });
    expect(result).toMatchObject({
      notices: [
        {
          code: "DUPLICATE_IP",
          params: { ip: pc2.ip, others: [{ deviceId: pc2.id, deviceName: pc2.name }] },
        },
      ],
    });
  });

  test("Router 인터페이스와 같은 IP도 알린다", () => {
    const result = setIp({ ip: "192.168.1.254", mask: TWO_PC.mask }, withRouter("192.168.1.254"));

    expect(result).toMatchObject({
      ok: true,
      notices: [
        {
          code: "DUPLICATE_IP",
          params: { ip: "192.168.1.254", others: [{ deviceId: ROUTER_ID, deviceName: "R1" }] },
        },
      ],
    });
  });

  test("겹치는 장비가 여럿이면 Document의 순서대로 담는다", () => {
    const result = setIp({ ip: pc2.ip, mask: TWO_PC.mask }, withRouter(pc2.ip));

    expect(result).toMatchObject({
      notices: [
        {
          params: {
            others: [
              { deviceId: pc2.id, deviceName: pc2.name },
              { deviceId: ROUTER_ID, deviceName: "R1" },
            ],
          },
        },
      ],
    });
  });

  test("자기 자신은 중복으로 보지 않고, 설정을 지울 때도 알리지 않는다", () => {
    expect(setIp({ ip: pc1.ip, mask: TWO_PC.mask })).toMatchObject({ notices: [] });
    expect(setIp({})).toMatchObject({ notices: [] });
  });
});

describe("pc/set-ip: 거부", () => {
  test("없는 장비", () => {
    const result = setIp({ deviceId: "00000000-0000-4000-8000-0000000000ff" });

    expect(errorOf(result)).toEqual({
      code: "DEVICE_NOT_FOUND",
      params: { deviceId: "00000000-0000-4000-8000-0000000000ff" },
    });
  });

  test("PC가 아닌 장비", () => {
    const result = setIp(
      { deviceId: TWO_PC_SWITCH.sw1.id, ip: "10.0.0.1", mask: "255.255.255.0" },
      twoPcSwitchDocument,
    );

    expect(errorOf(result)).toEqual({
      code: "DEVICE_KIND_MISMATCH",
      params: { deviceId: TWO_PC_SWITCH.sw1.id, expected: "pc", actual: "switch" },
    });
  });

  test.each([
    ["IP만", { ip: "10.0.0.1" }, "mask"],
    ["IP와 게이트웨이만", { ip: "10.0.0.1", gateway: "10.0.0.254" }, "mask"],
    ["마스크만", { mask: "255.255.255.0" }, "ip"],
    ["게이트웨이만", { gateway: "10.0.0.254" }, "ip"],
  ])("짝이 맞지 않음: %s", (_name, fields, missing) => {
    expect(errorOf(setIp(fields))).toEqual({
      code: "PC_ADDRESS_INCOMPLETE",
      params: { deviceId: pc1.id, missing },
    });
  });

  test.each([
    ["형식이 틀린 IP", { ip: "10.0.0", mask: "255.255.255.0" }, "INVALID_IPV4"],
    ["빈 문자열 IP", { ip: "", mask: "255.255.255.0" }, "INVALID_IPV4"],
    ["127.0.0.1", { ip: "127.0.0.1", mask: "255.0.0.0" }, "RESERVED_IPV4"],
    ["0.0.0.0", { ip: "0.0.0.0", mask: "255.255.255.0" }, "RESERVED_IPV4"],
    ["224.0.0.1", { ip: "224.0.0.1", mask: "255.255.255.0" }, "RESERVED_IPV4"],
    ["1이 이어지지 않는 마스크", { ip: "10.0.0.1", mask: "255.0.255.0" }, "INVALID_MASK"],
    ["/31", { ip: "10.0.0.1", mask: "255.255.255.254" }, "INVALID_MASK"],
    ["/32", { ip: "10.0.0.1", mask: "255.255.255.255" }, "INVALID_MASK"],
    ["네트워크 주소", { ip: "10.0.0.0", mask: "255.255.255.0" }, "IP_IS_NETWORK_ADDRESS"],
    ["브로드캐스트 주소", { ip: "10.0.0.255", mask: "255.255.255.0" }, "IP_IS_BROADCAST_ADDRESS"],
    [
      "다른 네트워크의 게이트웨이",
      { ip: "10.0.0.1", mask: "255.255.255.0", gateway: "10.0.1.1" },
      "GATEWAY_NOT_IN_NETWORK",
    ],
    [
      "형식이 틀린 게이트웨이",
      { ip: "10.0.0.1", mask: "255.255.255.0", gateway: "gw" },
      "INVALID_IPV4",
    ],
  ])("값 검사: %s", (_name, fields, code) => {
    expect(errorOf(setIp(fields))).toMatchObject({ code });
  });

  test.each([
    ["IP가 수", { ip: 5, mask: "255.255.255.0" }, "INVALID_IPV4"],
    ["마스크가 객체", { ip: "10.0.0.1", mask: {} }, "INVALID_MASK"],
    ["게이트웨이가 참거짓", { ip: "10.0.0.1", mask: "255.255.255.0", gateway: true }, "INVALID_IPV4"],
    ["장비 ID가 수", { deviceId: 7 }, "DEVICE_NOT_FOUND"],
    // String()이 예외를 던지는 값. JSON으로도 올 수 있다
    ["장비 ID가 문자열로 바꿀 수 없는 객체", { deviceId: { toString: 1, valueOf: 1 } }, "DEVICE_NOT_FOUND"],
    ["IP가 문자열로 바꿀 수 없는 객체", { ip: { toString: 1, valueOf: 1 } }, "INVALID_IPV4"],
    ["마스크가 문자열로 바꿀 수 없는 객체", { ip: "10.0.0.1", mask: { toString: 1, valueOf: 1 } }, "INVALID_MASK"],
    [
      "게이트웨이가 문자열로 바꿀 수 없는 객체",
      { ip: "10.0.0.1", mask: "255.255.255.0", gateway: { toString: 1, valueOf: 1 } },
      "INVALID_IPV4",
    ],
  ])("문자열이 아닌 값(%s)도 예외 없이 오류로 끝난다", (_name, fields, code) => {
    const command = {
      type: "pc/set-ip",
      deviceId: pc1.id,
      ip: null,
      mask: null,
      gateway: null,
      ...fields,
    } as unknown as Command;

    expect(errorOf(reduce(twoPcDocument, command))).toMatchObject({ code });
  });

  test("오류에 담는 값은 64자로 자른다", () => {
    const error = errorOf(setIp({ ip: "1".repeat(1000), mask: "255.255.255.0" })) as {
      params: { value: string };
    };

    expect(error.params.value.length).toBeLessThanOrEqual(64);
  });
});

describe("pc/set-ip: Simulator를 거칠 때", () => {
  test("성공하면 docVersion이 1 오르고, 결과 Document는 validateDocument를 통과한다", () => {
    const simulator = createSimulator();
    simulator.load(twoPcDocument);
    const before = simulator.getSnapshot().docVersion;

    const result = simulator.dispatch({
      type: "pc/set-ip",
      deviceId: pc1.id,
      ip: "10.0.0.1",
      mask: "255.255.255.0",
      gateway: "10.0.0.254",
    });

    expect(result).toEqual({ ok: true, notices: [] });
    expect(simulator.getSnapshot().docVersion).toBe(before + 1);
    expect(validateDocument(simulator.getSnapshot().document)).toMatchObject({ ok: true });
  });

  test("실패하면 docVersion과 Snapshot이 그대로다", () => {
    const simulator = createSimulator();
    simulator.load(twoPcDocument);
    const before = simulator.getSnapshot();

    const result = simulator.dispatch({
      type: "pc/set-ip",
      deviceId: pc1.id,
      ip: "10.0.0.0",
      mask: "255.255.255.0",
      gateway: null,
    });

    expect(result).toMatchObject({ ok: false, error: { code: "IP_IS_NETWORK_ADDRESS" } });
    expect(simulator.getSnapshot()).toBe(before);
  });

  test("같은 값을 다시 설정해도 docVersion은 오른다", () => {
    const simulator = createSimulator();
    simulator.load(twoPcDocument);
    const before = simulator.getSnapshot().docVersion;

    simulator.dispatch({ type: "pc/set-ip", deviceId: pc1.id, ip: pc1.ip, mask: TWO_PC.mask, gateway: null });

    expect(simulator.getSnapshot().docVersion).toBe(before + 1);
  });

  test.each([
    ["IP와 마스크", { ip: "10.0.0.1", mask: "255.255.255.0", gateway: null }],
    ["게이트웨이까지", { ip: "10.0.0.1", mask: "255.255.255.0", gateway: "10.0.0.254" }],
    ["설정 지우기", { ip: null, mask: null, gateway: null }],
    ["중복 IP", { ip: pc2.ip, mask: TWO_PC.mask, gateway: null }],
  ])("성공한 결과(%s)는 validateDocument를 통과한다", (_name, fields) => {
    const result = reduce(twoPcDocument, { type: "pc/set-ip", deviceId: pc1.id, ...fields });
    if (!result.ok) throw new Error("준비 실패");

    expect(validateDocument(result.document)).toMatchObject({ ok: true });
  });
});
