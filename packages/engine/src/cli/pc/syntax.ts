// PC 콘솔의 입력 규칙 가운데 기호 검사 (T0.9). 파일 명령어(echo)도 쓰므로 os.ts에서 따로 뺐다

/**
 * 한 줄에 명령 하나만 받는다 (T0.9, vpc.md 4절). 파이프, 리다이렉트, 명령 연결 기호의 위치를 찾는다.
 * Windows는 `&` 하나로도 명령을 이으므로 `&&`가 아니라 `&`를 본다
 */
export function unsupportedSyntaxAt(line: string): { readonly token: string; readonly position: number } | undefined {
  const match = /[|<>;&`]|\$\(/.exec(line);
  return match === null ? undefined : { token: match[0], position: match.index };
}
