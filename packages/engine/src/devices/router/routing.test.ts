import { PORT_NAMES } from "@ping9/shared";
import type { PortStatus, RouterConfig } from "@ping9/shared";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../../simulator";
import { connectedRoutes, routingTable } from "./routing";

const [GI0, GI1] = PORT_NAMES.router;
const R1 = "00000000-0000-4000-8000-000000000100";
const R2 = "00000000-0000-4000-8000-000000000101";
const LINK = "00000000-0000-4000-8000-000000000200";

describe("직접 연결 경로", () => {
  test("자기 IP와 네트워크/브로드캐스트 주소는 다음 홉으로 활성화하지 않는다", () => {
    const config: RouterConfig = {
      interfaces: { [GI0]: { adminUp: true, ip: "10.0.12.1", mask: "255.255.255.252" } },
      staticRoutes: ["10.0.12.0", "10.0.12.1", "10.0.12.3", "10.0.12.2"].map((nextHop, i) => ({
        network: `192.168.${i}.0`, mask: "255.255.255.0", nextHop,
      })),
    };
    expect(routingTable(config, [{ name: GI0, status: "up" }]).filter(route => route.source === "static"))
      .toEqual([{ source: "static", network: "192.168.3.0", mask: "255.255.255.0", nextHop: "10.0.12.2", port: GI0 }]);
  });
  test.each<PortStatus>(["admin-down", "no-link", "peer-down"])("%s 포트는 등록하지 않는다", status => {
    const config: RouterConfig = { interfaces: { [GI0]: { adminUp: true, ip: "10.0.12.1", mask: "255.255.255.252" } }, staticRoutes: [] };
    expect(connectedRoutes(config, [{ name: GI0, status }])).toEqual([]);
  });

  test("up이어도 IP가 없거나 설정이 꺼진 포트는 등록하지 않는다", () => {
    expect(connectedRoutes({ interfaces: { [GI0]: { adminUp: true }, [GI1]: {
      adminUp: false, ip: "10.0.1.1", mask: "255.255.255.0",
    } }, staticRoutes: [] }, [{ name: GI0, status: "up" }, { name: GI1, status: "up" }])).toEqual([]);
  });

  test.each([
    ["10.0.12.1", "255.255.255.252", "10.0.12.0"],
    ["192.168.1.129", "255.255.255.128", "192.168.1.128"],
    ["200.1.2.3", "128.0.0.0", "128.0.0.0"],
  ])("%s %s의 네트워크를 %s로 계산한다", (ip, mask, network) => {
    expect(connectedRoutes({ interfaces: { [GI0]: { adminUp: true, ip, mask } }, staticRoutes: [] }, [{ name: GI0, status: "up" }]))
      .toEqual([{ source: "connected", network, mask, port: GI0 }]);
  });

  test("CLI·명령·load로 포트와 IP가 바뀌면 스냅샷과 show ip route도 갱신된다", async () => {
    const sim = createSimulator();
    for (const id of [R1, R2]) expect(sim.dispatch({ type: "device/add", id, kind: "router", position: { x: 0, y: 0 } }).ok).toBe(true);
    const port = sim.console(R1);
    for (const line of ["enable", "conf t", "int gi0/0", "ip address 10.0.12.1 255.255.255.252", "no shut", "end"]) {
      expect((await port.exec(line)).lines.filter(line => line.kind === "error")).toEqual([]);
    }
    const routes = () => {
      const view = sim.getSnapshot().views[R1]!;
      return view.kind === "router" ? view.routingTable : [];
    };
    expect(routes()).toEqual([]);
    const link = { type: "link/add", id: LINK, ends: [{ deviceId: R1, port: GI0 }, { deviceId: R2, port: GI0 }] } as const;
    expect(sim.dispatch(link).ok).toBe(true);
    expect(routes()).toEqual([]); // 상대 포트 꺼짐
    sim.dispatch({ type: "interface/set-admin", deviceId: R2, port: GI0, adminUp: true });
    const before = sim.getSnapshot();
    expect(routes()).toEqual([{ source: "connected", network: "10.0.12.0", mask: "255.255.255.252", port: GI0 }]);
    const text = (await port.exec("show ip route")).lines.map(line => line.kind === "text" ? line.text : "").join("\n");
    expect(text).toContain("10.0.12.0/30"); expect(text).toContain(GI0);
    expect((await port.exec("show ip interface brief")).lines).toContainEqual(expect.objectContaining({ text: expect.stringContaining("10.0.12.1") }));
    sim.dispatch({ type: "interface/set-admin", deviceId: R1, port: GI0, adminUp: false }); expect(routes()).toEqual([]);
    sim.dispatch({ type: "interface/set-admin", deviceId: R1, port: GI0, adminUp: true }); expect(routes()).toHaveLength(1);
    sim.dispatch({ type: "interface/set-ip", deviceId: R1, port: GI0, ip: "10.0.13.1", mask: "255.255.255.252" });
    expect(routes()[0]!.network).toBe("10.0.13.0");
    sim.dispatch({ type: "interface/clear-ip", deviceId: R1, port: GI0 }); expect(routes()).toEqual([]);
    sim.load(before.document); expect(routes()).toHaveLength(1);
    sim.dispatch({ type: "link/remove", linkId: LINK }); expect(routes()).toEqual([]);
    sim.dispatch(link); expect(routes()).toHaveLength(1);
    sim.dispatch({ type: "device/remove", deviceId: R2 }); expect(routes()).toEqual([]);
    const old = before.views[R1]!; expect(old.kind === "router" && old.routingTable).toHaveLength(1);
  });
});
