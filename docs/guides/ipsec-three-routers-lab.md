# IPsec 실습: R1과 R3 사이 보호 정책

```text
PC_A ── R1 ── R2 ── R3 ── PC_B
         ╰───── IPsec ──────╯
```

**PING9의 IPsec은 교육용이다.** 보호 대역·정책·공개 키 식별자·SA·SPI·sequence·재전송 검사를 시뮬레이션한다. 실제 암호화·IKE 협상·암호학적 인증은 하지 않는다. `aes256` 등의 값은 양쪽 정책 일치 검사에 쓰인다.

GRE 없이 독립 IPsec으로 실습한다. SSL의 `vpn connect OFFICE` 명령은 사용하지 않는다.

## 1. 시작 방법

- 직접 설정: [공통 준비 가이드](vpn-three-routers-lab.md)를 따라 하거나 [VPN 설정 전 JSON](vpn-three-routers-underlay.ping9.json)을 가져온 뒤 아래 2단계부터 진행한다.
- 완성 구성 확인: [IPsec 완성 JSON](ipsec-three-routers.ping9.json)을 가져온 뒤 4단계의 ping과 상태 조회부터 실행한다.

웹 주소는 <http://127.0.0.1:5175/>다. 상단 **가져오기**로 파일을 열고 R1/R3의 VyOS 터미널에서 입력한다. 이전 GRE 실습에 이어 입력하지 말고 공통 준비 파일로 다시 시작한다.

### 어떤 순서로 입력하나?

공통 물리망 확인 → R1의 일반 모드(vyos@R1:~$) → configure → 아래 R1 set 명령을 위에서부터 전부 입력 → commit → exit → **R3로 창을 바꿔** R3 블록 전부 입력 → PC 양방향 ping → SA 확인 순서다. R2에는 IPsec 명령을 입력하지 않는다.

`IKE`, `ESP`, `LAB`, `R3`/`R1`은 설정 묶음의 이름이다. 먼저 묶음을 정의하고 뒤에서 peer 설정이 그 이름을 참조한다. `local-address`는 자신의 WAN IP, `remote-address`는 상대 Router의 WAN IP다. `local prefix`와 `remote prefix`는 각각 이쪽/상대쪽 PC LAN의 **네트워크 주소**이며 Router의 WAN 주소가 아니다.

`set`은 임시 편집이다. 해당 Router의 모든 줄을 입력한 뒤 commit으로 검증·적용하고 exit한다. 입력을 취소하려면 commit 전에 discard → exit한다. IOS 프롬프트 R1>/R1#이면 먼저 CLI 형식을 VyOS로 변경한다.

## 2. R1: IPsec 설정

```text
configure
set vpn ipsec interface eth1
set vpn ipsec ike-group IKE key-exchange ikev2
set vpn ipsec ike-group IKE lifetime 28800
set vpn ipsec ike-group IKE proposal 10 encryption aes256
set vpn ipsec ike-group IKE proposal 10 hash sha256
set vpn ipsec ike-group IKE proposal 10 dh-group 14
set vpn ipsec esp-group ESP mode tunnel
set vpn ipsec esp-group ESP lifetime 3600
set vpn ipsec esp-group ESP pfs enable
set vpn ipsec esp-group ESP proposal 10 encryption aes256
set vpn ipsec esp-group ESP proposal 10 hash sha256
set vpn ipsec authentication psk LAB id 198.168.1.1
set vpn ipsec authentication psk LAB id 198.168.2.2
set vpn ipsec authentication psk LAB secret LAB_SHARED
set vpn ipsec site-to-site peer R3 local-address 198.168.1.1
set vpn ipsec site-to-site peer R3 remote-address 198.168.2.2
set vpn ipsec site-to-site peer R3 authentication mode pre-shared-secret
set vpn ipsec site-to-site peer R3 ike-group IKE
set vpn ipsec site-to-site peer R3 default-esp-group ESP
set vpn ipsec site-to-site peer R3 tunnel 0 local prefix 198.168.0.0/24
set vpn ipsec site-to-site peer R3 tunnel 0 remote prefix 198.168.3.0/24
set protocols static route 198.168.3.0/24 next-hop 198.168.1.2
commit
exit
```

**한 줄씩 읽기 — 위 코드 블록 순서대로 입력한다.**

