import { expect, test } from "vitest";
import { validateDocument, validateTrace } from "@ping9/shared";
import type { SslVpnClientConfig, SslVpnServerConfig, TopologyDocument } from "@ping9/shared";
import { SSL_VPN_LAB as L, sslVpnClientConfig as client, sslVpnServerConfig as server, sslVpnSessionLabDocument as lab } from "@ping9/shared/examples";
import { createSimulator } from "../simulator";
const text=(r:{lines:readonly {kind:string;text?:string}[]})=>r.lines.filter(l=>l.kind==="text").map(l=>l.text).join("\n");
const open=(document:TopologyDocument=lab)=>{const sim=createSimulator();expect(sim.load(document).ok).toBe(true);return sim;};
type Sim=ReturnType<typeof open>;
const exec=(sim:Sim,line:string,id=L.pc)=>sim.console(id).exec(line);
const setClient=(sim:Sim,patch:Partial<SslVpnClientConfig>,id=L.pc)=>expect(sim.dispatch({type:"ssl-vpn/set-client",deviceId:id,config:{...client,...patch}}).ok).toBe(true);
const setServer=(sim:Sim,patch:Partial<SslVpnServerConfig>)=>expect(sim.dispatch({type:"ssl-vpn/set-server",deviceId:L.server,config:{...server,...patch}}).ok).toBe(true);
const latest=(sim:Sim)=>sim.getTrace(sim.getSnapshot().traces[0]!.id)!;

test("물리 PC→R1→R2→R3의 제어 메시지가 왕복한 뒤 가상 IP를 얻는다",async()=>{
 const sim=open();expect(text(await exec(sim,"vpn status"))).toContain("disconnected");
 const result=await exec(sim,"vpn connect OFFICE");expect(text(result)).toContain("State: connected");expect(text(result)).toContain("198.168.4.2");
 const trace=latest(sim);expect(trace.result.status).toBe("success");expect(validateTrace(trace).ok).toBe(true);
 expect(trace.events.filter(e=>e.deviceId===L.server&&e.reason.code==="TCP_SIM_SEGMENT_RECEIVED")).toHaveLength(3);
 expect(trace.events.filter(e=>e.deviceId===L.pc&&e.reason.code==="TCP_SIM_SEGMENT_RECEIVED")).toHaveLength(3);
 for(const id of [L.r1,L.r2])expect(trace.events.filter(e=>e.deviceId===id&&e.reason.code==="IPV4_FORWARDED")).toHaveLength(6);
 expect(trace.events.some(e=>e.reason.code==="SSL_VPN_STATE_CHANGED"&&e.reason.params.state==="validating")).toBe(true);
 expect(text(result)).toContain("NO TLS/encryption");
 const again=text(await exec(sim,"vpn connect OFFICE"));expect(again).toContain("ssl-1");
 expect(text(await exec(sim,"vpn disconnect"))).toContain("virtual IP released");
 expect(text(await exec(sim,"vpn status"))).toContain("disconnected");
 expect(text(await exec(sim,"vpn connect OFFICE"))).toContain("198.168.4.2");
});

test.each([
 ["expectedServerName","wrong","Server name mismatch"],
 ["trustCaId","WRONG_CA","Untrusted CA"],
 ["username","unknown","Authentication failed"],
 ["authId","WRONG_USER","Authentication failed"],
] as const)("%s 불일치 접속은 실패하고 복구 후 같은 IP를 할당한다",async(field,value,reason)=>{
 const sim=open();setClient(sim,{[field]:value});expect(text(await exec(sim,"vpn connect OFFICE"))).toContain(reason);
 expect(latest(sim).result.status).toBe("failed");expect(validateTrace(latest(sim)).ok).toBe(true);
 setClient(sim,{});expect(text(await exec(sim,"vpn connect OFFICE"))).toContain("198.168.4.2");
});

test.each(["request","reply"])("Router 경로의 %s 방향을 끊으면 연결 성공/가상 IP를 만들지 않는다",async direction=>{
 const sim=open();const id=direction==="request"?L.r2:L.server;
 const port=direction==="request"?"GigabitEthernet0/1":"GigabitEthernet0/0";
 expect(sim.dispatch({type:"interface/set-admin",deviceId:id,port,adminUp:false}).ok).toBe(true);
 const result=text(await exec(sim,"vpn connect OFFICE"));expect(result).toContain("timed out");expect(result).not.toContain("Virtual IP:");
 expect(latest(sim).events.some(e=>e.dropReason==="SSL_VPN_REJECTED")).toBe(true);
 expect(validateTrace(latest(sim)).ok).toBe(true);
 expect(sim.dispatch({type:"interface/set-admin",deviceId:id,port,adminUp:true}).ok).toBe(true);
 expect(text(await exec(sim,"vpn connect OFFICE"))).toContain("198.168.4.2");
});

