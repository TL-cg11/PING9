// PC 콘솔의 입력 규칙 (T0.9, vpc.md 4절)과 `help`. 공개 인터페이스(createSimulator)로만 확인한다.
import type { ConsoleResult, PcDevice, TopologyDocument } from "@ping9/shared";
import { TWO_PC, TWO_PC_SWITCH, twoPcDocument, twoPcSwitchDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../../index";

const { pc1, mask } = TWO_PC;

const linuxDocument: TopologyDocument = {
  ...twoPcDocument,
  devices: twoPcDocument.devices.map((device) =>
    device.id === pc1.id ? ({ ...device, config: { os: "linux", ip: pc1.ip, mask } } as PcDevice) : device,
  ),
};

function open(os: "windows" | "linux") {
  const simulator = createSimulator();
  simulator.load(os === "linux" ? linuxDocument : twoPcDocument);
  return { simulator, port: simulator.console(pc1.id) };
}

const texts = (result: ConsoleResult): string[] =>
  result.lines.flatMap((line) => (line.kind === "text" ? [line.text] : []));

describe("한 줄에 명령 하나", () => {
  test.each([
    ["linux", "ping -c 1 10.0.0.1 | grep ttl", "|", 19],
    ["linux", "ip addr > out.txt", ">", 8],
    ["linux", "ip addr < in.txt", "<", 8],
    ["linux", "ip addr; ip neigh", ";", 7],
    ["linux", "ip addr && ip neigh", "&", 8],
    ["linux", "echo `ip addr`", "`", 5],
    ["linux", "echo $(ip addr)", "$(", 5],
    ["windows", "ipconfig & arp -a", "&", 9],
    ["windows", "arp -a|more", "|", 6],
  ] as const)("%s `%s`는 실행하지 않고 기호의 위치를 알린다", async (os, line, token, position) => {
    const { simulator, port } = open(os);
    const before = simulator.getSnapshot();

    const result = await port.exec(line);

    expect(result.lines).toEqual([{ kind: "error", code: "CLI_UNSUPPORTED_SYNTAX", params: { token }, position }]);
    expect(simulator.getSnapshot()).toBe(before);
  });

  test("기호를 막아도 명령이 바뀌지 않는다: 같은 줄에 IP 설정이 있어도 반영되지 않는다", async () => {
    const { simulator, port } = open("windows");
    const before = simulator.getSnapshot().document;

    await port.exec("ipconfig 10.0.0.9 255.255.255.0 ; ping 10.0.0.2");

    expect(simulator.getSnapshot().document).toBe(before);
  });

  test("Switch 콘솔은 이 규칙을 쓰지 않는다", async () => {
    const simulator = createSimulator();
    simulator.load(twoPcSwitchDocument);
    const result = await simulator.console(TWO_PC_SWITCH.sw1.id).exec("show | include x");
    expect(result.lines.map((line) => (line.kind === "error" ? line.code : line.kind))).not.toContain(
      "CLI_UNSUPPORTED_SYNTAX",
    );
  });
});

describe("모르는 명령은 OS 형식으로 나온다", () => {
  test("Windows", async () => {
    expect((await open("windows").port.exec("ls -l")).lines).toEqual([
      { kind: "text", text: "'ls' is not recognized as an internal or external command," },
      { kind: "text", text: "operable program or batch file." },
      { kind: "notice", code: "PC_UNKNOWN_COMMAND", params: { token: "ls" } },
    ]);
  });

  test("Linux", async () => {
    expect((await open("linux").port.exec("  ls")).lines).toEqual([
      { kind: "text", text: "ls: command not found" },
      { kind: "notice", code: "PC_UNKNOWN_COMMAND", params: { token: "ls" } },
    ]);
  });

  test("첫 단어가 맞으면 지금처럼 틀린 위치의 오류다", async () => {
    expect((await open("linux").port.exec("ip bogus")).lines).toEqual([
      { kind: "error", code: "CLI_UNKNOWN_COMMAND", params: { token: "bogus" }, position: 3 },
    ]);
  });
});

describe("대소문자", () => {
  test("Linux는 구분한다: 첫 단어가 다르면 없는 명령어, 뒤의 단어가 다르면 그 자리의 오류", async () => {
    const { port } = open("linux");
    expect(texts(await port.exec("IP addr"))).toEqual(["IP: command not found"]);
    expect((await port.exec("ip ADDR")).lines).toEqual([
      { kind: "error", code: "CLI_UNKNOWN_COMMAND", params: { token: "ADDR" }, position: 3 },
    ]);
    expect(texts(await port.exec("ip addr"))[0]).toMatch(/^1: lo:/);
  });

  test("Linux의 Tab 완성과 `?`도 구분한다", () => {
    const { port } = open("linux");
    expect(port.complete("ip ro")).toBe("ip route ");
    expect(port.complete("ip RO")).toBeNull();
    expect(port.help("IP ")).toEqual([]);
  });

  test("Windows는 구분하지 않는다", async () => {
    const { port } = open("windows");
    expect(texts(await port.exec("IPCONFIG"))).toEqual(texts(await port.exec("ipconfig")));
    expect(port.complete("IPCONF")).toBe("ipconfig ");
  });
});

describe("help", () => {
  test("Windows: 모든 명령어를 쓰는 형태와 설명으로, 가나다순", async () => {
    const lines = texts(await open("windows").port.exec("help"));
    expect(lines).toContain("  arp -a                          Show the ARP table");
    expect(lines.map((line) => line.trim().split(/\s{2,}/)[0])).toEqual([
      "arp -a",
      "arp -d",
      "arp -d *",
      "arp -d <ip>",
      "help",
      "ipconfig",
      "ipconfig /all",
      "ipconfig <ip> <mask>",
      "ipconfig <ip> <mask> <gateway>",
      "ping -n <count> <ip>",
      "ping <ip>",
      "ping <ip> -n <count>",
      "tracert -d -h <hops> <ip>",
      "tracert -d <ip>",
      "tracert -h <hops> -d <ip>",
      "tracert -h <hops> <ip>",
      "tracert <ip>",
    ]);
  });

  test("Linux: Linux 명령어만 나온다", async () => {
    const usages = texts(await open("linux").port.exec("help")).map((line) => line.trim().split(/\s{2,}/)[0]);
    expect(usages).toEqual(expect.arrayContaining(["help", "ip addr add <cidr> dev eth0", "ping -c <count> <ip>"]));
    expect(usages).not.toContain("ipconfig");
  });

  test("`?`의 첫 단어 목록에도 나온다", () => {
    expect(open("windows").port.help("").map((entry) => entry.token)).toContain("help");
    expect(open("linux").port.help("").map((entry) => entry.token)).toContain("help");
  });
});
