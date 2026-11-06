// PC 콘솔의 명령어 (T1.6.1). 공개 인터페이스(createSimulator)로만 확인한다.
import type { ConsoleLine, ConsoleResult, TopologyDocument } from "@ping9/shared";
import { TWO_PC, TWO_PC_SWITCH, twoPcDocument, twoPcSwitchDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../../index";

const { pc1, pc2 } = TWO_PC;

function open(document: TopologyDocument = twoPcDocument, deviceId: string = pc1.id) {
  const simulator = createSimulator();
  simulator.load(document);
  return { simulator, port: simulator.console(deviceId) };
}

const texts = (result: ConsoleResult): string[] =>
  result.lines.map((line) => (line.kind === "text" ? line.text : `[${line.kind}]`));

/** PC1의 구성만 바꾼 문서 */
function withPc1Config(config: object): TopologyDocument {
  return {
    ...twoPcDocument,
    devices: twoPcDocument.devices.map((device) =>
      device.id === pc1.id ? ({ ...device, config } as typeof device) : device,
    ),
  };
}

const unlinked: TopologyDocument = { ...twoPcDocument, links: [] };

describe("ipconfig", () => {
  test("MAC, IP, 마스크, 게이트웨이를 보여 준다 (FR-24)", async () => {
    const { port } = open();

    expect(texts(await port.exec("ipconfig"))).toEqual([
      "Ethernet adapter Ethernet0:",
      "",
      "   Physical Address. . . . . . . . . : 02:00:00:00:01:00",
      "   IPv4 Address. . . . . . . . . . . : 192.168.1.1",
      "   Subnet Mask . . . . . . . . . . . : 255.255.255.0",
      "   Default Gateway . . . . . . . . . :",
    ]);
  });

  test("게이트웨이가 있으면 보여 준다", async () => {
    const { port } = open(withPc1Config({ ip: pc1.ip, mask: TWO_PC.mask, gateway: "192.168.1.254" }));

    expect(texts(await port.exec("ipconfig"))).toContain(
      "   Default Gateway . . . . . . . . . : 192.168.1.254",
    );
  });

  test("IP가 없으면 (not configured) 한 줄", async () => {
    const { port } = open(withPc1Config({}));

    const lines = texts(await port.exec("ipconfig"));

    expect(lines).toContain("   IPv4 Address. . . . . . . . . . . : (not configured)");
    expect(lines.some((line) => line.includes("Subnet Mask"))).toBe(false);
  });

  test("모든 줄의 콜론 위치가 같다", async () => {
    const { port } = open(withPc1Config({ ip: pc1.ip, mask: TWO_PC.mask, gateway: "192.168.1.254" }));

    const rows = texts(await port.exec("ipconfig /all")).filter((line) => line.startsWith("   "));

    expect(new Set(rows.map((line) => line.indexOf(" :"))).size).toBe(1);
  });
});

describe("ipconfig /all", () => {
  test("장비 이름과 연결 상태를 더한다", async () => {
    const { port } = open();

    expect(texts(await port.exec("ipconfig /all"))).toEqual([
      "Ethernet adapter Ethernet0:",
      "",
      "   Host Name . . . . . . . . . . . . : PC1",
      "   Media State . . . . . . . . . . . : Connected",
      "   Physical Address. . . . . . . . . : 02:00:00:00:01:00",
      "   IPv4 Address. . . . . . . . . . . : 192.168.1.1",
      "   Subnet Mask . . . . . . . . . . . : 255.255.255.0",
      "   Default Gateway . . . . . . . . . :",
    ]);
  });

  test("링크가 없으면 Media disconnected", async () => {
    const { port } = open(unlinked);

    expect(texts(await port.exec("ipconfig /all"))).toContain(
      "   Media State . . . . . . . . . . . : Media disconnected",
    );
  });

  test("대소문자를 구분하지 않는다", async () => {
    const { port } = open();

    expect(await port.exec("IPCONFIG /ALL")).toEqual(await port.exec("ipconfig /all"));
  });
});

describe("ipconfig <ip> <mask> [<gateway>]", () => {
  test("성공하면 출력이 없고, pc/set-ip와 같은 경로로 구성이 바뀐다 (AD-3)", async () => {
    const { simulator, port } = open();
    const before = simulator.getSnapshot().docVersion;

    const result = await port.exec("ipconfig 10.0.0.1 255.255.255.0");

    expect(result).toEqual({ lines: [], prompt: "PC1>" });
    expect(simulator.getSnapshot().docVersion).toBe(before + 1);
    expect(simulator.getSnapshot().document.devices.find((device) => device.id === pc1.id)?.config).toEqual({
      ip: "10.0.0.1",
      mask: "255.255.255.0",
    });
  });

  test("게이트웨이까지 저장한다", async () => {
    const { simulator, port } = open();

    await port.exec("ipconfig 10.0.0.1 255.255.255.0 10.0.0.254");

    expect(simulator.getSnapshot().document.devices.find((device) => device.id === pc1.id)?.config).toEqual({
      ip: "10.0.0.1",
      mask: "255.255.255.0",
      gateway: "10.0.0.254",
    });
  });

  test("바꾼 값이 ipconfig에 바로 보인다", async () => {
    const { port } = open();

    await port.exec("ipconfig 10.0.0.1 255.255.255.0 10.0.0.254");

    expect(texts(await port.exec("ipconfig"))).toEqual([
      "Ethernet adapter Ethernet0:",
      "",
      "   Physical Address. . . . . . . . . : 02:00:00:00:01:00",
      "   IPv4 Address. . . . . . . . . . . : 10.0.0.1",
      "   Subnet Mask . . . . . . . . . . . : 255.255.255.0",
      "   Default Gateway . . . . . . . . . : 10.0.0.254",
    ]);
  });

  test("같은 IP를 쓰는 장비가 있으면 알림 줄", async () => {
    const { port } = open();

    const result = await port.exec(`ipconfig ${pc2.ip} ${TWO_PC.mask}`);

    expect(result.lines).toEqual([
      {
        kind: "notice",
        code: "DUPLICATE_IP",
        params: { ip: pc2.ip, others: [{ deviceId: pc2.id, deviceName: pc2.name }] },
      },
    ]);
  });

  test("같은 값을 두 번 쳐도 둘 다 성공하고 docVersion이 두 번 오른다", async () => {
    const { simulator, port } = open();
    const before = simulator.getSnapshot().docVersion;

    await port.exec("ipconfig 10.0.0.1 255.255.255.0");
    const second = await port.exec("ipconfig 10.0.0.1 255.255.255.0");

    expect(second.lines).toEqual([]);
    expect(simulator.getSnapshot().docVersion).toBe(before + 2);
  });

  test.each([
    ["네트워크 주소", "ipconfig 10.0.0.0 255.255.255.0", "IP_IS_NETWORK_ADDRESS"],
    ["브로드캐스트 주소", "ipconfig 10.0.0.255 255.255.255.0", "IP_IS_BROADCAST_ADDRESS"],
    ["특수 주소", "ipconfig 127.0.0.1 255.0.0.0", "RESERVED_IPV4"],
    ["다른 네트워크의 게이트웨이", "ipconfig 10.0.0.1 255.255.255.0 10.0.1.1", "GATEWAY_NOT_IN_NETWORK"],
  ])("reducer가 거부하면(%s) 그 오류를 위치 없이 보여 주고 문서는 그대로", async (_name, line, code) => {
    const { simulator, port } = open();
    const before = simulator.getSnapshot();

    const result = await port.exec(line);

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({ kind: "error", code });
    expect(result.lines[0]).not.toHaveProperty("position");
    expect(simulator.getSnapshot()).toBe(before);
  });
});

describe("해석 오류", () => {
  test.each<[string, string, Partial<ConsoleLine>]>([
    ["IP 형식", "ipconfig 10.0.0 255.255.255.0", { code: "INVALID_IPV4", position: 9 }],
    ["마스크 형식", "ipconfig 10.0.0.1 255.0.255.0", { code: "INVALID_MASK", position: 18 }],
    ["게이트웨이 형식", "ipconfig 10.0.0.1 255.255.255.0 gw", { code: "INVALID_IPV4", position: 32 }],
    // 마스크가 없으면 해석기가 먼저 막는다. reducer의 PC_ADDRESS_INCOMPLETE까지 가지 않는다
    ["마스크 없음", "ipconfig 10.0.0.1", { code: "CLI_INCOMPLETE_COMMAND" }],
    // 해석기는 /bogus를 IP 자리로 본다 (설계안 결정 4: 해석기를 고치지 않음)
    ["옵션 오타", "ipconfig /bogus", { code: "INVALID_IPV4", position: 9 }],
    ["남는 단어", "ipconfig /all extra", { code: "CLI_UNKNOWN_COMMAND", position: 14 }],
    ["모르는 명령", "foo", { code: "CLI_UNKNOWN_COMMAND", position: 0 }],
    // PC에는 모드 전환이 없다
    ["enable", "enable", { code: "CLI_UNKNOWN_COMMAND", position: 0 }],
    // help는 T3.2.2에서 모든 장비 공용으로 만든다
    ["help", "help", { code: "CLI_UNKNOWN_COMMAND", position: 0 }],
  ])("%s", async (_name, line, expected) => {
    const { simulator, port } = open();
    const before = simulator.getSnapshot();

    const result = await port.exec(line);

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({ kind: "error", ...expected });
    expect(simulator.getSnapshot()).toBe(before);
  });
});

describe("프롬프트와 장비 종류", () => {
  test("PC의 프롬프트는 명령 전후 모두 이름>", async () => {
    const { port } = open();

    expect(port.prompt()).toBe("PC1>");
    expect((await port.exec("ipconfig 10.0.0.1 255.255.255.0")).prompt).toBe("PC1>");
    expect((await port.exec("foo")).prompt).toBe("PC1>");
  });

  test("Switch 콘솔에서는 ipconfig를 모른다", async () => {
    const { port } = open(twoPcSwitchDocument, TWO_PC_SWITCH.sw1.id);

    const result = await port.exec("ipconfig");

    expect(result.lines[0]).toMatchObject({ kind: "error", code: "CLI_UNKNOWN_COMMAND" });
  });

  test("빈 줄은 아무것도 하지 않는다", async () => {
    const { port } = open();

    expect(await port.exec("   ")).toEqual({ lines: [], prompt: "PC1>" });
  });
});
