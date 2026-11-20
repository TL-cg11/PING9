# SSL VPN 구현 현황과 로컬 검증

2026-11-19. 작업 폴더: **`/Users/seonyeongmin/Goorm/ping9`**. 기능 구현 브랜치: `feat/T15.3.11-ssl-vpn-sessions`.

## 이번 단계에서 되는 것

외부 PC가 회사 Router에 접속해 **교육용 신뢰·사용자 검사 → 가상 IP 할당 → 접속 상태 확인 → 해제**를 실습할 수 있다. 제어 메시지는 ARP·중간 Router 2대·케이블 경로를 실제 시뮬레이션으로 통과한다. 최신 main `2ebd1c7` 기준으로 독립 Firewall 장비는 제거되었고, iptables는 Server PC에서 사용한다. 단순히 명령 입력만으로 성공 상태를 만드는 방식이 아니다.

**실제 TLS·암호화·TCP handshake를 구현한 것은 아니다. 접속 후 내부망 ping을 VPN으로 감싸 보내는 데이터 터널도 다음 단계다.** 인증에 쓰는 `authId`, CA에 쓰는 `caId`는 공개 실습 식별자다. 실제 비밀번호·인증서를 넣지 않는다.

| 구분 | 구현 상태 |
|---|---|
| TCP 세그먼트 전달·방화벽 포트 검사·재생 | 구현 |
| PC 프로필·Router 서버 설정 저장·검증 | 구현; 설정 폼/서버 설정 CLI는 후속 |
| 서버 이름·신뢰 CA 식별자·가상 만료 시각 검사 | 교육용 검사 구현 |
| 사용자 식별자 일치 검사 | 교육용 검사 구현 |
| 가상 IP 풀·중복 방지·동시 접속 상한·해제 | 구현 |
| 세션 만료·관련 설정/물리 연결 변경 시 무효화 | 구현 |
| PC 접속·상태·해제 명령, 도움말·Tab 후보 | 구현 |
| TLS 협상·암호화·실제 인증서 검증 | 미구현 |
| 내부 ICMP를 VPN으로 캡슐화·복원 | 다음 단계 |

빈 화면에서 직접 구성하려면 [빈 캔버스부터 만드는 SSL VPN 접속 실습](ssl-vpn-from-scratch.md)을 따른다. 아래는 설정이 완료된 예제를 사용하는 빠른 확인 방법이다.

## 브라우저에서 직접 확인

개발 서버를 켠다. 이미 5175 서버가 실행 중이면 기존 서버를 사용한다.

```sh
cd /Users/seonyeongmin/Goorm/ping9
pnpm --filter @ping9/web exec vite --host 127.0.0.1 --port 5175 --strictPort
```

**새 탭**에서 <http://127.0.0.1:5175/?lab=ssl> 을 연다. `?lab=ssl`은 로컬 개발 서버 전용 예제이며, 새로 열면 미리 설정한 실습 구성이 로드된다.

```text
PC_A ── R1 ── R2 ── R3 ── PC_B
외부 PC              VPN 서버   회사 내부 PC
```

PC_A의 터미널에서 한 줄씩 입력한다. `PC_A>`는 프롬프트이므로 명령에 포함하지 않는다.

```text
vpn status
vpn connect OFFICE
vpn status
vpn disconnect
vpn connect OFFICE
```

| 명령 | 의미 | 예상 결과 |
|---|---|---|
| `vpn status` | 현재 접속 확인 | 처음에는 `State: disconnected` |
| `vpn connect OFFICE` | 저장된 OFFICE 프로필로 서버 접속 | `State: connected`, `Virtual IP: 198.168.4.2` |
| `vpn status` | 할당된 IP와 세션 확인 | connected, 가상 IP와 세션 ID 표시 |
| `vpn disconnect` | 접속 해제·IP 반환 | disconnected, 정상 경로에서는 IP 해제 안내 |
| `vpn connect OFFICE` | 재접속 | 다시 connected, 사용 가능한 IP 재할당 |

이 명령들은 **PING9 전용 교육용 명령**이며 Windows·Linux·VyOS의 실제 VPN 제품 명령이 아니다. 출력의 `NO TLS/encryption`과 `data tunnel not implemented`는 현재 구현 범위를 나타낸다. 가상 IP는 세션에 할당되며 PC의 물리 IP를 바꾸지 않는다.

