import { COMMAND_TYPES, EMPTY_DOCUMENT, LIMITS, validateDocument } from "@ping9/shared";
import type { Command, TopologyDocument } from "@ping9/shared";
import {
  EXAMPLE_DOCUMENTS,
  TWO_PC,
  TWO_PC_SWITCH,
  twoPcDocument,
  twoPcSwitchDocument,
} from "@ping9/shared/examples";
import { describe, expect, test, vi } from "vitest";

import { createSimulator } from "./index";
import { HANDLED_COMMAND_TYPES } from "./reducer";

/** 예시 자료를 고쳐 쓸 수 있게 깊이 복사한다 */
function copy<T = unknown>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("처음 만든 Simulator", () => {
  test("빈 문서와 버전 0으로 시작한다", () => {
    const simulator = createSimulator();

    expect(simulator.getSnapshot()).toEqual({
      document: EMPTY_DOCUMENT,
      docVersion: 0,
      runtimeVersion: 0,
      views: {},
      traces: [],
    });
  });

  test("Simulator끼리 상태를 나누지 않는다", () => {
    const first = createSimulator();
    const second = createSimulator();

    first.load(twoPcDocument);

    expect(first.getSnapshot().document.devices).toHaveLength(2);
    expect(second.getSnapshot().document.devices).toHaveLength(0);
  });
});

