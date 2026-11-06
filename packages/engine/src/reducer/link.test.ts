import { PORT_NAMES, validateDocument } from "@ping9/shared";
import type { Command, PortRef } from "@ping9/shared";
import fc from "fast-check";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../index";

const id = (number: number) => `00000000-0000-4000-8000-${number.toString(16).padStart(12, "0")}`;
const PC = id(100);
const SW = id(101);
const RT = id(102);
const LINK = id(200);
const pc = { deviceId: PC, port: "Ethernet0" };
const sw = { deviceId: SW, port: "FastEthernet0/1" };
const router = { deviceId: RT, port: "GigabitEthernet0/0" };
const add = (ends: readonly PortRef[] = [pc, sw], fields: Record<string, unknown> = {}): Command =>
  ({ type: "link/add", id: LINK, ends, ...fields }) as Command;

function open() {
  const simulator = createSimulator();
  for (const [index, kind] of (["pc", "switch", "router"] as const).entries()) {
    expect(simulator.dispatch({ type: "device/add", id: id(100 + index), kind, position: { x: index * 150, y: 100 } }).ok).toBe(true);
  }
  return simulator;
}

describe("link/add와 link/remove", () => {
  test("PC와 Switch를 연결하면 양 끝이 up, 연결을 끊으면 no-link가 된다", () => {
    const simulator = open();
    const before = simulator.getSnapshot();
    expect(simulator.dispatch(add())).toEqual({ ok: true, notices: [] });
    expect(before.document.links).toEqual([]);
    expect(simulator.getSnapshot().document.links).toEqual([{ id: LINK, ends: [pc, sw] }]);
    expect(simulator.getSnapshot().views[PC]!.ports[0]!.status).toBe("up");
    expect(simulator.getSnapshot().views[SW]!.ports[0]!.status).toBe("up");
    expect(simulator.dispatch({ type: "link/remove", linkId: LINK })).toEqual({ ok: true, notices: [] });
    expect(simulator.getSnapshot().views[PC]!.ports[0]!.status).toBe("no-link");
    expect(simulator.getSnapshot().views[SW]!.ports[0]!.status).toBe("no-link");
  });

  test("꺼진 Router도 연결 가능하며 켜면 링크 양 끝의 상태가 갱신된다", () => {
    const simulator = open();
    expect(simulator.dispatch(add([router, sw])).ok).toBe(true);
    expect(simulator.getSnapshot().views[RT]!.ports[0]!.status).toBe("admin-down");
    expect(simulator.getSnapshot().views[SW]!.ports[0]!.status).toBe("peer-down");
    simulator.dispatch({ type: "interface/set-admin", deviceId: RT, port: router.port, adminUp: true });
    expect(simulator.getSnapshot().views[RT]!.ports[0]!.status).toBe("up");
    expect(simulator.getSnapshot().views[SW]!.ports[0]!.status).toBe("up");
  });

  test.each([
    ["없는 장비", [{ deviceId: id(999), port: "Ethernet0" }, sw], "LINK_DEVICE_NOT_FOUND"],
    ["없는 포트", [pc, { ...sw, port: "FastEthernet0/9" }], "LINK_PORT_NOT_FOUND"],
    ["줄인 포트 이름", [pc, { ...sw, port: "fa0/1" }], "LINK_PORT_NOT_FOUND"],
    ["같은 장비의 두 포트", [sw, { ...sw, port: "FastEthernet0/2" }], "LINK_SAME_DEVICE"],
    ["끝 하나", [pc], "DOCUMENT_INVALID_SHAPE"],
    ["빈 배열", [], "DOCUMENT_INVALID_SHAPE"],
  ])("%s는 거부한다", (_label, ends, code) => {
    const simulator = open();
    const before = simulator.getSnapshot();
    expect(simulator.dispatch(add(ends))).toMatchObject({ ok: false, error: { code } });
    expect(simulator.getSnapshot()).toBe(before);
  });

  test.each(["ends", "id"])("%s가 빠져도 예외 대신 오류를 반환한다", (field) => {
    const simulator = open();
    const before = simulator.getSnapshot();
    expect(simulator.dispatch(add(undefined, { [field]: undefined })).ok).toBe(false);
    expect(simulator.getSnapshot()).toBe(before);
  });

  test("양 끝 어느 쪽이든 이미 쓰는 포트면 연결을 거부한다", () => {
    const simulator = open();
    simulator.dispatch(add());
    const before = simulator.getSnapshot();
    for (const ends of [[router, sw], [sw, router], [pc, router]]) {
      expect(simulator.dispatch(add(ends, { id: id(201) }))).toMatchObject({ ok: false, error: { code: "PORT_IN_USE" } });
      expect(simulator.getSnapshot()).toBe(before);
    }
  });

  test("장비/링크 ID 중복은 거부하고 해제한 포트는 다시 사용할 수 있다", () => {
    const simulator = open();
    expect(simulator.dispatch(add([pc, sw], { id: PC }))).toMatchObject({ ok: false, error: { code: "DUPLICATE_ID" } });
    simulator.dispatch(add());
    expect(simulator.dispatch(add([router, { ...sw, port: "FastEthernet0/2" }]))).toMatchObject({ ok: false, error: { code: "DUPLICATE_ID" } });
    simulator.dispatch({ type: "link/remove", linkId: LINK });
    expect(simulator.dispatch(add([pc, router], { id: id(201) })).ok).toBe(true);
  });

  test("없는 링크를 지우려 하면 기존 상태를 유지한다", () => {
    const simulator = open();
    const before = simulator.getSnapshot();
    expect(simulator.dispatch({ type: "link/remove", linkId: id(999) })).toMatchObject({ ok: false, error: { code: "LINK_NOT_FOUND" } });
    expect(simulator.getSnapshot()).toBe(before);
  });

  test("장비를 지우면 그 장비의 링크만 함께 삭제한다", () => {
    const simulator = open();
    simulator.dispatch(add());
    simulator.dispatch(add([router, { ...sw, port: "FastEthernet0/2" }], { id: id(201) }));
    const before = simulator.getSnapshot();
    expect(simulator.dispatch({ type: "device/remove", deviceId: PC }).ok).toBe(true);
    expect(before.document.links).toHaveLength(2);
    expect(simulator.getSnapshot().document.links.map(link => link.id)).toEqual([id(201)]);
    expect(validateDocument(simulator.getSnapshot().document).ok).toBe(true);
    expect(simulator.dispatch({ type: "device/remove", deviceId: PC })).toMatchObject({ ok: false, error: { code: "DEVICE_NOT_FOUND" } });
  });

  test("링크가 100개이면 새 연결을 거부한다", () => {
    const simulator = createSimulator();
    for (let index = 0; index < 50; index += 1) {
      simulator.dispatch({ type: "device/add", id: id(100 + index), kind: "switch", position: { x: index, y: 0 } });
    }
    const links = Array.from({ length: 100 }, (_, index) => ({
      id: id(2000 + index),
      ends: [0, 1].map(side => ({ deviceId: id(100 + Math.floor(index / 4) * 2 + side), port: `FastEthernet0/${index % 4 + 1}` })) as [PortRef, PortRef],
    }));
    expect(simulator.load({ ...simulator.getSnapshot().document, links }).ok).toBe(true);
    const before = simulator.getSnapshot();
    expect(simulator.dispatch(add([{ deviceId: id(100), port: "FastEthernet0/5" }, { deviceId: id(101), port: "FastEthernet0/5" }], { id: id(3000) })))
      .toEqual({ ok: false, error: { code: "LIMIT_EXCEEDED", params: { limit: "links", max: 100 } } });
    expect(simulator.getSnapshot()).toBe(before);
  });

  test("임의의 연결·해제·장비 삭제 순서에서도 문서의 참조가 유효하다", () => {
    const kinds = ["pc", "switch", "router"] as const;
    fc.assert(fc.property(fc.array(fc.record({
      operation: fc.constantFrom("add", "remove", "device"),
      first: fc.integer({ min: 0, max: 2 }), second: fc.integer({ min: 0, max: 2 }),
      port: fc.integer({ min: 0, max: 7 }),
    }), { maxLength: 50 }), actions => {
      const simulator = open();
      actions.forEach((action, index) => {
        const before = simulator.getSnapshot();
        const portOf = (device: number): PortRef => ({ deviceId: id(100 + device), port: PORT_NAMES[kinds[device]!]![action.port] ?? "missing" });
        const command: Command = action.operation === "add"
          ? add([portOf(action.first), portOf(action.second)], { id: id(1000 + index) })
          : action.operation === "device"
            ? { type: "device/remove", deviceId: id(100 + action.first) }
            : { type: "link/remove", linkId: before.document.links[0]?.id ?? id(999) };
        const result = simulator.dispatch(command);
        expect(validateDocument(simulator.getSnapshot().document).ok).toBe(true);
        if (!result.ok) expect(simulator.getSnapshot()).toBe(before);
      });
    }), { numRuns: 100, seed: 20261106 });
  });
});