| 순서 | 실제 입력할 명령 | 뜻과 입력 이유 |
|---|---|---|
| 1 | `configure` | R1의 일반 모드에서 설정 모드로 들어간다. 아직 실제 통신은 바뀌지 않는다. |
| 2 | `set vpn ipsec interface eth1` | 이 Router의 IPsec 출구로 실제 케이블이 연결된 eth1 포트를 지정한다. |
| 3 | `set vpn ipsec ike-group IKE key-exchange ikev2` | IKE 설정 묶음 IKE에 교육용 버전 ikev2를 지정한다. 실제 IKE 협상을 실행하지는 않는다. |
| 4 | `set vpn ipsec ike-group IKE lifetime 28800` | IKE 설정의 수명 값 28800초를 저장한다. 이 구현은 실제 IKE 협상/자동 갱신을 하지 않는다. |
| 5 | `set vpn ipsec ike-group IKE proposal 10 encryption aes256` | IKE 정책 비교용 암호화 알고리즘 이름 aes256을 저장한다. 실제 암호화는 하지 않는다. |
| 6 | `set vpn ipsec ike-group IKE proposal 10 hash sha256` | IKE 정책 비교용 해시 이름 sha256을 저장한다. |
| 7 | `set vpn ipsec ike-group IKE proposal 10 dh-group 14` | IKE 정책 비교용 DH 그룹 14를 저장한다. 실제 키 교환을 수행하지는 않는다. |
| 8 | `set vpn ipsec esp-group ESP mode tunnel` | ESP 설정 묶음 ESP를 tunnel 방식으로 정한다. 원래 IP 패킷을 안쪽에 둔다. |
| 9 | `set vpn ipsec esp-group ESP lifetime 3600` | 교육용 SA 수명을 3600 가상 초로 설정한다. 실제 시간 타이머와 다르다. |
| 10 | `set vpn ipsec esp-group ESP pfs enable` | 양쪽에서 일치해야 할 PFS 정책 값을 저장한다. 실제 추가 키 교환은 없다. |
| 11 | `set vpn ipsec esp-group ESP proposal 10 encryption aes256` | ESP 정책 비교용 알고리즘 이름 aes256을 저장한다. payload를 실제 암호화하지 않는다. |
| 12 | `set vpn ipsec esp-group ESP proposal 10 hash sha256` | ESP 정책 비교용 해시 이름 sha256을 저장한다. |
| 13 | `set vpn ipsec authentication psk LAB id 198.168.1.1` | PSK 설정 묶음 LAB이 적용될 상대 식별자 198.168.1.1를 등록한다. 이 실습은 양쪽 WAN IP를 식별자로 쓴다. |
| 14 | `set vpn ipsec authentication psk LAB id 198.168.2.2` | PSK 설정 묶음 LAB이 적용될 상대 식별자 198.168.2.2를 등록한다. 이 실습은 양쪽 WAN IP를 식별자로 쓴다. |
| 15 | `set vpn ipsec authentication psk LAB secret LAB_SHARED` | 양쪽에서 같아야 할 공개 실습 식별자 LAB_SHARED를 설정한다. 실제 비밀번호/비밀키가 아니다. |
| 16 | `set vpn ipsec site-to-site peer R3 local-address 198.168.1.1` | 로컬 상대 설정 R3에 이 Router 자신의 WAN IP 198.168.1.1를 지정한다. |
| 17 | `set vpn ipsec site-to-site peer R3 remote-address 198.168.2.2` | 상대 Router의 WAN IP 198.168.2.2를 지정한다. 중간 R2의 IP가 아니다. |
| 18 | `set vpn ipsec site-to-site peer R3 authentication mode pre-shared-secret` | 이 상대 설정이 PSK 방식의 교육용 인증 정보를 사용하도록 지정한다. |
| 19 | `set vpn ipsec site-to-site peer R3 ike-group IKE` | 앞에서 만든 IKE 설정 묶음 IKE를 이 상대 설정에 연결한다. |
| 20 | `set vpn ipsec site-to-site peer R3 default-esp-group ESP` | 앞에서 만든 ESP 설정 묶음 ESP를 이 상대 설정에 연결한다. |
| 21 | `set vpn ipsec site-to-site peer R3 tunnel 0 local prefix 198.168.0.0/24` | 이쪽에서 보호할 PC LAN 198.168.0.0/24를 지정한다. 자신의 WAN IP를 적는 자리가 아니다. |
| 22 | `set vpn ipsec site-to-site peer R3 tunnel 0 remote prefix 198.168.3.0/24` | 반대쪽에서 보호할 PC LAN 198.168.3.0/24를 지정한다. 반대 Router에서는 local/remote가 뒤집힌다. |
| 23 | `set protocols static route 198.168.3.0/24 next-hop 198.168.1.2` | 목적지 네트워크 198.168.3.0/24로 갈 패킷을 바로 옆 R2의 물리 IP 198.168.1.2로 보내도록 경로를 추가한다. |
| 24 | `commit` | 지금까지 편집한 R1의 설정을 검사하고 적용한다. 반대 Router는 별도로 설정해야 한다. |
| 25 | `exit` | 현재 설정 단계를 나간다. VyOS에서는 commit 뒤 일반 모드로 돌아간다. |


