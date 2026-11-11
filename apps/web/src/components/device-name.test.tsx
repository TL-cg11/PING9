import { createSimulator } from "@ping9/engine";
import { TWO_SWITCH_VLAN, twoSwitchVlanDocument } from "@ping9/shared/examples";
import { Children, isValidElement } from "react";
import type { ReactElement, ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { DeviceNameView } from "./device-name";
import type { DeviceNameViewProps } from "./device-name";
import { Inspector } from "./inspector";
import { Palette } from "./palette";

// 서버 렌더링은 글자 사이에 주석 표시를 넣으므로 빼고 비교한다
const text = (node: ReactElement) => renderToString(node).replaceAll("<!-- -->", "");

const view = (props: Partial<DeviceNameViewProps>) =>
  text(
    <DeviceNameView
      name="SW1"
      kindLabel="Switch"
      draft={null}
      error={null}
      onStart={() => {}}
      onChange={() => {}}
      onApply={() => {}}
      onCancel={() => {}}
      {...props}
    />,
  );

function inspect(props: Partial<Parameters<typeof Inspector>[0]> = {}, deviceId: string = TWO_SWITCH_VLAN.sw1.id) {
  const simulator = createSimulator();
  simulator.load(twoSwitchVlanDocument);
  return text(
    <Inspector
      snapshot={simulator.getSnapshot()}
      deviceId={deviceId}
      onOpenTerminal={() => {}}
      onDispatch={simulator.dispatch}
      {...props}
    />,
  );
}

describe("이름 바꾸기 (T1.3.3)", () => {
  test("평소에는 이름과 종류, 이름 바꾸기 버튼이 보인다", () => {
    const html = view({});

    expect(html).toContain("<h3>SW1</h3>");
    expect(html).toContain('<span class="chip">Switch</span>');
    expect(html).toMatch(/<button type="button" class="rename" aria-label="SW1 이름 바꾸기"/);
    expect(html).not.toContain("<input");
  });

  test("바꾸는 중에는 이름 자리에 입력란이 있고, 입력 중인 값이 들어 있다", () => {
    const html = view({ draft: "CORE" });

    expect(html).toMatch(/<input[^>]*class="name-input"[^>]*maxLength="32"[^>]*value="CORE"/);
    expect(html).toMatch(/<input[^>]*aria-label="장비 이름"/);
    expect(html).toMatch(/<input[^>]*aria-invalid="false"/);
    expect(html).not.toContain("<h3>");
    expect(html).not.toContain('role="alert"');
  });

  test("거부된 이름은 입력란을 남기고 사유를 보인다", () => {
    const html = view({ draft: "SW2", error: { code: "DUPLICATE_DEVICE_NAME", params: { name: "SW2" } } });

    expect(html).toMatch(/<input[^>]*aria-invalid="true"/);
    expect(html).toMatch(/class="name-err" role="alert">이미 쓰고 있는 장비 이름이에요: SW2</);
  });

  test("형식이 틀린 이름의 사유", () => {
    const html = view({ draft: "my pc", error: { code: "INVALID_DEVICE_NAME", params: { value: "my pc" } } });

    expect(html).toContain("장비 이름은 영문자, 숫자, -, _로 1~32자여야 해요: my pc");
  });
});

test("PC의 속성 패널에서 이름 줄과 PC 설정의 key가 겹치지 않는다", () => {
  // 둘 다 장비가 바뀌면 새로 만들려고 key를 쓴다. 같은 key면 React가 오류를 내고 지운 장비의 제목이 남는다.
  // 서버 렌더링은 겹친 key를 알리지 않아서, 패널이 돌려준 자식의 key를 직접 본다
  const simulator = createSimulator();
  simulator.load(twoSwitchVlanDocument);
  const panel = Inspector({
    snapshot: simulator.getSnapshot(),
    deviceId: TWO_SWITCH_VLAN.pc1.id,
    onOpenTerminal: () => {},
    onDispatch: simulator.dispatch,
  }) as ReactElement<{ children: ReactNode }>;
  const keys = Children.toArray(panel.props.children)
    .map((child) => (isValidElement(child) ? child.key : null))
    .filter((key) => key !== null && key.includes(TWO_SWITCH_VLAN.pc1.id));

  expect(keys).toHaveLength(2);
  expect(new Set(keys).size).toBe(keys.length);
});

describe("장비 삭제 (T1.3.3, T1.4.3)", () => {
  test("삭제할 길을 받지 않으면 삭제 버튼이 없다", () => {
    expect(inspect()).not.toContain("장비 삭제");
  });

  test("속성 패널에 장비 삭제 버튼이 있다", () => {
    const html = inspect({ onRemove: () => {} });

    expect(html).toMatch(/<button type="button" class="remove-device">장비 삭제<\/button>/);
    expect(html).not.toContain("remove-ask");
  });

  test("케이블이 연결된 장비는 지우기 전에 케이블 수를 알리고 한 번 더 묻는다", () => {
    const html = inspect({ onRemove: () => {}, removeAsk: true });

    expect(html).toContain('role="group" aria-label="장비 삭제 확인"');
    expect(html).toContain("SW1에 연결된 케이블 3개도 함께 지워요");
    expect(html).toMatch(/<button type="button" class="remove-device"[^>]*>삭제<\/button>/);
    expect(html).toMatch(/<button type="button" class="remove-cancel">취소<\/button>/);
    expect(html).not.toContain(">장비 삭제<");
  });
});

describe("끌던 것을 장비 목록에 놓아 취소 (T0.12)", () => {
  const palette = (dragCancel?: "idle" | "armed" | "over") =>
    text(<Palette deviceCount={2} onConnect={() => {}} {...(dragCancel === undefined ? {} : { dragCancel })} />);

  test("평소에는 시안과 같은 목록이다", () => {
    const html = palette();

    expect(html).toContain('<aside class="palette">');
    expect(html).toContain("장비를 끌어서 배치");
  });

  test("끄는 중에는 취소하는 방법을 알린다", () => {
    const html = palette("armed");

    expect(html).toContain('<aside class="palette cancel-armed">');
    expect(html).toContain("여기로 가져오면 취소");
  });

  test("목록 위에 오면 놓았을 때 취소된다고 표시한다", () => {
    const html = palette("over");

    expect(html).toContain('<aside class="palette cancel-over">');
    expect(html).toContain("놓으면 취소돼요");
  });
});
