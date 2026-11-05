import { PORT_NAMES, portIndex } from "@ping9/shared";
import { TWO_PC, thirtyDeviceDocument, twoPcPingTrace } from "@ping9/shared/examples";
import { describe, expect, test } from "vitest";

import { macAddressFor } from "./index";

describe("macAddressFor", () => {
  test("예시 자료의 MAC 주소와 같은 값을 만든다", () => {
    expect(macAddressFor(TWO_PC.pc1.id, portIndex("pc", TWO_PC.port))).toBe(TWO_PC.pc1.mac);
    expect(macAddressFor(TWO_PC.pc2.id, portIndex("pc", TWO_PC.port))).toBe(TWO_PC.pc2.mac);
  });

  test("예시 Trace의 출발지 MAC 주소는 그 프레임을 만든 장비의 것이다", () => {
    for (const event of twoPcPingTrace.events) {
      if (event.action !== "create" && event.action !== "reply") continue;
      expect(event.frame.ethernet.sourceMac).toBe(macAddressFor(event.deviceId, 0));
    }
  });

  test("소문자 16진수 여섯 묶음이고 02로 시작한다", () => {
    const mac = macAddressFor("3f2504e0-4f89-41d3-9a0c-0305e82cabcd", 7);

    expect(mac).toBe("02:e8:2c:ab:cd:07");
    expect(mac).toMatch(/^02(:[0-9a-f]{2}){5}$/);
  });

  test("같은 입력에는 항상 같은 값이다", () => {
    expect(macAddressFor(TWO_PC.pc1.id, 3)).toBe(macAddressFor(TWO_PC.pc1.id, 3));
  });

  test("한 장비의 포트마다 값이 다르다", () => {
    const macs = PORT_NAMES.switch.map((_, index) => macAddressFor(TWO_PC.pc1.id, index));

    expect(new Set(macs).size).toBe(PORT_NAMES.switch.length);
  });

  test("장비 30대 예시의 모든 포트가 서로 다른 값을 갖는다", () => {
    const macs = thirtyDeviceDocument.devices.flatMap((device) =>
      PORT_NAMES[device.kind].map((_, index) => macAddressFor(device.id, index)),
    );

    expect(macs).toHaveLength(5 * 8 + 25);
    expect(new Set(macs).size).toBe(macs.length);
  });
});
