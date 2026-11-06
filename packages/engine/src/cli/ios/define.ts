// IOS 방식 CLI의 명령 정의 형태 (AD-8). 명령어 하나는 정의 하나다.
// 이 폴더(cli/ios)는 장비 종류를 모른다. Switch와 Router가 각자의 정의 목록을 얹어 쓴다.
// 출처: docs/superpowers/specs/2026-11-05-switch-vlan-design.md 7절.

import type {
  Command,
  ConsoleLine,
  Device,
  DeviceKind,
  DispatchResult,
  TopologyDocument,
} from "@ping9/shared";

export type CliMode = "user" | "privileged" | "config" | "config-if" | "config-vlan";

/**
 * 매개변수의 종류. `word`는 빈칸 없는 글, `vlan-id`는 1~4094의 수,
 * `ipv4`는 점으로 구분한 IPv4 주소, `mask`는 1이 이어지는 서브넷 마스크다.
 * `ipv4`와 `mask`는 형식만 본다. 특수 주소나 네트워크 주소 같은 규칙은 reducer가 판정한다 (AD-3)
 */
export type ParamType = "word" | "vlan-id" | "ipv4" | "mask";

export interface ParamToken {
  /** 인자 이름. `run`이 받는 `args`의 키다 */
  readonly param: string;
  readonly type: ParamType;
  /** `?` 도움말에 보일 영어 설명 */
  readonly help: string;
}

/** 문자열은 키워드, 객체는 매개변수 자리다 */
export type Token = string | ParamToken;

export function param(name: string, type: ParamType, help: string): ParamToken {
  return { param: name, type, help };
}

/** 장비 하나의 CLI 세션. 변경 불가능한 값이며 바꿀 때는 새로 만든다 */
export interface CliSession {
  readonly mode: CliMode;
  /** `config-vlan`일 때 설정 중인 VLAN */
  readonly targetVlan?: number;
  /** `config-if`일 때 설정 중인 포트의 전체 이름 */
  readonly targetPort?: string;
}

export type CommandArgs = Readonly<Record<string, string | number>>;

export interface CommandContext {
  readonly device: Device;
  readonly document: TopologyDocument;
  readonly session: CliSession;
  /** Document를 바꾸는 길은 이것 하나다 (AD-3) */
  dispatch(command: Command): DispatchResult;
}

export interface CommandOutcome {
  readonly lines?: readonly ConsoleLine[];
  /** 세션이 바뀔 때만 */
  readonly session?: CliSession;
}

export interface CommandDefinition {
  /** 이 명령어를 쓸 수 있는 모드 */
  readonly modes: readonly CliMode[];
  /** 이 명령어가 있는 장비. 없으면 모든 장비 */
  readonly devices?: readonly DeviceKind[];
  /** 첫 토큰은 항상 키워드다. `no` 형식은 `["no", ...]`로 따로 정의한다 */
  readonly tokens: readonly Token[];
  /** `?` 도움말에 보일 영어 설명 */
  readonly help: string;
  run(args: CommandArgs, context: CommandContext): CommandOutcome;
}

/** 정의의 타입을 고정한다. 값은 그대로 돌려준다 */
export function defineCommand(definition: CommandDefinition): CommandDefinition {
  return definition;
}