## 3. R3: IPsec 설정

```text
configure
set vpn ipsec interface eth0
set vpn ipsec ike-group IKE key-exchange ikev2
set vpn ipsec ike-group IKE lifetime 28800
set vpn ipsec ike-group IKE proposal 10 encryption aes256
set vpn ipsec ike-group IKE proposal 10 hash sha256
set vpn ipsec ike-group IKE proposal 10 dh-group 14
set vpn ipsec esp-group ESP mode tunnel
set vpn ipsec esp-group ESP lifetime 3600
set vpn ipsec esp-group ESP pfs enable
set vpn ipsec esp-group ESP proposal 10 encryption aes256
set vpn ipsec esp-group ESP proposal 10 hash sha256
set vpn ipsec authentication psk LAB id 198.168.1.1
set vpn ipsec authentication psk LAB id 198.168.2.2
set vpn ipsec authentication psk LAB secret LAB_SHARED
set vpn ipsec site-to-site peer R1 local-address 198.168.2.2
set vpn ipsec site-to-site peer R1 remote-address 198.168.1.1
set vpn ipsec site-to-site peer R1 authentication mode pre-shared-secret
set vpn ipsec site-to-site peer R1 ike-group IKE
set vpn ipsec site-to-site peer R1 default-esp-group ESP
set vpn ipsec site-to-site peer R1 tunnel 0 local prefix 198.168.3.0/24
set vpn ipsec site-to-site peer R1 tunnel 0 remote prefix 198.168.0.0/24
set protocols static route 198.168.0.0/24 next-hop 198.168.2.1
commit
exit
```

**한 줄씩 읽기 — 위 코드 블록 순서대로 입력한다.**

