// 속성 패널에서 Firewall에만 있는 구역: iptables 필터 규칙 (T14.2.1).
// 규칙은 구성이라 스냅샷의 Document에서 읽고, 글은 콘솔의 `iptables -S`와 같은 함수로 만든다 (AD-7).
// 규칙을 바꾸는 곳은 콘솔이다. 여기서는 보기만 한다.

import { FIREWALL_CHAINS, firewallRuleSpec } from "@ping9/shared";
import type { FirewallConfig } from "@ping9/shared";
import { Fragment } from "react";

export function FirewallRules({ config }: { readonly config: FirewallConfig }) {
  return (
    <>
      <h4>필터 규칙 (iptables)</h4>
      {FIREWALL_CHAINS.map((chain) => {
        const { policy, rules } = config.filter[chain];
        return (
          <Fragment key={chain}>
            <div className="if-row">
              {chain}
              <span className="ip">기본 정책 {policy}</span>
            </div>
            {rules.length > 0 && (
              <div className="routes">
                {rules.map((rule, index) => (
                  // 규칙에는 ID가 없고 순서가 곧 번호다
                  <div key={`${index} ${firewallRuleSpec(rule)}`} className="route-row">
                    <span className="route-main fw-rule">
                      <span className="code">{index + 1}</span>
                      <span>{firewallRuleSpec(rule)}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Fragment>
        );
      })}
    </>
  );
}
