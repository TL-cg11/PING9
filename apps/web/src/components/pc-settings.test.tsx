import { createSimulator } from "@ping9/engine";
import type { TopologyDocument } from "@ping9/shared";
import { TWO_PC, TWO_SWITCH_VLAN, twoPcDocument, twoSwitchVlanDocument } from "@ping9/shared/examples";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { Inspector } from "./inspector";
import { OsChoice, PcSettingsView } from "./pc-settings";
import type { PcSettingsViewProps } from "./pc-settings";

const { pc1, pc2, mask } = TWO_PC;

// 서버 렌더링은 글자 사이에 주석 표시를 넣으므로 빼고 비교한다
const text = (node: ReactElement) => renderToString(node).replaceAll("<!-- -->", "");

const ignoreDispatch = () => ({ ok: true, notices: [] }) as const;

function inspect(document: TopologyDocument, deviceId: string) {
  const simulator = createSimulator();
  simulator.load(document);
  return text(
    <Inspector
      snapshot={simulator.getSnapshot()}
      deviceId={deviceId}
      onOpenTerminal={() => {}}
      onDispatch={ignoreDispatch}
    />,
  );
}

const view = (props: Partial<PcSettingsViewProps>) =>
  text(
    <PcSettingsView
      draft={{ ip: "", mask: "", gateway: "" }}
      errors={{}}
      general={null}
      notices={[]}
      status={null}
      onChange={() => {}}
      onApply={() => {}}
      {...props}
    />,
  );

describe("속성 패널의 PC 구역", () => {
  test("PC를 고르면 세 칸이 구성 값으로 채워진다", () => {
    const html = inspect(twoPcDocument, pc1.id);

    expect(html).toContain("<h4>IP 설정</h4>");
    expect(html).toMatch(/<label[^>]*>IP 주소<\/label><input[^>]*value="192\.168\.1\.1"/);
    expect(html).toMatch(/<label[^>]*>서브넷 마스크<\/label><input[^>]*value="255\.255\.255\.0"/);
    expect(html).toMatch(/<label[^>]*>기본 게이트웨이<\/label><input[^>]*value=""/);
    expect(html).toContain('<button type="submit" class="apply">적용</button>');
  });

  test("OS 고르기가 있고, OS 칸이 없는 PC는 Windows가 골라져 있다 (T0.7)", () => {
    const html = inspect(twoPcDocument, pc1.id);

    expect(html).toContain("<legend>OS</legend>");
    expect(html).toMatch(/<input type="radio"[^>]*checked=""[^>]*value="windows"/);
    expect(html).not.toMatch(/<input type="radio"[^>]*checked=""[^>]*value="linux"/);
  });

  test("마스크 칸 옆에 길이를 보인다 (T0.7)", () => {
    expect(inspect(twoPcDocument, pc1.id)).toContain('<span class="prefix">/24</span>');
  });

  test("Switch에는 없다", () => {
    expect(inspect(twoSwitchVlanDocument, TWO_SWITCH_VLAN.sw1.id)).not.toContain("IP 설정");
  });
});

describe("PcSettingsView", () => {
  test("칸마다 label이 input을 가리킨다", () => {
    const html = view({});

    for (const match of html.matchAll(/<label for="([^"]+)">/g)) {
      expect(html).toContain(`id="${match[1]}"`);
    }
    expect(html.match(/<label for=/g)).toHaveLength(3);
  });

  test("오류는 그 칸 아래에 문구로 나오고 칸과 묶인다", () => {
    const html = view({
      draft: { ip: "10.0.0.1", mask: "255.255.255.0", gateway: "10.0.1.1" },
      errors: {
        gateway: { code: "GATEWAY_NOT_IN_NETWORK", params: { gateway: "10.0.1.1", ip: "10.0.0.1", mask } },
      },
    });

    expect(html).toMatch(
      /기본 게이트웨이<\/label><input[^>]*aria-invalid="true"[^>]*aria-describedby="([^"]+)"[^>]*><div id="\1" class="field-err">게이트웨이 10\.0\.1\.1이 10\.0\.0\.1 255\.255\.255\.0와 같은 네트워크에 없어요<\/div>/,
    );
    expect(html.match(/aria-invalid="true"/g)).toHaveLength(1);
  });

  test("칸과 상관없는 오류는 위쪽에 한 줄", () => {
    const html = view({ general: { code: "DEVICE_NOT_FOUND", params: { deviceId: "d" } } });

    expect(html).toMatch(/<h4>IP 설정<\/h4><div class="form-err" role="alert">[^<]+<\/div>/);
  });

  test("중복 IP 경고", () => {
    const html = view({
      notices: [{ code: "DUPLICATE_IP", params: { ip: pc2.ip, others: [{ deviceId: pc2.id, deviceName: pc2.name }] } }],
    });

    expect(html).toContain('<div class="form-notice" role="status">⚠ 192.168.1.2는 PC2도 쓰고 있어요. 이대로 두면 통신이 제대로 안 될 수 있어요</div>');
  });

  test.each([
    ["applied", '<div class="form-status applied" role="status">✓ 적용했어요</div>'],
    ["unchanged", '<div class="form-status unchanged" role="status">바뀐 값이 없어요</div>'],
  ] as const)("적용 결과 한 줄: %s", (status, expected) => {
    expect(view({ status })).toContain(expected);
  });

  test("결과가 없으면 결과 줄도 없다", () => {
    expect(view({})).not.toContain("form-status");
  });

  test("값의 글자는 HTML로 해석되지 않는다 (SEC-11)", () => {
    const html = view({
      draft: { ip: "<b>x</b>", mask: "", gateway: "" },
      errors: { ip: { code: "INVALID_IPV4", params: { value: "<b>x</b>" } } },
    });

    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});

describe("OsChoice (T0.7)", () => {
  test("Windows와 Linux 라디오 버튼 둘이 같은 묶음이고 고른 것만 checked", () => {
    const html = text(<OsChoice os="linux" onChange={() => {}} />);

    expect(html.match(/type="radio"/g)).toHaveLength(2);
    const names = [...html.matchAll(/name="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(names).size).toBe(1);
    expect(html).toMatch(/checked="" value="linux"/);
    expect(html).not.toMatch(/checked="" value="windows"/);
    expect(html).toContain("Windows");
    expect(html).toContain("Linux");
  });
});

describe("마스크 칸의 길이 표시 (T0.7)", () => {
  test("길이로 써도 /24를 보인다", () => {
    expect(view({ draft: { ip: "", mask: "24", gateway: "" } })).toContain('<span class="prefix">/24</span>');
  });

  test("비었거나 틀렸으면 없다", () => {
    expect(view({})).not.toContain('class="prefix"');
    expect(view({ draft: { ip: "", mask: "255.0.255.0", gateway: "" } })).not.toContain('class="prefix"');
  });
});