describe("load", () => {
  test.each(EXAMPLE_DOCUMENTS)("$name: 예시 Document를 불러오고 스냅샷으로 돌려준다", ({ document }) => {
    const simulator = createSimulator();

    expect(simulator.load(document)).toEqual({ ok: true });

    const snapshot = simulator.getSnapshot();
    expect(snapshot.document).toEqual(document);
    expect(Object.keys(snapshot.views).sort()).toEqual(document.devices.map((d) => d.id).sort());
    expect(validateDocument(snapshot.document).ok).toBe(true);
  });

  test("불러올 때마다 docVersion과 runtimeVersion이 오르고 추적 목록이 빈다", () => {
    const simulator = createSimulator();

    simulator.load(twoPcDocument);
    expect(simulator.getSnapshot()).toMatchObject({ docVersion: 1, runtimeVersion: 1, traces: [] });

    simulator.load(twoPcSwitchDocument);
    expect(simulator.getSnapshot()).toMatchObject({ docVersion: 2, runtimeVersion: 2, traces: [] });
    expect(simulator.getSnapshot().document).toEqual(twoPcSwitchDocument);
  });

  test("유효하지 않은 문서는 오류로 돌려주고 아무것도 바꾸지 않는다", () => {
    const simulator = createSimulator();
    simulator.load(twoPcDocument);
    const before = simulator.getSnapshot();
    const listener = vi.fn();
    simulator.subscribe(listener);

    const broken = copy<{ links: { ends: { deviceId: string }[] }[] }>(twoPcDocument);
    broken.links[0]!.ends[0]!.deviceId = "00000000-0000-4000-8000-00000000dead";
    const result = simulator.load(broken as unknown as TopologyDocument);

    expect(result).toMatchObject({ ok: false, error: { code: "LINK_DEVICE_NOT_FOUND" } });
    expect(simulator.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  test.each([null, undefined, 42, "document", [], {}])("문서가 아닌 %j을 넣어도 예외가 나지 않는다", (value) => {
    const simulator = createSimulator();

    expect(simulator.load(value as unknown as TopologyDocument).ok).toBe(false);
    expect(simulator.getSnapshot().docVersion).toBe(0);
  });

  test("넣은 문서 객체는 얼리지도 고치지도 않는다", () => {
    const simulator = createSimulator();
    const mine = copy<{ devices: { name: string }[] }>(twoPcDocument);
    const before = JSON.stringify(mine);

    simulator.load(mine as unknown as TopologyDocument);

    expect(Object.isFrozen(mine)).toBe(false);
    expect(JSON.stringify(mine)).toBe(before);
    mine.devices[0]!.name = "CHANGED";
    expect(simulator.getSnapshot().document.devices[0]!.name).toBe("PC1");
  });

  test("정의되지 않은 필드는 스냅샷에 없다", () => {
    const simulator = createSimulator();
    const withExtra = { ...copy<object>(twoPcDocument), extra: "<script>" };

    simulator.load(withExtra as unknown as TopologyDocument);

    expect(JSON.stringify(simulator.getSnapshot())).not.toContain("script");
  });
});

describe("스냅샷", () => {
  test("바뀐 것이 없으면 같은 참조를 돌려준다", () => {
    const simulator = createSimulator();
    simulator.load(twoPcDocument);

    expect(simulator.getSnapshot()).toBe(simulator.getSnapshot());
  });

  test("불러오면 새 참조가 된다", () => {
    const simulator = createSimulator();
    const before = simulator.getSnapshot();

    simulator.load(twoPcDocument);

    expect(simulator.getSnapshot()).not.toBe(before);
  });

  test("값이 깊은 곳까지 얼어 있어 고칠 수 없다", () => {
    const simulator = createSimulator();
    simulator.load(twoPcSwitchDocument);
    const snapshot = simulator.getSnapshot() as unknown as {
      docVersion: number;
      document: { devices: { name: string; position: { x: number }; config: { vlans: unknown[] } }[] };
      views: Record<string, { ports: { status: string }[] }>;
      traces: unknown[];
    };

    expect(() => void (snapshot.docVersion = 99)).toThrow(TypeError);
    expect(() => void (snapshot.document.devices[0]!.name = "X")).toThrow(TypeError);
    expect(() => void (snapshot.document.devices[0]!.position.x = 1)).toThrow(TypeError);
    expect(() => void snapshot.document.devices.push(snapshot.document.devices[0]!)).toThrow(TypeError);
    expect(() => void snapshot.document.devices[2]!.config.vlans.push({})).toThrow(TypeError);
    expect(() => void (snapshot.views[TWO_PC_SWITCH.sw1.id]!.ports[0]!.status = "up")).toThrow(TypeError);
    expect(() => void snapshot.traces.push({})).toThrow(TypeError);
    expect(simulator.getSnapshot().document).toEqual(twoPcSwitchDocument);
  });

  test("단순 자료만 담는다 (JSON으로 적었다가 읽어도 같다)", () => {
    const simulator = createSimulator();
    simulator.load(twoPcSwitchDocument);
    const snapshot = simulator.getSnapshot();

    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });
});

describe("포트 상태 (AD-7)", () => {
  const statuses = (document: TopologyDocument, deviceId: string) => {
    const simulator = createSimulator();
    expect(simulator.load(document)).toEqual({ ok: true });
    return simulator.getSnapshot().views[deviceId]!.ports;
  };

  test("링크가 있는 포트는 up이고 링크 ID를 담는다", () => {
    expect(statuses(twoPcDocument, TWO_PC.pc1.id)).toEqual([
      { name: "Ethernet0", status: "up", linkId: TWO_PC.linkId },
    ]);
  });

  test("링크가 없는 포트는 no-link다", () => {
    const ports = statuses(twoPcSwitchDocument, TWO_PC_SWITCH.sw1.id);

    expect(ports.map((port) => port.name)).toEqual([
      "FastEthernet0/1",
      "FastEthernet0/2",
      "FastEthernet0/3",
      "FastEthernet0/4",
      "FastEthernet0/5",
      "FastEthernet0/6",
      "FastEthernet0/7",
      "FastEthernet0/8",
    ]);
    expect(ports.map((port) => port.status)).toEqual([
      "up",
      "up",
      "no-link",
      "no-link",
      "no-link",
      "no-link",
      "no-link",
      "no-link",
    ]);
    expect(ports[0]).toEqual({ name: "FastEthernet0/1", status: "up", linkId: TWO_PC_SWITCH.link1Id });
    expect(ports[2]).toEqual({ name: "FastEthernet0/3", status: "no-link" });
  });

  test("끈 포트는 admin-down이고 상대 포트는 peer-down이다", () => {
    const document = copy<{ devices: { config: { ports?: Record<string, unknown> } }[] }>(
      twoPcSwitchDocument,
    );
    document.devices[2]!.config.ports = {
      "FastEthernet0/1": { adminUp: false, mode: "access" },
      "FastEthernet0/5": { adminUp: false, mode: "access" },
    };
    const fixed = document as unknown as TopologyDocument;

    const switchPorts = statuses(fixed, TWO_PC_SWITCH.sw1.id);
    expect(switchPorts[0]!.status).toBe("admin-down");
    expect(switchPorts[1]!.status).toBe("up");
    // 링크가 없어도 꺼져 있으면 admin-down이 먼저다
    expect(switchPorts[4]!.status).toBe("admin-down");

    expect(statuses(fixed, TWO_PC_SWITCH.pc1.id)[0]!.status).toBe("peer-down");
    expect(statuses(fixed, TWO_PC_SWITCH.pc2.id)[0]!.status).toBe("up");
  });

  test("장비 종류마다 view의 모양이 정해져 있다", () => {
    const simulator = createSimulator();
    simulator.load(twoPcSwitchDocument);
    const { views } = simulator.getSnapshot();

    expect(views[TWO_PC_SWITCH.pc1.id]).toMatchObject({ kind: "pc", arpTable: [] });
    expect(views[TWO_PC_SWITCH.sw1.id]).toMatchObject({ kind: "switch", macTable: [] });
  });
});

describe("dispatch", () => {
  test.each(HANDLED_COMMAND_TYPES)("%s: 필드가 빠진 Command도 예외 없이 거부한다", (type) => {
    const simulator = createSimulator();
    simulator.load(twoPcSwitchDocument);
    const before = simulator.getSnapshot();

    expect(simulator.dispatch({ type } as Command).ok).toBe(false);
    expect(simulator.getSnapshot()).toBe(before);
  });

  const unhandled = COMMAND_TYPES.filter((type) => !HANDLED_COMMAND_TYPES.includes(type));

  test.each(unhandled)("%s: 처리기가 아직 없어 오류 결과로 돌려주고 예외를 던지지 않는다", (type) => {
    const simulator = createSimulator();
    simulator.load(twoPcDocument);
    const before = simulator.getSnapshot();
    const listener = vi.fn();
    simulator.subscribe(listener);

    const result = simulator.dispatch({ type } as Command);

    expect(result).toEqual({ ok: false, error: { code: "UNKNOWN_COMMAND", params: { type } } });
    expect(simulator.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  test.each([
    ["null", null, "undefined"],
    ["undefined", undefined, "undefined"],
    ["빈 객체", {}, "undefined"],
    ["type이 수", { type: 5 }, "5"],
    ["없는 type", { type: "device/explode" }, "device/explode"],
    ["Object의 기본 속성 이름", { type: "toString" }, "toString"],
    ["__proto__", { type: "__proto__" }, "__proto__"],
    ["문자열", "device/add", "undefined"],
    // String()이 예외를 던지는 값. JSON으로도 올 수 있다
    ["문자열로 바꿀 수 없는 type", { type: { toString: 1, valueOf: 1 } }, "object"],
  ])("Command가 아닌 값(%s)도 오류 결과로 끝난다", (_name, value, type) => {
    const simulator = createSimulator();

    expect(simulator.dispatch(value as unknown as Command)).toEqual({
      ok: false,
      error: { code: "UNKNOWN_COMMAND", params: { type } },
    });
  });

  test("오류에 담는 type은 64자로 자른다", () => {
    const result = createSimulator().dispatch({ type: "x".repeat(1000) } as unknown as Command);

    expect(result.ok === false && result.error.code === "UNKNOWN_COMMAND" && result.error.params.type).toHaveLength(64);
  });
});

describe("console", () => {
  test("프롬프트는 장비 이름에서 나온다", () => {
    const simulator = createSimulator();
    simulator.load(twoPcDocument);

    expect(simulator.console(TWO_PC.pc1.id).prompt()).toBe("PC1>");
    expect(simulator.console(TWO_PC.pc2.id).prompt()).toBe("PC2>");
  });

  test("같은 장비에는 같은 ConsolePort를 돌려준다", () => {
    const simulator = createSimulator();
    simulator.load(twoPcDocument);

    expect(simulator.console(TWO_PC.pc1.id)).toBe(simulator.console(TWO_PC.pc1.id));
    expect(simulator.console(TWO_PC.pc1.id)).not.toBe(simulator.console(TWO_PC.pc2.id));
  });

  test("빈 줄은 출력 없이 프롬프트만 돌려준다", async () => {
    const simulator = createSimulator();
    simulator.load(twoPcDocument);
    const port = simulator.console(TWO_PC.pc1.id);

    await expect(port.exec("")).resolves.toEqual({ lines: [], prompt: "PC1>" });
    await expect(port.exec("   ")).resolves.toEqual({ lines: [], prompt: "PC1>" });
  });

  test("없는 명령어는 알 수 없는 명령어이고, 틀린 단어의 위치를 담는다", async () => {
    const simulator = createSimulator();
    simulator.load(twoPcDocument);

    // ping은 T1.8.3에서 생겼다. tracert는 아직 없다
    await expect(simulator.console(TWO_PC.pc1.id).exec("  tracert 192.168.1.2")).resolves.toEqual({
      lines: [{ kind: "error", code: "CLI_UNKNOWN_COMMAND", params: { token: "tracert" }, position: 2 }],
      prompt: "PC1>",
    });
  });

  test("한도보다 긴 줄을 거부한다", async () => {
    const simulator = createSimulator();
    simulator.load(twoPcDocument);
    const port = simulator.console(TWO_PC.pc1.id);

    await expect(port.exec("x".repeat(LIMITS.maxConsoleLineLength))).resolves.toMatchObject({
      lines: [{ kind: "error", code: "CLI_UNKNOWN_COMMAND" }],
    });
    await expect(port.exec("x".repeat(LIMITS.maxConsoleLineLength + 1))).resolves.toEqual({
      lines: [{ kind: "error", code: "CLI_LINE_TOO_LONG", params: { limit: 512 } }],
      prompt: "PC1>",
    });
  });

  test("없는 장비의 콘솔도 예외 없이 오류 줄을 돌려준다", async () => {
    const simulator = createSimulator();
    const port = simulator.console("no-such-device");

    expect(port.prompt()).toBe(">");
    expect(port.complete("pi")).toBeNull();
    expect(port.help("")).toEqual([]);
    await expect(port.exec("ping 1.1.1.1")).resolves.toEqual({
      lines: [{ kind: "error", code: "DEVICE_NOT_FOUND", params: { deviceId: "no-such-device" } }],
      prompt: ">",
    });
  });

  test("문자열이 아닌 줄을 넣어도 거부(reject)하지 않는다", async () => {
    const simulator = createSimulator();
    simulator.load(twoPcDocument);

    await expect(simulator.console(TWO_PC.pc1.id).exec(null as unknown as string)).resolves.toEqual({
      lines: [],
      prompt: "PC1>",
    });
  });

  test("문서를 다시 불러오면 같은 ConsolePort가 새 문서를 본다", () => {
    const simulator = createSimulator();
    simulator.load(twoPcDocument);
    const port = simulator.console(TWO_PC.pc1.id);

    simulator.load(EMPTY_DOCUMENT);

    expect(port.prompt()).toBe(">");
  });

  test("문서를 다시 불러와도 Switch의 프롬프트는 user 모드에서 시작한다", () => {
    const simulator = createSimulator();
    simulator.load(twoPcSwitchDocument);
    expect(simulator.console(TWO_PC_SWITCH.sw1.id).prompt()).toBe("SW1>");

    simulator.load(twoPcSwitchDocument);

    expect(simulator.console(TWO_PC_SWITCH.sw1.id).prompt()).toBe("SW1>");
  });
});

describe("getTrace", () => {
  test("없는 추적은 undefined다", () => {
    const simulator = createSimulator();
    simulator.load(twoPcDocument);

    expect(simulator.getTrace(1)).toBeUndefined();
    expect(simulator.getTrace(Number.NaN)).toBeUndefined();
  });
});

describe("subscribe", () => {
  test("상태가 바뀔 때마다 구독한 함수가 불린다", () => {
    const simulator = createSimulator();
    const listener = vi.fn();
    simulator.subscribe(listener);

    simulator.load(twoPcDocument);
    simulator.load(twoPcSwitchDocument);

    expect(listener).toHaveBeenCalledTimes(2);
  });

  test("구독한 함수가 불릴 때 스냅샷은 이미 새 값이다", () => {
    const simulator = createSimulator();
    const seen: number[] = [];
    simulator.subscribe(() => seen.push(simulator.getSnapshot().document.devices.length));

    simulator.load(twoPcDocument);

    expect(seen).toEqual([2]);
  });

  test("구독을 끝내면 더 불리지 않는다", () => {
    const simulator = createSimulator();
    const listener = vi.fn();
    const unsubscribe = simulator.subscribe(listener);

    simulator.load(twoPcDocument);
    unsubscribe();
    unsubscribe();
    simulator.load(twoPcSwitchDocument);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("불리는 도중에 구독을 끝내도 다른 구독자는 불린다", () => {
    const simulator = createSimulator();
    const second = vi.fn();
    const unsubscribeFirst = simulator.subscribe(() => unsubscribeFirst());
    simulator.subscribe(second);

    simulator.load(twoPcDocument);
    simulator.load(twoPcSwitchDocument);

    expect(second).toHaveBeenCalledTimes(2);
  });
});
