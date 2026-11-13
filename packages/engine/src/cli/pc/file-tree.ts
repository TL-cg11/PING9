// PC의 가상 파일 트리 (T0.19). 순수 함수만 둔다. 트리는 변경 불가능한 값이고, 바꾸면 새 트리를 돌려준다.
// Runtime에만 있다. Document에 넣지 않으므로 새로고침하거나 문서를 다시 열면 처음 상태다 (설계안 결정 1).

import type { OsKind } from "@ping9/shared";

export interface PcFile {
  readonly kind: "file";
  readonly name: string;
  readonly content: string;
}

export interface PcDir {
  readonly kind: "dir";
  readonly name: string;
  readonly children: readonly PcNode[];
}

export type PcNode = PcFile | PcDir;

/** PC 하나의 파일 트리와 현재 폴더. `cwd`는 맨 위에서부터의 폴더 이름(만든 모양 그대로)이다 */
export interface PcFiles {
  readonly os: OsKind;
  readonly root: PcDir;
  readonly cwd: readonly string[];
}

/** 한도 (설계안 5절). 문서가 아니라 Runtime의 값이라 LIMITS가 아니라 여기에 둔다 */
export const FILE_LIMITS = {
  /** PC 하나의 파일·폴더 수 (맨 위 폴더는 세지 않는다) */
  maxNodes: 200,
  /** 파일 하나의 내용 (글자 수) */
  maxContent: 4096,
  /** 폴더 깊이 */
  maxDepth: 16,
} as const;

/** 이름 규칙: 영문자, 숫자, `.`, `-`, `_`, 1~64자. `.`과 `..`은 안 된다 */
export function validName(name: string): boolean {
  return /^[A-Za-z0-9._-]{1,64}$/.test(name) && name !== "." && name !== "..";
}

const dir = (name: string, children: readonly PcNode[] = []): PcDir => ({ kind: "dir", name, children });
const file = (name: string, content: string): PcFile => ({ kind: "file", name, content });

export const LINUX_HOME: readonly string[] = ["home", "user"];
export const WINDOWS_HOME: readonly string[] = ["Users", "User"];

export function homeOf(os: OsKind): readonly string[] {
  return os === "linux" ? LINUX_HOME : WINDOWS_HOME;
}

/** 처음 상태 (설계안 3절, 결정 5) */
export function initialFiles(os: OsKind): PcFiles {
  if (os === "linux") {
    return {
      os,
      cwd: LINUX_HOME,
      root: dir("", [
        dir("etc", [file("hosts", "127.0.0.1\tlocalhost")]),
        dir("home", [dir("user", [file("readme.txt", "Welcome to PING9. Try ls, cd, mkdir, cat and echo.")])]),
        dir("tmp"),
      ]),
    };
  }
  return {
    os,
    cwd: WINDOWS_HOME,
    root: dir("", [
      dir("Users", [dir("User", [file("readme.txt", "Welcome to PING9. Try dir, cd, mkdir, type and echo.")])]),
      dir("Windows", [dir("System32", [dir("drivers", [dir("etc", [file("hosts", "127.0.0.1       localhost")])])])]),
    ]),
  };
}

/** 이름 비교. Linux는 대소문자를 구분하고 Windows는 무시한다 */
export function sameName(os: OsKind, left: string, right: string): boolean {
  return os === "linux" ? left === right : left.toLowerCase() === right.toLowerCase();
}

/** 경로의 폴더나 파일. 없으면 undefined */
export function nodeAt(root: PcDir, path: readonly string[]): PcNode | undefined {
  let node: PcNode = root;
  for (const name of path) {
    if (node.kind !== "dir") return undefined;
    const next: PcNode | undefined = node.children.find((child) => child.name === name);
    if (next === undefined) return undefined;
    node = next;
  }
  return node;
}

/**
 * 입력한 경로를 맨 위에서부터의 이름 목록으로 푼다. 있는 이름은 만든 모양으로 바꾼다 (Windows는 대소문자 무시).
 * 없는 이름은 친 그대로 남는다. `..`은 맨 위에서 더 올라가지 않는다.
 * Linux: `/`로 시작하면 맨 위, `~`는 홈. Windows: `C:\`·`\`로 시작하면 맨 위, `/`도 구분자로 받는다
 */
export function resolvePath(files: PcFiles, text: string): string[] {
  let rest = text;
  let path: string[] = [...files.cwd];
  if (files.os === "linux") {
    if (rest.startsWith("/")) path = [];
    else if (rest === "~" || rest.startsWith("~/")) {
      path = [...LINUX_HOME];
      rest = rest.slice(1);
    }
  } else {
    if (/^[cC]:/.test(rest)) {
      path = [];
      rest = rest.slice(2);
    } else if (rest.startsWith("\\") || rest.startsWith("/")) path = [];
  }

  for (const part of rest.split(files.os === "linux" ? "/" : /[\\/]/)) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      path.pop();
      continue;
    }
    const here = nodeAt(files.root, path);
    const found = here?.kind === "dir" ? here.children.find((child) => sameName(files.os, child.name, part)) : undefined;
    path.push(found?.name ?? part);
  }
  return path;
}

