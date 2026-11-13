import { createSimulator } from "@ping9/engine";
import { greLabDocument, ipsecLabDocument, VPN_LAB as LAB } from "@ping9/shared/examples";
import type { ConsoleResult, TopologyDocument } from "@ping9/shared";
import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";
import { EventPanel } from "./components/event-panel";
import { causeOf, eventText } from "./messages/events";

const text = (result: ConsoleResult) => result.lines.flatMap(line => line.kind === "text" ? [line.text] : []).join("\n");
async function open(document: TopologyDocument) {
  const sim = createSimulator(); expect(sim.load(document).ok).toBe(true);
  for (const deviceId of [LAB.r1, LAB.r2]) {
    expect(sim.dispatch({ type: "router/set-cli-style", deviceId, style: "vyos" }).ok).toBe(true);
    for (const line of ["configure", "commit", "exit"]) expect((await sim.console(deviceId).exec(line)).lines.some(line => line.kind === "error")).toBe(false);
  }
  return sim;
}
function panel(sim: Awaited<ReturnType<typeof open>>, selectedSeq: number) {
  const snapshot = sim.getSnapshot(), trace = sim.getTrace(snapshot.traces[0]!.id)!;
  return renderToString(<EventPanel header={<span>이벤트</span>} document={snapshot.document} traces={snapshot.traces}
    getTrace={sim.getTrace} traceId={trace.id} onPickTrace={() => {}} replay={undefined} time={() => 0} paused={false}
    selectedSeq={selectedSeq} onSelectSeq={() => {}} />).replaceAll("<!-- -->", "");
}

test.each([["gre", greLabDocument], ["ipsec", ipsecLabDocument]] as const)("최신 main의 PC 파일·Tab과 VyOS %s ping·이벤트 상세가 함께 동작한다", async (mode, document) => {
  const sim = await open(document), pc = sim.console(LAB.pcA), cli = sim.console(LAB.r1);
  for (const command of ["mkdir vpn-lab", "cd vpn-lab", "echo LAB > note.txt"]) await pc.exec(command);
  expect(pc.prompt()).toBe("PC_A vpn-lab>");
  expect(text(await pc.exec("type note.txt"))).toBe("LAB");
  expect(pc.candidates("type no")).toContain("note.txt");
  expect(cli.candidates("show vpn ipsec ")).toEqual(["connections", "sa"]);
  expect(text(await pc.exec("ping -n 1 192.168.2.10"))).toContain("TTL=126");
  expect(pc.prompt()).toBe("PC_A vpn-lab>");
  const trace = sim.getTrace(sim.getSnapshot().traces[0]!.id)!;
  const selected = trace.events.find(event => mode === "gre" ? event.frame.gre !== undefined : event.frame.esp !== undefined)!;
  expect(trace.events.every(event => eventText(event.reason).length > 0)).toBe(true);
  const html = panel(sim, selected.seq);
  expect(html.match(/class="ev-row/g)).toHaveLength(trace.events.length);
  expect(html).toContain(mode === "gre" ? "GRE 안쪽 IP" : "ESP 안쪽 IP");
  expect(html).toContain("성공 · 응답을 받았어요");
});

test.each([["gre", greLabDocument], ["ipsec", ipsecLabDocument]] as const)("%s의 실패도 최신 이벤트 패널에서 원인과 조치 문구를 표시한다", async (mode, document) => {
  const sim = await open(document);
  const cli = sim.console(mode === "gre" ? LAB.r1 : LAB.r2);
  for (const command of ["configure", mode === "gre" ? "set interfaces tunnel tun0 remote 10.0.23.1" : "set vpn ipsec authentication psk PSK_0 secret WRONG", "commit", "exit"]) {
    expect((await cli.exec(command)).lines.some(line => line.kind === "error")).toBe(false);
  }
  expect(text(await sim.console(LAB.pcA).exec("ping -n 1 192.168.2.10"))).not.toContain("bytes=32");
  const trace = sim.getTrace(sim.getSnapshot().traces[0]!.id)!;
  const rejected = trace.events.find(event => event.dropReason === (mode === "gre" ? "GRE_REJECTED" : "IPSEC_REJECTED"))!;
  expect(rejected).toBeDefined(); expect(causeOf(rejected.reason)?.fix).toBeTruthy();
  const html = panel(sim, rejected.seq);
  expect(html).toContain("실패한 이유");
  expect(html).toContain(mode === "gre" ? "GRE 전달 거절" : "IPsec 전달 거절");
  expect(html).not.toContain("원인을 찾지 못했어요");
});
