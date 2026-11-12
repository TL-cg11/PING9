// PC 콘솔의 파일 명령어 (T0.19, 설계안 2절). 출력과 오류는 각 OS의 실제 형식을 따른다.
// 트리는 Runtime에만 있다. 명령은 context.files로 읽고 새 트리를 돌려 놓는다.

import { errorInfo, osOf } from "@ping9/shared";
import type { ConsoleLine, OsKind } from "@ping9/shared";

import { customParam, defineCommand } from "../ios";
import type { CommandArgs, CommandContext, CommandDefinition, CommandOutcome } from "../ios";
import {
  FILE_LIMITS,
  countNodes,
  depthOf,
  displayPath,
  homeOf,
  isWithin,
  nodeAt,
  putChild,
  removeAt,
  resolvePath,
  sortedChildren,
  totalNodes,
  validName,
} from "./file-tree";
import type { PcDir, PcFiles, PcNode } from "./file-tree";
import { unsupportedSyntaxAt } from "./syntax";

export interface FileOutcome {
  readonly files?: PcFiles;
  readonly lines?: readonly string[];
  /** 화면 지우기 (`clear`, `cls`) */
  readonly clear?: boolean;
}

const text = (line: string): ConsoleLine => ({ kind: "text", text: line });

function osOfContext(context: CommandContext): OsKind {
  return context.device.kind === "pc" ? osOf(context.device.config) : "windows";
}

/** 파일 트리를 읽고 바꾸는 명령. Runtime이 없으면(테스트의 일부) 아무것도 하지 않는다 */
function fileRun(body: (files: PcFiles, args: CommandArgs) => FileOutcome) {
  return (args: CommandArgs, context: CommandContext): CommandOutcome => {
    if (context.files === undefined) return { lines: [] };
    const outcome = body(context.files.get(osOfContext(context)), args);
    if (outcome.files !== undefined) context.files.set(outcome.files);
    const lines: ConsoleLine[] = (outcome.lines ?? []).map(text);
    return { lines: outcome.clear === true ? [{ kind: "clear" }, ...lines] : lines };
  };
}

/** 경로 자리. `-`로 시작하는 글은 옵션 자리에 남겨 두려고 받지 않는다 */
const pathParam = (name: string, help: string, files: "any" | "dir" = "any") => ({
  ...customParam(name, help, (value) =>
    value.startsWith("-")
      ? { ok: false, error: errorInfo("CLI_INVALID_VALUE", { token: value.slice(0, 64) }) }
      : { ok: true, value },
  ),
  files,
});
/** `cd`의 자리. Tab이 폴더만 채운다 */
const FOLDER = pathParam("path", "Folder", "dir");
const PATH = pathParam("path", "File or folder");
const SOURCE = pathParam("source", "File or folder to copy or move");
const TARGET = pathParam("target", "Destination");
const NAME = pathParam("name", "New name");
const TEXT = customParam("text", "Text to print or write", (value) => ({ ok: true, value }));
const FILE = pathParam("file", "File to write");

const arg = (args: CommandArgs, name: string): string => String(args[name]);

// ── 공용 동작 ──────────────────────────────────────────────

type MakeError = "exists" | "no-parent" | "invalid" | "space" | "depth";

/** 새 폴더나 빈 파일을 만든다. 이미 있으면 "exists" */
function make(files: PcFiles, typed: string, node: (name: string) => PcNode): PcFiles | MakeError {
  const path = resolvePath(files, typed);
  if (path.length === 0 || nodeAt(files.root, path) !== undefined) return "exists";
  const parent = nodeAt(files.root, path.slice(0, -1));
  if (parent?.kind !== "dir") return "no-parent";
  const name = path.at(-1)!;
  if (!validName(name)) return "invalid";
  if (path.length > FILE_LIMITS.maxDepth) return "depth";
  if (totalNodes(files) + 1 > FILE_LIMITS.maxNodes) return "space";
  return { ...files, root: putChild(files.root, path.slice(0, -1), node(name)) };
}

type TransferError = "no-source" | "source-dir" | "no-target" | "same" | "into-self" | "invalid" | "space" | "depth" | "target-dir";

