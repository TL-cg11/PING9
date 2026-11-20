import { createSimulator } from "@ping9/engine";
import { pingRoundKind, validateTrace } from "@ping9/shared";
import { SSL_VPN_LAB as L, sslVpnSessionLabDocument as lab } from "@ping9/shared/examples";
import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";
import { PacketCard } from "./components/packet-card";
import { EventPanel } from "./components/event-panel";
import { pacePing } from "./terminal/ping-pacing";
import { exportFile, readImportFile } from "./topology-file";

const open=()=>{const sim=createSimulator();expect(sim.load(lab).ok).toBe(true);return sim;};
test.each([false,true])("VPN 접속의 성공/실패 trace와 재생 분류를 표시한다: rejected=%s",async rejected=>{
 const sim=open();
 if(rejected) expect(sim.dispatch({type:"interface/set-admin",deviceId:L.r2,port:"GigabitEthernet0/1",adminUp:false}).ok).toBe(true);
 const result=await sim.console(L.pc).exec("vpn connect OFFICE");
 const summary=sim.getSnapshot().traces[0]!,trace=sim.getTrace(summary.id)!;
 expect(summary.kind).toBe("vpn");expect(validateTrace(trace).ok).toBe(true);
 const expected=rejected?"icmp-error":"reply";
 expect(pingRoundKind(trace,L.pc,1)).toBe(expected);
 expect(pacePing(result,()=>pingRoundKind(trace,L.pc,1)).rounds[0]?.kind).toBe(expected);
 const html=renderToString(<EventPanel header={<span>이벤트</span>} document={sim.getSnapshot().document}
   traces={sim.getSnapshot().traces} getTrace={sim.getTrace} traceId={summary.id} onPickTrace={()=>{}}
   replay={undefined} time={()=>0} paused={false} selectedSeq={null} onSelectSeq={()=>{}} />);
 expect(html).toContain("교육용 VPN 세션");
 expect(html).toContain(rejected?"SSL VPN 접속 거절":"Educational session established");
 expect(html).not.toContain("원인을 찾지 못했어요");
 if(!rejected){
  const sent=trace.events.find(e=>e.reason.code==="TCP_SIM_SEGMENT_SENT")!;
  const card=renderToString(<PacketCard event={sent} linkId={sent.linkId} document={sim.getSnapshot().document} onClose={()=>{}} />).replaceAll("<!-- -->", "");
  expect(card).toContain("교육용 TCP");expect(card).toContain("PSH ACK");
 }

});

test("내보내기/가져오기는 프로필을 보관하고 접속 상태를 재개하지 않는다",async()=>{
 const sim=open();await sim.console(L.pc).exec("vpn connect OFFICE");
 const file=exportFile("SSL session lab",sim.getSnapshot().document);
 const parsed=await readImportFile({size:new TextEncoder().encode(file.text).length,text:async()=>file.text});expect(parsed.ok).toBe(true);if(!parsed.ok)return;
 const restored=createSimulator();expect(restored.load(parsed.document).ok).toBe(true);
 const result=await restored.console(L.pc).exec("vpn status");
 expect(result.lines).toContainEqual({kind:"text",text:"State: disconnected"});
});
