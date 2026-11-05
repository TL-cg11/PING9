# Switch VLAN 첫 화면 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 브라우저에서 Switch 터미널을 열어 `enable` → `configure terminal` → `vlan 30` → `name LAB` → `end` → `show vlan brief`를 치면 속성 패널의 VLAN 목록이 바로 바뀌는 데까지 만든다.

**Architecture:** engine에 장비 종류를 모르는 IOS 방식 CLI(`cli/ios`)를 두고 Switch 명령 정의(`cli/switch`)를 얹는다. Document는 reducer의 `vlan/*` 처리기로만 바뀐다. 화면은 `Simulator`의 스냅샷과 `ConsolePort`만 읽고, Switch 구성은 `shared`의 읽기 함수로 해석한다.

**Tech Stack:** TypeScript 6 (strict), pnpm workspace, Vitest 5, fast-check 4, React 19, Vite 8. 새 의존성은 넣지 않는다.

**Spec:** [docs/superpowers/specs/2026-11-05-switch-vlan-design.md](../specs/2026-11-05-switch-vlan-design.md) · 화면 시안 [2026-11-05-switch-vlan-mockup.html](../specs/2026-11-05-switch-vlan-mockup.html)

**범위:** 설계 문서 9절의 18개 중 **1~4번**(T3.1.1, T3.1.2, T5.1.1, T5.4.1). 5~18번은 이 계획이 끝난 뒤 따로 계획한다.

## Global Constraints

- Node `>=24.19.0 <25`, pnpm `12.16.1`. 의존성 버전은 `pnpm-workspace.yaml`의 `catalog`에서만 온다. **이 계획에서는 `package.json`에 의존성을 더하지 않는다.**
- TypeScript: `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`(타입은 `import type`). 모든 값은 `readonly`이고 고치지 않고 새로 만든다 (AD-16).
- engine은 `Date.now`, `Math.random`, 실제 타이머를 쓰지 않는다 (AD-5). engine이 만드는 글은 영어, 오류와 알림은 `{ code, params }`다 (AD-14).
- engine 함수는 틀린 입력에 예외를 던지지 않고 오류 결과를 돌려준다. Command의 필드가 빠져 있거나 타입이 틀려도 마찬가지다.
- web이 engine에서 가져오는 것은 `createSimulator`와 타입뿐이다 (AD-16). 화면은 포트 상태나 VLAN 소속을 직접 계산하지 않는다 (AD-7).
- `ConsolePort`의 형태(`prompt`, `exec`, `complete`, `help`)를 바꾸지 않는다 (AD-8).
- 테스트 이름과 주석, 문서 본문은 한국어. **커밋 메시지와 PR 제목·설명은 영어이고 `Co-Authored-By`나 "Generated with" 같은 AI 표시 줄을 넣지 않는다.**
- 저장소 Task마다 브랜치 `feat/<Task ID>-<설명>`, 기록 문서 `docs/task-logs/<Task ID>-<설명>.md`(형식은 `docs/task-logs/_TEMPLATE.md`), `docs/task-logs/README.md` 목록에 한 줄. 기록 문서는 그 Task의 코드와 같은 PR에 넣는다.
- PR을 올리기 전에 `pnpm check`와 `pnpm check:secrets`가 통과해야 한다. **push와 PR 생성은 사용자에게 확인을 받은 뒤에 한다.**
- `vercel.json`, `apps/web/public/mockup.html`, `.github/`는 건드리지 않는다.
- 화면의 색, 글꼴, 간격, 모서리, 터미널 창의 모양은 시안의 CSS를 그대로 옮긴다. 시안에 없는 UI 요소를 더하지 않는다.

## Review Focus

테스트가 놓치기 쉬운 입력. 각 줄의 테스트는 괄호 안의 Task에 들어 있다.

1. 대소문자가 섞인 명령어, 앞뒤와 단어 사이의 공백 여러 개·탭 문자 → 같은 명령어로 해석된다 (Task 1).
2. 숫자가 아닌 VLAN 번호(`vlan 1e1`, `vlan 10.0`, `vlan -1`, `vlan 0x10`, 아주 긴 숫자) → 예외 없이 오류 줄, Document는 그대로 (Task 1, Task 6).
3. config-vlan 모드에 있는 동안 그 VLAN이 다른 경로로 지워짐, 또는 터미널이 열린 채 다른 문서를 `load` → 예외 없이 프롬프트가 config 또는 user로 돌아간다 (Task 3, Task 6).
4. 가져온 문서에 VLAN 1이 없거나, VLAN이 64개이고 이름이 32자 → `show vlan brief`와 속성 패널이 VLAN 1을 보여 주고 열이 어긋나지 않는다 (Task 4, Task 6).
5. 터미널에 `<img src=x onerror=alert(1)>`나 제어 문자가 든 줄을 입력, 앞 명령의 결과가 오기 전에 Enter를 연달아 누름 → 글자 그대로 보이고 실행되지 않으며, 줄의 순서가 입력 순서와 같다 (Task 8).

## 파일 구조

```text
packages/shared/src/
  codes.ts                      수정: 오류 코드 VLAN_NOT_FOUND, DEFAULT_VLAN_READONLY
  port-name.ts                  새로: 포트 이름 줄임 (FastEthernet0/1 → Fa0/1)
  switch-config.ts              새로: Switch 구성 읽기 함수 (기본값, VLAN 목록, VLAN별 포트)
  examples/two-switch-vlan.ts   새로: 시안과 같은 예시 문서
  examples/index.ts             수정: 예시 목록에 추가
  index.ts                      수정: 새 파일 내보내기
packages/engine/src/
  cli/ios/define.ts             새로: 명령 정의 형태, 매개변수, CommandContext
  cli/ios/parse.ts              새로: 줄 → 정의와 인자, 또는 오류와 위치
  cli/ios/session.ts            새로: 세션, 프롬프트, 사라진 대상 처리
  cli/ios/ios-console.ts        새로: 정의 목록으로 ConsolePort의 exec를 구현
  cli/ios/base-commands.ts      새로: enable, disable, configure terminal, exit, end, hostname
  cli/ios/index.ts              새로: 위 파일들의 공개 이름
  cli/switch/vlan-commands.ts   새로: vlan, no vlan, name
  cli/switch/show-vlan.ts       새로: show vlan brief의 줄 만들기
  cli/switch/index.ts           새로: SWITCH_COMMANDS
  handlers/switch-common.ts     새로: Switch 찾기, 구성 정규화, 구성 바꿔 끼우기
  handlers/switch-vlan.ts       새로: vlan/create, vlan/rename, vlan/remove
  console.ts                    수정: 장비 종류에 따라 cli/ios로 넘김
  reducer.ts                    수정: handlers 목록에 세 줄
  simulator.ts                  수정: 세션 보관, load 때 비움, 콘솔에 dispatch 전달
apps/web/
  index.html                    수정: 시안의 글꼴 link
  public/logo.png               새로: 시안의 로고 이미지
  src/styles/editor.css         새로: 시안의 CSS
  src/simulator.ts              새로: 앱의 Simulator 하나와 useSnapshot
  src/ui-state.ts               새로: 선택한 장비, 열린 터미널 (순수 reducer)
  src/terminal/terminal-state.ts 새로: 터미널의 줄, 프롬프트, 이전 명령어 (순수 함수)
  src/messages/errors.ts        새로: 모든 오류 코드의 한국어 문구
  src/messages/notices.ts       새로: 모든 알림 코드의 한국어 문구
  src/components/top-bar.tsx, palette.tsx, canvas.tsx, inspector.tsx,
                 switch-inspector.tsx, terminal-window.tsx   새로
  src/app.tsx, app.test.tsx, index.css   수정
```

테스트 파일은 대상 파일 옆에 `<이름>.test.ts(x)`로 둔다. 화면 테스트는 기존 방식대로 `react-dom/server`의 `renderToString`과 순수 함수 테스트만 쓴다 (DOM 테스트 도구를 더하지 않는다).

한 파일만 돌리는 명령: `pnpm --filter @ping9/engine exec vitest run src/cli/ios/parse.test.ts` (패키지 이름과 경로만 바꾼다).

---

## 브랜치 A — `feat/T3.1.1-cli-modes-and-session` (저장소 Task T3.1.1)

`origin/main`에서 가지를 친다. 이 브랜치의 첫 커밋에 설계 문서, 시안, 이 계획 문서를 넣는다 (`docs/superpowers/`는 `.git/info/exclude`에 로컬로 가려져 있으므로 `git add -f docs/superpowers`를 쓰고, 그 뒤 exclude의 해당 줄을 지운다).

### Task 1: 명령 정의 형태와 해석기

**Files:**
- Create: `packages/engine/src/cli/ios/define.ts`, `packages/engine/src/cli/ios/parse.ts`
- Test: `packages/engine/src/cli/ios/parse.test.ts`

**Interfaces:**
- Consumes: `@ping9/shared`의 `Command`, `ConsoleLine`, `Device`, `DeviceKind`, `DispatchResult`, `ErrorInfo`, `TopologyDocument`, `checkVlanId`
- Produces:

```ts
// define.ts
export type CliMode = "user" | "privileged" | "config" | "config-if" | "config-vlan";
export type ParamType = "word" | "vlan-id";
export interface ParamToken { readonly param: string; readonly type: ParamType; readonly help: string }
export type Token = string | ParamToken;
export function param(name: string, type: ParamType, help: string): ParamToken;

export interface CliSession {
  readonly mode: CliMode;
  readonly targetVlan?: number;   // config-vlan일 때
  readonly targetPort?: string;   // config-if일 때 (T3.3.1에서 씀)
}
export type CommandArgs = Readonly<Record<string, string | number>>;
export interface CommandContext {
  readonly device: Device;
  readonly document: TopologyDocument;
  readonly session: CliSession;
  dispatch(command: Command): DispatchResult;
}
export interface CommandOutcome {
  readonly lines?: readonly ConsoleLine[];
  readonly session?: CliSession;  // 바뀔 때만
}
export interface CommandDefinition {
  readonly modes: readonly CliMode[];
  readonly devices?: readonly DeviceKind[];  // 없으면 모든 장비
  readonly tokens: readonly Token[];         // 첫 토큰은 항상 문자열
  readonly help: string;                     // 영어
  run(args: CommandArgs, context: CommandContext): CommandOutcome;
}
export function defineCommand(definition: CommandDefinition): CommandDefinition;

// parse.ts
export type ParseResult =
  | { readonly ok: true; readonly definition: CommandDefinition; readonly args: CommandArgs }
  | { readonly ok: false; readonly error: ErrorInfo; readonly position?: number };
export function parseLine(
  line: string, mode: CliMode, kind: DeviceKind, definitions: readonly CommandDefinition[],
): ParseResult;
```

**해석 규칙** (이 Task는 단어가 정확히 일치할 때만. 줄임은 T3.2.1):

