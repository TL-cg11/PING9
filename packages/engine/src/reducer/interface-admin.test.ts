// `interface/set-admin`과 `shutdown` 명령어 (T3.3.2, FR-18, FR-22).

import { validateDocument } from "@ping9/shared";
import type { Command, SwitchDevice } from "@ping9/shared";
import { TWO_PC_SWITCH, twoPcSwitchDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../index";
import type { Simulator } from "../index";

const { sw1, pc1 } = TWO_PC_SWITCH;
const FA1 = "FastEthernet0/1";

function open(): Simulator {
  const simulator = createSimulator();
  simulator.load(twoPcSwitchDocument);
  return simulator;
}

const switchConfig = (simulator: Simulator) =>
  (simulator.getSnapshot().document.devices.find((device) => device.id === sw1.id) as SwitchDevice).config;

const statusOf = (simulator: Simulator, deviceId: string, port: string) =>
  simulator.getSnapshot().views[deviceId]?.ports.find((view) => view.name === port)?.status;

const setAdmin = (simulator: Simulator, fields: Record<string, unknown>) =>
  simulator.dispatch({ type: "interface/set-admin", deviceId: sw1.id, port: FA1, adminUp: false, ...fields } as Command);

describe("interface/set-admin (Switch)", () => {
  test("포트를 끄면 그 포트는 admin-down, 상대 포트는 peer-down이 된다", () => {
    const simulator = open();

    expect(setAdmin(simulator, {}).ok).toBe(true);

    expect(switchConfig(simulator).ports).toEqual({ [FA1]: { adminUp: false, mode: "access" } });
    expect(statusOf(simulator, sw1.id, FA1)).toBe("admin-down");
    expect(statusOf(simulator, pc1.id, "Ethernet0")).toBe("peer-down");
    expect(validateDocument(simulator.getSnapshot().document).ok).toBe(true);
  });

  test("다시 켜면 기본값이라 포트 항목이 없어지고 up으로 돌아온다", () => {
    const simulator = open();
    setAdmin(simulator, {});

    expect(setAdmin(simulator, { adminUp: true }).ok).toBe(true);

    expect(switchConfig(simulator).ports).toEqual({});
    expect(statusOf(simulator, sw1.id, FA1)).toBe("up");
    expect(statusOf(simulator, pc1.id, "Ethernet0")).toBe("up");
  });

  test("포트의 다른 설정은 그대로 둔다", () => {
    const simulator = open();
    simulator.load({
      ...twoPcSwitchDocument,
      devices: twoPcSwitchDocument.devices.map((device) =>
        device.id === sw1.id && device.kind === "switch"
          ? {
              ...device,
              config: {
                vlans: [{ id: 1, name: "default" }, { id: 10, name: "SALES" }],
                ports: { [FA1]: { adminUp: true, mode: "trunk", accessVlan: 10, allowedVlans: [[10, 20]] } },
              },
            }
          : device,
      ),
    });

    setAdmin(simulator, {});

    expect(switchConfig(simulator).ports[FA1]).toEqual({
      adminUp: false,
      mode: "trunk",
      accessVlan: 10,
      allowedVlans: [[10, 20]],
    });
  });

  test.each([
    ["없는 장비", { deviceId: "00000000-0000-4000-8000-00000000ffff" }, "DEVICE_NOT_FOUND"],
    ["Switch가 아닌 장비", { deviceId: pc1.id, port: "Ethernet0" }, "DEVICE_KIND_MISMATCH"],
    ["없는 포트", { port: "FastEthernet0/9" }, "UNKNOWN_PORT"],
    ["줄여 쓴 포트 이름", { port: "fa0/1" }, "UNKNOWN_PORT"],
    ["글이 아닌 포트", { port: 5 }, "UNKNOWN_PORT"],
    ["문자열로 바꿀 수 없는 포트", { port: { toString: 1, valueOf: 1 } }, "UNKNOWN_PORT"],
    ["참거짓이 아닌 값", { adminUp: "no" }, "DOCUMENT_INVALID_SHAPE"],
    ["빠진 값", { adminUp: undefined }, "DOCUMENT_INVALID_SHAPE"],
  ])("%s: 거부하고 문서를 바꾸지 않는다", (_name, fields, code) => {
    const simulator = open();
    const before = simulator.getSnapshot();

    const result = setAdmin(simulator, fields);

    expect(result).toMatchObject({ ok: false, error: { code } });
    expect(simulator.getSnapshot()).toBe(before);
  });

  test("없는 포트의 오류에는 장비와 포트 이름이 담긴다", () => {
    expect(setAdmin(open(), { port: "FastEthernet0/9" })).toEqual({
      ok: false,
      error: { code: "UNKNOWN_PORT", params: { deviceId: sw1.id, kind: "switch", port: "FastEthernet0/9" } },
    });
  });
});

describe("shutdown 명령어", () => {
  async function run(...lines: string[]) {
    const simulator = open();
    const port = simulator.console(sw1.id);
    let last = await port.exec("enable");
    for (const line of ["configure terminal", ...lines]) last = await port.exec(line);
    return { simulator, port, last };
  }

  test("shutdown은 설정 중인 포트를 끄고 출력이 없다", async () => {
    const { simulator, last } = await run("interface fa0/1", "shutdown");

    expect(last).toEqual({ lines: [], prompt: "SW1(config-if)#" });
    expect(statusOf(simulator, sw1.id, FA1)).toBe("admin-down");
  });

  test("no shutdown은 다시 켠다", async () => {
    const { simulator } = await run("interface fa0/1", "shutdown", "no shutdown");

    expect(statusOf(simulator, sw1.id, FA1)).toBe("up");
    expect(switchConfig(simulator).ports).toEqual({});
  });

  test("줄여 쓸 수 있다", async () => {
    const { simulator } = await run("int f0/2", "shut");

    expect(statusOf(simulator, sw1.id, "FastEthernet0/2")).toBe("admin-down");

    const { simulator: again } = await run("int f0/2", "shut", "no shut");
    expect(statusOf(again, sw1.id, "FastEthernet0/2")).toBe("up");
  });

  test("다른 포트로 옮기면 그 포트에 적용된다", async () => {
    const { simulator } = await run("interface fa0/1", "interface fa0/3", "shutdown");

    expect(statusOf(simulator, sw1.id, FA1)).toBe("up");
    expect(statusOf(simulator, sw1.id, "FastEthernet0/3")).toBe("admin-down");
  });

  test("인터페이스 설정 모드가 아니면 쓸 수 없다", async () => {
    const { simulator, last } = await run("shutdown");

    expect(last.lines).toEqual([
      { kind: "error", code: "CLI_WRONG_MODE", params: { token: "shutdown" }, position: 0 },
    ]);
    expect(switchConfig(simulator).ports).toEqual({});
  });
});