test("가상 인증서·세션 만료는 가상 시계에 따르고 자동 재접속하지 않는다",async()=>{
 const sim=open();setServer(sim,{certificateExpiresAtSeconds:1});
 await exec(sim,"ping -n 1 198.168.0.99"); // ARP timeout advances virtual time
 expect(text(await exec(sim,"vpn connect OFFICE"))).toContain("certificate expired");
 setServer(sim,{lifetimeSeconds:1});expect(text(await exec(sim,"vpn connect OFFICE"))).toContain("State: connected");
 await exec(sim,"ping -n 1 198.168.0.99");
 expect(text(await exec(sim,"vpn status"))).toContain("Session expired");
 expect(text(await exec(sim,"vpn connect OFFICE"))).toContain("198.168.4.2");
});

test("이름·배치 변경은 세션을 유지하고 관련 IP/설정/링크 변경은 해제한다",async()=>{
 const sim=open();await exec(sim,"vpn connect OFFICE");
 sim.dispatch({type:"device/move",deviceId:L.pc,position:{x:150,y:250}});sim.dispatch({type:"device/rename",deviceId:L.pc,name:"Remote"});
 expect(text(await exec(sim,"vpn status"))).toContain("State: connected");
 setServer(sim,{caId:"OTHER_CA"});expect(text(await exec(sim,"vpn status"))).toContain("disconnected");
 setServer(sim,{});await exec(sim,"vpn connect OFFICE");
 sim.dispatch({type:"link/remove",linkId:lab.links[1]!.id});expect(text(await exec(sim,"vpn status"))).toContain("disconnected");
});

test("설정은 JSON으로 보관하고 동적 세션·할당 IP는 저장하지 않는다",async()=>{
 const sim=open();await exec(sim,"vpn connect OFFICE");const saved=JSON.parse(JSON.stringify(sim.getSnapshot().document));
 expect(JSON.stringify(saved)).not.toContain("ssl-1");expect(JSON.stringify(saved)).not.toContain("198.168.4.2");
 const restored=open(saved);expect(text(await exec(restored,"vpn status"))).toContain("disconnected");
 expect(text(await exec(restored,"vpn connect OFFICE"))).toContain("198.168.4.2");
 // A session alone does not yet carry inner ICMP.
 expect(text(await exec(restored,"ping -n 1 198.168.3.2"))).not.toContain("bytes=32");
});

test.each(["listenPort","maxClients","pool","users","overlap","endpoint"])("잘못된 서버 %s 설정은 문서를 변경하지 않는다",problem=>{
 const sim=open();const before=sim.getSnapshot();
 const patch=problem==="listenPort"?{listenPort:65536}:problem==="maxClients"?{maxClients:5}:problem==="pool"?{poolNetwork:"198.168.4.2"}:problem==="users"?{users:[{name:"student",authId:"A"},{name:"student",authId:"B"}]}:problem==="overlap"?{poolNetwork:"198.168.3.0",poolMask:"255.255.255.0",tunnelIp:"198.168.3.2"}:{allowedNetworks:[{network:"198.168.2.0",mask:"255.255.255.252"}]};
 expect(sim.dispatch({type:"ssl-vpn/set-server",deviceId:L.server,config:{...server,...patch}}).ok).toBe(false);expect(sim.getSnapshot()).toBe(before);
});

test("프로필/장비 종류와 서버 중지·포트 불일치·존재하지 않는 endpoint를 검사한다",async()=>{
 const sim=open();expect(sim.dispatch({type:"ssl-vpn/set-server",deviceId:L.pc,config:server}).ok).toBe(false);
 setClient(sim,{serverPort:444});expect(text(await exec(sim,"vpn connect OFFICE"))).toContain("timed out");
 setClient(sim,{});setServer(sim,{enabled:false});expect(text(await exec(sim,"vpn connect OFFICE"))).toContain("timed out");
 setServer(sim,{});setClient(sim,{serverIp:"198.168.2.99"});expect(text(await exec(sim,"vpn connect OFFICE"))).toContain("timed out");
 expect(text(await exec(sim,"vpn connect UNKNOWN"))).toContain("PING9 educational VPN");
});