- 줄을 공백 문자(스페이스, 탭)로 나눈다. 단어마다 시작 위치를 기억한다.
- 키워드는 대소문자를 가리지 않는다. `no`는 특별하지 않은 키워드다 (`["no", "vlan", param(...)]`처럼 정의에 그대로 적는다).
- 후보는 `devices`가 없거나 `kind`를 포함하고, `modes`가 현재 모드를 포함하는 정의다. 현재 모드가 `config-if`나 `config-vlan`이고 그 모드의 정의 중 첫 단어가 일치하는 것이 없으면 `config` 모드의 정의를 후보로 쓴다.
- 매개변수 `word`: 빈 문자열이 아닌 단어. 값은 문자열 그대로. `vlan-id`: `/^[0-9]{1,9}$/`에 맞아야 하고 값은 수. 맞지 않으면 `CLI_INVALID_VALUE { token }`. 수이지만 `checkVlanId`가 거부하면 그 오류(`INVALID_VLAN_ID`)를 그대로 돌려준다. 두 경우 모두 `position`은 그 단어의 시작이다.
- 후보 중 하나라도 줄 전체와 일치하면 성공이다 (`show vlan`과 `show vlan brief`가 함께 있어도 된다). 일치하는 후보가 없을 때의 오류는 아래 순서로 정한다:
  1. 모든 단어가 일치했고 정의에 토큰이 남음 → `CLI_INCOMPLETE_COMMAND {}`, `position` 없음.
  2. 정의의 토큰이 끝났는데 단어가 남음 → `CLI_UNKNOWN_COMMAND { token: 남은 첫 단어 }`.
  3. 현재 모드의 후보는 첫 단어부터 틀리지만 이 장비에 해당하는(`devices` 조건이 맞는) 다른 모드의 정의는 줄 전체와 일치 → `CLI_WRONG_MODE { token: 첫 단어 }`, `position`은 첫 단어.
  4. 그 밖 → 가장 많은 단어가 일치한 후보에서 처음 틀린 단어로 `CLI_UNKNOWN_COMMAND { token }`.
- 오류의 `token`은 64자로 자른다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// parse.test.ts — 테스트용 정의
const run = () => ({});
const DEFS = [
  defineCommand({ modes: ["user"], tokens: ["enable"], help: "h", run }),
  defineCommand({ modes: ["privileged"], tokens: ["configure", "terminal"], help: "h", run }),
  defineCommand({ modes: ["config"], tokens: ["vlan", param("id", "vlan-id", "VLAN ID")], help: "h", run }),
  defineCommand({ modes: ["config"], tokens: ["no", "vlan", param("id", "vlan-id", "VLAN ID")], help: "h", run }),
  defineCommand({ modes: ["config-vlan"], tokens: ["name", param("name", "word", "VLAN name")], help: "h", run }),
  defineCommand({ modes: ["config"], devices: ["router"], tokens: ["router-only"], help: "h", run }),
];
const parse = (line: string, mode: CliMode) => parseLine(line, mode, "switch", DEFS);

test.each([
  ["enable", "user", ["enable"], {}],
  ["  ENABLE  ", "user", ["enable"], {}],
  ["configure\t terminal", "privileged", ["configure", "terminal"], {}],
  ["vlan 10", "config", ["vlan", "id"], { id: 10 }],
  ["no vlan 4094", "config", ["no", "vlan", "id"], { id: 4094 }],
  ["name SALES", "config-vlan", ["name", "name"], { name: "SALES" }],
  ["vlan 20", "config-vlan", ["vlan", "id"], { id: 20 }],   // config 모드로 되돌아가 해석
])("%j (%s): 정의와 인자를 찾는다", (line, mode, shape, args) => {
  const result = parse(line, mode as CliMode);
  expect(result.ok && result.definition.tokens.map((t) => (typeof t === "string" ? t : t.param))).toEqual(shape);
  expect(result.ok && result.args).toEqual(args);
});

test.each([
  ["foo", "user", { code: "CLI_UNKNOWN_COMMAND", params: { token: "foo" } }, 0],
  ["  enable now", "user", { code: "CLI_UNKNOWN_COMMAND", params: { token: "now" } }, 9],
  ["configure", "privileged", { code: "CLI_INCOMPLETE_COMMAND", params: {} }, undefined],
  ["vlan", "config", { code: "CLI_INCOMPLETE_COMMAND", params: {} }, undefined],
  ["vlan 10", "privileged", { code: "CLI_WRONG_MODE", params: { token: "vlan" } }, 0],
  ["router-only", "config", { code: "CLI_UNKNOWN_COMMAND", params: { token: "router-only" } }, 0],
  ["vlan 0", "config", { code: "INVALID_VLAN_ID", params: { value: 0 } }, 5],
  ["vlan 4095", "config", { code: "INVALID_VLAN_ID", params: { value: 4095 } }, 5],
  ["vlan 1e1", "config", { code: "CLI_INVALID_VALUE", params: { token: "1e1" } }, 5],
  ["vlan 10.0", "config", { code: "CLI_INVALID_VALUE", params: { token: "10.0" } }, 5],
  ["vlan -1", "config", { code: "CLI_INVALID_VALUE", params: { token: "-1" } }, 5],
  ["vlan 0x10", "config", { code: "CLI_INVALID_VALUE", params: { token: "0x10" } }, 5],
  ["vlan 99999999999999999999", "config", { code: "CLI_INVALID_VALUE", params: { token: "99999999999999999999" } }, 5],
])("%j (%s): 오류와 위치", (line, mode, error, position) => {
  expect(parse(line, mode as CliMode)).toEqual(
    position === undefined ? { ok: false, error } : { ok: false, error, position },
  );
});

test("오류에 담는 단어는 64자로 자른다", () => {
  const result = parse("x".repeat(500), "user");
  expect(result.ok === false && result.error.code === "CLI_UNKNOWN_COMMAND" && result.error.params.token).toHaveLength(64);
});
```

- [ ] **Step 2: 실패를 확인한다** — `pnpm --filter @ping9/engine exec vitest run src/cli/ios/parse.test.ts` → `define`/`parse` 모듈이 없어 FAIL.
- [ ] **Step 3: `define.ts`와 `parse.ts`를 위 Interfaces와 해석 규칙대로 구현한다.** `defineCommand`와 `param`은 받은 값을 그대로 돌려준다 (타입을 고정하는 용도).
- [ ] **Step 4: 통과를 확인한다** — 같은 명령 → PASS. `pnpm --filter @ping9/engine typecheck` → 오류 없음.
- [ ] **Step 5: 커밋** — `git add packages/engine/src/cli/ios` 후 `feat(T3.1.1): add the CLI command definition form and exact-match parser`

### Task 2: 세션, 프롬프트, IOS 콘솔

**Files:**
- Create: `packages/engine/src/cli/ios/session.ts`, `packages/engine/src/cli/ios/ios-console.ts`, `packages/engine/src/cli/ios/index.ts`
- Modify: `packages/engine/src/simulator.ts`, `packages/engine/src/console.ts`
- Test: `packages/engine/src/cli/ios/session.test.ts`, `packages/engine/src/cli/ios/ios-console.test.ts`
- Create: `docs/task-logs/T3.1.1-cli-modes-and-session.md`; Modify: `docs/task-logs/README.md`

**Interfaces:**
- Consumes: Task 1의 `CliSession`, `CommandDefinition`, `parseLine`
- Produces:

```ts
// session.ts
export const INITIAL_SESSION: CliSession;                 // { mode: "user" }
export function promptFor(deviceName: string, session: CliSession): string;
export function effectiveSession(session: CliSession, device: Device): CliSession;
export function linesFromDispatch(result: DispatchResult): readonly ConsoleLine[];

// ios-console.ts
export interface IosConsoleEnv {
  getDocument(): TopologyDocument;
  dispatch(command: Command): DispatchResult;
  getSession(deviceId: string): CliSession;               // 없으면 INITIAL_SESSION
  setSession(deviceId: string, session: CliSession): void;
}
export function iosPrompt(device: Device, env: IosConsoleEnv): string;
export function iosExec(
  line: string, device: Device, definitions: readonly CommandDefinition[], env: IosConsoleEnv,
): ConsoleResult;

// console.ts (기존 함수의 두 번째 인자가 바뀐다)
export function createConsolePort(deviceId: string, env: IosConsoleEnv): ConsolePort;
```

**규칙:**

- `promptFor`: `SW1>`, `SW1#`, `SW1(config)#`, `SW1(config-if)#`, `SW1(config-vlan)#`.
- `effectiveSession`: `config-vlan`인데 `targetVlan`이 그 Switch의 VLAN 목록에 없으면 `{ mode: "config" }`. 장비가 Switch가 아니면 같은 규칙에서 "목록에 없음"으로 본다. 그 밖에는 받은 세션 그대로. (Task 4의 `switchVlans`가 생기기 전이므로 이 Task에서는 `device.config.vlans`를 직접 본다. Task 6에서 `switchVlans`로 바꾼다.)
- `linesFromDispatch`: 성공이면 알림마다 `{ kind: "notice", ...notice }`, 실패면 `[{ kind: "error", ...error }]`.
- `iosExec`: 빈 줄과 `!`로 시작하는 줄은 줄 없이 프롬프트만. 해석 오류는 `{ kind: "error", ...error, position }` 한 줄(`position`이 없으면 필드도 없음). 성공하면 `run`을 부르고, 돌려준 `session`이 있으면 저장한 뒤 프롬프트를 계산한다. 세션은 항상 `effectiveSession`을 거친 값을 쓴다.
- `simulator.ts`: `Map<string, CliSession>`을 두고 `load()`가 성공하면 비운다. 콘솔에 넘기는 `dispatch`는 공개 `dispatch`와 같은 경로다 (reduce → `docVersion` 증가 → 구독자 알림). 세션이 바뀌어도 `runtimeVersion`은 그대로이고 구독자를 부르지 않는다.
- `console.ts`: 지금의 가드(없는 장비 `DEVICE_NOT_FOUND`, 문자열이 아닌 줄, 512자 초과 `CLI_LINE_TOO_LONG`)는 그대로 둔다. 가드 뒤에 `DEFINITIONS_BY_KIND[device.kind]`가 있으면 `iosExec`/`iosPrompt`로 넘기고, 없으면 지금처럼 `CLI_UNKNOWN_COMMAND`를 돌려준다. 이 Task에서 `DEFINITIONS_BY_KIND`는 `{}`다 (`Partial<Record<DeviceKind, readonly CommandDefinition[]>>`). `complete`는 `null`, `help`는 `[]`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// session.test.ts
test.each([
  [{ mode: "user" }, "SW1>"],
  [{ mode: "privileged" }, "SW1#"],
  [{ mode: "config" }, "SW1(config)#"],
  [{ mode: "config-if", targetPort: "FastEthernet0/1" }, "SW1(config-if)#"],
  [{ mode: "config-vlan", targetVlan: 10 }, "SW1(config-vlan)#"],
])("%j의 프롬프트는 %s", (session, prompt) => {
  expect(promptFor("SW1", session as CliSession)).toBe(prompt);
});

test("대상 VLAN이 사라지면 config 모드로 돌아간다", () => {
  const sw = twoPcSwitchDocument.devices.find((d) => d.kind === "switch")!;   // VLAN 1만 있다
  expect(effectiveSession({ mode: "config-vlan", targetVlan: 10 }, sw)).toEqual({ mode: "config" });
  expect(effectiveSession({ mode: "config-vlan", targetVlan: 1 }, sw)).toEqual({ mode: "config-vlan", targetVlan: 1 });
  expect(effectiveSession({ mode: "privileged" }, sw)).toEqual({ mode: "privileged" });
});

