// 상단 막대. 시안의 <header class="topbar">와 같은 마크업이다.
// 내보내기, 가져오기, 모드 전환, ping 실행은 아직 동작하지 않아 꺼 두었다.

export function TopBar({ name }: { readonly name: string }) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="tile">
          <img src="/logo.png" alt="" />
        </div>
        <div className="wordmark">
          PING<span>9</span>
        </div>
      </div>
      <div className="crumb">
        <span className="sep">/</span>
        <span className="name">{name}</span>
      </div>
      <div className="spacer" />
      <button className="ghost" disabled>
        ⤓ 내보내기
      </button>
      <button className="ghost" disabled>
        ⤒ 가져오기
      </button>
      <div className="mode" role="tablist" aria-label="모드">
        <button className="on" disabled>
          ⏱ 실시간
        </button>
        <button disabled>⏯ 시뮬레이션</button>
      </div>
      <button className="ping-btn" disabled>
        ▶ ping 실행
      </button>
    </header>
  );
}
