import { expect, test } from "vitest";
import { validateTrace } from "@ping9/shared";
import type { TcpSegment } from "@ping9/shared";
import { createSimulator } from "../simulator";
import { createKernel } from "../kernel";
import type { DeviceModel } from "../devices/model";
import { deviceRun } from "../devices/link";
import { PcModel } from "../devices/pc/pc-model";
import { RouterModel } from "../devices/router/router-model";
import { evaluateChain, filterPacketOf } from "../protocols/filter";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const A=id(1),R=id(2),F=id(3),B=id(4);
const GI0="GigabitEthernet0/0", GI1="GigabitEthernet0/1";
const segment: TcpSegment = { sourcePort: 50000, destinationPort: 443, sequence: 1, flags: ["SYN"], payload: "EDUCATIONAL_CONTROL" };
async function setup() {
 const sim=createSimulator();
 for (const [deviceId,kind] of [[A,"pc"],[R,"router"],[F,"router"],[B,"pc"]] as const) expect(sim.dispatch({type:"device/add",id:deviceId,kind,position:{x:0,y:0}}).ok).toBe(true);
 for (const [i,one,op,two,tp] of [[10,A,"Ethernet0",R,GI0],[11,R,GI1,F,GI0],[12,F,GI1,B,"Ethernet0"]] as const) expect(sim.dispatch({type:"link/add",id:id(i),ends:[{deviceId:one,port:op},{deviceId:two,port:tp}]}).ok).toBe(true);
 for(const [deviceId,ip,gateway] of [[A,"192.0.2.10","192.0.2.1"],[B,"198.51.100.10","198.51.100.1"]] as const) expect(sim.dispatch({type:"pc/set-ip",deviceId,ip,gateway,mask:"255.255.255.0"}).ok).toBe(true);
 for(const [deviceId,port,ip,mask] of [[R,GI0,"192.0.2.1","255.255.255.0"],[R,GI1,"10.0.1.1","255.255.255.252"],[F,GI0,"10.0.1.2","255.255.255.252"],[F,GI1,"198.51.100.1","255.255.255.0"]] as const) {
 expect(sim.dispatch({type:"interface/set-ip",deviceId,port,ip,mask}).ok).toBe(true);
 expect(sim.dispatch({type:"interface/set-admin",deviceId,port,adminUp:true}).ok).toBe(true);
 }
 for(const [deviceId,network,nextHop] of [[R,"198.51.100.0","10.0.1.2"],[F,"192.0.2.0","10.0.1.1"]] as const) expect(sim.dispatch({type:"route/add",deviceId,network,mask:"255.255.255.0",nextHop}).ok).toBe(true);
 expect(sim.dispatch({type:"pc/set-os",deviceId:B,os:"server"}).ok).toBe(true);
 const fw=sim.console(B);const rule=async(line:string)=>expect((await fw.exec(line)).lines.filter(l=>l.kind==="error"),line).toEqual([]);
 const kernel=createKernel();const doc=()=>sim.getSnapshot().document;
 const a=new PcModel(A,doc), b=new PcModel(B,doc);
 const router=new RouterModel(R,doc,()=>kernel.now()),transit=new RouterModel(F,doc,()=>kernel.now());
 const models=new Map<string, DeviceModel>([[A,a],[B,b],[R,router],[F,transit]] as const);
 const send=(reverse=false,tcp=segment,ttl=128)=>{
 a.startRun();b.startRun();router.startRun();transit.startRun();
 const source=reverse?b:a,target=reverse?a:b;
 const trace=kernel.run(deviceRun({docVersion:sim.getSnapshot().docVersion,models,
 start:ctx=>{source.tcp.send(ctx,"Ethernet0",reverse?"192.0.2.10":"198.51.100.10",tcp,ttl);},
 outcome:()=>target.tcp.received().length?"success":"failed"}));
 expect(validateTrace(trace).ok).toBe(true);return {trace,target};
 };
 return {sim,rule,send,a,b};
}

test("TCP 세그먼트는 ARP·Router 2대·케이블을 지나며 TTL만 감소하고 데이터/포트/sequence가 보존된다",async()=>{
 const {send}=await setup();const {trace,target}=send();expect(trace.result.status).toBe("success");
 expect(target.tcp.received()).toEqual([{sourceIp:"192.0.2.10",destinationIp:"198.51.100.10",segment}]);
 const received=trace.events.find(e=>e.reason.code==="TCP_SIM_SEGMENT_RECEIVED")!;
 expect(received.frame.ipv4?.ttl).toBe(126);
 const forwards=trace.events.filter(e=>e.reason.code==="IPV4_FORWARDED");
 expect(forwards.map(e=>e.deviceId)).toEqual([R,F]);
 expect(forwards.every(e=>JSON.stringify(e.frame.tcp)===JSON.stringify(segment))).toBe(true);
 expect(trace.events.some(e=>e.reason.code==="ARP_ENTRY_LEARNED")).toBe(true);
});

