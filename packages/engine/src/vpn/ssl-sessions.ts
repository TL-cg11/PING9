// 네트워크 경로를 통과하는 공개 실습용 제어 메시지. 실제 TCP handshake/TLS/암호화는 없다.
import { formatIpv4, parseIpv4, SSL_VPN_CLIENT_PORT, SSL_VPN_TIMEOUT_US } from "@ping9/shared";
import type { PcDevice, RouterDevice, SslVpnSessionView, TcpSegment, TopologyDocument } from "@ping9/shared";
import type { Frame, SimContext, TimerRef } from "../kernel";
import { deviceRef, portMac } from "../topology";

type Lease = {clientId:string;serverId:string;clientIp:string;serverIp:string;port:number;virtualIp:string;sessionId:string;expiresAtUs:number};
type Attempt = {id:number;clientId:string;clientIp:string;serverId?:string;serverIp:string;port:number;kind:"connect"|"disconnect";stage:string;timer?:TimerRef;offer?:Lease;serverReady?:boolean};
type Wire = {t:string;a:number;serverName?:string;caId?:string;certificateExpiresAtSeconds?:number;username?:string;authId?:string;sessionId?:string;virtualIp?:string;expiresAtUs?:number;detail?:string};
type Send = (ctx:SimContext,deviceId:string,sourceIp:string,targetIp:string,segment:TcpSegment)=>boolean;
const disconnected = (detail="Disconnected"):SslVpnSessionView=>({state:"disconnected",detail});