서버·클라이언트 설정은 예제에 미리 들어 있다. 다른 설정으로 실습하려면 토폴로지 JSON의 `config.sslVpn`을 변경해 가져오거나 내부 `ssl-vpn/set-client`, `ssl-vpn/set-server` Command를 사용한다. 아직 화면 설정 폼이나 Router용 SSL VPN 설정 명령은 없다.

### R2 포트 중단과 복구

먼저 PC_A에서 `vpn disconnect`를 한다. R2 터미널의 `R2>`에서 다음 명령을 입력해 R3 방향 포트를 끈다. 이미 `R2#`이면 enable은 생략한다.

```text
enable
configure terminal
interface gi0/1
shutdown
end
```

PC_A에서 `vpn connect OFFICE`를 입력하면 `State: failed`, timeout 안내가 나온다. R2의 포트가 꺼져 서버까지 메시지가 도착하지 못한다.

R2의 `R2#`에서 다음 명령으로 복구한다.

```text
configure terminal
interface gi0/1
no shutdown
end
```

PC_A에서 다시 `vpn connect OFFICE`를 입력하면 connected와 가상 IP 198.168.4.2가 나온다. 실제 설정 순서는 [처음부터 실습하는 가이드](ssl-vpn-from-scratch.md)를 참고한다.

### 주의해서 해석할 결과

- connected는 **교육용 접속 검사와 IP 할당 완료**를 뜻한다. `ping 198.168.3.2` 성공을 보장하지 않는다. 이번 예제는 VPN 데이터 전달이 없으므로 내부 PC ping이 실패하도록 테스트했다.
- 세션 수명은 600 **가상 초**, 교육용 인증서 만료는 커널 초기화 이후 3600 **가상 초**다. 현실에서 10분 기다리는 방식이 아니다. 시뮬레이션 작업으로 가상 시간이 진행되며 상태 조회/다음 접속 때 만료를 정리한다.
- 토폴로지 저장 파일에는 프로필만 남고 실행 중 세션은 저장하지 않는다. 새로고침·가져오기 후 다시 접속한다.
- 해제 요청이 경로 중단이나 Server PC 필터에 막히면 PC는 로컬에서 해제되고, 서버 IP 예약은 가상 수명이 끝날 때 정리된다. 출력에 이를 표시한다.

## 자동 테스트

저장소 루트에서 각각 실행한다. 줄 끝에 역슬래시를 붙이지 않는다.

```sh
cd /Users/seonyeongmin/Goorm/ping9
pnpm --filter @ping9/engine exec vitest run src/vpn/ssl-sessions.test.ts
pnpm --filter @ping9/web exec vitest run src/ssl-vpn-session.test.tsx
```

엔진 세션 테스트 23개는 정상 접속/해제, 신뢰·인증 실패와 복구, Router 경로 중단, Server PC INPUT/OUTPUT 차단·복구, 세션 만료, IP 풀 고갈, 동시 접속 상한, 설정 검증·저장과 기존 CLI 호환을 확인한다. 웹 3개 테스트는 실제 성공/실패 trace의 이벤트 표시·재생 분류와 설정 내보내기/가져오기를 확인한다.

기존 전송 기반도 따로 확인할 수 있다.

```sh
pnpm --filter @ping9/engine exec vitest run src/protocols/tcp-segment.test.ts
pnpm --filter @ping9/web exec vitest run src/replay/tcp.test.tsx
```

전체 확인:

```sh
VITEST_MAX_WORKERS=2 pnpm check
pnpm check:secrets
```

## 다음 구현

1. 허용된 내부 대역만 VPN으로 선택하는 클라이언트 경로를 만든다.
2. 내부 ICMP를 외부 TCP 제어 경로와 구분해 캡슐화·복원한다.
3. 서버의 내부망 전달과 가상 IP로 돌아오는 응답을 연결한다.
4. 연결 전 실패 → 연결 후 ping 성공 → 해제 후 실패와 방화벽 차단을 비교한다.
5. 서버/클라이언트 설정 UI와 추가 명령어를 연결한다.

전체 목표·제약: [SSL VPN 계획서](../proposals/ssl-vpn-plan.md).
