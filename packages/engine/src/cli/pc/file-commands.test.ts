// PC 콘솔의 파일 명령어 (T0.19). 공개 인터페이스(createSimulator)로만 확인한다.
import { TWO_PC as LAB, twoPcDocument } from "@ping9/shared/examples";
import type { ConsoleLine, TopologyDocument } from "@ping9/shared";
import { describe, expect, test } from "vitest";

import { createSimulator } from "../../simulator";

/** PC1은 Windows, PC2는 Linux로 바꾼 직결 예시 */
function lab() {
  const document: TopologyDocument = {
    ...twoPcDocument,
    devices: twoPcDocument.devices.map((device) =>
      device.kind === "pc" && device.id === LAB.pc2.id ? { ...device, config: { ...device.config, os: "linux" } } : device,
    ),
  } as TopologyDocument;
  const sim = createSimulator();
  expect(sim.load(document).ok).toBe(true);
  const run = (id: string) => async (line: string) => {
    const result = await sim.console(id).exec(line);
    return { prompt: result.prompt, lines: result.lines, text: result.lines.map(show) };
  };
  return { sim, win: run(LAB.pc1.id), linux: run(LAB.pc2.id) };
}

const show = (line: ConsoleLine) => (line.kind === "text" ? line.text : line.kind === "error" ? `!${line.code}` : `[${line.kind}]`);

describe("프롬프트 (D안: 장비 이름 + 지금 폴더 이름)", () => {
  test("처음은 홈, 들어가면 그 폴더 이름, 맨 위는 C:\\ 와 /", async () => {
    const { sim, win, linux } = lab();
    expect(sim.console(LAB.pc1.id).prompt()).toBe("PC1 User>");
    expect(sim.console(LAB.pc2.id).prompt()).toBe("user@PC2 ~ $");

    await win("mkdir lab");
    expect((await win("cd lab")).prompt).toBe("PC1 lab>");
    expect((await win("cd \\")).prompt).toBe("PC1 C:\\>");
    expect((await win("cd..")).prompt).toBe("PC1 C:\\>");

    await linux("mkdir lab");
    expect((await linux("cd lab")).prompt).toBe("user@PC2 lab $");
    expect((await linux("cd /")).prompt).toBe("user@PC2 / $");
    expect((await linux("cd")).prompt).toBe("user@PC2 ~ $");
  });
});

describe("Linux", () => {
  test("mkdir, cd, echo >, ls, cat, pwd", async () => {
    const { linux } = lab();
    expect((await linux("ls")).text).toEqual(["readme.txt"]);
    await linux("mkdir lab");
    await linux("cd lab");
    expect((await linux("echo hello   world > note.txt")).text).toEqual([]);
    expect((await linux('echo "a  b"')).text).toEqual(["a  b"]);
    expect((await linux("cat note.txt")).text).toEqual(["hello world"]);
    expect((await linux("pwd")).text).toEqual(["/home/user/lab"]);
    expect((await linux("ls -l")).text).toEqual(["total 4", "-rw-r--r-- 1 user user    12 Jan  1 00:00 note.txt"]);
    expect((await linux("ls ..")).text).toEqual(["lab  readme.txt"]);
  });

  test("cp, cp -r, mv, rm, rm -r, rmdir와 오류 줄", async () => {
    const { linux } = lab();
    await linux("mkdir d");
    expect((await linux("cp d e")).text).toEqual(["cp: -r not specified; omitting directory 'd'"]);
    await linux("touch d/a");
    await linux("cp -r d e");
    expect((await linux("ls e")).text).toEqual(["a"]);
    await linux("mv e f");
    expect((await linux("ls")).text).toEqual(["d  f  readme.txt"]);
    expect((await linux("rmdir d")).text).toEqual(["rmdir: failed to remove 'd': Directory not empty"]);
    expect((await linux("rm d")).text).toEqual(["rm: cannot remove 'd': Is a directory"]);
    await linux("rm -r d");
    expect((await linux("cat nope")).text).toEqual(["cat: nope: No such file or directory"]);
    expect((await linux("cd readme.txt")).text).toEqual(["bash: cd: readme.txt: Not a directory"]);
    expect((await linux("mkdir f")).text).toEqual(["mkdir: cannot create directory 'f': File exists"]);
  });

  test("대소문자를 구분한다", async () => {
    const { linux } = lab();
    expect((await linux("cat README.TXT")).text).toEqual(["cat: README.TXT: No such file or directory"]);
    expect((await linux("LS")).text[0]).toBe("LS: command not found");
  });

  test("지금 폴더를 지우면 위 폴더로 간다", async () => {
    const { linux } = lab();
    await linux("mkdir a");
    await linux("cd a");
    expect((await linux("rm -r ../a")).prompt).toBe("user@PC2 ~ $");
  });
});