test("Server PC의 INPUT·OUTPUT은 교육용 TCP 목적지 포트와 역방향 출발 포트를 각각 검사한다",async()=>{
 const {send,rule}=await setup();await rule("iptables -P INPUT DROP");await rule("iptables -P OUTPUT DROP");
 expect(send().trace.result.status).toBe("failed");
 await rule("iptables -A INPUT -p tcp --dport 443 -j ACCEPT");
 expect(send().trace.result.status).toBe("success");
 const reverse={...segment,sourcePort:443,destinationPort:50000,flags:["ACK"] as const};
 expect(send(true,reverse).trace.result.status).toBe("failed");
 await rule("iptables -A OUTPUT -p tcp --sport 443 -j ACCEPT");
 expect(send(true,reverse).trace.result.status).toBe("success");
 expect(send(false,{...segment,destinationPort:444}).trace.result.status).toBe("failed");
});

test("먼저 일치한 규칙과 차단 규칙 번호가 trace에 남는다",async()=>{
 const {send,rule}=await setup();await rule("iptables -A INPUT -p tcp --dport 443 -j DROP");await rule("iptables -A INPUT -p tcp --dport 443 -j ACCEPT");
 const {trace}=send();expect(trace.events.find(e=>e.dropReason==="FIREWALL_BLOCKED")?.reason.params).toMatchObject({chain:"INPUT",rule:1,target:"DROP"});
});

test.each(["ttl-router", "ttl-transit", "link", "arp"])("전달 실패 %s는 성공 처리되지 않는다",async problem=>{
 const {send,sim}=await setup();
 if(problem==="link") sim.dispatch({type:"interface/set-admin",deviceId:R,port:GI1,adminUp:false});
 if(problem==="arp") sim.dispatch({type:"interface/clear-ip",deviceId:F,port:GI0});
 const {trace,target}=send(false,segment,problem==="ttl-router"?1:problem==="ttl-transit"?2:128);
 expect(trace.result.status).toBe("failed");expect(target.tcp.received()).toEqual([]);
 if(problem.startsWith("ttl")) expect(trace.events.some(e=>e.dropReason==="TTL_EXPIRED")).toBe(true);
 if(problem==="arp") expect(trace.events.some(e=>e.dropReason==="ARP_TIMEOUT")).toBe(true);
});

test("Trace의 TCP header·프로토콜 불일치, 잘못된 포트, 중복 flag, 큰 payload를 거부한다",async()=>{
 const {send}=await setup();const {trace}=send();const seq=trace.events.findIndex(e=>e.frame.tcp!==undefined);
 for(const patch of [{tcp:{...segment,destinationPort:65536}},{tcp:{...segment,flags:["SYN","SYN"]}},{tcp:{...segment,payload:"x".repeat(513)}},{tcp:undefined},{ipv4:{...trace.events[seq]!.frame.ipv4,protocol:47}}]) {
 const events=trace.events.map((event,i)=>i===seq?{...event,frame:{...event.frame,...patch}}:event);
 expect(validateTrace({...trace,events}).ok).toBe(false);
 }
});

test("TCP 포트 규칙은 일반 ICMP·ARP·기존 UDP를 TCP로 잘못 분류하지 않는다",()=>{
 const ip={sourceIp:"192.0.2.10",destinationIp:"198.51.100.10",ttl:64};
 expect(filterPacketOf({ipv4:ip,icmp:{type:"echo-request",sequence:1}})?.protocol).toBe("icmp");
 expect(filterPacketOf({ipv4:ip,udp:{sourcePort:520,destinationPort:520}})?.protocol).toBe("udp");
 expect(filterPacketOf({})).toBeUndefined();
 const packet=filterPacketOf({ipv4:{...ip,protocol:6},tcp:segment})!;
 expect(evaluateChain({policy:"DROP",rules:[{protocol:"tcp",destinationPort:"440:450",target:"ACCEPT"}]},packet,{}).target).toBe("ACCEPT");
});


test.each(["SYN", "RST"] as const)("Server PC의 REJECT는 교육용 %s에도 기존 RST 무응답 규칙을 유지한다",async flag=>{
 const {send,rule}=await setup();await rule("iptables -A INPUT -p tcp --dport 443 -j REJECT");
 const {trace}=send(false,{...segment,flags:[flag]});
 expect(trace.result.status).toBe("failed");
 expect(trace.events.some(e=>e.dropReason==="FIREWALL_BLOCKED")).toBe(true);
 expect(trace.events.some(e=>e.reason.code==="ICMP_ERROR_SENT")).toBe(flag==="SYN");
});
