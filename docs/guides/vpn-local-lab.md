# VyOS 1.4 방식 GRE·IPsec 로컬 실습

PING9 라우터에서 **VyOS 1.4의 일부 명령어**로 GRE와 IPsec을 각각 실습한다. 실제 VyOS OS 전체를 실행하는 것은 아니다. 기존 IOS 명령어는 호환용으로 유지하며, 장비 속성의 **라우터 CLI 형식 → VyOS 1.4 · VPN 실습**을 선택하면 아래 문법을 쓴다. PC와 Switch의 CLI는 바뀌지 않는다.

IPsec은 사용자가 선택한 **교육용 시뮬레이션**이다. `aes256`, `sha256`, PSK 등은 양쪽 정책이 맞는지 검사하기 위한 설정이다. 실제 암호화·해시 인증·키 교환·IKE 패킷은 생성하지 않는다. 공개 실습 식별자 `LAB_SHARED`를 사용하며 실제 비밀번호를 넣지 않는다. GRE+IPsec, SSL VPN은 이번 범위에 없다.

## 1. 실행과 기본 구성

저장소 루트에서:

```sh
pnpm --filter @ping9/web dev --host 127.0.0.1 --port 5175 --strictPort
```

개발 서버 전용 예제 주소:

| 주소 | 시작 상태 |
|---|---|
| <http://127.0.0.1:5175/?lab=vpn> | 물리 IP·상대 WAN 경로만 준비. 아래 명령을 직접 입력하는 실습 |
| <http://127.0.0.1:5175/?lab=gre> | GRE 설정 완료, 바로 ping 가능 |
| <http://127.0.0.1:5175/?lab=ipsec> | IPsec 설정 완료, 바로 ping 가능 |

예제에서 R1/R2는 VyOS CLI, ISP는 기존 IOS CLI다. 실제 배포에서는 빈 캔버스에서 장비·케이블·IP를 직접 구성하거나, 로컬에서 내보낸 토폴로지 JSON을 가져온다. 예제 URL은 개발 모드에서만 동작한다. 새로고침하면 입력한 내용 대신 예제의 초기 상태로 돌아간다.

```text
PC_A ── R1 ── ISP ── R2 ── PC_B
```

| 장비 | 인터페이스 | IP / prefix | 역할 |
|---|---|---|---|
| PC_A | Ethernet0 | 192.168.1.10/24, GW 192.168.1.1 | 왼쪽 PC |
| R1 | eth0 = Gi0/0 | 192.168.1.1/24 | 왼쪽 LAN |
| R1 | eth1 = Gi0/1 | 10.0.13.1/30 | ISP 방향 |
| ISP | Gi0/0 | 10.0.13.2/30 | R1 방향 |
| ISP | Gi0/1 | 10.0.23.1/30 | R2 방향 |
| R2 | eth0 = Gi0/0 | 10.0.23.2/30 | ISP 방향 |
| R2 | eth1 = Gi0/1 | 192.168.2.1/24 | 오른쪽 LAN |
| PC_B | Ethernet0 | 192.168.2.10/24, GW 192.168.2.1 | 오른쪽 PC |

R1에는 `10.0.23.0/30 → 10.0.13.2`, R2에는 `10.0.13.0/30 → 10.0.23.1` 경로가 미리 있다. ISP에는 사설 LAN 경로가 없으므로 VPN 구성 전 PC 간 ping은 실패하는 것이 정상이다.

`eth0`~`eth3`은 내부의 `GigabitEthernet0/0`~`0/3`과 같은 물리 포트다. `tun0`~`tun3`은 내부 `Tunnel0`~`Tunnel3`과 대응한다. 화면의 케이블 포트 이름은 기존 이름을 사용할 수 있다.

## 2. 설정 적용 방식

일반 모드는 `vyos@R1:~$`, 설정 모드는 `vyos@R1#`이다. **명령을 입력할 때 프롬프트는 빼고 입력한다.**

