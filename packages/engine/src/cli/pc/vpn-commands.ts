// PING9 전용 명령. Windows/Linux/VyOS의 실제 VPN 제품 명령이 아니다.
import { errorInfo } from "@ping9/shared";
import type { ConsoleLine, SslVpnAction } from "@ping9/shared";
import { defineCommand, param } from "../ios";
import type { CommandDefinition } from "../ios";

export const VPN_COMMANDS: readonly CommandDefinition[] = (["connect","disconnect","status"] as const).map(action=>defineCommand({
  modes:["user"],devices:["pc"],
  tokens:action==="connect"?["vpn",action,param("profile","word","PING9 VPN profile name")]:["vpn",action],
  help:`PING9 educational SSL VPN: ${action} (NO TLS/encryption, session only)`,
  run:(args,context)=>{
    if(context.device.kind!=="pc") return {};
    if(action==="connect"&&args.profile!==context.device.config.sslVpn?.name) return {lines:[
      {kind:"text",text:"PING9 educational VPN: vpn connect <configured-profile>"},
      {kind:"error",...errorInfo("CLI_INVALID_VALUE",{token:String(args.profile)})},
    ]};
    const run=context.runtime?.sslVpn?.(context.device.id,action as SslVpnAction);
    if(!run) return {lines:[{kind:"error",...errorInfo("CLI_UNKNOWN_COMMAND",{token:"vpn"})}]};
    const lines:ConsoleLine[]=[{kind:"text",text:"PING9 educational SSL VPN · NO TLS/encryption · data tunnel not implemented"},
      {kind:"text",text:`State: ${run.session.state}`},{kind:"text",text:run.session.detail}];
    if(run.session.virtualIp) lines.push({kind:"text",text:`Virtual IP: ${run.session.virtualIp}; session ${run.session.sessionId}`});
    if(run.traceId!==undefined) lines.push({kind:"trace",traceId:run.traceId});
    return {lines};
  },
}));