// ios-console.test.ts — 가짜 정의 둘과 Map으로 만든 env로 iosExec를 직접 부른다
//   sw는 twoPcSwitchDocument의 Switch. env.getDocument는 그 문서를 돌려주고,
//   env.dispatch는 reduce(document, command)의 결과를 DispatchResult로 바꿔 돌려준다 (문서는 바꾸지 않는다)
//   up:   modes ["user"], tokens ["up"]   → { session: { mode: "privileged" } }
//   boom: modes ["privileged"], tokens ["boom"] → { lines: linesFromDispatch(ctx.dispatch({ type: "device/remove", deviceId: "x" })) }
test("명령을 실행하고 세션과 프롬프트를 바꾼다", () => {
  expect(iosExec("up", sw, DEFS, env)).toEqual({ lines: [], prompt: "SW1#" });
  expect(env.getSession(sw.id)).toEqual({ mode: "privileged" });
});
test("빈 줄과 !로 시작하는 줄은 아무것도 하지 않는다", () => {
  expect(iosExec("   ", sw, DEFS, env)).toEqual({ lines: [], prompt: "SW1>" });
  expect(iosExec("! comment", sw, DEFS, env)).toEqual({ lines: [], prompt: "SW1>" });
});
test("해석 오류는 위치가 든 오류 줄이 된다", () => {
  expect(iosExec(" nope", sw, DEFS, env)).toEqual({
    lines: [{ kind: "error", code: "CLI_UNKNOWN_COMMAND", params: { token: "nope" }, position: 1 }],
    prompt: "SW1>",
  });
});
test("dispatch가 거부되면 오류 줄이 되고 모드는 그대로다", () => {
  env.setSession(sw.id, { mode: "privileged" });
  expect(iosExec("boom", sw, DEFS, env)).toEqual({
    lines: [{ kind: "error", code: "UNKNOWN_COMMAND", params: { type: "device/remove" } }],
    prompt: "SW1#",
  });
});
```

`packages/engine/src/simulator.test.ts`의 `describe("console")`에 더한다:

```ts
test("문서를 다시 불러오면 CLI 세션이 처음으로 돌아간다", () => {
  // Task 3 전에는 Switch에 명령이 없으므로 여기서는 load 뒤 프롬프트만 확인한다
  const simulator = createSimulator();
  simulator.load(twoPcSwitchDocument);
  expect(simulator.console(TWO_PC_SWITCH.sw1.id).prompt()).toBe("SW1>");
  simulator.load(twoPcSwitchDocument);
  expect(simulator.console(TWO_PC_SWITCH.sw1.id).prompt()).toBe("SW1>");
});
```

- [ ] **Step 2: 실패를 확인한다** — `pnpm --filter @ping9/engine exec vitest run src/cli/ios` → 모듈이 없어 FAIL.
- [ ] **Step 3: `session.ts`, `ios-console.ts`, `index.ts`를 구현하고 `simulator.ts`와 `console.ts`를 고친다.** `index.ts`는 `define`, `parse`, `session`, `ios-console`의 공개 이름을 다시 내보낸다.
- [ ] **Step 4: 통과와 회귀를 확인한다** — `pnpm --filter @ping9/engine test` → 전부 PASS (기존 `simulator.test.ts`와 `simulator.property.test.ts` 포함).
- [ ] **Step 5: 기록 문서를 쓴다.** `docs/task-logs/T3.1.1-cli-modes-and-session.md`를 `_TEMPLATE.md` 형식으로 쓰고 `README.md` 목록에 한 줄을 더한다. "계획과 달라진 점"에 적을 것: ① 분담이 계층별에서 장비별로 바뀜, ② T1.6.1의 "명령 정의 형태와 해석기"를 여기서 만듦, ③ `no`를 처리기 필드가 아닌 일반 키워드로 정의함, ④ `serialize`는 T3.4.1에서 더함. "결과와 검증"에는 실제로 돌린 `pnpm check`의 출력을 붙인다.
- [ ] **Step 6: 검사와 커밋** — `pnpm check && pnpm check:secrets` → 통과. 커밋 `feat(T3.1.1): add CLI sessions, prompts and the IOS console` 과 `docs(T3.1.1): add the task log`.
- [ ] **Step 7: 사용자에게 확인한 뒤 push하고 PR을 연다.** 제목 `feat(T3.1.1): CLI modes, sessions and the IOS-style command parser`.

---

## 브랜치 B — `feat/T3.1.2-switch-basic-commands` (저장소 Task T3.1.2)

브랜치 A에서 가지를 친다. A의 PR이 병합되면 `origin/main`으로 rebase한다. 뒤의 브랜치도 같은 방식이다.

### Task 3: 기본 명령어와 Switch 콘솔 연결

**Files:**
- Create: `packages/engine/src/cli/ios/base-commands.ts`, `packages/engine/src/cli/switch/index.ts`
- Modify: `packages/engine/src/cli/ios/index.ts`, `packages/engine/src/console.ts`
- Test: `packages/engine/src/cli/switch/switch-console.test.ts`
- Create: `docs/task-logs/T3.1.2-switch-basic-commands.md`; Modify: `docs/task-logs/README.md`

**Interfaces:**
- Consumes: Task 1의 `defineCommand`, `param`; Task 2의 `linesFromDispatch`
- Produces:

```ts
// cli/ios/base-commands.ts — 장비 종류를 가리지 않는다. Router 담당도 이 목록을 쓴다
export const BASE_COMMANDS: readonly CommandDefinition[];
// cli/switch/index.ts
export const SWITCH_COMMANDS: readonly CommandDefinition[];   // 이 Task에서는 BASE_COMMANDS와 같다
```

`console.ts`의 `DEFINITIONS_BY_KIND`는 `{ switch: SWITCH_COMMANDS }`가 된다.

| 명령어 | 모드 | 결과 |
|---|---|---|
| `enable` | user | privileged로 |
| `disable` | privileged | user로 |
| `configure terminal` | privileged | config로 |
| `exit` | user | 그대로 |
| `exit` | privileged | user로 |
| `exit` | config | privileged로 |
| `exit` | config-if, config-vlan | config로 |
| `end` | privileged, config, config-if, config-vlan | privileged로 |
| `hostname <이름>` (`word`) | config | `device/rename { deviceId, name }`을 dispatch하고 `linesFromDispatch`의 줄을 돌려준다 |

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// switch-console.test.ts — 공개 인터페이스(createSimulator)로만 확인한다
async function run(port: ConsolePort, ...lines: string[]) {
  let result = { lines: [] as readonly ConsoleLine[], prompt: port.prompt() };
  for (const line of lines) result = await port.exec(line);
  return result;
}
const open = () => {
  const simulator = createSimulator();
  simulator.load(twoPcSwitchDocument);
  return { simulator, port: simulator.console(TWO_PC_SWITCH.sw1.id) };
};

test.each([
  [["enable"], "SW1#"],
  [["enable", "disable"], "SW1>"],
  [["enable", "configure terminal"], "SW1(config)#"],
  [["enable", "configure terminal", "exit"], "SW1#"],
  [["enable", "configure terminal", "end"], "SW1#"],
  [["enable", "exit"], "SW1>"],
  [["exit"], "SW1>"],
  [["ENABLE", "Configure   Terminal"], "SW1(config)#"],
])("%j 뒤의 프롬프트는 %s", async (lines, prompt) => {
  const { port } = open();
  expect((await run(port, ...lines)).prompt).toBe(prompt);
  expect(port.prompt()).toBe(prompt);
});

test("모드에 맞지 않는 명령은 CLI_WRONG_MODE", async () => {
  const { port } = open();
  expect(await run(port, "configure terminal")).toEqual({
    lines: [{ kind: "error", code: "CLI_WRONG_MODE", params: { token: "configure" }, position: 0 }],
    prompt: "SW1>",
  });
});

test("hostname은 device/rename을 dispatch한다 (처리기가 없는 동안은 그 오류가 그대로 나온다)", async () => {
  const { port } = open();
  expect(await run(port, "enable", "configure terminal", "hostname CORE")).toEqual({
    lines: [{ kind: "error", code: "UNKNOWN_COMMAND", params: { type: "device/rename" } }],
    prompt: "SW1(config)#",
  });
});

test("터미널을 닫았다 열어도(같은 ConsolePort를 다시 받아도) 모드가 남는다", async () => {
  const { simulator, port } = open();
  await run(port, "enable", "configure terminal");
  expect(simulator.console(TWO_PC_SWITCH.sw1.id).prompt()).toBe("SW1(config)#");
});

test("문서를 다시 불러오면 user 모드로 돌아간다", async () => {
  const { simulator, port } = open();
  await run(port, "enable", "configure terminal");
  simulator.load(twoPcSwitchDocument);
  expect(port.prompt()).toBe("SW1>");
});

test("PC의 콘솔은 그대로다", async () => {
  const { simulator } = open();
  expect(await simulator.console(TWO_PC_SWITCH.pc1.id).exec("enable")).toEqual({
    lines: [{ kind: "error", code: "CLI_UNKNOWN_COMMAND", params: { token: "enable" }, position: 0 }],
    prompt: "PC1>",
  });
});
```

- [ ] **Step 2: 실패를 확인한다** — `pnpm --filter @ping9/engine exec vitest run src/cli/switch` → FAIL.
- [ ] **Step 3: `base-commands.ts`와 `cli/switch/index.ts`를 표대로 구현하고 `console.ts`의 `DEFINITIONS_BY_KIND`에 Switch를 넣는다.**
- [ ] **Step 4: 통과와 회귀를 확인한다** — `pnpm --filter @ping9/engine test` → 전부 PASS. `simulator.property.test.ts`의 "불러온 직후 프롬프트는 `이름>`" 단정이 Switch에도 그대로 성립해야 한다.
- [ ] **Step 5: 기록 문서, 검사, 커밋** — `docs/task-logs/T3.1.2-switch-basic-commands.md`와 README 한 줄. "계획과 달라진 점": 기본 명령어를 `cli/switch`가 아니라 `cli/ios/base-commands.ts`에 두어 Router가 함께 쓰게 함. "남은 일": `hostname`은 `device/rename` 처리기가 들어와야 동작. `pnpm check && pnpm check:secrets` → 통과. 커밋 `feat(T3.1.2): add the base IOS commands and route switch consoles to the CLI`, `docs(T3.1.2): add the task log`.
- [ ] **Step 6: 사용자에게 확인한 뒤 push하고 PR을 연다.**

---

## 브랜치 C — `feat/T5.1.1-vlan-config` (저장소 Task T5.1.1)

### Task 4: `shared` — 오류 코드, 구성 읽기 함수, 예시 문서

**Files:**
- Modify: `packages/shared/src/codes.ts`, `packages/shared/src/index.ts`, `packages/shared/src/examples/index.ts`
- Create: `packages/shared/src/port-name.ts`, `packages/shared/src/switch-config.ts`, `packages/shared/src/examples/two-switch-vlan.ts`
- Test: `packages/shared/src/port-name.test.ts`, `packages/shared/src/switch-config.test.ts`, `packages/shared/src/examples/examples.test.ts`(수정)

**Interfaces — Produces:**

```ts
// codes.ts의 ErrorParamsByCode와 ERROR_CODE_SET에 더한다
VLAN_NOT_FOUND: { readonly deviceId: string; readonly vlanId: number };
DEFAULT_VLAN_READONLY: { readonly deviceId: string };

// port-name.ts
/** FastEthernet0/1 → Fa0/1, GigabitEthernet0/0 → Gi0/0, Ethernet0 → Eth0. 모르는 이름은 그대로 */
export function shortPortName(port: string): string;

// switch-config.ts
export const DEFAULT_VLAN_ID = 1;
export const DEFAULT_VLAN_NAME = "default";
export const ALL_VLANS: readonly VlanRange[];            // [[1, 4094]]
export interface EffectiveSwitchPort {
  readonly name: string;                                 // 전체 이름
  readonly adminUp: boolean;                             // 기본 true
  readonly mode: SwitchportMode;                         // 기본 "access"
  readonly accessVlan: number;                           // 기본 1
  readonly allowedVlans: readonly VlanRange[];           // 기본 ALL_VLANS
}
export function defaultVlanName(vlanId: number): string;                             // 10 → "VLAN0010"
export function switchPort(config: SwitchConfig, port: string): EffectiveSwitchPort;
export function switchPorts(config: SwitchConfig): readonly EffectiveSwitchPort[];   // PORT_NAMES.switch 순서
export function switchVlans(config: SwitchConfig): readonly Vlan[];                  // 번호 오름차순. VLAN 1이 없으면 { id: 1, name: "default" }를 넣어 돌려준다
export function vlanAccessPorts(config: SwitchConfig, vlanId: number): readonly string[];  // mode가 access이고 accessVlan이 vlanId인 포트의 전체 이름, 포트 순서

// examples/two-switch-vlan.ts
export const TWO_SWITCH_VLAN: {
  pc1, pc2, pc3, pc4: { id, name, ip }; sw1, sw2: { id, name }; mask: "255.255.255.0";
};
export const twoSwitchVlanDocument: TopologyDocument;
```