| 모드 | 명령 | 의미 |
|---|---|---|
| 일반 | `configure` | 현재 활성 설정을 복사해 임시 설정(candidate) 편집 시작 |
| 설정 | `set ...` | 임시 설정 추가·수정. 아직 통신에는 영향 없음 |
| 설정 | `delete ...` | 임시 설정의 해당 항목·하위 트리 삭제 |
| 설정 | `show` | 임시 설정을 `set` 명령 목록으로 보기 |
| 설정 | `commit` | 전체를 검증해 한 번에 활성화. 실패하면 기존 설정 보존 |
| 설정 | `discard` | 임시 변경을 버리고 현재 활성 설정으로 다시 시작 |
| 설정 | `exit` | 편집 종료. 미적용 변경이 있으면 종료하지 않고 안내 |
| 설정 | `exit discard` | 임시 변경을 버리고 종료 |
| 설정 | `run show vpn ipsec sa` | 설정 모드에서 활성 SA 보기 |
| 설정 | `run ping 10.0.23.2` | 설정 모드에서 ping 실행 |
| 일반 | `show configuration commands` | 활성 설정을 재입력 가능한 명령 목록으로 보기 |
| 일반 | `show interfaces` | 물리 인터페이스 주소와 상태 |
| 일반 | `show interfaces ethernet eth1` | 해당 물리 인터페이스 확인 |
| 일반 | `show ip route` | 활성 라우팅 표 |
| 일반 | `show arp` | ARP 표 |

`?` 도움말과 Tab 완성을 지원한다. 값의 유효성·참조 관계는 `commit` 시 검사한다. 다른 화면/API에서 라우터 설정이 바뀐 동안 편집했다면 commit을 거절한다. `discard` 후 최신 설정을 기준으로 다시 편집한다. CLI 형식을 바꾸면 임시 설정은 사라진다.

이 구현에서는 VyOS의 `save` 명령을 지원하지 않는다. **commit한 설정의 보관은 화면의 내보내기/가져오기**를 사용한다. 임시 설정과 SA 카운터는 JSON에 저장하지 않는다.

### 명령어의 고정 부분과 바꿔 넣는 값 읽기

이 문서의 **`[이름]`, `[IP 주소]` 같은 대괄호는 직접 바꿔 넣는 자리**다. 대괄호와 한글 설명을 그대로 입력하지 않는다. 대괄호 밖의 `set`, `interfaces`, `encapsulation` 같은 단어는 명령어이므로 그대로 쓴다.

**일반 형식:**

```text
set interfaces tunnel [터널 이름] encapsulation [캡슐화 방식]
```

**실제 입력 예시:**

```text
set interfaces tunnel tun0 encapsulation gre
```

| 부분 | 읽는 방법 | 예시에서 넣은 값 |
|---|---|---|
| `set` | 설정을 추가하거나 변경한다 | 고정 단어 |
| `interfaces tunnel` | 터널 인터페이스를 설정한다 | 고정 단어 |
| `[터널 이름]` | 어느 터널을 설정할지 지정한다 | `tun0` |
| `encapsulation` | 패킷을 감싸는 방식을 지정한다 | 고정 단어 |
| `[캡슐화 방식]` | 어떤 형식으로 감쌀지 지정한다 | `gre` |

즉, **“tun0 터널에서 패킷을 GRE 방식으로 감싸라”**는 뜻이다. `encapsulation`은 암호화 방법이 아니다. 이 프로그램의 터널은 `gre`를 지원하며 GRE 자체는 암호화하지 않는다. 아래 표의 대괄호도 같은 규칙으로 읽는다.

**자주 바꿔 넣는 값:**