function multiClientDocument():TopologyDocument {
 const sw="00000000-0000-4000-8000-000000001620";
 return {...lab,devices:[...lab.devices,{id:sw,name:"SW1",kind:"switch",position:{x:220,y:200},config:{vlans:[],ports:{}}},
 ...[1,2,3,4].map(n=>({id:`00000000-0000-4000-8000-${String(1620+n).padStart(12,"0")}`,name:`Client${n}`,kind:"pc" as const,position:{x:0,y:n*50},config:{ip:`198.168.0.${10+n}`,mask:"255.255.255.0",gateway:"198.168.0.1",sslVpn:client}}))],
 links:[{...lab.links[0]!,ends:[{deviceId:L.pc,port:"Ethernet0"},{deviceId:sw,port:"FastEthernet0/1"}]},{id:"00000000-0000-4000-8000-000000001630",ends:[{deviceId:sw,port:"FastEthernet0/2"},lab.links[0]!.ends[1]]},...lab.links.slice(1),
 ...[1,2,3,4].map(n=>({id:`00000000-0000-4000-8000-${String(1630+n).padStart(12,"0")}`,ends:[{deviceId:`00000000-0000-4000-8000-${String(1620+n).padStart(12,"0")}`,port:"Ethernet0"},{deviceId:sw,port:`FastEthernet0/${n+2}`} ] as const}))]};
}

test.each(["limit","pool"])("여러 클라이언트의 주소는 유일하며 %s 상한 후 해제하면 재사용한다",async problem=>{
 const doc=multiClientDocument();expect(validateDocument(doc).ok).toBe(true);const sim=open(doc);
 if(problem==="pool")setServer(sim,{poolMask:"255.255.255.252"});else setServer(sim,{maxClients:1});
 expect(text(await exec(sim,"vpn connect OFFICE"))).toContain("198.168.4.2");
 const other="00000000-0000-4000-8000-000000001621";
 expect(text(await exec(sim,"vpn connect OFFICE",other))).toContain(problem==="pool"?"pool exhausted":"session limit");
 await exec(sim,"vpn disconnect");expect(text(await exec(sim,"vpn connect OFFICE",other))).toContain("198.168.4.2");
});


test("4개 동시 세션의 주소는 유일하고 5번째는 거절되며 다른 세션을 건드리지 않고 주소를 회수한다",async()=>{
 const sim=open(multiClientDocument());const ids=[L.pc,...[1,2,3,4].map(n=>`00000000-0000-4000-8000-${String(1620+n).padStart(12,"0")}`)];
 for(const [i,id] of ids.slice(0,4).entries()) expect(text(await exec(sim,"vpn connect OFFICE",id))).toContain(`198.168.4.${i+2}`);
 expect(text(await exec(sim,"vpn connect OFFICE",ids[4]!))).toContain("session limit");
 await exec(sim,"vpn disconnect",ids[0]!);
 expect(text(await exec(sim,"vpn status",ids[1]!))).toContain("198.168.4.3");
 expect(text(await exec(sim,"vpn connect OFFICE",ids[4]!))).toContain("198.168.4.2");
});

test("PC의 기존 명령 도움말·Tab과 VPN 명령을 함께 제공한다",async()=>{
 const sim=open();const cli=sim.console(L.pc);
 expect(text(await cli.exec("help"))).toContain("vpn connect");
 expect(cli.complete("vpn con")).toBe("vpn connect ");
 expect(cli.candidates("vpn ")).toEqual(["connect","disconnect","status"]);
 expect(text(await cli.exec("vpn connect OFFICE"))).toContain("State: connected");
 expect(text(await cli.exec("ipconfig"))).toContain("198.168.0.2");
});


test.each(["OUTPUT", "INPUT"] as const)("Server PC의 %s 규칙은 VPN 제어 TCP에도 적용되고 복구 후 접속한다",async chain=>{
 const sim=open();expect(sim.dispatch({type:"pc/set-os",deviceId:L.pc,os:"server"}).ok).toBe(true);
 const cli=sim.console(L.pc),match=chain==="OUTPUT"?"--dport":"--sport";
 expect((await cli.exec(`iptables -A ${chain} -p tcp ${match} 443 -j DROP`)).lines.filter(l=>l.kind==="error")).toEqual([]);
 const result=text(await cli.exec("vpn connect OFFICE"));expect(result).toContain("timed out");expect(result).not.toContain("Virtual IP:");
 expect(latest(sim).events.find(e=>e.dropReason==="FIREWALL_BLOCKED")?.reason.params).toMatchObject({chain,target:"DROP"});
 expect((await cli.exec(`iptables -D ${chain} 1`)).lines.filter(l=>l.kind==="error")).toEqual([]);
 expect(text(await cli.exec("vpn connect OFFICE"))).toContain("Virtual IP: 198.168.4.2");
});