**예시 문서의 값** (시안과 같다):

| 장비 | 위치 | 구성 |
|---|---|---|
| PC1 | (110, 128) | 10.0.10.1 / 255.255.255.0 |
| PC2 | (110, 250) | 10.0.20.2 |
| PC3 | (750, 128) | 10.0.10.3 |
| PC4 | (750, 250) | 10.0.20.4 |
| SW1 | (300, 189) | VLAN 1 `default`, 10 `SALES`, 20 `DEV`. `FastEthernet0/1` access 10, `0/2` access 20, `0/8` trunk 허용 `[[10,10],[20,20]]` |
| SW2 | (560, 189) | VLAN은 SW1과 같음. `0/1` access 10, `0/2` access 20, `0/8` trunk 허용 `[[20,20]]` |

링크 5개: PC1–SW1 `Fa0/1`, PC2–SW1 `Fa0/2`, SW1 `Fa0/8`–SW2 `Fa0/8`, PC3–SW2 `Fa0/1`, PC4–SW2 `Fa0/2`. ID는 기존 예시처럼 `00000000-0000-4000-8000-0000000000xx` 형태로 서로 겹치지 않게 정한다. 포트 항목은 `{ adminUp: true, mode, accessVlan? , allowedVlans? }`이고 기본값인 필드(`accessVlan: 1` 등)는 적지 않는다. `EXAMPLE_DOCUMENTS`에 `{ name: "Switch 2대와 VLAN 2개", document: twoSwitchVlanDocument }`를 더한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// port-name.test.ts
test.each([
  ["FastEthernet0/1", "Fa0/1"], ["GigabitEthernet0/3", "Gi0/3"], ["Ethernet0", "Eth0"], ["Serial0/0", "Serial0/0"],
])("%s → %s", (full, short) => expect(shortPortName(full)).toBe(short));

// switch-config.test.ts
const sw1 = twoSwitchVlanDocument.devices.find((d) => d.name === "SW1")!.config as SwitchConfig;
const bare: SwitchConfig = { vlans: [], ports: {} };

test("구성에 없는 포트는 켜짐, access, VLAN 1, 전부 허용이다", () => {
  expect(switchPort(bare, "FastEthernet0/3")).toEqual({
    name: "FastEthernet0/3", adminUp: true, mode: "access", accessVlan: 1, allowedVlans: [[1, 4094]],
  });
});
test("구성에 있는 값은 그대로, 없는 값만 기본값으로 채운다", () => {
  expect(switchPort(sw1, "FastEthernet0/8")).toEqual({
    name: "FastEthernet0/8", adminUp: true, mode: "trunk", accessVlan: 1, allowedVlans: [[10, 10], [20, 20]],
  });
});
test("switchPorts는 8개를 포트 순서로 돌려준다", () => {
  expect(switchPorts(sw1).map((p) => p.name)).toEqual(PORT_NAMES.switch);
});
test("VLAN 1이 없는 문서에도 VLAN 1이 있다", () => {
  expect(switchVlans(bare)).toEqual([{ id: 1, name: "default" }]);
  expect(switchVlans({ vlans: [{ id: 20, name: "B" }, { id: 10, name: "A" }], ports: {} }).map((v) => v.id)).toEqual([1, 10, 20]);
});
test("VLAN별 포트에는 access 포트만 들어간다", () => {
  expect(vlanAccessPorts(sw1, 10)).toEqual(["FastEthernet0/1"]);
  expect(vlanAccessPorts(sw1, 1)).toEqual(["FastEthernet0/3", "FastEthernet0/4", "FastEthernet0/5", "FastEthernet0/6", "FastEthernet0/7"]);
  expect(vlanAccessPorts(sw1, 30)).toEqual([]);
});
test.each([[1, "VLAN0001"], [10, "VLAN0010"], [4094, "VLAN4094"]])("기본 이름 %i → %s", (id, name) => {
  expect(defaultVlanName(id)).toBe(name);
  expect(checkVlanName(name)).toBeNull();
});
```

`examples.test.ts`에 더한다: `twoSwitchVlanDocument`는 장비 6대(Switch 2, PC 4)와 링크 5개다. (`validateDocument` 통과는 기존 `test.each(EXAMPLE_DOCUMENTS)`가 확인한다.)

- [ ] **Step 2: 실패를 확인한다** — `pnpm --filter @ping9/shared test` → 새 테스트 FAIL.
- [ ] **Step 3: 구현한다.** `index.ts`에 `export * from "./port-name"; export * from "./switch-config";`를 더한다.
- [ ] **Step 4: 통과와 회귀를 확인한다** — `pnpm --filter @ping9/shared test && pnpm --filter @ping9/engine test` → 전부 PASS. engine의 `simulator.test.ts`와 속성 기반 테스트는 `EXAMPLE_DOCUMENTS`를 돌므로 새 예시도 함께 확인된다.
- [ ] **Step 5: 커밋** — `feat(T5.1.1): add VLAN error codes, switch config readers and the two-switch example`

### Task 5: `vlan/*` reducer와 정규화

**Files:**
- Create: `packages/engine/src/handlers/switch-common.ts`, `packages/engine/src/handlers/switch-vlan.ts`
- Modify: `packages/engine/src/reducer.ts`(처리기 세 줄), `packages/engine/src/simulator.test.ts`(dispatch 테스트)
- Test: `packages/engine/src/handlers/switch-vlan.test.ts`, `packages/engine/src/handlers/switch-vlan.property.test.ts`

**Interfaces:**
- Consumes: `reducer.ts`의 `CommandHandler`, `ReduceResult`(`import type`); Task 4의 `switchVlans`, `switchPort`, `defaultVlanName`, `ALL_VLANS`
- Produces:

```ts
// switch-common.ts
export type FoundSwitch =
  | { readonly ok: true; readonly device: SwitchDevice }
  | { readonly ok: false; readonly error: ErrorInfo };
export function findSwitch(document: TopologyDocument, deviceId: unknown): FoundSwitch;
export function normalizeSwitchConfig(config: SwitchConfig): SwitchConfig;
export function withSwitchConfig(document: TopologyDocument, deviceId: string, config: SwitchConfig): TopologyDocument;  // 정규화해서 끼운다
// switch-vlan.ts
export const createVlan: CommandHandler<"vlan/create">;
export const renameVlan: CommandHandler<"vlan/rename">;
export const removeVlan: CommandHandler<"vlan/remove">;
```

**규칙** (설계 5.2~5.4절):

- `findSwitch`: `deviceId`가 문자열이 아니거나 없는 장비면 `DEVICE_NOT_FOUND { deviceId: String(deviceId).slice(0, 64) }`. Switch가 아니면 `DEVICE_KIND_MISMATCH { deviceId, expected: "switch", actual }`.
- `normalizeSwitchConfig`: VLAN 1이 없으면 `{ id: 1, name: "default" }`를 넣는다. `vlans`는 번호 오름차순. 포트마다 `accessVlan`이 1이면 지우고, `allowedVlans`가 `[[1, 4094]]`이면 지우고, 남은 것이 `{ adminUp: true, mode: "access" }`뿐이면 그 포트 항목을 지운다. 두 번 적용해도 결과가 같다.
- 검사 순서. 처음 걸리는 오류를 돌려주고 Document는 바꾸지 않는다.
  - `vlan/create`: `findSwitch` → `checkVlanId` → 이미 있으면 `DUPLICATE_VLAN { deviceId, vlanId }` → `name`이 있으면 `checkVlanName` → `switchVlans(config).length >= 64`이면 `LIMIT_EXCEEDED { limit: "vlans", max: 64 }` → 추가. 이름이 없으면 `defaultVlanName(vlanId)`.
  - `vlan/rename`: `findSwitch` → `checkVlanId` → 1이면 `DEFAULT_VLAN_READONLY { deviceId }` → 없으면 `VLAN_NOT_FOUND { deviceId, vlanId }` → `checkVlanName` → 변경.
  - `vlan/remove`: `findSwitch` → `checkVlanId` → 1이면 `DEFAULT_VLAN_READONLY` → 없으면 `VLAN_NOT_FOUND` → 삭제. 포트의 `accessVlan`은 건드리지 않는다.
- "있다/없다"는 `switchVlans(config)` 기준이다 (VLAN 1은 항상 있다). 성공 결과의 `notices`는 `[]`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// switch-vlan.test.ts
const SW = TWO_PC_SWITCH.sw1.id, PC = TWO_PC_SWITCH.pc1.id;
const start = () => { const s = createSimulator(); s.load(twoPcSwitchDocument); return s; };
const vlansOf = (s: Simulator) =>
  (s.getSnapshot().document.devices.find((d) => d.id === SW)!.config as SwitchConfig).vlans;

test("VLAN을 만들면 번호순으로 들어가고 이름이 없으면 기본 이름이다", () => {
  const s = start();
  expect(s.dispatch({ type: "vlan/create", deviceId: SW, vlanId: 20, name: "DEV" })).toEqual({ ok: true, notices: [] });
  expect(s.dispatch({ type: "vlan/create", deviceId: SW, vlanId: 10 })).toEqual({ ok: true, notices: [] });
  expect(vlansOf(s)).toEqual([{ id: 1, name: "default" }, { id: 10, name: "VLAN0010" }, { id: 20, name: "DEV" }]);
});

test.each([
  [{ type: "vlan/create", deviceId: SW, vlanId: 0 }, { code: "INVALID_VLAN_ID", params: { value: 0 } }],
  [{ type: "vlan/create", deviceId: SW, vlanId: 4095 }, { code: "INVALID_VLAN_ID", params: { value: 4095 } }],
  [{ type: "vlan/create", deviceId: SW, vlanId: 1 }, { code: "DUPLICATE_VLAN", params: { deviceId: SW, vlanId: 1 } }],
  [{ type: "vlan/create", deviceId: SW, vlanId: 10, name: "a b" }, { code: "INVALID_VLAN_NAME", params: { value: "a b" } }],
  [{ type: "vlan/create", deviceId: PC, vlanId: 10 }, { code: "DEVICE_KIND_MISMATCH", params: { deviceId: PC, expected: "switch", actual: "pc" } }],
  [{ type: "vlan/create", deviceId: "nope", vlanId: 10 }, { code: "DEVICE_NOT_FOUND", params: { deviceId: "nope" } }],
  [{ type: "vlan/rename", deviceId: SW, vlanId: 1, name: "X" }, { code: "DEFAULT_VLAN_READONLY", params: { deviceId: SW } }],
  [{ type: "vlan/rename", deviceId: SW, vlanId: 30, name: "X" }, { code: "VLAN_NOT_FOUND", params: { deviceId: SW, vlanId: 30 } }],
  [{ type: "vlan/remove", deviceId: SW, vlanId: 1 }, { code: "DEFAULT_VLAN_READONLY", params: { deviceId: SW } }],
  [{ type: "vlan/remove", deviceId: SW, vlanId: 30 }, { code: "VLAN_NOT_FOUND", params: { deviceId: SW, vlanId: 30 } }],
])("%j는 거부되고 아무것도 바뀌지 않는다", (command, error) => {
  const s = start(); const before = s.getSnapshot();
  expect(s.dispatch(command as Command)).toEqual({ ok: false, error });
  expect(s.getSnapshot()).toBe(before);
});

test("경계 번호 1과 4094 사이는 만들 수 있다", () => {
  const s = start();
  expect(s.dispatch({ type: "vlan/create", deviceId: SW, vlanId: 4094 }).ok).toBe(true);
  expect(s.dispatch({ type: "vlan/create", deviceId: SW, vlanId: 2 }).ok).toBe(true);
});

test("VLAN은 Switch당 64개까지다 (VLAN 1 포함)", () => {
  const s = start();
  for (let id = 2; id <= 64; id += 1) expect(s.dispatch({ type: "vlan/create", deviceId: SW, vlanId: id }).ok).toBe(true);
  expect(s.dispatch({ type: "vlan/create", deviceId: SW, vlanId: 65 })).toEqual({
    ok: false, error: { code: "LIMIT_EXCEEDED", params: { limit: "vlans", max: 64 } },
  });
});

test("이름을 바꾸고 지울 수 있다", () => {
  const s = start();
  s.dispatch({ type: "vlan/create", deviceId: SW, vlanId: 10 });
  expect(s.dispatch({ type: "vlan/rename", deviceId: SW, vlanId: 10, name: "SALES" }).ok).toBe(true);
  expect(vlansOf(s)).toEqual([{ id: 1, name: "default" }, { id: 10, name: "SALES" }]);
  expect(s.dispatch({ type: "vlan/remove", deviceId: SW, vlanId: 10 }).ok).toBe(true);
  expect(vlansOf(s)).toEqual([{ id: 1, name: "default" }]);
});

test("VLAN을 지워도 그 VLAN을 쓰던 포트의 값은 남는다", () => {
  const s = createSimulator(); s.load(twoSwitchVlanDocument);
  const id = TWO_SWITCH_VLAN.sw1.id;
  expect(s.dispatch({ type: "vlan/remove", deviceId: id, vlanId: 10 }).ok).toBe(true);
  const config = s.getSnapshot().document.devices.find((d) => d.id === id)!.config as SwitchConfig;
  expect(config.ports["FastEthernet0/1"]).toEqual({ adminUp: true, mode: "access", accessVlan: 10 });
});

test("예시 문서의 Switch 구성은 이미 정규화된 형태다", () => {
  for (const device of twoSwitchVlanDocument.devices) {
    if (device.kind === "switch") expect(normalizeSwitchConfig(device.config)).toEqual(device.config);
  }
});

test("정규화는 기본값과 같은 설정을 지운다", () => {
  expect(normalizeSwitchConfig({
    vlans: [{ id: 20, name: "B" }],
    ports: {
      "FastEthernet0/1": { adminUp: true, mode: "access", accessVlan: 1, allowedVlans: [[1, 4094]] },
      "FastEthernet0/2": { adminUp: false, mode: "access" },
    },
  })).toEqual({
    vlans: [{ id: 1, name: "default" }, { id: 20, name: "B" }],
    ports: { "FastEthernet0/2": { adminUp: false, mode: "access" } },
  });
});
```

```ts
// switch-vlan.property.test.ts — 임의의 Command 열 (deviceId는 SW/PC/"nope", vlanId는 -1..70과 4094, 4095, name은 "", "A", "a b", 33자)
// 을 twoSwitchVlanDocument에 차례로 dispatch한다. numRuns 300, seed 20261105.
// 단정: 예외가 없다. 매 단계 validateDocument(snapshot.document).ok === true.
//       거부되면 스냅샷 참조가 그대로다. 마지막 Switch 구성에 normalizeSwitchConfig를 적용해도 같다.
```

`simulator.test.ts`의 `describe("dispatch")` 첫 테스트를 둘로 나눈다:

```ts
/** 처리기가 들어온 Command. 처리기를 더하는 사람이 여기에 자기 type을 더한다 */
const HANDLED_TYPES: readonly string[] = ["vlan/create", "vlan/rename", "vlan/remove"];

