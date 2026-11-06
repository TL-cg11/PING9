// 키보드 포커스를 캔버스 노드와 터미널 입력란 사이에서 옮긴다 (T1.6.2, NFR-12).
// 둘은 서로 다른 컴포넌트라 장비 ID를 담은 data 속성으로 찾는다.
// 상태가 바뀐 화면이 그려진 뒤에 옮겨야 하므로 다음 프레임에 한다.

const byDevice = (selector: string, deviceId: string) => `${selector}[data-device-id="${CSS.escape(deviceId)}"]`;

/** 터미널에서 Esc: 그 장비의 캔버스 노드로 */
export function focusCanvasNode(deviceId: string): void {
  requestAnimationFrame(() => {
    document.querySelector<SVGGElement>(byDevice(".node", deviceId))?.focus();
  });
}

/** 콘솔을 열거나 이미 열린 콘솔을 다시 열 때: 그 터미널의 입력란으로 */
export function focusTerminalInput(deviceId: string): void {
  requestAnimationFrame(() => {
    document.querySelector<HTMLInputElement>(`${byDevice(".term", deviceId)} input`)?.focus();
  });
}