export class SslVpnSessions {
  readonly #document:()=>TopologyDocument;
  readonly #now:()=>number;
  readonly #send:Send;
  readonly #leases=new Map<string,Lease>();
  readonly #states=new Map<string,SslVpnSessionView>();
  #attempt:Attempt|undefined;
  #next=0;
  constructor(document:()=>TopologyDocument,now:()=>number,send:Send){this.#document=document;this.#now=now;this.#send=send;}
  #pc(id:string):PcDevice|undefined {const d=this.#document().devices.find(d=>d.id===id);return d?.kind==="pc"?d:undefined;}
  #server(id:string):RouterDevice|undefined {const d=this.#document().devices.find(d=>d.id===id);return d?.kind==="router"?d:undefined;}
  reset():void{this.#leases.clear();this.#states.clear();this.#attempt=undefined;this.#next=0;}
  #expire():void {
    for(const [id,lease] of this.#leases) if(this.#now()>=lease.expiresAtUs){this.#leases.delete(id);this.#states.set(id,disconnected("Session expired (virtual time)"));}
  }
  status(id:string):SslVpnSessionView {this.#expire();return {...(this.#states.get(id)??disconnected())};}
  #record(ctx:SimContext,id:string,state:SslVpnSessionView,frame?:Frame):void {
    this.#states.set(id,state);
    const device=this.#document().devices.find(d=>d.id===id);if(!device||!frame)return;
    const base={frame,deviceId:id,layer:"TCP" as const};
    if(state.state==="failed") ctx.record({...base,action:"drop",reason:{code:"SSL_VPN_REJECTED",params:{device:deviceRef(device),detail:state.detail}}});
    else ctx.record({...base,action:"learn",reason:{code:"SSL_VPN_STATE_CHANGED",params:{device:deviceRef(device),state:state.state,detail:state.detail}}});
  }
  #wire(ctx:SimContext,a:Attempt,server:boolean,message:Wire):void {
    this.#send(ctx,server?a.serverId!:a.clientId,server?a.serverIp:a.clientIp,server?a.clientIp:a.serverIp,{
      sourcePort:server?a.port:SSL_VPN_CLIENT_PORT,destinationPort:server?SSL_VPN_CLIENT_PORT:a.port,
      sequence:a.id,flags:["PSH","ACK"],payload:JSON.stringify(message),
    });
  }
  begin(ctx:SimContext,id:string,kind:"connect"|"disconnect"):void {
    this.#expire();const pc=this.#pc(id),config=pc?.config.sslVpn;
    if(kind==="disconnect"&&!this.#leases.has(id)){this.#states.set(id,disconnected());return;}
    if(kind==="connect"&&this.status(id).state==="connected")return;
    if(!pc||!config?.enabled||!pc.config.ip||pc.config.adminUp===false){this.#states.set(id,{state:"failed",detail:"Enabled VPN profile and physical IP/port required"});return;}
    const lease=this.#leases.get(id);
    const a:Attempt={id:++this.#next,clientId:id,clientIp:pc.config.ip,serverIp:config.serverIp,port:config.serverPort,kind,stage:kind==="connect"?"hello":"bye",...(lease===undefined?{}:{serverId:lease.serverId,offer:lease})};
    this.#attempt=a;this.#states.set(id,{state:"connecting",serverIp:a.serverIp,detail:kind==="connect"?"Connecting (educational, no TLS)":"Disconnecting"});
    a.timer=ctx.setTimer(id,`ssl-vpn:${a.id}`,SSL_VPN_TIMEOUT_US);
    this.#wire(ctx,a,false,{t:kind==="connect"?"hello-request":"bye",a:a.id,...(lease?{sessionId:lease.sessionId}:{})});
  }
  #message(frame:Frame):Wire|undefined {
    const tcp=frame.snapshot.tcp;
    if(frame.snapshot.ipv4?.protocol!==6||tcp===undefined||!("sequence" in tcp)||!tcp.payload||tcp.payload.length>512)return;
    try{const value:unknown=JSON.parse(tcp.payload);if(typeof value!=="object"||value===null||Array.isArray(value))return;const m=value as Wire;if(typeof m.t!=="string"||!Number.isInteger(m.a))return;return m;}catch{return;}
  }
  onServer(ctx:SimContext,id:string,frame:Frame):void {
    const a=this.#attempt,m=this.#message(frame),server=this.#server(id),cfg=server?.config.sslVpn,tcp=frame.snapshot.tcp,ip=frame.snapshot.ipv4;
    if(!a||!m||m.a!==a.id||!cfg?.enabled||!ip||!tcp||ip.sourceIp!==a.clientIp||ip.destinationIp!==cfg.listenAddress||cfg.listenAddress!==a.serverIp||tcp.sourcePort!==SSL_VPN_CLIENT_PORT||tcp.destinationPort!==cfg.listenPort||cfg.listenPort!==a.port)return;
    a.serverId=id;
    if(a.kind==="disconnect") {
      const lease=this.#leases.get(a.clientId);
      if(m.t!=="bye"||!lease||lease.serverId!==id||lease.sessionId!==m.sessionId)return;
      this.#leases.delete(a.clientId);this.#wire(ctx,a,true,{t:"bye-ack",a:a.id,sessionId:lease.sessionId});return;
    }
    if(m.t==="hello-request"&&a.stage==="hello"){
      a.stage="trust";this.#wire(ctx,a,true,{t:"hello",a:a.id,serverName:cfg.serverName,caId:cfg.caId,certificateExpiresAtSeconds:cfg.certificateExpiresAtSeconds});return;
    }
    if(m.t==="auth"&&a.stage==="auth"){
      this.#expire();
      const reject=(detail:string)=>{a.stage="reject";this.#wire(ctx,a,true,{t:"reject",a:a.id,detail});};
      if(!cfg.users.some(user=>user.name===m.username&&user.authId===m.authId)){reject("Authentication failed (educational identifier)");return;}
      if([...this.#leases.values()].filter(l=>l.serverId===id).length>=cfg.maxClients){reject("Server session limit reached");return;}
      const start=parseIpv4(cfg.poolNetwork)!,mask=parseIpv4(cfg.poolMask)!,end=start+(0xffffffff-mask);
      const used=new Set([...this.#leases.values()].filter(l=>l.serverId===id).map(l=>l.virtualIp));
      let allocated:string|undefined;
      for(let n=start+1;n<end;n++){const candidate=formatIpv4(n);if(candidate!==cfg.tunnelIp&&!used.has(candidate)){allocated=candidate;break;}}
      if(!allocated){reject("VPN IP pool exhausted");return;}
      a.offer={clientId:a.clientId,clientIp:a.clientIp,serverId:id,serverIp:a.serverIp,port:a.port,virtualIp:allocated,sessionId:`ssl-${a.id}`,expiresAtUs:ctx.now()+cfg.lifetimeSeconds*1_000_000};
      a.stage="offer";this.#wire(ctx,a,true,{t:"offer",a:a.id,virtualIp:allocated,sessionId:a.offer.sessionId,expiresAtUs:a.offer.expiresAtUs});return;
    }
    if(m.t==="confirm"&&a.stage==="confirm"&&a.offer&&m.sessionId===a.offer.sessionId){
      a.serverReady=true;a.stage="ready";this.#wire(ctx,a,true,{t:"ready",a:a.id,sessionId:a.offer.sessionId});
    }
  }
  onClient(ctx:SimContext,id:string,frame:Frame):void {
    const a=this.#attempt,m=this.#message(frame),pc=this.#pc(id),cfg=pc?.config.sslVpn,ip=frame.snapshot.ipv4,tcp=frame.snapshot.tcp;
    if(!a||id!==a.clientId||!cfg||!m||m.a!==a.id||!ip||!tcp||ip.sourceIp!==a.serverIp||ip.destinationIp!==a.clientIp||tcp.sourcePort!==a.port||tcp.destinationPort!==SSL_VPN_CLIENT_PORT)return;
    const fail=(detail:string)=>{if(a.timer)ctx.cancelTimer(a.timer);this.#record(ctx,id,{state:"failed",detail,serverIp:a.serverIp},frame);a.stage="failed";};
    if(a.kind==="disconnect"&&m.t==="bye-ack"&&m.sessionId===a.offer?.sessionId){if(a.timer)ctx.cancelTimer(a.timer);this.#record(ctx,id,disconnected("Disconnected; virtual IP released"),frame);a.stage="done";return;}
    if(a.kind!=="connect")return;
    if(m.t==="hello"&&a.stage==="trust"){
      if(m.serverName!==cfg.expectedServerName){fail("Server name mismatch");return;}
      if(m.caId!==cfg.trustCaId){fail("Untrusted CA identifier");return;}
      if(!Number.isInteger(m.certificateExpiresAtSeconds)||ctx.now()>=m.certificateExpiresAtSeconds!*1_000_000){fail("Educational certificate expired (virtual time)");return;}
      this.#record(ctx,id,{state:"validating",detail:"Trust identifiers matched; validating user",serverIp:a.serverIp},frame);
      a.stage="auth";this.#wire(ctx,a,false,{t:"auth",a:a.id,username:cfg.username,authId:cfg.authId});return;
    }
    if(m.t==="reject"&&a.stage==="reject"){fail(typeof m.detail==="string"?m.detail.slice(0,128):"Connection rejected");return;}
    if(m.t==="offer"&&a.stage==="offer"&&a.offer&&m.sessionId===a.offer.sessionId&&m.virtualIp===a.offer.virtualIp){a.stage="confirm";this.#wire(ctx,a,false,{t:"confirm",a:a.id,sessionId:m.sessionId});return;}
    if(m.t==="ready"&&a.stage==="ready"&&a.offer&&a.serverReady&&m.sessionId===a.offer.sessionId){
      this.#leases.set(id,a.offer);if(a.timer)ctx.cancelTimer(a.timer);a.stage="done";
      this.#record(ctx,id,{state:"connected",detail:"Educational session established; NO TLS/encryption; data tunnel pending",serverIp:a.serverIp,virtualIp:a.offer.virtualIp,sessionId:a.offer.sessionId,expiresAtUs:a.offer.expiresAtUs},frame);
    }
  }
  onTimer(ctx:SimContext,timer:TimerRef):boolean {
    if(!timer.key.startsWith("ssl-vpn:"))return false;
    const a=this.#attempt;if(a&&timer.key===`ssl-vpn:${a.id}`&&a.stage!=="done"&&a.stage!=="failed"){
      const diagnostic=ctx.createFrame({ethernet:{sourceMac:portMac(this.#pc(a.clientId)!,"Ethernet0"),destinationMac:"00:00:00:00:00:00"},ipv4:{sourceIp:a.clientIp,destinationIp:a.serverIp,ttl:64,protocol:6},tcp:{sourcePort:SSL_VPN_CLIENT_PORT,destinationPort:a.port,sequence:a.id,flags:[]}});
      this.#record(ctx,a.clientId,a.kind==="disconnect"?disconnected("Disconnected locally; server lease expires if request was blocked"):{state:"failed",detail:"Connection timed out (route, firewall or endpoint)",serverIp:a.serverIp},diagnostic);
      a.stage="failed";
    }
    return true;
  }
  finish(id:string):SslVpnSessionView {this.#attempt=undefined;return this.status(id);}
  configChanged(previous:TopologyDocument,document:TopologyDocument):boolean {
    let changed=false;
    const fingerprint=(doc:TopologyDocument,id:string)=>{const d=doc.devices.find(d=>d.id===id);if(d?.kind==="pc"){const {ip,mask,gateway,adminUp,sslVpn}=d.config;return JSON.stringify({ip,mask,gateway,adminUp,sslVpn});}if(d?.kind==="router")return JSON.stringify({interfaces:d.config.interfaces,sslVpn:d.config.sslVpn});return "missing";};
    const physical=(doc:TopologyDocument)=>JSON.stringify(doc.devices.map(d=>d.kind==="pc"?{id:d.id,ip:d.config.ip,mask:d.config.mask,adminUp:d.config.adminUp??true}:d.kind==="switch"?{id:d.id,ports:d.config.ports}:{id:d.id,interfaces:d.config.interfaces}));
    const linksChanged=JSON.stringify(previous.links)!==JSON.stringify(document.links)||physical(previous)!==physical(document);
    for(const [id,lease] of this.#leases) if(linksChanged||fingerprint(previous,id)!==fingerprint(document,id)||fingerprint(previous,lease.serverId)!==fingerprint(document,lease.serverId)){
      this.#leases.delete(id);this.#states.set(id,disconnected("Relevant configuration/link changed; reconnect required"));changed=true;
    }
    for(const [id,state] of this.#states) if(state.state!=="connected"&&fingerprint(previous,id)!==fingerprint(document,id)){this.#states.delete(id);changed=true;}
    return changed;
  }
}