test.each(COMMAND_TYPES.filter((type) => !HANDLED_TYPES.includes(type)))(
  "%s: 처리기가 아직 없어 오류 결과로 돌려주고 예외를 던지지 않는다", /* 본문은 그대로 */);

test.each(HANDLED_TYPES)("%s: 필드가 빠진 Command도 예외 없이 거부한다", (type) => {
  const simulator = createSimulator(); simulator.load(twoPcSwitchDocument);
  const before = simulator.getSnapshot();
  expect(simulator.dispatch({ type } as Command).ok).toBe(false);
  expect(simulator.getSnapshot()).toBe(before);
});
```

- [ ] **Step 2: 실패를 확인한다** — `pnpm --filter @ping9/engine exec vitest run src/handlers` → FAIL.
- [ ] **Step 3: 구현하고 `reducer.ts`의 `handlers`에 `"vlan/create": createVlan, "vlan/rename": renameVlan, "vlan/remove": removeVlan`을 넣는다.**
- [ ] **Step 4: 통과와 회귀를 확인한다** — `pnpm --filter @ping9/engine test` → 전부 PASS.
- [ ] **Step 5: 커밋** — `feat(T5.1.1): handle vlan/create, vlan/rename and vlan/remove in the reducer`

### Task 6: `vlan`, `name`, `no vlan`, `show vlan brief`

**Files:**
- Create: `packages/engine/src/cli/switch/vlan-commands.ts`, `packages/engine/src/cli/switch/show-vlan.ts`
- Modify: `packages/engine/src/cli/switch/index.ts`, `packages/engine/src/cli/ios/session.ts`(`effectiveSession`이 `switchVlans`를 쓰게)
- Test: `packages/engine/src/cli/switch/vlan-commands.test.ts`, `packages/engine/src/cli/switch/show-vlan.test.ts`
- Create: `docs/task-logs/T5.1.1-vlan-config.md`; Modify: `docs/task-logs/README.md`

**Interfaces:**
- Consumes: Task 1~5의 이름 전부
- Produces:

```ts
// show-vlan.ts
export function showVlanBriefLines(config: SwitchConfig): readonly string[];
// vlan-commands.ts
export const VLAN_COMMANDS: readonly CommandDefinition[];
// cli/switch/index.ts
export const SWITCH_COMMANDS = [...BASE_COMMANDS, ...VLAN_COMMANDS];
```

| 명령어 | 모드 | 동작 |
|---|---|---|
| `vlan <번호>` | config (하위 모드에서도 됨) | 있으면 `{ mode: "config-vlan", targetVlan }`로. 없으면 `vlan/create`를 dispatch하고, 성공하면 들어가고 실패하면 오류 줄만 내고 모드는 그대로 |
| `no vlan <번호>` | config | `vlan/remove` |
| `name <이름>` | config-vlan | `vlan/rename { vlanId: session.targetVlan, name }` |
| `show vlan brief`, `show vlan` | privileged | `showVlanBriefLines`의 줄을 `{ kind: "text", text }`로 |

**`show vlan brief`의 형식** (설계 7.5절): 열은 `VLAN`, `Name`, `Status`, `Ports`. 앞의 세 열의 너비는 머리글과 값 중 가장 긴 것, 열 사이는 공백 2칸. `Status`는 항상 `active`. `Ports`는 `vlanAccessPorts`의 포트를 `shortPortName`으로 줄여 `, `로 잇되 한 줄에 3개까지 쓰고, 넘으면 `Ports` 열의 시작 위치까지 공백을 채운 다음 줄에 잇는다. 줄 끝의 공백은 지운다. VLAN은 `switchVlans` 순서다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// show-vlan.test.ts
test("새 Switch: VLAN 1에 포트 8개가 3개씩 나뉘어 나온다", () => {
  expect(showVlanBriefLines({ vlans: [{ id: 1, name: "default" }], ports: {} })).toEqual([
    "VLAN  Name     Status  Ports",
    "1     default  active  Fa0/1, Fa0/2, Fa0/3",
    "                       Fa0/4, Fa0/5, Fa0/6",
    "                       Fa0/7, Fa0/8",
  ]);
});
test("예시 SW1: trunk 포트는 나오지 않고, 포트가 없는 VLAN은 줄 끝에 공백이 없다", () => {
  const sw1 = twoSwitchVlanDocument.devices.find((d) => d.name === "SW1")!.config as SwitchConfig;
  expect(showVlanBriefLines({ ...sw1, vlans: [...sw1.vlans, { id: 30, name: "LAB" }] })).toEqual([
    "VLAN  Name     Status  Ports",
    "1     default  active  Fa0/3, Fa0/4, Fa0/5",
    "                       Fa0/6, Fa0/7",
    "10    SALES    active  Fa0/1",
    "20    DEV      active  Fa0/2",
    "30    LAB      active",
  ]);
});
test("VLAN 1이 없는 구성에도 VLAN 1 줄이 나온다", () => {
  expect(showVlanBriefLines({ vlans: [], ports: {} })[1]).toBe("1     default  active  Fa0/1, Fa0/2, Fa0/3");
});
test("VLAN 64개와 32자 이름에서도 모든 줄의 Status 열 위치가 같다", () => {
  const vlans = Array.from({ length: 64 }, (_, i) => ({ id: i === 0 ? 1 : 4030 + i, name: i === 0 ? "default" : "N".repeat(32) }));
  const lines = showVlanBriefLines({ vlans, ports: {} });
  const column = lines[0]!.indexOf("Status");
  const rows = lines.filter((line) => /^[0-9]/.test(line));
  expect(rows).toHaveLength(64);
  for (const row of rows) expect(row.slice(column, column + 6)).toBe("active");
});

// vlan-commands.test.ts — Task 3의 run/open 도우미와 Task 5의 vlansOf를 같은 모양으로 쓴다 (twoPcSwitchDocument, SW1)
const CONFIG = ["enable", "configure terminal"];

test("vlan 10 → name SALES → end → show vlan brief", async () => {
  const { simulator, port } = open();
  expect((await run(port, ...CONFIG, "vlan 10")).prompt).toBe("SW1(config-vlan)#");
  expect(await run(port, "name SALES")).toEqual({ lines: [], prompt: "SW1(config-vlan)#" });
  expect(await run(port, "end", "show vlan brief")).toEqual({
    lines: [
      "VLAN  Name     Status  Ports",
      "1     default  active  Fa0/1, Fa0/2, Fa0/3",
      "                       Fa0/4, Fa0/5, Fa0/6",
      "                       Fa0/7, Fa0/8",
      "10    SALES    active",
    ].map((text) => ({ kind: "text", text })),
    prompt: "SW1#",
  });
  expect(vlansOf(simulator)).toEqual([{ id: 1, name: "default" }, { id: 10, name: "SALES" }]);
});

test("show vlan은 show vlan brief와 같다", async () => {
  const { port } = open();
  expect((await run(port, "enable", "show vlan")).lines).toEqual((await run(port, "show vlan brief")).lines);
});

test("이미 있는 VLAN은 만들지 않고 들어가기만 한다", async () => {
  const { simulator, port } = open();
  await run(port, ...CONFIG, "vlan 10", "exit");
  const version = simulator.getSnapshot().docVersion;
  expect(await run(port, "vlan 10")).toEqual({ lines: [], prompt: "SW1(config-vlan)#" });
  expect(simulator.getSnapshot().docVersion).toBe(version);
});

test("config-vlan에서 다른 vlan 명령을 치면 그 VLAN으로 옮겨 간다", async () => {
  const { simulator, port } = open();
  expect((await run(port, ...CONFIG, "vlan 10", "vlan 20", "name DEV")).prompt).toBe("SW1(config-vlan)#");
  expect(vlansOf(simulator)).toEqual([{ id: 1, name: "default" }, { id: 10, name: "VLAN0010" }, { id: 20, name: "DEV" }]);
});

test("no vlan으로 지우고, VLAN 1은 지울 수 없다", async () => {
  const { simulator, port } = open();
  expect(await run(port, ...CONFIG, "vlan 10", "exit", "no vlan 10")).toEqual({ lines: [], prompt: "SW1(config)#" });
  expect(vlansOf(simulator)).toEqual([{ id: 1, name: "default" }]);
  expect(await run(port, "no vlan 1")).toEqual({
    lines: [{ kind: "error", code: "DEFAULT_VLAN_READONLY", params: { deviceId: TWO_PC_SWITCH.sw1.id } }],
    prompt: "SW1(config)#",
  });
});

test("VLAN 1의 이름은 바꿀 수 없다", async () => {
  const { port } = open();
  expect(await run(port, ...CONFIG, "vlan 1", "name CORE")).toEqual({
    lines: [{ kind: "error", code: "DEFAULT_VLAN_READONLY", params: { deviceId: TWO_PC_SWITCH.sw1.id } }],
    prompt: "SW1(config-vlan)#",
  });
});

test("한도를 넘는 vlan은 오류가 나고 config 모드에 남는다", async () => {
  const { simulator, port } = open();
  for (let id = 2; id <= 64; id += 1) simulator.dispatch({ type: "vlan/create", deviceId: TWO_PC_SWITCH.sw1.id, vlanId: id });
  expect(await run(port, ...CONFIG, "vlan 65")).toEqual({
    lines: [{ kind: "error", code: "LIMIT_EXCEEDED", params: { limit: "vlans", max: 64 } }],
    prompt: "SW1(config)#",
  });
});

test("틀린 번호는 Document를 바꾸지 않는다", async () => {
  const { simulator, port } = open();
  await run(port, ...CONFIG);
  const before = simulator.getSnapshot();
  for (const line of ["vlan 0", "vlan 4095", "vlan 1e1", "vlan -1", "vlan 10.0", "vlan"]) {
    expect((await port.exec(line)).lines[0]).toMatchObject({ kind: "error" });
  }
  expect(simulator.getSnapshot()).toBe(before);
});

test("config-vlan에 있는 동안 그 VLAN이 다른 경로로 지워지면 config 모드로 돌아간다", async () => {
  const { simulator, port } = open();
  await run(port, ...CONFIG, "vlan 10");
  simulator.dispatch({ type: "vlan/remove", deviceId: TWO_PC_SWITCH.sw1.id, vlanId: 10 });
  expect(port.prompt()).toBe("SW1(config)#");
  expect(await run(port, "name X")).toEqual({
    lines: [{ kind: "error", code: "CLI_WRONG_MODE", params: { token: "name" }, position: 0 }],
    prompt: "SW1(config)#",
  });
});
```