| 자리 | 의미·작성 방법 | R1 예시 |
|---|---|---|
| `[터널 이름]` | 이 프로그램에서는 `tun0`~`tun3`. 같은 터널을 설정하는 줄에는 같은 이름을 사용 | `tun0` |
| `[물리 포트]` | 실제 케이블이 연결된 포트. `eth0`~`eth3` | ISP 방향 `eth1` |
| `[자신의 물리 IP]` | 자기 라우터 물리 포트에 이미 설정된 IP | `10.0.13.1` |
| `[상대 물리 IP]` | 터널/VPN 반대편 라우터의 물리 IP | R2의 `10.0.23.2` |
| `[터널 IP/prefix]` | 자신의 가상 터널 주소와 마스크 길이 | `172.16.12.1/30` |
| `[목적지 대역/prefix]` | 보내려는 네트워크의 네트워크 주소와 마스크 길이 | `192.168.2.0/24` |
| `[다음 홉 IP]` | 그 목적지로 갈 때 다음에 전달할 주소 | GRE에서는 R2 터널 IP `172.16.12.2` |
| `[peer 이름]` | 이 라우터 안에서 상대 VPN 설정을 구분하는 이름. IP 주소 자체가 아님 | `R2` |
| `[PSK 이름]`, `[IKE 그룹]`, `[ESP 그룹]` | 각 설정 묶음의 이름. peer에서 참조할 그룹 이름은 정의한 이름과 같아야 함 | `LAB`, `IKE`, `ESP` |
| `[초]` | 초 단위 정수. 이 프로그램에서는 1~86400 | `3600` |

`/24`는 `255.255.255.0`, `/30`은 `255.255.255.252`다. 인터페이스 주소는 해당 장비의 IP를 넣고, 경로·보호 대역에는 `192.168.2.0/24`처럼 **네트워크 주소**를 넣는다. 그룹·peer·PSK 이름은 영문·숫자·`-`·`_`로 1~32자다.

R1의 **물리 IP `10.0.13.1`**은 ISP 구간을 지나는 바깥 패킷의 주소이고, **터널 IP `172.16.12.1`**은 GRE 안쪽 가상 연결의 주소다. R2에서는 자신의 값과 상대 값을 반대로 넣는다. 아래 R1/R2 전체 예시를 비교하면 된다.

## 3. GRE 명령어 표

아래 설정 명령은 `configure` 후 실행하고 `commit`으로 적용한다.

| 일반 형식 | 실제 입력 예시 (R1) | 의미 |
|---|---|---|
| `set interfaces tunnel [터널 이름] encapsulation [캡슐화 방식]` | `set interfaces tunnel tun0 encapsulation gre` | tun0에서 패킷을 GRE로 감싸도록 지정 |
| `set interfaces tunnel [터널 이름] source-address [자신의 물리 IP]` | `set interfaces tunnel tun0 source-address 10.0.13.1` | 바깥 패킷의 출발 IP |
| `set interfaces tunnel [터널 이름] remote [상대 물리 IP]` | `set interfaces tunnel tun0 remote 10.0.23.2` | 바깥 패킷을 받을 R2의 IP |
| `set interfaces tunnel [터널 이름] address [터널 IP/prefix]` | `set interfaces tunnel tun0 address 172.16.12.1/30` | R1 자신의 터널 인터페이스에 IP 부여 |
| `set protocols static route [목적지 대역/prefix] next-hop [다음 홉 IP]` | `set protocols static route 192.168.2.0/24 next-hop 172.16.12.2` | 192.168.2.x행 패킷을 R2의 터널 IP로 전달 |
| `set interfaces tunnel [터널 이름] disable` | `set interfaces tunnel tun0 disable` | 터널 끄기 |
| `delete interfaces tunnel [터널 이름] disable` | `delete interfaces tunnel tun0 disable` | 터널 다시 켜기. disable 설정만 삭제 |
| `delete interfaces tunnel [터널 이름]` | `delete interfaces tunnel tun0` | 터널 전체 설정 삭제. 관련 정적 경로는 별도로 삭제 |
| `show interfaces tunnel [터널 이름]` | `show interfaces tunnel tun0` | 일반 모드에서 터널 상태 확인 |

