import { createSimulator } from "@ping9/engine";
import { TWO_PC, twoPcDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import {
  applyDraft,
  checkDraft,
  cidrOf,
  commandFor,
  draftOf,
  fieldOfError,
  normalizeMask,
  prefixLabel,
  sameAsConfig,
} from "./pc-address";
import type { PcDraft } from "./pc-address";

const { pc1, pc2, mask } = TWO_PC;
const draft = (ip: string, maskText: string, gateway = ""): PcDraft => ({ ip, mask: maskText, gateway });

describe("draftOf", () => {
  test("구성 값을 칸에 채우고, 없는 값은 빈 칸", () => {
    expect(draftOf({ ip: pc1.ip, mask })).toEqual({ ip: pc1.ip, mask, gateway: "" });
    expect(draftOf({})).toEqual({ ip: "", mask: "", gateway: "" });
  });
});

describe("checkDraft", () => {
  test("맞는 값과 빈 칸은 통과", () => {
    expect(checkDraft(draft("10.0.0.1", "255.255.255.0", "10.0.0.254"))).toEqual({});
    expect(checkDraft(draft("", "", ""))).toEqual({});
  });

  test("틀린 칸만, 여러 칸이면 모두", () => {
    expect(checkDraft(draft("10.0.0", "255.255.255.0"))).toEqual({
      ip: { code: "INVALID_IPV4", params: { value: "10.0.0" } },
    });
    expect(checkDraft(draft("x", "255.0.255.0", "y"))).toEqual({
      ip: { code: "INVALID_IPV4", params: { value: "x" } },
      mask: { code: "INVALID_MASK", params: { value: "255.0.255.0" } },
      gateway: { code: "INVALID_IPV4", params: { value: "y" } },
    });
  });

  test("앞뒤 빈칸은 지우고 본다", () => {
    expect(checkDraft(draft(" 10.0.0.1 ", " 255.255.255.0"))).toEqual({});
  });
});

describe("sameAsConfig", () => {
  test("앞뒤 빈칸을 지운 값이 구성과 같으면 같다", () => {
    expect(sameAsConfig(draft(` ${pc1.ip}`, mask), { ip: pc1.ip, mask })).toBe(true);
    expect(sameAsConfig(draft("", "", ""), {})).toBe(true);
  });

  test("한 칸이라도 다르면 다르다", () => {
    expect(sameAsConfig(draft(pc1.ip, mask, "192.168.1.254"), { ip: pc1.ip, mask })).toBe(false);
  });
});

describe("commandFor", () => {
  test("빈 칸은 null", () => {
    expect(commandFor(pc1.id, draft(" 10.0.0.1 ", "255.255.255.0"))).toEqual({
      type: "pc/set-ip",
      deviceId: pc1.id,
      ip: "10.0.0.1",
      mask: "255.255.255.0",
      gateway: null,
    });
  });

  test("세 칸이 모두 비면 모두 null (설정 지우기)", () => {
    expect(commandFor(pc1.id, draft("", "", ""))).toMatchObject({ ip: null, mask: null, gateway: null });
  });
});

describe("fieldOfError", () => {
  const typed = draft("10.0.0.1", "255.255.255.0", "10.0.1.1");

  test.each([
    [{ code: "PC_ADDRESS_INCOMPLETE", params: { deviceId: "d", missing: "ip" } }, "ip"],
    [{ code: "PC_ADDRESS_INCOMPLETE", params: { deviceId: "d", missing: "mask" } }, "mask"],
    [{ code: "IP_IS_NETWORK_ADDRESS", params: { ip: "10.0.0.0", mask: "255.255.255.0" } }, "ip"],
    [{ code: "IP_IS_BROADCAST_ADDRESS", params: { ip: "10.0.0.255", mask: "255.255.255.0" } }, "ip"],
    [{ code: "GATEWAY_NOT_IN_NETWORK", params: { gateway: "10.0.1.1", ip: "10.0.0.1", mask: "255.255.255.0" } }, "gateway"],
    [{ code: "INVALID_MASK", params: { value: "x" } }, "mask"],
    [{ code: "RESERVED_IPV4", params: { value: "10.0.0.1" } }, "ip"],
    [{ code: "RESERVED_IPV4", params: { value: "127.0.0.1" } }, "gateway"],
    [{ code: "INVALID_IPV4", params: { value: "10.0.0.1" } }, "ip"],
    [{ code: "DEVICE_NOT_FOUND", params: { deviceId: "d" } }, null],
  ] as const)("%o → %s", (error, field) => {
    expect(fieldOfError(error, typed)).toBe(field);
  });
});

describe("applyDraft (Simulator와 함께)", () => {
  function setup() {
    const simulator = createSimulator();
    simulator.load(twoPcDocument);
    const config = () => {
      const device = simulator.getSnapshot().document.devices.find((candidate) => candidate.id === pc1.id);
      return device?.kind === "pc" ? device.config : {};
    };
    return { simulator, config };
  }

  test("바꾼 값이 Document에 반영된다 (FR-25)", () => {
    const { simulator, config } = setup();

    const outcome = applyDraft(pc1.id, config(), draft("10.0.0.1", "255.255.255.0", "10.0.0.254"), simulator.dispatch);

    expect(outcome).toEqual({ kind: "applied", notices: [] });
    expect(config()).toEqual({ ip: "10.0.0.1", mask: "255.255.255.0", gateway: "10.0.0.254" });
  });

  test("같은 값이면 보내지 않아 docVersion이 그대로", () => {
    const { simulator, config } = setup();
    const before = simulator.getSnapshot();

    expect(applyDraft(pc1.id, config(), draftOf(config()), simulator.dispatch)).toEqual({ kind: "unchanged" });
    expect(simulator.getSnapshot()).toBe(before);
  });

  test("형식이 틀리면 보내지 않는다", () => {
    const { simulator, config } = setup();
    const before = simulator.getSnapshot();

    expect(applyDraft(pc1.id, config(), draft("10.0.0", "255.0.255.0"), simulator.dispatch)).toMatchObject({
      kind: "invalid",
      errors: { ip: { code: "INVALID_IPV4" }, mask: { code: "INVALID_MASK" } },
    });
    expect(simulator.getSnapshot()).toBe(before);
  });

  test("중복 IP는 설정되면서 알림이 온다 (FR-27)", () => {
    const { simulator, config } = setup();

    const outcome = applyDraft(pc1.id, config(), draft(pc2.ip, mask), simulator.dispatch);

    expect(outcome).toEqual({
      kind: "applied",
      notices: [{ code: "DUPLICATE_IP", params: { ip: pc2.ip, others: [{ deviceId: pc2.id, deviceName: pc2.name }] } }],
    });
    expect(config().ip).toBe(pc2.ip);
  });

  test.each([
    ["마스크 빠짐", draft("10.0.0.1", ""), "PC_ADDRESS_INCOMPLETE", "mask"],
    ["네트워크 주소", draft("10.0.0.0", "255.255.255.0"), "IP_IS_NETWORK_ADDRESS", "ip"],
    ["특수 주소", draft("127.0.0.1", "255.0.0.0"), "RESERVED_IPV4", "ip"],
    ["다른 네트워크의 게이트웨이", draft("10.0.0.1", "255.255.255.0", "10.0.1.1"), "GATEWAY_NOT_IN_NETWORK", "gateway"],
  ])("reducer가 거부하면(%s) 칸을 정해 돌려주고 문서는 그대로", (_name, typed, code, field) => {
    const { simulator, config } = setup();
    const before = simulator.getSnapshot();

    expect(applyDraft(pc1.id, config(), typed, simulator.dispatch)).toMatchObject({
      kind: "rejected",
      field,
      error: { code },
    });
    expect(simulator.getSnapshot()).toBe(before);
  });

  test("세 칸을 모두 비우면 설정이 지워진다", () => {
    const { simulator, config } = setup();

    expect(applyDraft(pc1.id, config(), draft("", "", ""), simulator.dispatch)).toEqual({ kind: "applied", notices: [] });
    expect(config()).toEqual({});
  });
});

describe("마스크 칸의 길이 입력 (T0.7)", () => {
  test.each([
    ["/24", "255.255.255.0"],
    ["24", "255.255.255.0"],
    [" /30 ", "255.255.255.252"],
    ["/0", "0.0.0.0"],
    ["255.255.0.0", "255.255.0.0"],
    ["/33", "/33"],
    ["abc", "abc"],
  ])("normalizeMask(%j) → %j", (input, output) => {
    expect(normalizeMask(input)).toBe(output);
  });

  test("길이로 쓴 마스크는 형식 오류가 아니고, 마스크로 바꿔 보낸다", () => {
    const draft = { ip: "10.0.0.1", mask: "/24", gateway: "" };
    expect(checkDraft(draft)).toEqual({});
    expect(commandFor("d", draft)).toMatchObject({ mask: "255.255.255.0" });
  });

  test("범위 밖 길이는 마스크 형식 오류", () => {
    expect(checkDraft({ ip: "10.0.0.1", mask: "/33", gateway: "" }).mask?.code).toBe("INVALID_MASK");
  });

  test("지금 마스크와 같은 길이면 바뀐 것이 없다", () => {
    expect(sameAsConfig({ ip: "10.0.0.1", mask: "24", gateway: "" }, { ip: "10.0.0.1", mask: "255.255.255.0" })).toBe(
      true,
    );
  });
});

describe("CIDR 표시 (T0.7)", () => {
  test.each([
    ["10.0.0.1", "255.255.255.0", "10.0.0.1/24"],
    ["10.0.0.1", "255.255.255.252", "10.0.0.1/30"],
    ["10.0.0.1", "255.0.255.0", "10.0.0.1"],
    ["10.0.0.1", undefined, "10.0.0.1"],
  ])("cidrOf(%s, %s) → %s", (ip, mask, output) => {
    expect(cidrOf(ip, mask)).toBe(output);
  });

  test.each([
    ["255.255.255.0", "/24"],
    ["/16", "/16"],
    ["", null],
    ["255.0.255.0", null],
    ["255.255", null],
  ])("prefixLabel(마스크 %j) → %j", (mask, label) => {
    expect(prefixLabel({ ip: "", mask, gateway: "" })).toBe(label);
  });

  test("IP 칸에 길이가 있으면 그것을 보인다", () => {
    expect(prefixLabel({ ip: "10.0.20.4/30", mask: "255.255.255.0", gateway: "" })).toBe("/30");
  });
});

describe("IP 칸의 길이 입력 (T0.7)", () => {
  test("10.0.20.4/24는 주소와 마스크로 나눠 보낸다. 형식 오류가 아니다", () => {
    const draft = { ip: "10.0.20.4/24", mask: "", gateway: "" };
    expect(checkDraft(draft)).toEqual({});
    expect(commandFor("d", draft)).toMatchObject({ ip: "10.0.20.4", mask: "255.255.255.0" });
  });

  test("IP 칸의 길이가 마스크 칸보다 앞선다", () => {
    expect(commandFor("d", { ip: "10.0.20.4/30", mask: "255.255.0.0", gateway: "" })).toMatchObject({
      mask: "255.255.255.252",
    });
  });

  test("범위 밖 길이는 IP 칸의 형식 오류", () => {
    expect(checkDraft({ ip: "10.0.20.4/40", mask: "", gateway: "" }).ip?.code).toBe("INVALID_IPV4");
  });

  test("지금 구성과 같으면 바뀐 것이 없다", () => {
    expect(sameAsConfig({ ip: "10.0.20.4/24", mask: "", gateway: "" }, { ip: "10.0.20.4", mask: "255.255.255.0" })).toBe(
      true,
    );
  });

  test("Simulator에 적용하면 주소와 마스크가 들어간다", () => {
    const simulator = createSimulator();
    simulator.load(twoPcDocument);
    const pc = twoPcDocument.devices.find((device) => device.id === TWO_PC.pc1.id)!;
    const outcome = applyDraft(
      pc.id,
      pc.kind === "pc" ? pc.config : {},
      { ip: "10.0.20.4/24", mask: "", gateway: "" },
      (command) => simulator.dispatch(command),
    );

    expect(outcome.kind).toBe("applied");
    expect(simulator.getSnapshot().document.devices.find((device) => device.id === pc.id)?.config).toEqual({
      ip: "10.0.20.4",
      mask: "255.255.255.0",
    });
  });
});
