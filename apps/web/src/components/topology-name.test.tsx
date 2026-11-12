import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { TopBar } from "./top-bar";
import { NAME_HINT, normalizeTopologyName } from "./topology-name";

describe("토폴로지 이름 고치기 (T0.16)", () => {
  test("앞뒤 공백을 뗀다", () => {
    expect(normalizeTopologyName("  1주차 VLAN 실습 ")).toBe("1주차 VLAN 실습");
  });

  test("비었거나 공백뿐이면 쓸 수 없다", () => {
    expect(normalizeTopologyName("")).toBeNull();
    expect(normalizeTopologyName("   ")).toBeNull();
  });

  test("100자까지 되고 101자는 안 된다", () => {
    expect(normalizeTopologyName("가".repeat(100))).toBe("가".repeat(100));
    expect(normalizeTopologyName("가".repeat(101))).toBeNull();
  });

  test("제어 문자는 안 된다", () => {
    expect(normalizeTopologyName("a\tb")).toBeNull();
  });

  test("안내 문구", () => {
    expect(NAME_HINT).toBe("이름을 1~100자로 적어 주세요");
  });

  test("onRename을 주면 이름이 누를 수 있는 단추, 연필이 붙는다", () => {
    const html = renderToString(<TopBar name="새 토폴로지" onRename={() => {}} onExport={() => {}} onImport={() => {}} mode="realtime" onModeChange={() => {}} />);
    expect(html).toMatch(/<button type="button" class="name"[^>]*aria-label="토폴로지 이름 새 토폴로지, 눌러서 고치기"/);
    expect(html).toContain("✎");
  });

  test("onRename이 없으면 글자만", () => {
    const html = renderToString(<TopBar name="새 토폴로지" onExport={() => {}} onImport={() => {}} mode="realtime" onModeChange={() => {}} />);
    expect(html).toContain('<span class="name">새 토폴로지</span>');
    expect(html).not.toContain("✎");
  });
});
