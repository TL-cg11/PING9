import { createSimulator } from "@ping9/engine";
import { VPN_LAB as LAB, vpnUnderlayDocument } from "@ping9/shared/examples";
import { expect, test } from "vitest";
import guide from "../../../docs/guides/vpn-local-lab.md?raw";

test.each(["gre", "ipsec"])("실습안내서의 %s R1/R2 명령을 그대로 실행하면 양방향 통신이 된다", async mode => {
  const sim = createSimulator(); expect(sim.load(vpnUnderlayDocument).ok).toBe(true);
  for (const [id, side] of [[LAB.r1, "r1"], [LAB.r2, "r2"]] as const) {
    expect(sim.dispatch({ type: "router/set-cli-style", deviceId: id, style: "vyos" }).ok).toBe(true);
    const block = guide.split("```text vyos-" + mode + "-" + side + "\n")[1]?.split("```")[0];
    expect(block).toBeDefined();
    for (const command of block!.trim().split("\n")) {
      expect((await sim.console(id).exec(command)).lines.filter(line => line.kind === "error"), command).toEqual([]);
    }
  }
  for (const [id, target] of [[LAB.pcA, "192.168.2.10"], [LAB.pcB, "192.168.1.10"]] as const) {
    expect((await sim.console(id).exec(`ping -n 1 ${target}`)).lines).toContainEqual({ kind: "text", text: expect.stringContaining("TTL=126") });
  }
  expect((await sim.console(LAB.r1).exec("show interfaces ethernet eth1")).lines).toContainEqual({ kind: "text", text: expect.stringContaining("10.0.13.1/30") });
});