정적 경로 예시를 읽으면 **“목적지가 192.168.2.0/24에 속하면 다음 홉 172.16.12.2로 보내라”**는 뜻이다. 여기서 다음 홉은 R2의 터널 IP이고, `remote`에 넣은 R2의 물리 IP와 다르다.

### R1: GRE 설정

```text vyos-gre-r1
configure
set interfaces tunnel tun0 encapsulation gre
set interfaces tunnel tun0 source-address 10.0.13.1
set interfaces tunnel tun0 remote 10.0.23.2
set interfaces tunnel tun0 address 172.16.12.1/30
set protocols static route 192.168.2.0/24 next-hop 172.16.12.2
commit
exit
```

### R2: GRE 설정

```text vyos-gre-r2
configure
set interfaces tunnel tun0 encapsulation gre
set interfaces tunnel tun0 source-address 10.0.23.2
set interfaces tunnel tun0 remote 10.0.13.1
set interfaces tunnel tun0 address 172.16.12.2/30
set protocols static route 192.168.1.0/24 next-hop 172.16.12.1
commit
exit
```

PC_A에서 `ping 192.168.2.10`, PC_B에서 `ping 192.168.1.10`을 실행한다. 양방향 응답과 `TTL=126`을 확인한다. ISP는 바깥쪽 WAN 주소만 라우팅한다. GRE는 암호화하지 않는다.

## 4. IPsec 명령어 표

**GRE 실습과 별도의 초기 구성**에서 시작한다. `?lab=vpn`을 새 탭에 열거나 GRE 경로·터널을 삭제한 뒤 구성한다. 아래는 policy-based site-to-site IPsec의 지원 범위다.