/** 화면에 보일 전체 위치. Linux `/home/user`, Windows `C:\Users\User` */
export function displayPath(os: OsKind, path: readonly string[]): string {
  return os === "linux" ? `/${path.join("/")}` : `C:\\${path.join("\\")}`;
}

/** 프롬프트에 보일 지금 폴더 이름 (설계안 결정 4, D안). 홈은 Linux `~`, 맨 위는 `/`·`C:\` */
export function folderLabel(files: PcFiles): string {
  if (files.cwd.length === 0) return files.os === "linux" ? "/" : "C:\\";
  if (files.os === "linux" && files.cwd.join("/") === LINUX_HOME.join("/")) return "~";
  return files.cwd.at(-1)!;
}

/** 경로의 폴더를 바꾼 새 트리 */
export function updateDir(root: PcDir, path: readonly string[], change: (dir: PcDir) => PcDir): PcDir {
  if (path.length === 0) return change(root);
  const [head, ...rest] = path;
  return {
    ...root,
    children: root.children.map((child) => (child.kind === "dir" && child.name === head ? updateDir(child, rest, change) : child)),
  };
}

/** 폴더에 하나를 넣는다. 같은 이름이 있으면 바꾼다 */
export function putChild(root: PcDir, parent: readonly string[], node: PcNode): PcDir {
  return updateDir(root, parent, (folder) => ({
    ...folder,
    children: [...folder.children.filter((child) => child.name !== node.name), node],
  }));
}

/** 경로의 하나를 뺀다 */
export function removeAt(root: PcDir, path: readonly string[]): PcDir {
  const name = path.at(-1);
  return updateDir(root, path.slice(0, -1), (folder) => ({
    ...folder,
    children: folder.children.filter((child) => child.name !== name),
  }));
}

/** 이 노드와 그 아래의 파일·폴더 수 */
export function countNodes(node: PcNode): number {
  return node.kind === "file" ? 1 : 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
}

/** 이 노드 아래의 가장 깊은 단계 (노드 자신이 1) */
export function depthOf(node: PcNode): number {
  return node.kind === "file" ? 1 : 1 + Math.max(0, ...node.children.map(depthOf));
}

/** 맨 위 폴더를 뺀 전체 수 */
export function totalNodes(files: PcFiles): number {
  return countNodes(files.root) - 1;
}

/** `inner`가 `outer`와 같거나 그 아래인가 */
export function isWithin(inner: readonly string[], outer: readonly string[]): boolean {
  return outer.length <= inner.length && outer.every((name, index) => inner[index] === name);
}

/** 목록에 보일 순서: 대소문자를 가리지 않는 이름순 */
export function sortedChildren(folder: PcDir): readonly PcNode[] {
  return [...folder.children].sort((left, right) => {
    const a = left.name.toLowerCase();
    const b = right.name.toLowerCase();
    return a < b ? -1 : a > b ? 1 : left.name < right.name ? -1 : 1;
  });
}

/**
 * Tab 후보 (T0.19). 치다 만 경로의 마지막 이름으로 시작하는 파일·폴더.
 * 넣을 글은 앞의 폴더 부분을 그대로 두고 이름을 만든 모양으로 바꾼다. 폴더는 구분자로 끝난다
 */
export function pathCompletions(
  files: PcFiles,
  typed: string,
  dirsOnly: boolean,
): { insert: string; label: string; final: boolean; caseSensitive: boolean }[] {
  const separators = files.os === "linux" ? ["/"] : ["\\", "/"];
  const cut = Math.max(...separators.map((separator) => typed.lastIndexOf(separator)));
  const folderPart = typed.slice(0, cut + 1);
  const namePart = typed.slice(cut + 1);
  const folder = nodeAt(files.root, resolvePath(files, folderPart === "" ? "." : folderPart));
  if (folder?.kind !== "dir") return [];
  const separator = files.os === "linux" ? "/" : "\\";
  return sortedChildren(folder)
    .filter((child) => (!dirsOnly || child.kind === "dir") && sameName(files.os, child.name.slice(0, namePart.length), namePart))
    .map((child) => ({
      insert: `${folderPart}${child.name}${child.kind === "dir" ? separator : ""}`,
      label: files.os === "linux" && child.kind === "dir" ? `${child.name}/` : child.name,
      final: child.kind === "file",
      caseSensitive: files.os === "linux",
    }));
}
