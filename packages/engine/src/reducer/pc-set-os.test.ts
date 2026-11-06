import { validateDocument } from "@ping9/shared";
import type { Command, TopologyDocument } from "@ping9/shared";
import { TWO_PC, TWO_PC_SWITCH, twoPcDocument, twoPcSwitchDocument } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { reduce } from "../reducer";
import type { ReduceResult } from "../reducer";

const { pc1, pc2 } = TWO_PC;

function configOf(result: ReduceResult, deviceId: string = pc1.id): unknown {
  if (!result.ok) throw new Error(`실패: ${JSON.stringify(result.error)}`);
  return result.document.devices.find((device) => device.id === deviceId)?.config;
}

function setOs(os: unknown, document: TopologyDocument = twoPcDocument, deviceId: string = pc1.id) {
  return reduce(document, { type: "pc/set-os", deviceId, os } as Command);
}

describe("pc/set-os: 성공", () => {
  test("OS만 바꾸고 IP 구성은 그대로 둔다. 받은 Document는 고치지 않는다", () => {
    const before = JSON.stringify(twoPcDocument);
    const pcBefore = twoPcDocument.devices.find((device) => device.id === pc1.id)!;

    const result = setOs("linux");

    expect(configOf(result)).toEqual({ ...pcBefore.config, os: "linux" });
    expect(JSON.stringify(twoPcDocument)).toBe(before);
  });

  test("다른 장비와 링크는 바뀌지 않는다", () => {
    const result = setOs("linux");
    if (!result.ok) throw new Error("실패");

    expect(result.document.links).toEqual(twoPcDocument.links);
    expect(result.document.devices.find((device) => device.id === pc2.id)).toEqual(
      twoPcDocument.devices.find((device) => device.id === pc2.id),
    );
  });

  test("Windows로 되돌릴 수 있고, 같은 OS로 바꿔도 성공한다", () => {
    const linux = setOs("linux");
    if (!linux.ok) throw new Error("실패");

    expect((configOf(setOs("windows", linux.document)) as { os?: string }).os).toBe("windows");
    expect((configOf(setOs("linux", linux.document)) as { os?: string }).os).toBe("linux");
  });

  test("결과 문서는 검증을 통과한다", () => {
    const result = setOs("linux");
    if (!result.ok) throw new Error("실패");
    expect(validateDocument(result.document).ok).toBe(true);
  });

  test("알림이 없다", () => {
    const result = setOs("linux");
    expect(result.ok && result.notices).toEqual([]);
  });
});

describe("pc/set-os: 거부", () => {
  test("없는 장비", () => {
    const result = setOs("linux", twoPcDocument, "00000000-0000-4000-8000-0000000000ff");
    expect(result.ok ? null : result.error.code).toBe("DEVICE_NOT_FOUND");
  });

  test("PC가 아닌 장비", () => {
    const result = setOs("linux", twoPcSwitchDocument, TWO_PC_SWITCH.sw1.id);
    expect(result.ok ? null : result.error).toEqual({
      code: "DEVICE_KIND_MISMATCH",
      params: { deviceId: TWO_PC_SWITCH.sw1.id, expected: "pc", actual: "switch" },
    });
  });

  test.each([["macos"], [""], [null], [undefined], [1], [{ toString: 1 }]])(
    "정해진 OS가 아님: %s",
    (os) => {
      const result = setOs(os);
      expect(result.ok ? null : result.error).toEqual({
        code: "DOCUMENT_INVALID_SHAPE",
        params: { path: "os" },
      });
    },
  );
});