| 일반 형식 | 실제 입력 예시 (R1) | 의미 |
|---|---|---|
| `set vpn ipsec interface [물리 포트]` | `set vpn ipsec interface eth1` | IPsec을 사용하는 물리 인터페이스 |
| `set vpn ipsec authentication psk [PSK 이름] id [인증 ID]` | `set vpn ipsec authentication psk LAB id 10.0.13.1` | 공유 키 설정에 포함할 인증 ID. 양쪽 ID를 각각 추가 |
| `set vpn ipsec authentication psk [PSK 이름] secret [교육용 공유 식별자]` | `set vpn ipsec authentication psk LAB secret LAB_SHARED` | 교육용 공유 식별자 |
| `set vpn ipsec ike-group [IKE 그룹] key-exchange [IKE 버전]` | `set vpn ipsec ike-group IKE key-exchange ikev2` | IKE 버전 정책값 |
| `set vpn ipsec ike-group [IKE 그룹] lifetime [초]` | `set vpn ipsec ike-group IKE lifetime 28800` | IKE 수명 설정값 보관. 실제 IKE 교환·만료·재협상 없음 |
| `set vpn ipsec ike-group [IKE 그룹] proposal 10 encryption [암호화 알고리즘]` | `set vpn ipsec ike-group IKE proposal 10 encryption aes256` | IKE 암호화 알고리즘 정책값 |
| `set vpn ipsec ike-group [IKE 그룹] proposal 10 hash [해시 알고리즘]` | `set vpn ipsec ike-group IKE proposal 10 hash sha256` | IKE 해시 알고리즘 정책값 |
| `set vpn ipsec ike-group [IKE 그룹] proposal 10 dh-group [DH 그룹 번호]` | `set vpn ipsec ike-group IKE proposal 10 dh-group 14` | DH 그룹 정책값 |
| `set vpn ipsec esp-group [ESP 그룹] mode tunnel` | `set vpn ipsec esp-group ESP mode tunnel` | 독립 ESP tunnel 모드 |
| `set vpn ipsec esp-group [ESP 그룹] lifetime [초]` | `set vpn ipsec esp-group ESP lifetime 3600` | 교육용 SA 수명. 시뮬레이터 가상 시간 기준 |
| `set vpn ipsec esp-group [ESP 그룹] pfs [enable 또는 disable]` | `set vpn ipsec esp-group ESP pfs enable` | PFS 정책값 |
| `set vpn ipsec esp-group [ESP 그룹] proposal 10 encryption [암호화 알고리즘]` | `set vpn ipsec esp-group ESP proposal 10 encryption aes256` | ESP 암호화 알고리즘 정책값 |
| `set vpn ipsec esp-group [ESP 그룹] proposal 10 hash [해시 알고리즘]` | `set vpn ipsec esp-group ESP proposal 10 hash sha256` | ESP 해시 알고리즘 정책값 |
| `set vpn ipsec site-to-site peer [peer 이름] local-address [자신의 물리 IP]` | `set vpn ipsec site-to-site peer R2 local-address 10.0.13.1` | 자신의 물리 IP |
| `set vpn ipsec site-to-site peer [peer 이름] remote-address [상대 물리 IP]` | `set vpn ipsec site-to-site peer R2 remote-address 10.0.23.2` | 상대 물리 IP |
| `set vpn ipsec site-to-site peer [peer 이름] authentication mode pre-shared-secret` | `set vpn ipsec site-to-site peer R2 authentication mode pre-shared-secret` | PSK 방식 선택 |
| `set vpn ipsec site-to-site peer [peer 이름] authentication local-id [자신의 인증 ID]` | `set vpn ipsec site-to-site peer R2 authentication local-id 10.0.13.1` | 선택 항목. 생략하면 자신의 물리 IP를 ID로 사용 |
| `set vpn ipsec site-to-site peer [peer 이름] authentication remote-id [상대 인증 ID]` | `set vpn ipsec site-to-site peer R2 authentication remote-id 10.0.23.2` | 선택 항목. 생략하면 상대 물리 IP를 ID로 사용 |
| `set vpn ipsec site-to-site peer [peer 이름] ike-group [IKE 그룹]` | `set vpn ipsec site-to-site peer R2 ike-group IKE` | IKE 정책 연결 |
| `set vpn ipsec site-to-site peer [peer 이름] default-esp-group [ESP 그룹]` | `set vpn ipsec site-to-site peer R2 default-esp-group ESP` | ESP 정책 연결 |
| `set vpn ipsec site-to-site peer [peer 이름] tunnel 0 local prefix [자신의 보호 대역/prefix]` | `set vpn ipsec site-to-site peer R2 tunnel 0 local prefix 192.168.1.0/24` | 자신의 보호 LAN |
| `set vpn ipsec site-to-site peer [peer 이름] tunnel 0 remote prefix [상대 보호 대역/prefix]` | `set vpn ipsec site-to-site peer R2 tunnel 0 remote prefix 192.168.2.0/24` | 상대 보호 LAN |
| `set vpn ipsec site-to-site peer [peer 이름] tunnel 0 disable` | `set vpn ipsec site-to-site peer R2 tunnel 0 disable` | 이 peer의 보호 정책 끄기 |
| `delete vpn ipsec site-to-site peer [peer 이름] tunnel 0 disable` | `delete vpn ipsec site-to-site peer R2 tunnel 0 disable` | 보호 정책 다시 켜기 |
| `delete vpn ipsec site-to-site peer [peer 이름]` | `delete vpn ipsec site-to-site peer R2` | 해당 peer 삭제 |
| `show vpn ipsec sa` | `show vpn ipsec sa` | 일반 모드에서 SA 상태·SPI·송수신·거절 카운터 |
| `show vpn ipsec connections` | `show vpn ipsec connections` | 일반 모드에서 연결된 교육용 SA 요약. 현재 SA 조회와 같은 출력 |

