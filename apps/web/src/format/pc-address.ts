// PC 설정 패널(T1.5.2)의 판단. 화면 없이 테스트하도록 컴포넌트에서 떼어 냈다.
// 값 하나의 형식은 CLI 해석기와 같은 shared 함수로 보고, 토폴로지 규칙은 reducer가 본다 (AD-3).

import { checkIpv4, checkMask } from "@ping9/shared";
import type { Command, DispatchResult, ErrorInfo, Notice, PcConfig } from "@ping9/shared";

export const PC_FIELDS = ["ip", "mask", "gateway"] as const;
export type PcField = (typeof PC_FIELDS)[number];

/** 입력 칸에 쓰는 중인 값. 빈 문자열은 빈 칸이다 */
export type PcDraft = Readonly<Record<PcField, string>>;

export type FieldErrors = Readonly<Partial<Record<PcField, ErrorInfo>>>;

export type ApplyOutcome =
  /** 형식이 틀린 칸이 있어 보내지 않았다 */
  | { readonly kind: "invalid"; readonly errors: FieldErrors }
  /** 지금 구성과 같아 보내지 않았다. reducer는 같은 값도 받아 docVersion을 올리기 때문이다 */
  | { readonly kind: "unchanged" }
  | { readonly kind: "applied"; readonly notices: readonly Notice[] }
  /** reducer가 거부했다. `field`가 null이면 칸이 아니라 패널 전체의 오류다 */
  | { readonly kind: "rejected"; readonly field: PcField | null; readonly error: ErrorInfo };

export function draftOf(config: PcConfig): PcDraft {
  return { ip: config.ip ?? "", mask: config.mask ?? "", gateway: config.gateway ?? "" };
}

const trimmed = (draft: PcDraft): PcDraft => ({
  ip: draft.ip.trim(),
  mask: draft.mask.trim(),
  gateway: draft.gateway.trim(),
});

/** 칸마다 형식을 본다. 빈 칸은 보지 않는다. 여러 칸이 틀리면 모두 돌려준다 */
export function checkDraft(draft: PcDraft): FieldErrors {
  const { ip, mask, gateway } = trimmed(draft);
  const errors: Partial<Record<PcField, ErrorInfo>> = {};
  const ipError = ip === "" ? null : checkIpv4(ip);
  const maskError = mask === "" ? null : checkMask(mask);
  const gatewayError = gateway === "" ? null : checkIpv4(gateway);
  if (ipError !== null) errors.ip = ipError;
  if (maskError !== null) errors.mask = maskError;
  if (gatewayError !== null) errors.gateway = gatewayError;
  return errors;
}

export function sameAsConfig(draft: PcDraft, config: PcConfig): boolean {
  const current = draftOf(config);
  const next = trimmed(draft);
  return PC_FIELDS.every((field) => next[field] === current[field]);
}

/** 빈 칸은 null로 보낸다. 세 칸이 모두 비면 IP 설정을 지우는 뜻이다 */
export function commandFor(deviceId: string, draft: PcDraft): Command {
  const { ip, mask, gateway } = trimmed(draft);
  return {
    type: "pc/set-ip",
    deviceId,
    ip: ip === "" ? null : ip,
    mask: mask === "" ? null : mask,
    gateway: gateway === "" ? null : gateway,
  };
}

/** reducer의 오류를 붙일 칸. 칸과 상관없는 오류면 null */
export function fieldOfError(error: ErrorInfo, draft: PcDraft): PcField | null {
  switch (error.code) {
    case "PC_ADDRESS_INCOMPLETE":
      return error.params.missing;
    case "IP_IS_NETWORK_ADDRESS":
    case "IP_IS_BROADCAST_ADDRESS":
      return "ip";
    case "GATEWAY_NOT_IN_NETWORK":
      return "gateway";
    case "INVALID_MASK":
      return "mask";
    case "INVALID_IPV4":
    case "RESERVED_IPV4":
      // reducer는 IP를 먼저 본다. 값이 IP 칸과 같으면 IP 칸, 아니면 게이트웨이 칸이다
      return error.params.value === trimmed(draft).ip ? "ip" : "gateway";
    default:
      return null;
  }
}

/** 적용 한 번: 형식 검사 → 같은 값인지 → dispatch → 결과 */
export function applyDraft(
  deviceId: string,
  config: PcConfig,
  draft: PcDraft,
  dispatch: (command: Command) => DispatchResult,
): ApplyOutcome {
  const errors = checkDraft(draft);
  if (Object.keys(errors).length > 0) return { kind: "invalid", errors };
  if (sameAsConfig(draft, config)) return { kind: "unchanged" };

  const result = dispatch(commandFor(deviceId, draft));
  if (result.ok) return { kind: "applied", notices: result.notices };
  return { kind: "rejected", field: fieldOfError(result.error, draft), error: result.error };
}