- [ ] **Step 2: 실패를 확인한다** — `pnpm --filter @ping9/engine exec vitest run src/cli/switch` → FAIL.
- [ ] **Step 3: 구현한다.**
- [ ] **Step 4: 통과와 회귀를 확인한다** — `pnpm --filter @ping9/engine test` → 전부 PASS.
- [ ] **Step 5: 기록 문서, 검사, 커밋** — `docs/task-logs/T5.1.1-vlan-config.md`와 README 한 줄. "계획과 달라진 점": `shared`에 오류 코드 2개와 구성 읽기 함수를 더함(팀 확인 필요), E3이 끝나기 전에 T5.1.1을 함, `show running-config` 직렬화와 왕복 테스트는 T3.4.1로 미룸. `pnpm check && pnpm check:secrets` → 통과. 커밋 `feat(T5.1.1): add the vlan, name, no vlan and show vlan brief commands`, `docs(T5.1.1): add the task log`.
- [ ] **Step 6: 사용자에게 확인한 뒤 push하고 PR을 연다.** PR 설명에 `shared`가 바뀌었으니 두 팀원 모두의 확인이 필요하다고 적는다.

---

## 브랜치 D — `feat/T5.4.1-switch-screen` (저장소 Task T5.4.1, 계획 문서에 없는 새 ID)

### Task 7: 화면 틀과 읽기 전용 캔버스

**Files:**
- Modify: `apps/web/index.html`, `apps/web/src/index.css`, `apps/web/src/app.tsx`, `apps/web/src/app.test.tsx`
- Create: `apps/web/public/logo.png`, `apps/web/src/styles/editor.css`, `apps/web/src/simulator.ts`, `apps/web/src/ui-state.ts`, `apps/web/src/components/top-bar.tsx`, `palette.tsx`, `canvas.tsx`
- Test: `apps/web/src/ui-state.test.ts`, `apps/web/src/components/canvas.test.tsx`

**Interfaces — Produces:**

```ts
// simulator.ts
export const simulator: Simulator;            // 모듈이 처음 불릴 때 twoSwitchVlanDocument를 load한다
export function useSnapshot(): Snapshot;      // useSyncExternalStore(simulator.subscribe, simulator.getSnapshot, simulator.getSnapshot)

// ui-state.ts
export interface TerminalPlacement { readonly deviceId: string; readonly x: number; readonly y: number; readonly hidden: boolean }
export interface UiState {
  readonly selectedDeviceId: string | null;
  readonly terminals: readonly TerminalPlacement[];   // 배열의 뒤쪽이 위에 그려진다
}
export const INITIAL_UI_STATE: UiState;               // { selectedDeviceId: null, terminals: [] }
export type UiAction =
  | { readonly type: "select"; readonly deviceId: string | null }
  | { readonly type: "open-terminal"; readonly deviceId: string }    // 없으면 (120 + 30n, 40 + 30n)에 만들고, 있으면 hidden을 풀고 맨 위로
  | { readonly type: "close-terminal"; readonly deviceId: string }   // hidden만 true로
  | { readonly type: "focus-terminal"; readonly deviceId: string }   // 맨 위로
  | { readonly type: "move-terminal"; readonly deviceId: string; readonly x: number; readonly y: number }
  | { readonly type: "sync"; readonly deviceIds: readonly string[] };  // 문서에 없는 장비의 선택과 터미널을 지운다
export function uiReducer(state: UiState, action: UiAction): UiState;

// components
export function TopBar(props: { readonly name: string }): JSX.Element;
export function Palette(props: { readonly deviceCount: number }): JSX.Element;
export function Canvas(props: {
  readonly document: TopologyDocument; readonly selectedDeviceId: string | null;
  readonly onSelect: (deviceId: string) => void; readonly onOpenTerminal: (deviceId: string) => void;
}): JSX.Element;
```

**만드는 방법:**

- `editor.css`: 시안(`docs/superpowers/specs/2026-11-05-switch-vlan-mockup.html`)의 `<style>`에서 `:root` 변수, 초기화 규칙, `.app`, `.topbar`와 그 안, `.work`, `.palette`, `.tool`, `.quota`, `.canvas`, `.topo`, `.node`, `.wire`, `.hint`, `.term*`, `.inspector`와 그 안, `.chip`, `.if-row`, `.dot`, `.route`, `.open-term`, `.vtag`, `.v1`·`.v10`·`.v20`·`.vt`, `.mac`, `.term-body .pre`, `.if-row .ip`를 **값을 바꾸지 않고** 옮긴다. `.banner`, `.rt-bar`, `.sim`과 그 안, `.ev*`, `.frame`, `.layer`, `.reason`, `.wire.trunk`, `.vlabel`은 옮기지 않는다. `.app`의 `grid-template-rows`는 하단 줄이 없으므로 `64px 1fr`로 한다.
- `index.css`: 자리표시 화면의 규칙을 지우고 `@import "./styles/editor.css";`만 둔다.
- `index.html`: 시안 `<head>`의 글꼴 `<link>` 두 줄(Pretendard, Nunito와 JetBrains Mono)을 그대로 넣는다. `<meta name="robots" content="noindex">`는 둔다.
- `logo.png`: 시안의 `.brand .tile img`의 `src`(data URI)를 디코딩해 파일로 저장한다. `<img src="/logo.png" alt="">`로 쓴다.
- `TopBar`: 시안의 `<header class="topbar">`와 같은 마크업. `.saved` 표시는 넣지 않는다(저장 기능이 없다). 내보내기, 가져오기, 모드 전환 두 버튼, ping 실행 버튼은 `disabled`다.
- `Palette`: 시안의 `<aside class="palette">`와 같은 마크업과 SVG 아이콘. `.tool`은 끌 수 없다(`cursor: default`를 인라인으로). 장비 수는 `장비 {deviceCount} / {LIMITS.maxDevices}`, 막대 너비는 그 비율이다.
- `Canvas`: 시안의 노드 그리기 코드(`ICON`, 카드 80×72 `rx` 16, 종류별 `badge-p|s|r`, 이름, PC는 카드 아래에 IP)를 React로 옮긴다. 링크는 양 끝 장비 위치를 잇는 `<line class="wire">`. `viewBox`는 `0 0 860 330`을 기본으로 하고 장비 위치가 벗어나면 모든 장비가 60의 여백과 함께 들어오도록 넓힌다. 노드는 클릭으로 `onSelect`, 더블클릭으로 `onOpenTerminal`. 노드의 `className`은 `node`, 선택된 노드는 정확히 `node sel`이다. 오른쪽 위에 시안의 `.hint` 문구.
- `App`: `<div class="app"><TopBar name="VLAN 실습 1"/><main class="work"><Palette/><section class="canvas"><Canvas/>…터미널(Task 8)</section><aside class="inspector">…(Task 9)</aside></main></div>`. `useReducer(uiReducer, INITIAL_UI_STATE)`. 스냅샷의 `docVersion`이 바뀔 때 `sync`를 보낸다. 이 Task에서는 속성 패널 자리를 비워 둔다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// ui-state.test.ts
test("터미널을 열면 뒤에 붙고, 다시 열면 숨김이 풀리며 맨 위로 온다", () => {
  let s = uiReducer(INITIAL_UI_STATE, { type: "open-terminal", deviceId: "a" });
  s = uiReducer(s, { type: "open-terminal", deviceId: "b" });
  expect(s.terminals).toEqual([
    { deviceId: "a", x: 120, y: 40, hidden: false }, { deviceId: "b", x: 150, y: 70, hidden: false },
  ]);
  s = uiReducer(s, { type: "close-terminal", deviceId: "a" });
  expect(s.terminals[0]).toEqual({ deviceId: "a", x: 120, y: 40, hidden: true });
  s = uiReducer(s, { type: "open-terminal", deviceId: "a" });
  expect(s.terminals.map((t) => [t.deviceId, t.hidden])).toEqual([["b", false], ["a", false]]);
});
test("옮기기와 맨 위로 올리기", () => {
  let s = uiReducer(INITIAL_UI_STATE, { type: "open-terminal", deviceId: "a" });
  s = uiReducer(s, { type: "open-terminal", deviceId: "b" });
  s = uiReducer(s, { type: "move-terminal", deviceId: "a", x: 5, y: 6 });
  s = uiReducer(s, { type: "focus-terminal", deviceId: "a" });
  expect(s.terminals).toEqual([
    { deviceId: "b", x: 150, y: 70, hidden: false }, { deviceId: "a", x: 5, y: 6, hidden: false },
  ]);
});
test("문서에서 사라진 장비의 선택과 터미널을 지운다", () => {
  let s = uiReducer(INITIAL_UI_STATE, { type: "select", deviceId: "a" });
  s = uiReducer(s, { type: "open-terminal", deviceId: "a" });
  s = uiReducer(s, { type: "open-terminal", deviceId: "b" });
  expect(uiReducer(s, { type: "sync", deviceIds: ["b"] })).toEqual({
    selectedDeviceId: null, terminals: [{ deviceId: "b", x: 150, y: 70, hidden: false }],
  });
});
test("없는 터미널을 가리키는 동작은 상태를 그대로 돌려준다", () => {
  expect(uiReducer(INITIAL_UI_STATE, { type: "close-terminal", deviceId: "x" })).toBe(INITIAL_UI_STATE);
});