`[인증 ID]`는 상대가 누구인지 구분하는 값이다. 이 실습에서는 R1/R2의 물리 IP를 인증 ID로 사용하므로, PSK `LAB`에 `10.0.13.1`과 `10.0.23.2`를 각각 `id`로 추가한다. PSK 이름 `LAB`과 공유 식별자 `LAB_SHARED`는 서로 다른 값이다.

예를 들어 다음 명령은 **“R2라는 peer 설정에, 앞에서 만든 IKE라는 그룹을 연결하라”**는 뜻이다.

```text
set vpn ipsec site-to-site peer [peer 이름] ike-group [IKE 그룹]
```

실제 입력:

```text
set vpn ipsec site-to-site peer R2 ike-group IKE
```

이 프로그램에서는 `proposal 10`, `tunnel 0`, `mode tunnel`, `authentication mode pre-shared-secret`을 그대로 사용한다. 번호를 마음대로 바꾸는 자리가 아니다. 선택 가능한 정책값은 IKE 버전 `ikev1`/`ikev2`, 암호화 알고리즘 `aes128`/`aes256`, 해시 `sha1`/`sha256`, DH 그룹 `14`/`19`, PFS `enable`/`disable`이다. 이 값들은 **교육용 정책 일치 검사**에 사용하며 실제 암호화·IKE를 실행하지 않는다.

### R1: IPsec 설정

```text vyos-ipsec-r1
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
set vpn ipsec authentication psk LAB id 10.0.13.1
set vpn ipsec authentication psk LAB id 10.0.23.2
set vpn ipsec authentication psk LAB secret LAB_SHARED
set vpn ipsec site-to-site peer R2 local-address 10.0.13.1
set vpn ipsec site-to-site peer R2 remote-address 10.0.23.2
set vpn ipsec site-to-site peer R2 authentication mode pre-shared-secret
set vpn ipsec site-to-site peer R2 ike-group IKE
set vpn ipsec site-to-site peer R2 default-esp-group ESP
set vpn ipsec site-to-site peer R2 tunnel 0 local prefix 192.168.1.0/24
set vpn ipsec site-to-site peer R2 tunnel 0 remote prefix 192.168.2.0/24
set protocols static route 192.168.2.0/24 next-hop 10.0.13.2
commit
exit
```

### R2: IPsec 설정

```text vyos-ipsec-r2
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
set vpn ipsec authentication psk LAB id 10.0.13.1
set vpn ipsec authentication psk LAB id 10.0.23.2
set vpn ipsec authentication psk LAB secret LAB_SHARED
set vpn ipsec site-to-site peer R1 local-address 10.0.23.2
set vpn ipsec site-to-site peer R1 remote-address 10.0.13.1
set vpn ipsec site-to-site peer R1 authentication mode pre-shared-secret
set vpn ipsec site-to-site peer R1 ike-group IKE
set vpn ipsec site-to-site peer R1 default-esp-group ESP
set vpn ipsec site-to-site peer R1 tunnel 0 local prefix 192.168.2.0/24
set vpn ipsec site-to-site peer R1 tunnel 0 remote prefix 192.168.1.0/24
set protocols static route 192.168.1.0/24 next-hop 10.0.23.1
commit
exit
```

## 5. 성공·실패 확인