| 순서 | 실제 입력할 명령 | 뜻과 입력 이유 |
|---|---|---|
| 1 | `configure` | R3의 일반 모드에서 설정 모드로 들어간다. 아직 실제 통신은 바뀌지 않는다. |
| 2 | `set vpn ipsec interface eth0` | 이 Router의 IPsec 출구로 실제 케이블이 연결된 eth0 포트를 지정한다. |
| 3 | `set vpn ipsec ike-group IKE key-exchange ikev2` | IKE 설정 묶음 IKE에 교육용 버전 ikev2를 지정한다. 실제 IKE 협상을 실행하지는 않는다. |
| 4 | `set vpn ipsec ike-group IKE lifetime 28800` | IKE 설정의 수명 값 28800초를 저장한다. 이 구현은 실제 IKE 협상/자동 갱신을 하지 않는다. |
| 5 | `set vpn ipsec ike-group IKE proposal 10 encryption aes256` | IKE 정책 비교용 암호화 알고리즘 이름 aes256을 저장한다. 실제 암호화는 하지 않는다. |
| 6 | `set vpn ipsec ike-group IKE proposal 10 hash sha256` | IKE 정책 비교용 해시 이름 sha256을 저장한다. |
| 7 | `set vpn ipsec ike-group IKE proposal 10 dh-group 14` | IKE 정책 비교용 DH 그룹 14를 저장한다. 실제 키 교환을 수행하지는 않는다. |
| 8 | `set vpn ipsec esp-group ESP mode tunnel` | ESP 설정 묶음 ESP를 tunnel 방식으로 정한다. 원래 IP 패킷을 안쪽에 둔다. |
| 9 | `set vpn ipsec esp-group ESP lifetime 3600` | 교육용 SA 수명을 3600 가상 초로 설정한다. 실제 시간 타이머와 다르다. |
| 10 | `set vpn ipsec esp-group ESP pfs enable` | 양쪽에서 일치해야 할 PFS 정책 값을 저장한다. 실제 추가 키 교환은 없다. |
| 11 | `set vpn ipsec esp-group ESP proposal 10 encryption aes256` | ESP 정책 비교용 알고리즘 이름 aes256을 저장한다. payload를 실제 암호화하지 않는다. |
| 12 | `set vpn ipsec esp-group ESP proposal 10 hash sha256` | ESP 정책 비교용 해시 이름 sha256을 저장한다. |
| 13 | `set vpn ipsec authentication psk LAB id 198.168.1.1` | PSK 설정 묶음 LAB이 적용될 상대 식별자 198.168.1.1를 등록한다. 이 실습은 양쪽 WAN IP를 식별자로 쓴다. |
| 14 | `set vpn ipsec authentication psk LAB id 198.168.2.2` | PSK 설정 묶음 LAB이 적용될 상대 식별자 198.168.2.2를 등록한다. 이 실습은 양쪽 WAN IP를 식별자로 쓴다. |
| 15 | `set vpn ipsec authentication psk LAB secret LAB_SHARED` | 양쪽에서 같아야 할 공개 실습 식별자 LAB_SHARED를 설정한다. 실제 비밀번호/비밀키가 아니다. |
| 16 | `set vpn ipsec site-to-site peer R1 local-address 198.168.2.2` | 로컬 상대 설정 R1에 이 Router 자신의 WAN IP 198.168.2.2를 지정한다. |
| 17 | `set vpn ipsec site-to-site peer R1 remote-address 198.168.1.1` | 상대 Router의 WAN IP 198.168.1.1를 지정한다. 중간 R2의 IP가 아니다. |
| 18 | `set vpn ipsec site-to-site peer R1 authentication mode pre-shared-secret` | 이 상대 설정이 PSK 방식의 교육용 인증 정보를 사용하도록 지정한다. |
| 19 | `set vpn ipsec site-to-site peer R1 ike-group IKE` | 앞에서 만든 IKE 설정 묶음 IKE를 이 상대 설정에 연결한다. |
| 20 | `set vpn ipsec site-to-site peer R1 default-esp-group ESP` | 앞에서 만든 ESP 설정 묶음 ESP를 이 상대 설정에 연결한다. |
| 21 | `set vpn ipsec site-to-site peer R1 tunnel 0 local prefix 198.168.3.0/24` | 이쪽에서 보호할 PC LAN 198.168.3.0/24를 지정한다. 자신의 WAN IP를 적는 자리가 아니다. |
| 22 | `set vpn ipsec site-to-site peer R1 tunnel 0 remote prefix 198.168.0.0/24` | 반대쪽에서 보호할 PC LAN 198.168.0.0/24를 지정한다. 반대 Router에서는 local/remote가 뒤집힌다. |
| 23 | `set protocols static route 198.168.0.0/24 next-hop 198.168.2.1` | 목적지 네트워크 198.168.0.0/24로 갈 패킷을 바로 옆 R2의 물리 IP 198.168.2.1로 보내도록 경로를 추가한다. |
| 24 | `commit` | 지금까지 편집한 R3의 설정을 검사하고 적용한다. 반대 Router는 별도로 설정해야 한다. |
| 25 | `exit` | 현재 설정 단계를 나간다. VyOS에서는 commit 뒤 일반 모드로 돌아간다. |


| 설정 묶음 | 의미 |
|---|---|
| `interface eth1` / `eth0` | 각 Router에서 바깥쪽으로 연결된 물리 포트 |
| `ike-group IKE` | 양쪽 정책 일치에 사용할 교육용 IKE 설정 묶음 |
| `esp-group ESP` | tunnel 방식·알고리즘·가상 수명 등의 설정 묶음 |
| `authentication psk LAB` | 공개 실습 식별자 LAB_SHARED를 양쪽에서 참조 |
| `peer R3` / `peer R1` | 상대쪽 설정을 구분하는 로컬 이름 |
| `local-address`, `remote-address` | 양쪽의 바깥 WAN IP |
| `tunnel 0 local/remote prefix` | 보호할 양쪽 PC LAN. 반대편에서는 local/remote가 뒤바뀜 |
| `protocols static route` | 상대 LAN 패킷을 R2 쪽으로 보내는 경로 |

GRE와 달리 정적 경로의 next-hop에 **R2의 물리 IP**를 넣는다. 나가는 패킷이 보호 대역과 일치하면 R1/R3가 ESP 교육용 패킷으로 감싼다. R2에는 IPsec 설정을 하지 않는다.

## 4. 정상 통신과 상태 확인

