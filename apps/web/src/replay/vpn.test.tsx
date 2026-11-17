import { createSimulator } from "@ping9/engine";
import { greLabDocument, ipsecLabDocument, VPN_LAB as LAB } from "@ping9/shared/examples";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { Inspector } from "../components/inspector";
import { replaySteps } from "./steps";
import { previewTimeline } from "./timeline";

describe("VPN 조회와 화면 재생", () => {
  test.each([["GRE", greLabDocument, "gre-request"], ["IPsec", ipsecLabDocument, "esp"]] as const)("%s는 중간 링크에서 감싼 패킷으로 표시하며 원본 Trace를 보존한다", async (_mode, document, kind) => {
    const sim = createSimulator(); sim.load(document);
    await sim.console(LAB.pcA).exec("ping -n 1 192.168.2.10");
    const trace = sim.getTrace(sim.getSnapshot().traces[0]!.id)!;
    const before = JSON.stringify(trace);
    const steps = replaySteps(trace);
    expect(steps.flatMap(step => step.hops).some(hop => hop.fromDeviceId === LAB.isp && hop.kind === kind)).toBe(true);
    expect(steps.flatMap(step => step.hops).filter(hop => hop.fromDeviceId === LAB.pcA && hop.kind === "icmp-request")).toHaveLength(1);
    expect(previewTimeline(trace).durationMs).toBeLessThanOrEqual(15000);
    expect(JSON.stringify(trace)).toBe(before);
    const html = renderToString(<Inspector snapshot={sim.getSnapshot()} deviceId={LAB.r1} onOpenTerminal={() => {}} onDispatch={command => sim.dispatch(command)} />).replaceAll("<!-- -->", "");
    expect(html).toContain("포트 4개 · 2개 연결");
    if (kind === "esp") {
      expect(html).toContain("IPsec 실습"); expect(html).toContain("실제 암호화/IKE 없음");
      expect(html).toContain("active"); expect(html).toContain("송신 1 · 수신 1");
    } else {
      expect(html).toContain("GRE 터널"); expect(html).toContain("Tunnel0"); expect(html).toContain("암호화 없음");
    }
  });
});
