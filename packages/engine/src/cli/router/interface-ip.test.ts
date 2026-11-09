import { PORT_NAMES, normalizeRouterConfig, prefixLengthToMask } from "@ping9/shared";
import type { ConsoleResult, RouterDevice } from "@ping9/shared";
import { TWO_PC, twoPcDocument } from "@ping9/shared/examples";
import fc from "fast-check";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../../index";
import type { ConsolePort, Simulator } from "../../index";

const ID = "00000000-0000-4000-8000-000000000100";
const GI0 = PORT_NAMES.router[0];
const GI1 = PORT_NAMES.router[1];
const configOf = (simulator: Simulator) => (simulator.getSnapshot().document.devices.find(device => device.id === ID) as RouterDevice).config;
const texts = (result: ConsoleResult) => result.lines.map(line => line.kind === "text" ? line.text : `[${line.kind}]`);

function open() {
  const simulator = createSimulator();
  expect(simulator.dispatch({ type: "device/add", id: ID, kind: "router", position: { x: 0, y: 0 } }).ok).toBe(true);
  return { simulator, port: simulator.console(ID) };
}

async function run(port: ConsolePort, lines: readonly string[]) {
  const results: ConsoleResult[] = [];
  for (const line of lines) results.push(await port.exec(line));
  return results;
}

async function paste(port: ConsolePort, lines: readonly string[]) {
  const results = await run(port, ["enable", "configure terminal", ...lines]);
  expect(results.flatMap(result => result.lines).filter(line => line.kind === "error")).toEqual([]);
}

describe("Router IP 설정 CLI", () => {
  test("CLI와 dispatch가 같은 IP 구성과 스냅샷을 만든다", async () => {
    const cli = open();
    await paste(cli.port, ["interface gi0/0", "ip address 10.0.1.1 255.255.255.0", "no shutdown", "end"]);
    const direct = open();
    direct.simulator.dispatch({ type: "interface/set-ip", deviceId: ID, port: GI0, ip: "10.0.1.1", mask: "255.255.255.0" });
    direct.simulator.dispatch({ type: "interface/set-admin", deviceId: ID, port: GI0, adminUp: true });
    expect(cli.simulator.getSnapshot()).toEqual(direct.simulator.getSnapshot());
    const output = texts(await cli.port.exec("show ip interface brief"));
    expect(output.some(line => line.includes(GI0) && line.includes("10.0.1.1") && line.includes("no-link"))).toBe(true);
  });

  test("줄임 입력으로 설정하고 지우면 IP만 제거한다", async () => {
    const { simulator, port } = open();
    await paste(port, ["int gi0/0", "ip add 10.0.1.1 255.255.255.0", "no shut", "no ip add", "end"]);
    expect(configOf(simulator).interfaces[GI0]).toEqual({ adminUp: true });
    expect(texts(await port.exec("show ip interface brief")).some(line => line.includes(GI0) && line.includes("unassigned"))).toBe(true);
  });

  test("인터페이스 설정 모드에서만 IP를 설정한다", async () => {
    const { port } = open();
    expect((await port.exec("ip address 10.0.1.1 255.255.255.0")).lines).toMatchObject([{ code: "CLI_WRONG_MODE" }]);
    await run(port, ["enable", "configure terminal"]);
    expect((await port.exec("no ip address")).lines).toMatchObject([{ code: "CLI_WRONG_MODE" }]);
  });

  test("형식 오류와 네트워크 겹침을 사유로 표시하고 문서는 유지한다", async () => {
    const { simulator, port } = open();
    await paste(port, ["interface gi0/0", "ip address 10.0.1.1 255.255.255.0", "interface gi0/1"]);
    const before = simulator.getSnapshot();
    expect((await port.exec("ip address 10.0.1.2 255.255.255.0")).lines)
      .toMatchObject([{ code: "INTERFACE_NETWORK_OVERLAP", params: { port: GI1, otherPort: GI0 } }]);
    expect((await port.exec("ip address 10.0.2.256 255.255.255.0")).lines).toMatchObject([{ code: "INVALID_IPV4" }]);
    expect((await port.exec("ip address 10.0.2.1 255.255.255.254")).lines).toMatchObject([{ code: "INVALID_MASK" }]);
    expect(simulator.getSnapshot()).toBe(before);
  });

  test("다른 장비와 IP가 같으면 콘솔에 중복 경고가 나온다", async () => {
    const { simulator, port } = open();
    simulator.load({ ...twoPcDocument, devices: [...twoPcDocument.devices, ...simulator.getSnapshot().document.devices] });
    await run(port, ["enable", "configure terminal", "interface gi0/0"]);
    expect((await port.exec(`ip address ${TWO_PC.pc1.ip} ${TWO_PC.mask}`)).lines)
      .toMatchObject([{ kind: "notice", code: "DUPLICATE_IP" }]);
  });

  test("IP 명령의 도움말과 Tab 완성도 같은 정의에서 나온다", async () => {
    const { port } = open();
    await run(port, ["enable", "configure terminal", "interface gi0/0"]);
    expect(port.complete("ip a")).toBe("ip address ");
    expect(port.help("ip address ").map(entry => entry.token)).toEqual(["<ip>"]);
    expect(port.help("ip address 10.0.1.1 ").map(entry => entry.token)).toEqual(["<mask>"]);
  });
});

