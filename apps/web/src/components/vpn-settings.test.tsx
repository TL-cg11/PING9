import { createSimulator } from "@ping9/engine";
import type { RouterDevice } from "@ping9/shared";
import { greLabDocument, ipsecLabDocument, VPN_LAB as LAB, vpnUnderlayDocument } from "@ping9/shared/examples";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { Inspector } from "./inspector";

function view(document = greLabDocument) {
  const sim = createSimulator(); sim.load(document);
  const render = () => renderToString(<Inspector snapshot={sim.getSnapshot()} deviceId={LAB.r1} onOpenTerminal={() => {}} onDispatch={command => sim.dispatch(command)} />).replaceAll("<!-- -->", "");
  return { sim, render };
}

describe("Router VPN 선택 화면", () => {
  test.each([[greLabDocument, "gre"], [ipsecLabDocument, "ipsec"], [vpnUnderlayDocument, "off"]] as const)("기존 문서의 모드를 선택 상태로 보여 준다: %s", (document, mode) => {
    const { render } = view(document); const html = render();
    expect(html).toContain("VPN 사용");
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(html).toMatch(new RegExp(`type="radio"[^>]*checked=""[^>]*value="${mode}"`));
    expect(html).toContain("상대 라우터에서도 같은 모드를 선택");
  });

  test("일반 통신 선택은 일반 경로 필요 안내와 IPsec disabled 상태를 표시한다", () => {
    const { sim, render } = view(ipsecLabDocument);
    sim.dispatch({ type: "router/set-vpn-mode", deviceId: LAB.r1, mode: "off" });
    const html = render();
    expect(html).toContain("VPN을 사용하지 않고 기존 물리 경로로 전달해요");
    expect(html).toContain("일반 라우팅 설정이 필요");
    expect(html).toContain("disabled");
    expect(html).toMatch(/type="radio"[^>]*checked=""[^>]*value="off"/);
  });

  test("설정 없이 선택한 GRE/IPsec을 준비 완료로 보이지 않고 필요한 설정을 안내한다", () => {
    const { sim, render } = view(vpnUnderlayDocument);
    sim.dispatch({ type: "router/set-vpn-mode", deviceId: LAB.r1, mode: "gre" });
    expect(render()).toContain("GRE 터널 설정이 아직 없어요");
    sim.dispatch({ type: "router/set-vpn-mode", deviceId: LAB.r1, mode: "ipsec" });
    const html = render();
    expect(html).toContain("IPsec 프로필이 아직 없어요");
    expect(html).toContain("실제 암호화/IKE 없음");
  });

  test("옛 문서에 두 종류의 독립 설정이 있으면 기존 설정 상태를 명시한다", () => {
    const left = greLabDocument.devices.find(device => device.id === LAB.r1) as RouterDevice;
    const ipsec = ipsecLabDocument.devices.find(device => device.id === LAB.r1) as RouterDevice;
    const { render } = view({ ...greLabDocument, devices: greLabDocument.devices.map(device => device === left ? { ...left, config: { ...left.config, ipsec: ipsec.config.ipsec } } : device) });
    expect(render()).toContain("기존 CLI의 터널·정책 설정을 따르고 있어요");
  });
  test("VyOS에서는 CLI 형식 선택과 commit 안내를 보여 주고 전용 vpn mode 선택은 숨긴다", async () => {
    const { sim, render } = view(ipsecLabDocument);
    expect(sim.dispatch({ type: "router/set-cli-style", deviceId: LAB.r1, style: "vyos" }).ok).toBe(true);
    const html = render();
    expect(html).toContain("라우터 CLI 형식");
    expect(html).toMatch(/<option value="vyos" selected="">/);
    expect(html).toContain("configure → set / delete → commit");
    expect(html).not.toContain('type="radio"');
    expect(html).toContain("실제 암호화/IKE 없음");
    expect((await sim.console(LAB.r1).exec("configure")).prompt).toBe("vyos@R1#");
  });

});
