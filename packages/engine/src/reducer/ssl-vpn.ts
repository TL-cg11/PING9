import { errorInfo, validateDocument } from "@ping9/shared";
import type { CommandHandler } from "../reducer";

const set: CommandHandler<"ssl-vpn/set-client" | "ssl-vpn/set-server"> = (document, command) => {
  const device=document.devices.find(item=>item.id===command.deviceId);
  if (!device) return {ok:false,error:errorInfo("DEVICE_NOT_FOUND",{deviceId:command.deviceId})};
  const kind=command.type==="ssl-vpn/set-client"?"pc":"router";
  if(device.kind!==kind) return {ok:false,error:errorInfo("DEVICE_KIND_MISMATCH",{deviceId:device.id,expected:kind,actual:device.kind})};
  const checked=validateDocument({...document,devices:document.devices.map(item=>item.id!==device.id?item:{...item,config:{...item.config,sslVpn:command.config===null?undefined:command.config}})});
  return checked.ok?{ok:true,document:checked.document,notices:[]}:checked;
};
export const setSslClient: CommandHandler<"ssl-vpn/set-client"> = (document, command) => set(document, command);
export const setSslServer: CommandHandler<"ssl-vpn/set-server"> = (document, command) => set(document, command);
