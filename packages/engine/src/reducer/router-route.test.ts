import { LIMITS, PORT_NAMES, validateDocument } from "@ping9/shared";
import type { Command, RouterDevice, StaticRoute } from "@ping9/shared";
import fc from "fast-check";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../simulator";

const ID = "00000000-0000-4000-8000-000000000100";
const PC = "00000000-0000-4000-8000-000000000101";
const GI0 = PORT_NAMES.router[0];
const base: StaticRoute = { network: "192.168.2.0", mask: "255.255.255.0", nextHop: "10.0.12.2" };
const add = (fields: Record<string, unknown> = {}): Command => ({ type: "route/add", deviceId: ID, ...base, ...fields }) as Command;

function open() {
  const sim = createSimulator();
  sim.dispatch({ type: "device/add", id: ID, kind: "router", position: { x: 0, y: 0 } });
  return sim;
}
const router = (sim: ReturnType<typeof open>) => sim.getSnapshot().document.devices[0] as RouterDevice;

describe("정적 경로 설정 명령", () => {
  test("도달 불가능한 경로도 저장하고 중복 추가는 멱등이며 다른 설정과 이전 스냅샷을 보존한다", () => {
    const sim = open(); const before = sim.getSnapshot();
    expect(sim.dispatch(add())).toEqual({ ok: true, notices: [] });
    expect(router(sim).config.staticRoutes).toEqual([base]);
    expect(sim.dispatch(add()).ok).toBe(true);
    expect(router(sim).config.staticRoutes).toHaveLength(1);
    expect(router(sim).config.interfaces).toEqual((before.document.devices[0] as RouterDevice).config.interfaces);
    expect((before.document.devices[0] as RouterDevice).config.staticRoutes).toEqual([]);
    const view = sim.getSnapshot().views[ID]!; expect(view.kind === "router" && view.routingTable).toEqual([]);
  });

  test("같은 네트워크의 다른 다음 홉은 보존하고 정확히 지정한 경로만 삭제한다", () => {
    const sim = open(); sim.dispatch(add()); sim.dispatch(add({ nextHop: "10.0.12.3" }));
    expect(sim.dispatch({ type: "route/remove", deviceId: ID, ...base }).ok).toBe(true);
    expect(router(sim).config.staticRoutes).toEqual([{ ...base, nextHop: "10.0.12.3" }]);
    const before = sim.getSnapshot();
    expect(sim.dispatch({ type: "route/remove", deviceId: ID, ...base })).toMatchObject({ ok: false, error: { code: "ROUTE_NOT_FOUND" } });
    expect(sim.getSnapshot()).toBe(before);
  });

  test("기본 경로와 /32 호스트 경로를 저장할 수 있다", () => {
    const sim = open();
    expect(sim.dispatch(add({ network: "0.0.0.0", mask: "0.0.0.0" })).ok).toBe(true);
    expect(sim.dispatch(add({ network: "192.168.2.10", mask: "255.255.255.255" })).ok).toBe(true);
  });

  test.each([
    [{ deviceId: "missing" }, "DEVICE_NOT_FOUND"],
    [{ network: "192.168.2.9" }, "ROUTE_NETWORK_NOT_ALIGNED"],
    [{ network: "1.0.0.0", mask: "0.0.0.0" }, "ROUTE_NETWORK_NOT_ALIGNED"],
    [{ network: "bad" }, "INVALID_IPV4"], [{ mask: "255.0.255.0" }, "INVALID_MASK"],
    [{ nextHop: "127.0.0.1" }, "RESERVED_IPV4"], [{ nextHop: "0.0.0.0" }, "RESERVED_IPV4"],
    [{ nextHop: "224.0.0.1" }, "RESERVED_IPV4"], [{ nextHop: "255.255.255.255" }, "RESERVED_IPV4"],
    [{ nextHop: "10.0.12.256" }, "INVALID_IPV4"], [{ network: null }, "INVALID_IPV4"],
    [{ mask: {} }, "INVALID_MASK"], [{ nextHop: undefined }, "INVALID_IPV4"],
  ])("%j는 거부하고 스냅샷을 유지한다", (fields, code) => {
    const sim = open(); const before = sim.getSnapshot();
    expect(sim.dispatch(add(fields))).toMatchObject({ ok: false, error: { code } });
    expect(sim.getSnapshot()).toBe(before);
  });

  test("PC에는 설정할 수 없다", () => {
    const sim = open(); sim.dispatch({ type: "device/add", id: PC, kind: "pc", position: { x: 0, y: 0 } });
    expect(sim.dispatch(add({ deviceId: PC }))).toMatchObject({ ok: false, error: { code: "DEVICE_KIND_MISMATCH" } });
  });

  test("꺼진 포트의 자기 IP도 다음 홉으로 거부하고 이후 IP 변경과 load에도 같은 규칙을 쓴다", () => {
    const sim = open();
    sim.dispatch({ type: "interface/set-ip", deviceId: ID, port: GI0, ip: base.nextHop, mask: base.mask });
    expect(sim.dispatch(add())).toMatchObject({ ok: false, error: { code: "ROUTE_NEXT_HOP_IS_SELF" } });
    sim.dispatch({ type: "interface/clear-ip", deviceId: ID, port: GI0 }); sim.dispatch(add());
    const before = sim.getSnapshot();
    expect(sim.dispatch({ type: "interface/set-ip", deviceId: ID, port: GI0, ip: base.nextHop, mask: base.mask }))
      .toMatchObject({ ok: false, error: { code: "ROUTE_NEXT_HOP_IS_SELF" } });
    expect(sim.getSnapshot()).toBe(before);
    const device = router(sim);
    const invalid = { ...before.document, devices: [{ ...device, config: { ...device.config,
      interfaces: { [GI0]: { adminUp: false, ip: base.nextHop, mask: base.mask } } } }] };
    expect(sim.load(invalid)).toMatchObject({ ok: false, error: { code: "ROUTE_NEXT_HOP_IS_SELF" } });
    expect(sim.getSnapshot()).toBe(before);
    expect(sim.load({ ...before.document, devices: [{ ...device, config: { ...device.config,
      staticRoutes: [{ ...base, network: "192.168.2.1" }] } }] }))
      .toMatchObject({ ok: false, error: { code: "ROUTE_NETWORK_NOT_ALIGNED" } });
  });

  test("100개까지 허용하고 한도에서 중복 추가·삭제·재추가가 안전하다", () => {
    const sim = open(); const device = router(sim);
    const routes = Array.from({ length: LIMITS.maxStaticRoutesPerRouter }, (_, i) => ({ ...base, network: `192.168.${i}.0` }));
    expect(sim.load({ ...sim.getSnapshot().document, devices: [{ ...device, config: { ...device.config, staticRoutes: routes } }] }).ok).toBe(true);
    expect(sim.dispatch(add()).ok).toBe(true); // 중복은 한도를 소비하지 않음
    const before = sim.getSnapshot();
    expect(sim.dispatch(add({ network: "192.168.200.0" }))).toMatchObject({ ok: false, error: { code: "LIMIT_EXCEEDED" } });
    expect(sim.getSnapshot()).toBe(before);
    sim.dispatch({ type: "route/remove", deviceId: ID, ...base });
    expect(sim.dispatch(add({ network: "192.168.200.0" })).ok).toBe(true);
  });

  test.each(["network", "mask", "nextHop"])("긴 %s 값도 오류에서는 64자 이내다", key => {
    expect(open().dispatch(add({ [key]: "x".repeat(1000) }))).toMatchObject({ ok: false, error: { params: { value: "x".repeat(64) } } });
  });

  test("임의의 추가·삭제 열도 유효한 문서를 유지하고 실패는 원본을 보존한다", () => {
    fc.assert(fc.property(fc.array(fc.record({
      add: fc.boolean(), network: fc.integer({ min: 0, max: 110 }), hop: fc.integer({ min: 1, max: 4 }),
    }), { maxLength: 35 }), actions => {
      const sim = open();
      for (const action of actions) {
        const before = sim.getSnapshot();
        const result = sim.dispatch(add({ type: action.add ? "route/add" : "route/remove",
          network: `172.16.${action.network}.0`, nextHop: `10.0.12.${action.hop}` }));
        expect(validateDocument(sim.getSnapshot().document).ok).toBe(true);
        if (!result.ok) expect(sim.getSnapshot()).toBe(before);
      }
    }), { numRuns: 100, seed: 20261109 });
  });
});