1. PC_A에서 `ping 192.168.2.10`, PC_B에서 `ping 192.168.1.10`: 양방향 응답, `TTL=126` 확인.
2. R1 일반 모드에서 `ping 192.168.2.10`: `Success rate: 4/4` 확인.
3. R1/R2에서 `show vpn ipsec sa`: ping 후 송수신 카운터 증가 확인. `active`는 로컬 SA 사용 상태이며 실제 상대와의 IKE 연결 완료를 뜻하지 않는다.
4. 시뮬레이션 모드에서 ping하면 GRE/ESP 캡슐화·복원 과정을 재생할 수 있다. ISP 구간은 바깥 WAN 주소로 전달한다.
5. `set`만 입력한 상태에서는 활성 설정과 통신이 바뀌지 않아야 한다. 잘못된 source IP, 부족한 peer/PSK/그룹, 잘못된 subnet으로 `commit`하면 오류가 나오고 기존 설정이 남는다.
6. 서로 다른 PSK·인증 ID·알고리즘 정책으로 commit한 경우 보호 패킷을 거절한다. 실패 후 자동 평문 재전송은 하지 않는다.
7. 양쪽에서 `tunnel 0 disable`을 commit하면 해당 보호 정책이 꺼진다. 일반 경로가 있으면 평문 라우팅을 할 수 있다. 이 예제의 ISP에는 LAN 경로가 없으므로 PC 간 통신은 실패한다. `delete ... disable` 후 commit하면 다시 켠다.

PSK·정책을 바꾸거나 peer를 삭제하면 관련 로컬 SA를 초기화한다. 양쪽을 맞춘 새 토폴로지를 다시 가져오면 동적 SA 상태도 초기화된다. disable/enable만으로는 sequence를 초기화하지 않으며, 이 구현은 자동 재협상을 하지 않는다. 만료 SA를 실제 IKE처럼 자동 갱신하는 기능은 이번 범위 밖이다.

## 6. 지원 범위와 기존 설정

- IPv4, 물리 포트 eth0~3, GRE tun0~3, 포트당 주소 하나, 정적 경로 next-hop을 지원한다. 주소 변경은 옛 `address <CIDR>` 항목을 delete한 뒤 새 주소를 set한다.
- IPsec은 PSK 방식, peer당 tunnel 0 하나, proposal 10 하나, ESP tunnel 모드, IPv4 ICMP를 지원한다. IKE ikev1/ikev2, AES128/256, SHA1/256, DH14/19, PFS enable/disable 값만 받는다. 양쪽 정책이 정확히 일치해야 하며 여러 proposal 사이 협상은 하지 않는다.
- SPI는 시뮬레이터가 결정적으로 생성해 양쪽 번호를 대응시킨다. 실제 IKE로 할당한 번호가 아니다. 기존 수동 SPI 프로필을 변환하면 그 번호는 보존한다.
- `connection-type`, VTI, NAT-T, 인증서, IPv6, `save` 등 나머지 VyOS 명령어는 지원하지 않으며 성공한 것처럼 처리하지 않는다. 표시 형식·오류 문구는 PING9의 교육용 출력이다.
- 기존 IOS 방식의 `vpn mode`, `crypto ipsec profile`, `interface Tunnel0`는 **IOS 형식에서만** 유지한다. VyOS 형식에서는 `vpn mode ipsec` 같은 전용 명령을 쓰지 않는다.
- CLI를 VyOS로 바꾸면 기존 전역 VPN 모드 선택을 해제하고 실제 터널·정책 설정을 따른다. 완성된 기존 GRE/IPsec 설정은 `configure` 때 변환한다. 미완성 IPsec 프로필이나 AD가 별도로 지정된 경로는 자동 변환을 거절해 유실을 막는다. 기존 RIP 설정은 유지하지만 이 VyOS subset에서 편집하지 않는다.
- 기존 IOS 교육 모델의 shutdown은 보호 대상 평문 전달도 차단한다. VyOS로 commit한 정책의 disable은 정책을 끄는 동작이다. 두 흐름의 차이를 구분한다.

공식 문법 참고: [VyOS 1.4 CLI](https://docs.vyos.io/en/1.4/cli.html), [GRE tunnel](https://docs.vyos.io/en/1.4/configuration/interfaces/tunnel.html), [site-to-site IPsec](https://docs.vyos.io/en/1.4/configuration/vpn/ipsec/site2site_ipsec.html), [static routes](https://docs.vyos.io/en/1.4/configuration/protocols/static.html).