| 실행 장비 | 명령 | 예상 |
|---|---|---|
| PC_A | `ping 198.168.3.2` | PC_B의 bytes=32 응답 |
| PC_B | `ping 198.168.0.2` | PC_A의 bytes=32 응답 |
| R1/R3 | `show vpn ipsec connections` | 설정된 상대·보호 대역·교육용 제한 안내 |
| R1/R3 | `show vpn ipsec sa` | ping 이후 active와 송수신 카운터 증가 |
| R1/R3 | `show ip route` | 상대 LAN의 물리 next-hop 확인 |

Windows PC의 응답 TTL은 이 구성에서 **126**이다. SA의 active는 로컬에서 사용했다는 뜻이며 실제 IKE 협상 성공은 아니다. 시뮬레이션 모드에서 ESP 생성·전달·복원을 확인할 수 있다.

## 5. IPsec 정책 끄기 → 실패 → 복구

R1에서 R3 방향의 보호 정책을 끈다.

```text
configure
set vpn ipsec site-to-site peer R3 tunnel 0 disable
commit
exit
```

**한 줄씩 읽기 — 위 코드 블록 순서대로 입력한다.**

| 순서 | 실제 입력할 명령 | 뜻과 입력 이유 |
|---|---|---|
| 1 | `configure` | R1의 일반 모드에서 설정 모드로 들어간다. 아직 실제 통신은 바뀌지 않는다. |
| 2 | `set vpn ipsec site-to-site peer R3 tunnel 0 disable` | 이 상대의 tunnel 0 보호 정책을 끈다. commit 후 일반 경로만 남으며 이 예제에서는 PC 간 통신이 실패한다. |
| 3 | `commit` | 지금까지 편집한 R1의 설정을 검사하고 적용한다. 반대 Router는 별도로 설정해야 한다. |
| 4 | `exit` | 현재 설정 단계를 나간다. VyOS에서는 commit 뒤 일반 모드로 돌아간다. |


PC_A에서 `ping 198.168.3.2`를 실행하면 실패해야 한다. 이 VyOS 방식의 disable은 보호 정책을 끄는 동작이다. 일반 라우팅 경로가 있으면 평문으로 갈 수 있지만, 이 실습의 R2에는 PC LAN 경로가 없어 통신이 실패한다.

R1에서 정책을 다시 켠다.

```text
configure
delete vpn ipsec site-to-site peer R3 tunnel 0 disable
commit
exit
```

**한 줄씩 읽기 — 위 코드 블록 순서대로 입력한다.**

| 순서 | 실제 입력할 명령 | 뜻과 입력 이유 |
|---|---|---|
| 1 | `configure` | R1의 일반 모드에서 설정 모드로 들어간다. 아직 실제 통신은 바뀌지 않는다. |
| 2 | `delete vpn ipsec site-to-site peer R3 tunnel 0 disable` | 이 상대의 tunnel 0 disable 항목을 제거한다. commit 후 IPsec 보호 정책을 다시 사용한다. |
| 3 | `commit` | 지금까지 편집한 R1의 설정을 검사하고 적용한다. 반대 Router는 별도로 설정해야 한다. |
| 4 | `exit` | 현재 설정 단계를 나간다. VyOS에서는 commit 뒤 일반 모드로 돌아간다. |


PC_A에서 ping을 다시 실행하면 정상 응답이 돌아온다. 복구 후 상단 **내보내기**로 저장한다.

## 6. 막혔을 때

- 먼저 R1→R3와 R3→R1의 바깥 물리 IP ping부터 확인한다.
- 양쪽의 LAB_SHARED와 IKE/ESP 알고리즘·PFS가 같은지 확인한다.
- R1의 local은 198.168.0.0/24, remote는 198.168.3.0/24다. R3는 반대다.
- `commit`에서 오류가 났다면 활성 설정은 바뀌지 않는다. 값·참조 그룹을 수정하고 다시 commit한다.
- R2에는 PC LAN 경로를 추가하지 않는다. ESP 경로와 평문 경로를 구분하는 실습이다.
- 한쪽의 PSK/정책 값을 바꾸면 그쪽 SA가 초기화된다. 원래 값으로 돌린 뒤에도 anti-replay가 나오면 완성 JSON을 다시 가져와 양쪽 실행 상태를 함께 초기화한다. 실제 IKE 자동 재협상은 구현하지 않았다.

[GRE 실습](gre-three-routers-lab.md) · [SSL 실습](ssl-vpn-from-scratch.md)