/** 복사·이동. 대상이 폴더면 그 안으로, 아니면 그 이름으로 */
function transfer(
  files: PcFiles,
  sourceText: string,
  targetText: string,
  mode: "copy" | "move",
  allowDir: boolean,
): PcFiles | TransferError {
  const source = resolvePath(files, sourceText);
  const node = nodeAt(files.root, source);
  if (node === undefined) return "no-source";
  if (source.length === 0) return "into-self";
  if (node.kind === "dir" && !allowDir) return "source-dir";

  const dest = resolvePath(files, targetText);
  const destNode = nodeAt(files.root, dest);
  const target = destNode?.kind === "dir" ? [...dest, node.name] : dest;
  if (target.length === 0) return "into-self";
  const parent = nodeAt(files.root, target.slice(0, -1));
  if (parent?.kind !== "dir") return "no-target";
  const name = target.at(-1)!;
  if (!validName(name)) return "invalid";
  if (target.join("/") === source.join("/")) return mode === "copy" ? "same" : files;
  if (node.kind === "dir" && isWithin(target, source)) return "into-self";

  const existing = nodeAt(files.root, target);
  if (existing?.kind === "dir") return "target-dir";
  if (target.length - 1 + depthOf(node) > FILE_LIMITS.maxDepth) return "depth";
  const added = mode === "copy" ? countNodes(node) - (existing === undefined ? 0 : 1) : 0;
  if (totalNodes(files) + added > FILE_LIMITS.maxNodes) return "space";

  const moved: PcNode = { ...node, name };
  const root = mode === "move" ? removeAt(files.root, source) : files.root;
  // 옮긴 폴더 안에 있었으면 현재 폴더도 따라간다
  const cwd = mode === "move" && isWithin(files.cwd, source) ? [...target, ...files.cwd.slice(source.length)] : files.cwd;
  return { ...files, root: putChild(root, target.slice(0, -1), moved), cwd };
}

/** 지운다. 현재 폴더가 그 안이면 지운 것의 위 폴더로 옮긴다 */
function remove(files: PcFiles, path: readonly string[]): PcFiles {
  const cwd = isWithin(files.cwd, path) ? path.slice(0, -1) : files.cwd;
  return { ...files, root: removeAt(files.root, path), cwd };
}

