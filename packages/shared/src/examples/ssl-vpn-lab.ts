import { PORT_NAMES } from "../document";
import type { TopologyDocument, SslVpnClientConfig, SslVpnServerConfig } from "../index";
const id=(n:number)=>`00000000-0000-4000-8000-${n.toString().padStart(12,"0")}`;
export const SSL_VPN_LAB={pc:id(1601),r1:id(1602),r2:id(1603),server:id(1604),internalPc:id(1605)};
const L=SSL_VPN_LAB,[G0,G1]=PORT_NAMES.router;
export const sslVpnClientConfig:SslVpnClientConfig={enabled:true,name:"OFFICE",serverIp:"198.168.2.2",serverPort:443,expectedServerName:"vpn.office.test",trustCaId:"LAB_CA",username:"student",authId:"LAB_USER"};
export const sslVpnServerConfig:SslVpnServerConfig={enabled:true,listenAddress:"198.168.2.2",listenPort:443,serverName:"vpn.office.test",caId:"LAB_CA",certificateExpiresAtSeconds:3600,poolNetwork:"198.168.4.0",poolMask:"255.255.255.248",tunnelIp:"198.168.4.1",allowedNetworks:[{network:"198.168.3.0",mask:"255.255.255.0"}],users:[{name:"student",authId:"LAB_USER"}],lifetimeSeconds:600,maxClients:4};
const iface=(ip:string,mask="255.255.255.252")=>({adminUp:true,ip,mask});
export const sslVpnSessionLabDocument:TopologyDocument={schemaVersion:1,devices:[
 {id:L.pc,name:"PC_A",kind:"pc",position:{x:120,y:240},config:{ip:"198.168.0.2",mask:"255.255.255.0",gateway:"198.168.0.1",sslVpn:sslVpnClientConfig}},
 {id:L.r1,name:"R1",kind:"router",position:{x:330,y:240},config:{interfaces:{[G0]:iface("198.168.0.1","255.255.255.0"),[G1]:iface("198.168.1.1")},staticRoutes:[{network:"198.168.2.0",mask:"255.255.255.252",nextHop:"198.168.1.2"}]}},
 {id:L.r2,name:"R2",kind:"router",position:{x:540,y:240},config:{interfaces:{[G0]:iface("198.168.1.2"),[G1]:iface("198.168.2.1")},staticRoutes:[{network:"0.0.0.0",mask:"0.0.0.0",nextHop:"198.168.1.1"}]}},
 {id:L.server,name:"R3",kind:"router",position:{x:750,y:240},config:{cliStyle:"ios",interfaces:{[G0]:iface("198.168.2.2"),[G1]:iface("198.168.3.1","255.255.255.0")},staticRoutes:[{network:"0.0.0.0",mask:"0.0.0.0",nextHop:"198.168.2.1"}],sslVpn:sslVpnServerConfig}},
 {id:L.internalPc,name:"PC_B",kind:"pc",position:{x:960,y:240},config:{ip:"198.168.3.2",mask:"255.255.255.0",gateway:"198.168.3.1"}},
],links:[
 {id:id(1611),ends:[{deviceId:L.pc,port:"Ethernet0"},{deviceId:L.r1,port:G0!}]},
 {id:id(1612),ends:[{deviceId:L.r1,port:G1!},{deviceId:L.r2,port:G0!}]},
 {id:id(1613),ends:[{deviceId:L.r2,port:G1!},{deviceId:L.server,port:G0!}]},
 {id:id(1614),ends:[{deviceId:L.server,port:G1!},{deviceId:L.internalPc,port:"Ethernet0"}]},
]};