describe("Router show running-config 왕복", () => {
  test("기본 설정은 생략하고 IP와 켜진 포트를 순서대로 출력한다", async () => {
    const { port } = open();
    await paste(port, [
      "interface gi0/2", "ip address 10.0.2.1 255.255.255.0", "no shutdown",
      "interface gi0/0", "ip address 10.0.1.1 255.255.255.0", "end",
    ]);
    expect(texts(await port.exec("show running-config"))).toEqual([
      "hostname R1", "!", "interface GigabitEthernet0/0", " ip address 10.0.1.1 255.255.255.0", "!",
      "interface GigabitEthernet0/2", " ip address 10.0.2.1 255.255.255.0", " no shutdown", "!", "end",
    ]);
  });

  test("빈 설정은 최소 명령어로 출력한다", async () => {
    const { port } = open();
    await port.exec("enable");
    expect(texts(await port.exec("show running-config"))).toEqual(["hostname R1", "!", "end"]);
  });

  test("불러온 희소 인터페이스 구성도 새 Router에서 정규화된 값으로 복원된다", async () => {
    const source = open();
    const device = source.simulator.getSnapshot().document.devices[0] as RouterDevice;
    const config = { interfaces: { [GI0]: { adminUp: true, ip: "10.0.1.1", mask: "255.255.255.0" } }, staticRoutes: [] };
    source.simulator.load({ schemaVersion: 1, devices: [{ ...device, config }], links: [] });
    await source.port.exec("enable");
    const target = open();
    await paste(target.port, texts(await source.port.exec("show running-config")));
    expect(configOf(target.simulator)).toEqual(normalizeRouterConfig(config));
  });

  test("임의의 IP 설정/포트 상태 조합을 새 Router로 복원할 수 있다", async () => {
    await fc.assert(fc.asyncProperty(fc.array(fc.record({
      prefix: fc.integer({ min: 16, max: 30 }), configured: fc.boolean(), adminUp: fc.boolean(),
    }), { minLength: 4, maxLength: 4 }), async interfaces => {
      const source = open();
      const lines: string[] = [];
      interfaces.forEach((iface, index) => {
        lines.push(`interface ${PORT_NAMES.router[index]}`);
        if (iface.configured) lines.push(`ip address 10.${index + 1}.0.1 ${prefixLengthToMask(iface.prefix)}`);
        if (iface.adminUp) lines.push("no shutdown");
      });
      await paste(source.port, [...lines, "end"]);
      const configuration = texts(await source.port.exec("show running-config"));
      const target = open();
      await paste(target.port, configuration);
      expect(configOf(target.simulator)).toEqual(configOf(source.simulator));
    }), { numRuns: 100, seed: 20261106 });
  });
});