/** UTF-8로 쓴 바이트 수. engine은 DOM 타입(TextEncoder)을 쓰지 않는다 */
function utf8Length(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const code = character.codePointAt(0)!;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** 파일 크기(바이트). 실제처럼 줄 끝을 더한다: Linux `\n`, Windows `\r\n` */
function sizeOf(os: OsKind, content: string): number {
  if (content === "") return 0;
  return utf8Length(content) + (os === "linux" ? 1 : 2);
}

function contentLines(content: string): string[] {
  return content === "" ? [] : content.split("\n");
}

// ── echo (한 줄 전체를 받으므로 console.ts가 먼저 알아본다) ─────────────

export interface EchoLine {
  readonly text: string;
  /** `> <파일>`이 있으면 */
  readonly file?: string;
}

/**
 * `echo <글>`과 `echo <글> > <파일>`을 알아본다 (설계안 결정 3). 다른 기호가 섞였거나 `>>`면 undefined.
 * 입력 규칙(한 줄에 명령 하나)의 예외는 이 한 형태뿐이다
 */
export function parseEcho(line: string, os: OsKind): EchoLine | undefined {
  const match = /^\s*(\S+)(.*)$/s.exec(line);
  if (match === null) return undefined;
  const [, word, restRaw] = match as unknown as [string, string, string];
  if (os === "linux" ? word !== "echo" : word.toLowerCase() !== "echo") return undefined;
  if (restRaw !== "" && !/^\s/.test(restRaw)) return undefined;

  const at = restRaw.indexOf(">");
  const body = at === -1 ? restRaw : restRaw.slice(0, at);
  if (unsupportedSyntaxAt(body) !== undefined) return undefined;
  const printed = echoText(body, os);
  if (at === -1) return { text: printed };

  const file = restRaw.slice(at + 1).trim();
  if (file === "" || /\s/.test(file) || unsupportedSyntaxAt(file) !== undefined) return undefined;
  return { text: printed, file };
}

/** echo가 보일 글. Linux는 따옴표를 벗기고 빈칸을 하나로, Windows는 친 그대로 */
function echoText(body: string, os: OsKind): string {
  if (os === "windows") return body.replace(/^\s/, "").trimEnd();
  const trimmed = body.trim();
  const quoted = /^(["'])(.*)\1$/s.exec(trimmed);
  return quoted === null ? trimmed.split(/\s+/).join(" ") : quoted[2]!;
}

export function runEcho(files: PcFiles, echo: EchoLine): FileOutcome {
  const { os } = files;
  if (echo.file === undefined) {
    return { lines: [os === "windows" && echo.text === "" ? "ECHO is on." : echo.text] };
  }
  const path = resolvePath(files, echo.file);
  const existing = nodeAt(files.root, path);
  const fail = (linux: string, windows: string): FileOutcome => ({ lines: [os === "linux" ? `bash: ${echo.file}: ${linux}` : windows] });
  if (path.length === 0 || existing?.kind === "dir") return fail("Is a directory", "Access is denied.");
  const parent = nodeAt(files.root, path.slice(0, -1));
  if (parent?.kind !== "dir") return fail("No such file or directory", "The system cannot find the path specified.");
  const name = path.at(-1)!;
  if (!validName(name)) return fail("Invalid argument", "The filename, directory name, or volume label syntax is incorrect.");
  if (existing === undefined && totalNodes(files) + 1 > FILE_LIMITS.maxNodes) {
    return fail("No space left on device", "There is not enough space on the disk.");
  }
  const content = echo.text.slice(0, FILE_LIMITS.maxContent);
  return { files: { ...files, root: putChild(files.root, path.slice(0, -1), { kind: "file", name, content }) } };
}

function echoDefinitions(caseSensitive: boolean): CommandDefinition[] {
  // 실행은 console.ts의 parseEcho가 먼저 가져간다. 이 정의는 help, Tab, `?`에 보이기 위한 것이다
  const echoRun = (args: CommandArgs, context: CommandContext): CommandOutcome =>
    fileRun((files) => runEcho(files, { text: arg(args, "text"), ...(args.file === undefined ? {} : { file: arg(args, "file") }) }))(args, context);
  return [
    { ...pc(["echo", TEXT], "Print the text", echoRun), caseSensitive },
    { ...pc(["echo", TEXT, ">", FILE], "Write the text to a file", echoRun), caseSensitive },
  ];
}

const pc = (tokens: CommandDefinition["tokens"], help: string, run: CommandDefinition["run"]) =>
  defineCommand({ modes: ["user"], devices: ["pc"], tokens, help, run });

// ── Linux ──────────────────────────────────────────────

function linuxLong(node: PcNode): string {
  const size = node.kind === "dir" ? 4096 : sizeOf("linux", node.content);
  const head = node.kind === "dir" ? "drwxr-xr-x 2" : "-rw-r--r-- 1";
  return `${head} user user ${String(size).padStart(5)} Jan  1 00:00 ${node.name}`;
}

function linuxLs(long: boolean) {
  return fileRun((files, args) => {
    const typed = args.path === undefined ? "." : arg(args, "path");
    const node = nodeAt(files.root, resolvePath(files, typed));
    if (node === undefined) return { lines: [`ls: cannot access '${typed}': No such file or directory`] };
    if (node.kind === "file") return { lines: [long ? linuxLong({ ...node, name: typed }) : typed] };
    const children = sortedChildren(node);
    if (long) return { lines: [`total ${children.length * 4}`, ...children.map(linuxLong)] };
    return { lines: children.length === 0 ? [] : [children.map((child) => child.name).join("  ")] };
  });
}

const linuxMakeError = (verb: string, typed: string, error: MakeError): string => {
  const reason = {
    exists: "File exists",
    "no-parent": "No such file or directory",
    invalid: "Invalid argument",
    space: "No space left on device",
    depth: "File name too long",
  }[error];
  return `${verb} '${typed}': ${reason}`;
};

function linuxTransfer(mode: "copy" | "move", recursive: boolean) {
  const tool = mode === "copy" ? "cp" : "mv";
  return fileRun((files, args) => {
    const source = arg(args, "source");
    const target = arg(args, "target");
    const result = transfer(files, source, target, mode, mode === "move" || recursive);
    if (typeof result !== "string") return { files: result };
    const line = {
      "no-source": `${tool}: cannot stat '${source}': No such file or directory`,
      "source-dir": `${tool}: -r not specified; omitting directory '${source}'`,
      "no-target": `${tool}: cannot create regular file '${target}': No such file or directory`,
      same: `${tool}: '${source}' and '${target}' are the same file`,
      "into-self": `${tool}: cannot ${mode} a directory, '${source}', into itself, '${target}'`,
      invalid: `${tool}: cannot create regular file '${target}': Invalid argument`,
      space: `${tool}: cannot create regular file '${target}': No space left on device`,
      depth: `${tool}: cannot create regular file '${target}': File name too long`,
      "target-dir": `${tool}: cannot overwrite directory '${target}' with non-directory`,
    }[result];
    return { lines: [line] };
  });
}

function linuxRm(recursive: boolean) {
  return fileRun((files, args) => {
    const typed = arg(args, "path");
    const path = resolvePath(files, typed);
    const node = nodeAt(files.root, path);
    if (path.length === 0) return { lines: ["rm: it is dangerous to operate recursively on '/'"] };
    if (node === undefined) return { lines: [`rm: cannot remove '${typed}': No such file or directory`] };
    if (node.kind === "dir" && !recursive) return { lines: [`rm: cannot remove '${typed}': Is a directory`] };
    return { files: remove(files, path) };
  });
}

export const LINUX_FILE_COMMANDS: readonly CommandDefinition[] = [
  pc(["ls"], "List the current folder", linuxLs(false)),
  pc(["ls", "-l"], "List the current folder with details", linuxLs(true)),
  pc(["ls", "-l", PATH], "List a folder with details", linuxLs(true)),
  pc(["ls", PATH], "List a folder", linuxLs(false)),
  pc(["pwd"], "Show the current folder", fileRun((files) => ({ lines: [displayPath("linux", files.cwd)] }))),
  pc(["cd"], "Go to the home folder", fileRun((files) => ({ files: { ...files, cwd: homeOf("linux") } }))),
  pc(["cd", FOLDER], "Change the current folder", fileRun((files, args) => {
    const typed = arg(args, "path");
    const path = resolvePath(files, typed);
    const node = nodeAt(files.root, path);
    if (node === undefined) return { lines: [`bash: cd: ${typed}: No such file or directory`] };
    if (node.kind === "file") return { lines: [`bash: cd: ${typed}: Not a directory`] };
    return { files: { ...files, cwd: path } };
  })),
  pc(["mkdir", FOLDER], "Make a folder", fileRun((files, args) => {
    const typed = arg(args, "path");
    const result = make(files, typed, (name): PcDir => ({ kind: "dir", name, children: [] }));
    return typeof result === "string" ? { lines: [linuxMakeError("mkdir: cannot create directory", typed, result)] } : { files: result };
  })),
  pc(["touch", PATH], "Make an empty file", fileRun((files, args) => {
    const typed = arg(args, "path");
    const result = make(files, typed, (name) => ({ kind: "file", name, content: "" }));
    if (result === "exists") return {};
    return typeof result === "string" ? { lines: [linuxMakeError("touch: cannot touch", typed, result)] } : { files: result };
  })),
  pc(["cat", PATH], "Show a file", fileRun((files, args) => {
    const typed = arg(args, "path");
    const node = nodeAt(files.root, resolvePath(files, typed));
    if (node === undefined) return { lines: [`cat: ${typed}: No such file or directory`] };
    if (node.kind === "dir") return { lines: [`cat: ${typed}: Is a directory`] };
    return { lines: contentLines(node.content) };
  })),
  pc(["cp", "-r", SOURCE, TARGET], "Copy a folder and everything in it", linuxTransfer("copy", true)),
  pc(["cp", SOURCE, TARGET], "Copy a file", linuxTransfer("copy", false)),
  pc(["mv", SOURCE, TARGET], "Move or rename", linuxTransfer("move", true)),
  pc(["rm", "-r", PATH], "Remove a folder and everything in it", linuxRm(true)),
  pc(["rm", PATH], "Remove a file", linuxRm(false)),
  pc(["rmdir", FOLDER], "Remove an empty folder", fileRun((files, args) => {
    const typed = arg(args, "path");
    const path = resolvePath(files, typed);
    const node = nodeAt(files.root, path);
    const fail = (reason: string) => ({ lines: [`rmdir: failed to remove '${typed}': ${reason}`] });
    if (node === undefined) return fail("No such file or directory");
    if (node.kind === "file") return fail("Not a directory");
    if (path.length === 0 || node.children.length > 0) return fail("Directory not empty");
    return { files: remove(files, path) };
  })),
  pc(["clear"], "Clear the screen", fileRun(() => ({ clear: true }))),
  ...echoDefinitions(true),
];

// ── Windows ──────────────────────────────────────────────

const WIN_DATE = "01/01/2026  12:00 AM";
const commas = (value: number) => value.toLocaleString("en-US");

function windowsDir(path: readonly string[], node: PcNode): string[] {
  const folder = node.kind === "dir" ? path : path.slice(0, -1);
  const entries: { name: string; node?: PcNode }[] = node.kind === "dir"
    ? [...(path.length === 0 ? [] : [{ name: "." }, { name: ".." }]), ...sortedChildren(node).map((child) => ({ name: child.name, node: child }))]
    : [{ name: node.name, node }];
  let fileCount = 0;
  let bytes = 0;
  let dirCount = 0;
  const rows = entries.map((entry) => {
    if (entry.node?.kind === "file") {
      const size = sizeOf("windows", entry.node.content);
      fileCount += 1;
      bytes += size;
      return `${WIN_DATE} ${commas(size).padStart(17)} ${entry.name}`;
    }
    dirCount += 1;
    return `${WIN_DATE}    <DIR>          ${entry.name}`;
  });
  return [
    " Volume in drive C has no label.",
    " Volume Serial Number is 0000-0000",
    "",
    ` Directory of ${displayPath("windows", folder)}`,
    "",
    ...rows,
    `${String(fileCount).padStart(16)} File(s) ${commas(bytes).padStart(14)} bytes`,
    `${String(dirCount).padStart(16)} Dir(s)  ${commas(10_737_418_240).padStart(14)} bytes free`,
  ];
}

const WIN_NOT_FOUND = "The system cannot find the file specified.";
const WIN_NO_PATH = "The system cannot find the path specified.";
const WIN_BAD_NAME = "The filename, directory name, or volume label syntax is incorrect.";
const WIN_NO_SPACE = "There is not enough space on the disk.";

function windowsCd(typed: string) {
  return fileRun((files) => {
    const path = resolvePath(files, typed);
    const node = nodeAt(files.root, path);
    if (node === undefined) return { lines: [WIN_NO_PATH] };
    if (node.kind === "file") return { lines: ["The directory name is invalid."] };
    return { files: { ...files, cwd: path } };
  });
}

function windowsMkdir() {
  return fileRun((files, args) => {
    const typed = arg(args, "path");
    const result = make(files, typed, (name): PcDir => ({ kind: "dir", name, children: [] }));
    if (typeof result !== "string") return { files: result };
    const line = {
      exists: `A subdirectory or file ${typed} already exists.`,
      "no-parent": WIN_NO_PATH,
      invalid: WIN_BAD_NAME,
      space: WIN_NO_SPACE,
      depth: "The filename or extension is too long.",
    }[result];
    return { lines: [line] };
  });
}

function windowsTransfer(mode: "copy" | "move") {
  return fileRun((files, args) => {
    const sourceNode = nodeAt(files.root, resolvePath(files, arg(args, "source")));
    const result = transfer(files, arg(args, "source"), arg(args, "target"), mode, mode === "move");
    if (typeof result !== "string") {
      const what = sourceNode?.kind === "dir" ? "dir(s)" : "file(s)";
      return { files: result, lines: [`        1 ${what} ${mode === "copy" ? "copied" : "moved"}.`] };
    }
    const line = {
      "no-source": WIN_NOT_FOUND,
      "source-dir": "Access is denied.",
      "no-target": WIN_NO_PATH,
      same: "The file cannot be copied onto itself.",
      "into-self": "The process cannot access the file because it is being used by another process.",
      invalid: WIN_BAD_NAME,
      space: WIN_NO_SPACE,
      depth: "The filename or extension is too long.",
      "target-dir": "Access is denied.",
    }[result];
    return { lines: [line, `        0 file(s) ${mode === "copy" ? "copied" : "moved"}.`] };
  });
}

function windowsRmdir(recursive: boolean) {
  return fileRun((files, args) => {
    const path = resolvePath(files, arg(args, "path"));
    const node = nodeAt(files.root, path);
    if (node === undefined) return { lines: [WIN_NOT_FOUND] };
    if (node.kind === "file") return { lines: ["The directory name is invalid."] };
    if (isWithin(files.cwd, path)) return { lines: ["The process cannot access the file because it is being used by another process."] };
    if (!recursive && node.children.length > 0) return { lines: ["The directory is not empty."] };
    return { files: remove(files, path) };
  });
}

const windowsRmdirDefinitions = (word: string): CommandDefinition[] => [
  pc([word, "/s", "/q", PATH], "Remove a folder and everything in it without asking", windowsRmdir(true)),
  pc([word, "/q", "/s", PATH], "Remove a folder and everything in it without asking", windowsRmdir(true)),
  pc([word, "/s", PATH], "Remove a folder and everything in it", windowsRmdir(true)),
  pc([word, PATH], "Remove an empty folder", windowsRmdir(false)),
];

export const WINDOWS_FILE_COMMANDS: readonly CommandDefinition[] = [
  pc(["dir"], "List the current folder", fileRun((files) => ({ lines: windowsDir(files.cwd, nodeAt(files.root, files.cwd)!) }))),
  pc(["dir", PATH], "List a folder", fileRun((files, args) => {
    const path = resolvePath(files, arg(args, "path"));
    const node = nodeAt(files.root, path);
    return { lines: node === undefined ? [" Volume in drive C has no label.", " Volume Serial Number is 0000-0000", "", "File Not Found"] : windowsDir(path, node) };
  })),
  pc(["cd"], "Show the current folder", fileRun((files) => ({ lines: [displayPath("windows", files.cwd)] }))),
  pc(["cd", FOLDER], "Change the current folder", (args, context) => windowsCd(arg(args, "path"))(args, context)),
  pc(["cd.."], "Go up one folder", windowsCd("..")),
  pc(["cd\\"], "Go to the top folder", windowsCd("\\")),
  pc(["mkdir", FOLDER], "Make a folder", windowsMkdir()),
  pc(["md", FOLDER], "Make a folder", windowsMkdir()),
  pc(["type", PATH], "Show a file", fileRun((files, args) => {
    const node = nodeAt(files.root, resolvePath(files, arg(args, "path")));
    if (node === undefined) return { lines: [WIN_NOT_FOUND] };
    if (node.kind === "dir") return { lines: ["Access is denied."] };
    return { lines: contentLines(node.content) };
  })),
  pc(["copy", SOURCE, TARGET], "Copy a file", windowsTransfer("copy")),
  pc(["move", SOURCE, TARGET], "Move a file or folder", windowsTransfer("move")),
  pc(["ren", PATH, NAME], "Rename a file or folder", fileRun((files, args) => {
    const path = resolvePath(files, arg(args, "path"));
    const node = nodeAt(files.root, path);
    const name = arg(args, "name");
    if (node === undefined || path.length === 0) return { lines: [WIN_NOT_FOUND] };
    if (!validName(name)) return { lines: [WIN_BAD_NAME] };
    const target = [...path.slice(0, -1), name];
    const existing = nodeAt(files.root, resolvePath({ ...files, cwd: path.slice(0, -1) }, name));
    if (existing !== undefined && existing !== node) {
      return { lines: ["A duplicate file name exists, or the file cannot be found."] };
    }
    const cwd = isWithin(files.cwd, path) ? [...target, ...files.cwd.slice(path.length)] : files.cwd;
    return { files: { ...files, root: putChild(removeAt(files.root, path), path.slice(0, -1), { ...node, name }), cwd } };
  })),
  pc(["del", PATH], "Delete a file", fileRun((files, args) => {
    const path = resolvePath(files, arg(args, "path"));
    const node = nodeAt(files.root, path);
    if (node === undefined) return { lines: [`Could Not Find ${displayPath("windows", path)}`] };
    if (node.kind === "file") return { files: remove(files, path) };
    // 폴더를 주면 실제처럼 그 안의 파일만 지운다 (실제는 한 번 묻는다. 콘솔이 한 줄씩이라 묻지 않는다)
    const root = node.children
      .filter((child) => child.kind === "file")
      .reduce((tree, child) => removeAt(tree, [...path, child.name]), files.root);
    return { files: { ...files, root } };
  })),
  ...windowsRmdirDefinitions("rmdir"),
  ...windowsRmdirDefinitions("rd"),
  pc(["cls"], "Clear the screen", fileRun(() => ({ clear: true }))),
  ...echoDefinitions(false),
];