// canvas.test.tsx
test("예시 문서의 장비 6대와 링크 5개를 그리고 선택한 장비를 표시한다", () => {
  const html = renderToString(
    <Canvas document={twoSwitchVlanDocument} selectedDeviceId={TWO_SWITCH_VLAN.sw1.id} onSelect={() => {}} onOpenTerminal={() => {}} />,
  );
  for (const name of ["PC1", "PC2", "PC3", "PC4", "SW1", "SW2"]) expect(html).toContain(`>${name}<`);
  expect(html.match(/class="wire"/g)).toHaveLength(5);
  expect(html.match(/class="node sel"/g)).toHaveLength(1);
  expect(html).toContain("10.0.10.1");
});

// app.test.tsx (기존 테스트를 바꾼다)
test("편집기 화면이 예시 토폴로지를 그린다", () => {
  const html = renderToString(<App />).replaceAll("<!-- -->", "");
  expect(html).toContain("VLAN 실습 1");
  expect(html).toContain("장비 6 / 50");
  expect(html).toContain(">SW1<");
});
```

- [ ] **Step 2: 실패를 확인한다** — `pnpm --filter @ping9/web test` → FAIL.
- [ ] **Step 3: 위 "만드는 방법"대로 구현한다.**
- [ ] **Step 4: 통과를 확인한다** — `pnpm --filter @ping9/web test && pnpm --filter @ping9/web typecheck && pnpm --filter @ping9/web build` → 통과.
- [ ] **Step 5: 눈으로 확인한다** — `pnpm dev`로 띄우고 브라우저에서 시안과 나란히 본다. 상단 막대, 장비 목록, 점무늬 캔버스, 노드 카드의 색·모서리·글꼴이 시안과 같아야 한다. 다른 곳이 있으면 CSS를 시안의 값으로 되돌린다.
- [ ] **Step 6: 커밋** — `feat(T5.4.1): add the editor shell and a read-only canvas styled from the mockup`

### Task 8: 터미널 창과 한국어 문구

**Files:**
- Create: `apps/web/src/terminal/terminal-state.ts`, `apps/web/src/messages/errors.ts`, `apps/web/src/messages/notices.ts`, `apps/web/src/components/terminal-window.tsx`
- Modify: `apps/web/src/app.tsx`
- Test: `apps/web/src/terminal/terminal-state.test.ts`, `apps/web/src/messages/messages.test.ts`, `apps/web/src/components/terminal-window.test.tsx`

**Interfaces — Produces:**

```ts
// terminal-state.ts
export type TerminalLine =
  | { readonly kind: "input"; readonly prompt: string; readonly text: string }
  | { readonly kind: "text" | "error" | "notice"; readonly text: string };
export interface TerminalState {
  readonly lines: readonly TerminalLine[];     // 최대 5,000줄. 넘으면 앞에서부터 버린다
  readonly prompt: string;
  readonly history: readonly string[];         // 실행한 줄. 빈 줄과 바로 앞과 같은 줄은 넣지 않는다
  readonly historyIndex: number | null;        // null이면 새 줄을 쓰는 중
}
export function initialTerminal(prompt: string): TerminalState;
export function cleanInput(text: string): string;                              // 제어 문자(U+0000~001F, U+007F~009F)를 지우고 512자로 자른다
export function submitted(state: TerminalState, input: string): TerminalState; // 입력 줄을 기록하고 history에 넣는다
export function received(state: TerminalState, result: ConsoleResult): TerminalState;
export function historyStep(state: TerminalState, direction: "up" | "down"): { readonly state: TerminalState; readonly input: string };
export function runLine(port: ConsolePort, state: TerminalState, input: string): Promise<TerminalState>;  // cleanInput → submitted → exec → received

// messages
export const ERROR_MESSAGES: { readonly [C in ErrorCode]: (params: ErrorParamsByCode[C]) => string };
export function formatError(error: ErrorInfo): string;
export const NOTICE_MESSAGES: { readonly [C in NoticeCode]: (params: NoticeParamsByCode[C]) => string };
export function formatNotice(notice: Notice): string;

// terminal-window.tsx
export function TerminalWindow(props: {
  readonly deviceName: string; readonly kindLabel: "PC" | "Switch" | "Router";
  readonly state: TerminalState; readonly placement: TerminalPlacement; readonly zIndex: number;
  readonly onSubmit: (input: string) => void; readonly onHistory: (direction: "up" | "down") => string;
  readonly onClose: () => void; readonly onFocus: () => void; readonly onMove: (x: number, y: number) => void;
}): JSX.Element;
```

**규칙:**

- `received`: `text` 줄은 그대로, `error` 줄은 `formatError`, `notice` 줄은 `formatNotice`, `trace` 줄은 버린다(이 범위에 없다). 프롬프트를 `result.prompt`로 바꾼다.
- `historyStep`: `up`은 이전 명령으로, 맨 처음에서는 멈춘다. `down`은 다음 명령으로, 마지막을 지나면 `historyIndex`가 `null`이 되고 입력은 `""`다.
- 문구: 모든 오류 코드와 알림 코드에 한국어 한 문장. 값은 `params`에서 넣는다. 예: `CLI_UNKNOWN_COMMAND` → `` `알 수 없는 명령어예요: ${token}` ``, `CLI_WRONG_MODE` → `` `이 모드에서는 쓸 수 없는 명령어예요: ${token}` ``, `CLI_INCOMPLETE_COMMAND` → `명령어가 끝나지 않았어요`, `INVALID_VLAN_ID` → `` `VLAN 번호는 1~4094여야 해요: ${value}` ``, `DEFAULT_VLAN_READONLY` → `VLAN 1은 지우거나 이름을 바꿀 수 없어요`, `LIMIT_EXCEEDED`(`vlans`) → `` `VLAN은 Switch 하나에 ${max}개까지 만들 수 있어요` ``, `VLAN_AUTO_CREATED` → `` `VLAN ${vlanId}이 없어서 새로 만들었어요` ``. 나머지는 같은 말투(~예요/~해요)로 쓴다. 문구에는 `params`의 값만 넣고 HTML을 넣지 않는다.
- `TerminalWindow`: 시안의 `.term` 마크업(`.term-bar`의 이름·종류 칩·닫기 버튼, `.term-body`, `.term-in`의 프롬프트와 `<input spellcheck={false}>`). `input` 줄은 `<span class="p">프롬프트</span> 글`, `text`는 `class="pre"`, `error`는 `class="err"`, `notice`는 `class="dim"`. 글은 React의 글자 노드로만 넣는다 (`dangerouslySetInnerHTML`을 쓰지 않는다). Enter는 `onSubmit`(빈 줄도 보낸다), 위·아래 화살표는 `onHistory`의 결과로 입력란을 바꾼다. 제목 막대를 끌면 캔버스 안에서만 움직이고(시안의 `wireTerm`과 같은 범위 계산) 놓을 때가 아니라 움직이는 동안 `onMove`를 부른다. 크기는 CSS `resize: both`. 줄이 더해지면 `.term-body`를 맨 아래로 내린다. `placement.hidden`이면 `hidden` 클래스.
- `App`: 장비별 `TerminalState`를 `useState<Readonly<Record<string, TerminalState>>>`로 둔다 (닫았다 열어도 남는다). 터미널을 처음 열 때 `initialTerminal(simulator.console(id).prompt())`. `onSubmit`은 **장비별로 앞 실행이 끝난 뒤에 다음을 실행**한다: 장비별 `Promise` 사슬(`useRef<Map<string, Promise<void>>>`)에 `runLine`을 이어 붙이고, 사슬 안에서는 그 시점의 최신 상태를 읽어 쓴다. `kindLabel`은 장비 종류에서 정한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// terminal-state.test.ts
const port = () => { const s = createSimulator(); s.load(twoSwitchVlanDocument); return s.console(TWO_SWITCH_VLAN.sw1.id); };

test("명령을 실행하면 입력 줄, 출력 줄, 새 프롬프트가 남는다", async () => {
  const p = port();
  let state = initialTerminal(p.prompt());
  state = await runLine(p, state, "enable");
  state = await runLine(p, state, "show vlan brief");
  expect(state.prompt).toBe("SW1#");
  expect(state.lines.slice(0, 3)).toEqual([
    { kind: "input", prompt: "SW1>", text: "enable" },
    { kind: "input", prompt: "SW1#", text: "show vlan brief" },
    { kind: "text", text: "VLAN  Name     Status  Ports" },
  ]);
  expect(state.history).toEqual(["enable", "show vlan brief"]);
});
test("오류는 한국어 한 줄이 된다", async () => {
  const p = port();
  const state = await runLine(p, initialTerminal(p.prompt()), "vlan 10");
  expect(state.lines.at(-1)).toEqual({ kind: "error", text: "이 모드에서는 쓸 수 없는 명령어예요: vlan" });
});
test("HTML처럼 생긴 입력도 글자 그대로 기록한다", async () => {
  const p = port();
  const state = await runLine(p, initialTerminal(p.prompt()), "<img src=x onerror=alert(1)>");
  expect(state.lines[0]).toEqual({ kind: "input", prompt: "SW1>", text: "<img src=x onerror=alert(1)>" });
});
test("제어 문자를 지우고 512자로 자른다", () => {
  expect(cleanInput("en\u0007ab\u001b[31mle\u0000")).toBe("enab[31mle");
  expect(cleanInput("x".repeat(600))).toHaveLength(512);
});
test("빈 줄과 바로 앞과 같은 줄은 이력에 넣지 않는다", () => {
  let state = initialTerminal("SW1>");
  for (const line of ["enable", "enable", "", "exit"]) state = submitted(state, line);
  expect(state.history).toEqual(["enable", "exit"]);
});
test("위·아래로 이전 명령어를 오간다", () => {
  let state = initialTerminal("SW1>");
  for (const line of ["a", "b"]) state = submitted(state, line);
  const steps: string[] = [];
  for (const direction of ["up", "up", "up", "down", "down"] as const) {
    const next = historyStep(state, direction); state = next.state; steps.push(next.input);
  }
  expect(steps).toEqual(["b", "a", "a", "b", ""]);
});
test("연달아 실행해도 줄의 순서가 입력 순서와 같다", async () => {
  const p = port();
  let state = initialTerminal(p.prompt());
  let chain = Promise.resolve();
  for (const line of ["enable", "configure terminal", "vlan 30", "end"]) {
    chain = chain.then(async () => { state = await runLine(p, state, line); });
  }
  await chain;
  expect(state.lines.filter((l) => l.kind === "input").map((l) => l.text)).toEqual(["enable", "configure terminal", "vlan 30", "end"]);
  expect(state.prompt).toBe("SW1#");
});
test("화면 기록은 5,000줄을 넘지 않는다", () => {
  let state = initialTerminal("SW1>");
  for (let i = 0; i < 5100; i += 1) state = submitted(state, `line ${i}`);
  expect(state.lines).toHaveLength(5000);
  expect(state.lines.at(-1)).toEqual({ kind: "input", prompt: "SW1>", text: "line 5099" });
});

// messages.test.ts
test.each(ERROR_CODES)("%s: 문구가 있고 비어 있지 않다", (code) => {
  expect(typeof ERROR_MESSAGES[code]).toBe("function");
});
test.each(NOTICE_CODES)("%s: 문구가 있다", (code) => {
  expect(typeof NOTICE_MESSAGES[code]).toBe("function");
});
test("값이 문구에 들어간다", () => {
  expect(formatError({ code: "INVALID_VLAN_ID", params: { value: 4095 } })).toBe("VLAN 번호는 1~4094여야 해요: 4095");
  expect(formatError({ code: "LIMIT_EXCEEDED", params: { limit: "vlans", max: 64 } })).toBe("VLAN은 Switch 하나에 64개까지 만들 수 있어요");
});

// terminal-window.test.tsx
test("줄 종류마다 시안의 클래스로 그리고, 글은 이스케이프된다", () => {
  const html = renderToString(<TerminalWindow deviceName="SW1" kindLabel="Switch" zIndex={21}
    placement={{ deviceId: "x", x: 10, y: 20, hidden: false }}
    state={{ prompt: "SW1#", history: [], historyIndex: null, lines: [
      { kind: "input", prompt: "SW1>", text: "<b>enable</b>" },
      { kind: "text", text: "VLAN  Name" }, { kind: "error", text: "오류" }, { kind: "notice", text: "알림" },
    ] }}
    onSubmit={() => {}} onHistory={() => ""} onClose={() => {}} onFocus={() => {}} onMove={() => {}} />);
  expect(html).toContain("&lt;b&gt;enable&lt;/b&gt;");
  expect(html).not.toContain("<b>enable</b>");
  expect(html).toContain('class="pre"');
  expect(html).toContain('class="err"');
  expect(html).toContain('class="dim"');
  expect(html).toContain("t-chip");
});
```