describe("Windows", () => {
  test("md, cd, echo >, dir, type, cd", async () => {
    const { win } = lab();
    await win("md lab");
    await win("CD LAB");
    await win("echo hello > note.txt");
    expect((await win("type NOTE.TXT")).text).toEqual(["hello"]);
    expect((await win("cd")).text).toEqual(["C:\\Users\\User\\lab"]);
    expect((await win("dir")).text).toEqual([
      " Volume in drive C has no label.",
      " Volume Serial Number is 0000-0000",
      "",
      " Directory of C:\\Users\\User\\lab",
      "",
      "01/01/2026  12:00 AM    <DIR>          .",
      "01/01/2026  12:00 AM    <DIR>          ..",
      "01/01/2026  12:00 AM                 7 note.txt",
      "               1 File(s)              7 bytes",
      "               2 Dir(s)  10,737,418,240 bytes free",
    ]);
    expect((await win("echo")).text).toEqual(["ECHO is on."]);
  });

  test("copy, move, ren, del, rmdir /s와 오류 줄", async () => {
    const { win } = lab();
    expect((await win("copy readme.txt r2.txt")).text).toEqual(["        1 file(s) copied."]);
    await win("mkdir d");
    expect((await win("move r2.txt d")).text).toEqual(["        1 file(s) moved."]);
    await win("ren readme.txt read.txt");
    expect((await win("type readme.txt")).text).toEqual(["The system cannot find the file specified."]);
    expect((await win("rmdir d")).text).toEqual(["The directory is not empty."]);
    await win("rmdir /s /q d");
    expect((await win("cd d")).text).toEqual(["The system cannot find the path specified."]);
    expect((await win("del nope.txt")).text).toEqual(["Could Not Find C:\\Users\\User\\nope.txt"]);
  });
});

describe("입력 규칙과 화면", () => {
  test("echo 한 형태 말고는 기호를 그대로 막는다", async () => {
    const { linux, win } = lab();
    expect((await linux("echo a >> f")).text).toEqual(["!CLI_UNSUPPORTED_SYNTAX"]);
    expect((await linux("echo a > f | cat")).text).toEqual(["!CLI_UNSUPPORTED_SYNTAX"]);
    expect((await win("dir > out.txt")).text).toEqual(["!CLI_UNSUPPORTED_SYNTAX"]);
  });

  test("clear와 cls는 화면 지우기 줄", async () => {
    const { linux, win } = lab();
    expect((await linux("clear")).lines).toEqual([{ kind: "clear" }]);
    expect((await win("cls")).lines).toEqual([{ kind: "clear" }]);
  });

  test("help에 파일 명령어가 나온다", async () => {
    const { linux, win } = lab();
    const linuxHelp = (await linux("help")).text.join("\n");
    expect(linuxHelp).toContain("mkdir <path>");
    expect(linuxHelp).toContain("echo <text> > <file>");
    expect((await win("help")).text.join("\n")).toContain("rmdir /s <path>");
  });

  test("문서를 다시 열면 처음 상태, OS를 바꿔도 처음 상태", async () => {
    const { sim, linux } = lab();
    await linux("mkdir keep");
    await linux("cd keep");
    expect(sim.load(sim.getSnapshot().document).ok).toBe(true);
    expect(sim.console(LAB.pc2.id).prompt()).toBe("user@PC2 ~ $");
    expect((await linux("ls")).text).toEqual(["readme.txt"]);
  });
});

describe("Tab 완성과 후보 (A안: 두 OS 모두 bash처럼)", () => {
  test("Linux: 하나면 채움, 여럿이면 겹치는 데까지, 더 없으면 null. 후보는 이름순, 폴더는 /", async () => {
    const { sim, linux } = lab();
    const port = sim.console(LAB.pc2.id);
    await linux("mkdir notes");
    await linux("touch note.txt");
    expect(port.complete("c")).toBeNull();
    expect(port.candidates("c")).toEqual(["cat", "cd", "clear", "cp"]);
    expect(port.complete("cat r")).toBe("cat readme.txt ");
    expect(port.complete("cat no")).toBe("cat note");
    expect(port.complete("cat note")).toBeNull();
    expect(port.candidates("cat note")).toEqual(["note.txt", "notes/"]);
    expect(port.complete("cd n")).toBe("cd notes/");
    expect(port.candidates("cd ")).toEqual(["notes/"]);
    expect(port.complete("cat /et")).toBe("cat /etc/");
    expect(port.complete("cat /etc/h")).toBe("cat /etc/hosts ");
    expect(port.complete("cat R")).toBeNull();
    expect(port.candidates("ls ")).toEqual(["note.txt", "notes/", "readme.txt"]);
    expect(port.candidates("ls -")).toEqual(["-l"]);
  });

  test("Windows: 대소문자 무시, 만든 모양으로 채움, 폴더는 \\", async () => {
    const { sim } = lab();
    const port = sim.console(LAB.pc1.id);
    expect(port.complete("type READ")).toBe("type readme.txt ");
    expect(port.complete("cd \\us")).toBe("cd \\Users\\");
    expect(port.candidates("c")).toEqual(["cd", "cd..", "cd\\", "cls", "copy"]);
    expect(port.complete("ipc")).toBe("ipconfig ");
  });
});
