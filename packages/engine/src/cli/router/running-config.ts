import { PORT_NAMES } from "@ping9/shared";
import type { RouterDevice } from "@ping9/shared";

/** 기본 구성과 다른 설정을, 포트 순서대로 다시 입력할 수 있는 명령어로 만든다. */
export function routerRunningConfigLines(device: RouterDevice): string[] {
  const lines = [`hostname ${device.name}`, "!"];
  for (const port of PORT_NAMES.router) {
    const iface = device.config.interfaces[port];
    if (iface === undefined) continue;
    const settings: string[] = [];
    if (iface.ip !== undefined && iface.mask !== undefined) settings.push(` ip address ${iface.ip} ${iface.mask}`);
    if (iface.adminUp) settings.push(" no shutdown");
    if (settings.length > 0) lines.push(`interface ${port}`, ...settings, "!");
  }
  for (const route of device.config.staticRoutes) {
    lines.push(`ip route ${route.network} ${route.mask} ${route.nextHop}`);
  }
  lines.push("end");
  return lines;
}