- [ ] **Step 2: 실패를 확인한다** — `pnpm --filter @ping9/web test` → FAIL.
- [ ] **Step 3: 구현하고 `App`에 터미널을 붙인다.**
- [ ] **Step 4: 통과를 확인한다** — `pnpm --filter @ping9/web test && pnpm --filter @ping9/web typecheck` → 통과.
- [ ] **Step 5: 커밋** — `feat(T5.4.1): add terminal windows and Korean messages for error and notice codes`

### Task 9: Switch 속성 패널, 전체 확인, 기록

**Files:**
- Create: `apps/web/src/components/inspector.tsx`, `apps/web/src/components/switch-inspector.tsx`
- Modify: `apps/web/src/app.tsx`, `apps/web/src/app.test.tsx`
- Test: `apps/web/src/components/inspector.test.tsx`
- Create: `docs/task-logs/T5.4.1-switch-screen.md`; Modify: `docs/task-logs/README.md`

**Interfaces — Produces:**

```ts
export function Inspector(props: {
  readonly snapshot: Snapshot; readonly deviceId: string | null; readonly onOpenTerminal: (deviceId: string) => void;
}): JSX.Element;
export function SwitchInspector(props: {
  readonly device: SwitchDevice; readonly view: SwitchView; readonly document: TopologyDocument;
}): JSX.Element;   // VLAN 목록과 MAC 주소 테이블 구역만 그린다
```

**내용** (시안의 `selectDevice`가 만드는 마크업과 클래스를 따른다):

- 선택한 장비가 없으면 `.inspector` 안에 `.sub` 한 줄: `장비를 누르면 여기에 정보가 보여요`.
- 공통: `.title`(이름, `.chip`에 `PC`/`Switch`/`Router`), `.sub`(`포트 N개 · M개 연결`. M은 `view.ports` 중 `linkId`가 있는 수), 그리고 맨 아래 `터미널 열기` 버튼(`.open-term`).
- Switch일 때 `<h4>VLAN</h4>`: `switchVlans(config)`마다 `.if-row` 한 줄 — `<span class="vtag v{번호}">VLAN {번호}</span>` 이름 `<span class="ip">소속 포트</span>`. 소속 포트는 `vlanAccessPorts`를 `shortPortName`으로 줄여 `, `로 이은 것이고 없으면 `-`다. 색 클래스는 `v1`, `v10`, `v20`만 있다. 그 밖의 번호는 `v1`과 같은 회색으로 그린다 (나머지 색은 T5.2.1에서 정한다).
- `<h4>포트</h4>`(Switch) 또는 `<h4>인터페이스</h4>`(그 밖): `view.ports`마다 `.if-row` — `<span class="dot">`(상태가 `up`이 아니면 `off` 클래스), `shortPortName(이름)`, `<span class="ip">`에 링크 반대쪽 장비의 이름, 링크가 없으면 `연결 없음`. 반대쪽 장비는 `document.links`에서 `linkId`로 찾는다. 포트의 VLAN과 trunk 표시는 이 범위가 아니다 (T5.2.1, T5.3.1).
- Switch일 때 `<h4>MAC 주소 테이블</h4>`: `view.macTable`이 비어 있으면 `.sub` 한 줄 `아직 학습한 주소가 없어요`, 있으면 시안의 `.mac` 격자(VLAN, MAC, 줄인 포트 이름).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// inspector.test.tsx
const snapshotOf = (document: TopologyDocument) => { const s = createSimulator(); s.load(document); return s.getSnapshot(); };
const text = (node: JSX.Element) => renderToString(node).replaceAll("<!-- -->", "");

test("SW1: VLAN 목록, 포트와 연결된 장비, 빈 MAC 주소 테이블", () => {
  const html = text(<Inspector snapshot={snapshotOf(twoSwitchVlanDocument)} deviceId={TWO_SWITCH_VLAN.sw1.id} onOpenTerminal={() => {}} />);
  expect(html).toContain("포트 8개 · 3개 연결");
  expect(html).toMatch(/class="vtag v10">VLAN 10<\/span>SALES<span class="ip">Fa0\/1<\/span>/);
  expect(html).toMatch(/class="vtag v1">VLAN 1<\/span>default<span class="ip">Fa0\/3, Fa0\/4, Fa0\/5, Fa0\/6, Fa0\/7<\/span>/);
  expect(html).toMatch(/Fa0\/1<span class="ip">PC1<\/span>/);
  expect(html).toMatch(/Fa0\/8<span class="ip">SW2<\/span>/);
  expect(html).toMatch(/class="dot off"><\/span>Fa0\/3<span class="ip">연결 없음<\/span>/);
  expect(html).toContain("아직 학습한 주소가 없어요");
  expect(html).toContain("터미널 열기");
});
test("VLAN 1이 없는 문서에도 VLAN 1이 보인다", () => {
  const document = JSON.parse(JSON.stringify(twoSwitchVlanDocument)) as { devices: { name: string; config: { vlans: unknown[] } }[] };
  document.devices.find((d) => d.name === "SW1")!.config.vlans = [];
  const html = text(<Inspector snapshot={snapshotOf(document as unknown as TopologyDocument)} deviceId={TWO_SWITCH_VLAN.sw1.id} onOpenTerminal={() => {}} />);
  expect(html).toContain(">VLAN 1</span>default");
});
test("PC: 인터페이스 한 줄이고 VLAN 구역이 없다", () => {
  const html = text(<Inspector snapshot={snapshotOf(twoSwitchVlanDocument)} deviceId={TWO_SWITCH_VLAN.pc1.id} onOpenTerminal={() => {}} />);
  expect(html).toContain("인터페이스");
  expect(html).toMatch(/Eth0<span class="ip">SW1<\/span>/);
  expect(html).not.toContain("VLAN");
});
test("선택이 없거나 없는 장비면 안내 문구만 나온다", () => {
  for (const id of [null, "nope"]) {
    expect(text(<Inspector snapshot={snapshotOf(twoSwitchVlanDocument)} deviceId={id} onOpenTerminal={() => {}} />)).toContain("장비를 누르면 여기에 정보가 보여요");
  }
});
```

- [ ] **Step 2: 실패를 확인한다** — `pnpm --filter @ping9/web test` → FAIL.
- [ ] **Step 3: 구현하고 `App`의 `.inspector` 자리에 넣는다.**
- [ ] **Step 4: 통과를 확인한다** — `pnpm check && pnpm check:secrets` → 전부 통과.
- [ ] **Step 5: 브라우저에서 직접 해 본다.** `pnpm dev` → `http://localhost:5173`. 아래를 차례로 하고 각 결과를 확인한다. 화면을 캡처해 기록 문서에 적는다.
  1. SW1을 누른다 → 속성 패널에 VLAN 1·10·20과 포트 8개가 보인다.
  2. SW1을 더블클릭한다 → 터미널이 열리고 프롬프트가 `SW1>`이다.
  3. `enable`, `configure terminal`, `vlan 30`, `name LAB`을 친다 → 프롬프트가 `SW1(config-vlan)#`이고, **속성 패널의 VLAN 목록에 `VLAN 30 LAB`이 바로 생긴다.**
  4. `end`, `show vlan brief`를 친다 → 열이 맞게 나오고 `30    LAB      active` 줄이 있다.
  5. `configure terminal`, `no vlan 30` → 패널에서 VLAN 30이 사라진다. `no vlan 1` → 빨간 줄 `VLAN 1은 지우거나 이름을 바꿀 수 없어요`.
  6. 위 화살표를 누른다 → 이전 명령어가 입력란에 나온다. 터미널을 닫았다가 SW1을 다시 더블클릭한다 → 출력과 모드가 남아 있다.
  7. 제목 막대를 끌어 옮기고 모서리로 크기를 바꾼다. SW2 터미널도 열어 둘이 겹칠 때 누른 쪽이 위로 온다.
  8. PC1을 더블클릭해 `ipconfig`를 친다 → `알 수 없는 명령어예요: ipconfig` (PC 명령어는 다른 담당의 범위).
  9. 브라우저 콘솔에 오류가 없다.
- [ ] **Step 6: 기록 문서, 커밋** — `docs/task-logs/T5.4.1-switch-screen.md`와 README 한 줄. "계획과 달라진 점": 계획에 없는 Task ID T5.4.1, 캔버스를 SVG로·터미널을 입력란으로·Tailwind 없이 시안 CSS로 시작, 오류·알림 문구를 T1.9.1보다 먼저 만듦, 운영 주소의 `/`는 여전히 `mockup.html`이라 이 화면은 로컬에서만 보임. "남은 일": 포트·링크의 VLAN과 trunk 표시(T5.2.1, T5.3.1), Tab과 `?`(T3.2.3), 오류 위치 표시(T3.5.2), 장비 놓기와 연결. 커밋 `feat(T5.4.1): add the switch inspector with VLAN and port lists`, `docs(T5.4.1): add the task log`.
- [ ] **Step 7: 사용자에게 확인한 뒤 push하고 PR을 연다.**

---

## 이 계획 뒤에 남는 것

설계 문서 9절의 5~18번: 인터페이스 모드와 포트 끄기(T3.3.1, T3.3.2), 전달 규칙(T1.7.3), access와 trunk(T5.2.1, T5.3.1, T5.3.2), 줄임·완성·도움말·오류 위치(T3.2.x, T3.5.x), `show running-config` 왕복(T3.4.1), `show mac address-table`(T3.4.2), kernel 연결(T5.2.2). 이 계획이 끝나면 그때의 코드에 맞춰 다음 계획을 쓴다.
