import { DEVICE_KINDS, LIMITS, PORT_NAMES, validateDocument } from "@ping9/shared";
import type { Command, DeviceKind, RouterDevice, TopologyDocument } from "@ping9/shared";
import { TWO_PC, twoPcDocument } from "@ping9/shared/examples";
import fc from "fast-check";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../index";

const id = (number: number) => `00000000-0000-4000-8000-${number.toString(16).padStart(12, "0")}`;
const command = (fields: Record<string, unknown> = {}): Command => ({
  type: "device/add", id: id(100), kind: "router", position: { x: 320, y: 180 }, ...fields,
}) as Command;

describe("device/add", () => {
  test("Router를 추가하면 R1과 꺼진 인터페이스 4개가 생긴다", () => {
    const simulator = createSimulator();
    expect(simulator.dispatch(command())).toEqual({ ok: true, notices: [] });
    const snapshot = simulator.getSnapshot();
    const router = snapshot.document.devices[0] as RouterDevice;
    expect(router).toMatchObject({ id: id(100), kind: "router", name: "R1", position: { x: 320, y: 180 } });
    expect(Object.keys(router.config.interfaces)).toEqual(PORT_NAMES.router);
    expect(Object.values(router.config.interfaces)).toEqual(Array.from({ length: 4 }, () => ({ adminUp: false })));
    expect(router.config.staticRoutes).toEqual([]);
    expect(snapshot.views[router.id]).toEqual({
      kind: "router", ports: PORT_NAMES.router.map(name => ({ name, status: "admin-down" })),
      arpTable: [], routingTable: [],
    });
    expect(validateDocument(snapshot.document).ok).toBe(true);
  });

  test.each(DEVICE_KINDS)("%s도 같은 공통 생성 경로를 쓴다", (kind) => {
    const simulator = createSimulator();
    expect(simulator.dispatch(command({ kind })).ok).toBe(true);
    const device = simulator.getSnapshot().document.devices[0]!;
    const names = { pc: "PC1", switch: "SW1", router: "R1" };
    expect(device.name).toBe(names[kind]);
    expect(validateDocument(simulator.getSnapshot().document).ok).toBe(true);
  });

  test("PC는 고른 OS로 만들고, 고르지 않으면 os 칸이 없다 (T0.7)", () => {
    const simulator = createSimulator();
    expect(simulator.dispatch(command({ kind: "pc", os: "linux" })).ok).toBe(true);
    expect(simulator.dispatch(command({ kind: "pc", id: id(101), os: "windows" })).ok).toBe(true);
    expect(simulator.dispatch(command({ kind: "pc", id: id(102) })).ok).toBe(true);
    const configs = simulator.getSnapshot().document.devices.map(device => device.config);
    expect(configs).toEqual([{ os: "linux" }, { os: "windows" }, {}]);
    expect(simulator.console(id(100)).prompt()).toBe("user@PC1 ~ $");
    expect(simulator.console(id(101)).prompt()).toBe("PC2 User>");
  });

  test.each([
    ["없는 OS", { kind: "pc", os: "macos" }],
    ["PC가 아닌 장비", { kind: "switch", os: "linux" }],
  ])("os가 잘못되면 거부하고 문서는 그대로다: %s", (_, fields) => {
    const simulator = createSimulator();
    const before = simulator.getSnapshot();
    expect(simulator.dispatch(command(fields))).toMatchObject({
      ok: false, error: { code: "DOCUMENT_INVALID_SHAPE", params: { path: "os" } },
    });
    expect(simulator.getSnapshot()).toBe(before);
  });

  test("종류와 관계없이 사용 중인 이름은 피하고 다음 번호를 붙인다", () => {
    const simulator = createSimulator();
    const document: TopologyDocument = {
      ...twoPcDocument,
      devices: twoPcDocument.devices.map((device, index) => ({ ...device, name: `R${index + 1}` })),
    };
    expect(simulator.load(document).ok).toBe(true);
    simulator.dispatch(command());
    simulator.dispatch(command({ id: id(101) }));
    expect(simulator.getSnapshot().document.devices.map(device => device.name)).toEqual(["R1", "R2", "R3", "R4"]);
  });

  test("호출자의 위치 객체를 보관하거나 얼리지 않는다", () => {
    const simulator = createSimulator();
    const position = { x: 10, y: 20 };
    const before = simulator.getSnapshot();
    simulator.dispatch(command({ position }));
    position.x = 999;
    expect(Object.isFrozen(position)).toBe(false);
    expect(before.document.devices).toEqual([]);
    expect(simulator.getSnapshot().document.devices[0]!.position).toEqual({ x: 10, y: 20 });
  });

  test.each([
    ["지원하지 않는 종류", { kind: "firewall" }, "DOCUMENT_INVALID_SHAPE"],
    ["종류 누락", { kind: undefined }, "DOCUMENT_INVALID_SHAPE"],
    ["잘못된 UUID", { id: "R1" }, "INVALID_ID"],
    ["문자열이 아닌 UUID", { id: { toString: 1 } }, "INVALID_ID"],
    ["위치 누락", { position: undefined }, "DOCUMENT_INVALID_SHAPE"],
    ["잘못된 좌표", { position: { x: "0", y: 0 } }, "DOCUMENT_INVALID_SHAPE"],
    ["무한 좌표", { position: { x: Number.POSITIVE_INFINITY, y: 0 } }, "DOCUMENT_INVALID_SHAPE"],
    ["범위 밖 좌표", { position: { x: LIMITS.maxPosition + 1, y: 0 } }, "DOCUMENT_INVALID_SHAPE"],
  ])("%s는 오류를 반환하고 기존 문서를 유지한다", (_label, fields, code) => {
    const simulator = createSimulator();
    const before = simulator.getSnapshot();
    expect(simulator.dispatch(command(fields))).toMatchObject({ ok: false, error: { code } });
    expect(simulator.getSnapshot()).toBe(before);
  });

  test.each([TWO_PC.pc1.id, TWO_PC.linkId])("장비/링크와 겹치는 ID %s는 거부한다", (duplicate) => {
    const simulator = createSimulator();
    simulator.load(twoPcDocument);
    expect(simulator.dispatch(command({ id: duplicate }))).toEqual({
      ok: false, error: { code: "DUPLICATE_ID", params: { id: duplicate } },
    });
  });

  test("50대까지 추가하고 51번째는 거부한다", () => {
    const simulator = createSimulator();
    for (let i = 0; i < LIMITS.maxDevices; i += 1) {
      expect(simulator.dispatch(command({ id: id(100 + i) })).ok).toBe(true);
    }
    const before = simulator.getSnapshot();
    expect(simulator.dispatch(command({ id: id(1000) }))).toEqual({
      ok: false, error: { code: "LIMIT_EXCEEDED", params: { limit: "devices", max: 50 } },
    });
    expect(simulator.getSnapshot()).toBe(before);
  });

  test("임의의 종류를 연속 추가해도 문서가 유효하고 이름이 중복되지 않는다", () => {
    fc.assert(fc.property(fc.array(fc.constantFrom<DeviceKind>(...DEVICE_KINDS), { maxLength: 50 }), kinds => {
      const simulator = createSimulator();
      kinds.forEach((kind, index) => {
        expect(simulator.dispatch(command({ kind, id: id(100 + index) })).ok).toBe(true);
        const document = simulator.getSnapshot().document;
        expect(validateDocument(document).ok).toBe(true);
        expect(new Set(document.devices.map(device => device.name)).size).toBe(document.devices.length);
      });
    }), { numRuns: 100, seed: 20261106 });
  });
});
