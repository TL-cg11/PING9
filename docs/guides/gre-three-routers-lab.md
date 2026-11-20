# GRE 실습: R1과 R3 사이 터널

```text
PC_A ── R1 ── R2 ── R3 ── PC_B
         ╰────── GRE ───────╯
```

R1과 R3가 원래 패킷을 GRE로 감싸고 풀어 준다. R2는 바깥 IP만 보고 전달한다. **GRE는 암호화하지 않는다.** SSL의 `vpn connect OFFICE` 명령은 사용하지 않는다.

지금 만든 **1.1.1.x·2.2.2.x·192.168.x.x 구성**으로 연습 중이면 [네 사진 주소를 쓰는 GRE 순서 안내](gre-custom-address-lab.md)를 따른다. 아래 본문은 198.168.x.x 예제다. 두 문서의 IP를 섞지 않는다.

## 1. 시작 방법

- 직접 설정: [공통 준비 가이드](vpn-three-routers-lab.md)를 따라 하거나 [VPN 설정 전 JSON](vpn-three-routers-underlay.ping9.json)을 가져온 뒤 아래 2단계부터 진행한다.
- 완성 구성 확인: [GRE 완성 JSON](gre-three-routers.ping9.json)을 가져온 뒤 4단계의 ping과 조회 명령부터 실행한다. 완성 파일에는 이미 아래 설정이 들어 있다.

웹 주소는 <http://127.0.0.1:5175/>다. 파일은 상단 **가져오기**로 연다. 이전 실습은 먼저 내보내기로 보관한다. R1/R3의 CLI 형식은 VyOS다.

### 먼저 장비·모드·순서를 확인

1. 물리 연결·IP·WAN 왕복 경로를 준비한다. 물리망이 없으면 터널도 전달되지 않는다.
2. R1 터미널이 `vyos@R1:~$`인지 확인한다.
3. 아래 R1 블록을 **configure → set 5개 → commit → exit** 순서로 입력한다.
4. R3 터미널을 열어 R3 블록 전체를 같은 순서로 입력한다.
5. 양쪽 설정 후 PC에서 ping한다. R1만 설정한 시점에는 아직 완료가 아니다.
6. R2는 일반 전달만 한다. R1/R3의 GRE 명령을 R2에 입력하지 않는다.

| 보이는 프롬프트 | 뜻 | 다음에 할 일 |
|---|---|---|
| `vyos@R1:~$` / `vyos@R3:~$` | VyOS 일반 모드 | configure 입력 |
| `vyos@R1#` / `vyos@R3#` | VyOS 설정 모드 | set/delete 편집 후 commit |
| `R1>` / `R1#` | IOS 모드 | 속성 패널에서 VyOS로 먼저 변경 |

`configure`만 입력했는데 “명령어가 끝나지 않았어요”가 나오면 IOS인지 확인한다. GRE 블록은 VyOS 문법이므로 IOS의 configure terminal 뒤에 그대로 붙이지 않는다. `interface`가 아니라 **interfaces**이며, `<IPv4>`·`[IP 주소]` 같은 설명용 자리는 실제 값으로 바꿔 넣는다. 코드 블록의 각 줄 끝에 역슬래시를 붙이지 않는다.

### 어떤 주소를 넣는 자리인지 먼저 구분

| 항목 | 어디서 가져오나? | R1에서 | R3에서 |
|---|---|---|---|
| source-address | **자신**의 R2 방향 물리 포트 IP | 198.168.1.1 | 198.168.2.2 |
| remote | GRE를 풀 **반대편 Router**의 물리 포트 IP | 198.168.2.2 | 198.168.1.1 |
| tun0 address | 터널용으로 **새로 정할 자신의 가상 IP** | 198.168.4.1/30 | 198.168.4.2/30 |
| static route 목적지 | 도착할 **반대편 PC의 네트워크 주소** | 198.168.3.0/24 | 198.168.0.0/24 |
| static route next-hop | **반대편 tun0의 IP** | 198.168.4.2 | 198.168.4.1 |

`source-address`와 `remote`는 기존 물리 주소를 사용한다. `tun0`는 이 설정으로 만드는 가상 인터페이스 이름이며 `0`은 번호다. tun0에 줄 IP는 별도 대역으로 정한다. `/30`은 255.255.255.252와 같으며, 이 대역은 `.0`이 네트워크, `.1`·`.2`가 장비용, `.3`이 브로드캐스트다. 양끝을 `.1`과 `.2`로 맞춘다. `198.168.5.1/30`처럼 다른 대역으로 건너뛰지 않는다.

R1의 remote는 R3 주소이고, R3의 remote는 R1 주소이므로 서로 반대다. PC 주소나 중간 R2 주소를 remote에 넣지 않는다.

## 2. R1: GRE 설정

R1의 일반 모드 터미널에 한 줄씩 입력한다.

```text
configure
set interfaces tunnel tun0 encapsulation gre
set interfaces tunnel tun0 source-address 198.168.1.1
set interfaces tunnel tun0 remote 198.168.2.2
set interfaces tunnel tun0 address 198.168.4.1/30
set protocols static route 198.168.3.0/24 next-hop 198.168.4.2
commit
exit
```

**한 줄씩 읽기 — 위 코드 블록 순서대로 입력한다.**

| 순서 | 실제 입력할 명령 | 뜻과 입력 이유 |
|---|---|---|
| 1 | `configure` | R1의 일반 모드에서 설정 모드로 들어간다. 아직 실제 통신은 바뀌지 않는다. |
| 2 | `set interfaces tunnel tun0 encapsulation gre` | 가상 인터페이스 tun0을 GRE 터널로 설정한다. 실제 케이블 포트를 추가하는 명령은 아니다. |
| 3 | `set interfaces tunnel tun0 source-address 198.168.1.1` | 바깥 GRE 패킷의 출발 IP를 198.168.1.1로 정한다. R1 자신의 기존 WAN 포트 IP다. |
| 4 | `set interfaces tunnel tun0 remote 198.168.2.2` | 바깥 GRE 패킷을 받을 R3의 물리 IP 198.168.2.2를 지정한다. PC나 R2의 IP가 아니다. |
| 5 | `set interfaces tunnel tun0 address 198.168.4.1/30` | tun0 자체에 새 가상 IP 198.168.4.1/30를 준다. 반대편 tun0과 같은 대역의 다른 주소를 사용한다. |
| 6 | `set protocols static route 198.168.3.0/24 next-hop 198.168.4.2` | 목적지 네트워크 198.168.3.0/24로 갈 패킷을 R3의 가상 터널 IP 198.168.4.2로 보내도록 경로를 추가한다. |
| 7 | `commit` | 지금까지 편집한 R1의 설정을 검사하고 적용한다. 반대 Router는 별도로 설정해야 한다. |
| 8 | `exit` | 현재 설정 단계를 나간다. VyOS에서는 commit 뒤 일반 모드로 돌아간다. |


| 설정 | 뜻 |
|---|---|
| `encapsulation gre` | tun0에서 패킷을 GRE 형식으로 감싸기 |
| `source-address 198.168.1.1` | R1의 바깥쪽 물리 IP |
| `remote 198.168.2.2` | GRE를 풀 상대 R3의 바깥쪽 물리 IP |
| `address 198.168.4.1/30` | R1의 터널 내부 IP |
| 목적지 `198.168.3.0/24` | PC_B가 속한 LAN |
| 다음 홉 `198.168.4.2` | R3의 터널 내부 IP로 보내기 |

`remote`의 물리 IP와 `next-hop`의 터널 IP를 구분한다.

## 3. R3: GRE 설정

```text
configure
set interfaces tunnel tun0 encapsulation gre
set interfaces tunnel tun0 source-address 198.168.2.2
set interfaces tunnel tun0 remote 198.168.1.1
set interfaces tunnel tun0 address 198.168.4.2/30
set protocols static route 198.168.0.0/24 next-hop 198.168.4.1
commit
exit
```

**한 줄씩 읽기 — 위 코드 블록 순서대로 입력한다.**

| 순서 | 실제 입력할 명령 | 뜻과 입력 이유 |
|---|---|---|
| 1 | `configure` | R3의 일반 모드에서 설정 모드로 들어간다. 아직 실제 통신은 바뀌지 않는다. |
| 2 | `set interfaces tunnel tun0 encapsulation gre` | 가상 인터페이스 tun0을 GRE 터널로 설정한다. 실제 케이블 포트를 추가하는 명령은 아니다. |
| 3 | `set interfaces tunnel tun0 source-address 198.168.2.2` | 바깥 GRE 패킷의 출발 IP를 198.168.2.2로 정한다. R3 자신의 기존 WAN 포트 IP다. |
| 4 | `set interfaces tunnel tun0 remote 198.168.1.1` | 바깥 GRE 패킷을 받을 R1의 물리 IP 198.168.1.1를 지정한다. PC나 R2의 IP가 아니다. |
| 5 | `set interfaces tunnel tun0 address 198.168.4.2/30` | tun0 자체에 새 가상 IP 198.168.4.2/30를 준다. 반대편 tun0과 같은 대역의 다른 주소를 사용한다. |
| 6 | `set protocols static route 198.168.0.0/24 next-hop 198.168.4.1` | 목적지 네트워크 198.168.0.0/24로 갈 패킷을 R1의 가상 터널 IP 198.168.4.1로 보내도록 경로를 추가한다. |
| 7 | `commit` | 지금까지 편집한 R3의 설정을 검사하고 적용한다. 반대 Router는 별도로 설정해야 한다. |
| 8 | `exit` | 현재 설정 단계를 나간다. VyOS에서는 commit 뒤 일반 모드로 돌아간다. |


R3에는 PC_A LAN으로 돌아가는 경로를 넣는다. R2에는 GRE 설정을 하지 않는다.

## 4. 정상 통신과 상태 확인

| 실행 장비 | 명령 | 예상 |
|---|---|---|
| R1/R3 | `show interfaces tunnel tun0` | 터널 설정·상태 표시 |
| R1/R3 | `show ip route` | 상대 LAN 경로가 tun0 방향 |
| PC_A | `ping 198.168.3.2` | PC_B의 bytes=32 응답 |
| PC_B | `ping 198.168.0.2` | PC_A의 bytes=32 응답 |

Windows PC 양쪽의 응답 TTL은 이 구성에서 **126**이다. `commit` 전에는 활성 설정에 반영되지 않는다. 시뮬레이션 모드로 ping하면 GRE 캡슐화·복원과 중간 R2 전달을 볼 수 있다.

## 5. 터널 중단 → 실패 → 복구

R1 일반 모드에서 터널을 끈다.

```text
configure
set interfaces tunnel tun0 disable
commit
exit
```

**한 줄씩 읽기 — 위 코드 블록 순서대로 입력한다.**

| 순서 | 실제 입력할 명령 | 뜻과 입력 이유 |
|---|---|---|
| 1 | `configure` | R1의 일반 모드에서 설정 모드로 들어간다. 아직 실제 통신은 바뀌지 않는다. |
| 2 | `set interfaces tunnel tun0 disable` | tun0에 꺼짐 설정을 추가한다. commit 후 터널 경로를 사용할 수 없게 된다. |
| 3 | `commit` | 지금까지 편집한 R1의 설정을 검사하고 적용한다. 반대 Router는 별도로 설정해야 한다. |
| 4 | `exit` | 현재 설정 단계를 나간다. VyOS에서는 commit 뒤 일반 모드로 돌아간다. |


PC_A의 `ping 198.168.3.2`가 실패해야 한다. 이어 R1에서 다시 켠다.

```text
configure
delete interfaces tunnel tun0 disable
commit
exit
```

**한 줄씩 읽기 — 위 코드 블록 순서대로 입력한다.**

| 순서 | 실제 입력할 명령 | 뜻과 입력 이유 |
|---|---|---|
| 1 | `configure` | R1의 일반 모드에서 설정 모드로 들어간다. 아직 실제 통신은 바뀌지 않는다. |
| 2 | `delete interfaces tunnel tun0 disable` | tun0의 꺼짐 설정을 제거한다. commit 후 터널을 다시 켠다. |
| 3 | `commit` | 지금까지 편집한 R1의 설정을 검사하고 적용한다. 반대 Router는 별도로 설정해야 한다. |
| 4 | `exit` | 현재 설정 단계를 나간다. VyOS에서는 commit 뒤 일반 모드로 돌아간다. |


PC_A에서 ping을 다시 실행하면 정상 응답이 돌아와야 한다. 이후 상단 **내보내기**로 직접 설정한 구성을 저장한다.

### 같은 목적지의 기존 일반 경로가 있다면

기존에 상대 LAN으로 가는 일반 정적 경로를 만들었다면, 그 경로가 GRE 경로와 함께 남지 않도록 확인한다. 일반 모드에서 `show configuration commands` 또는 `show ip route`로 기존 next-hop을 먼저 확인한다. 설정 모드에서는 `show`로 임시 설정을 볼 수 있다.

일반 형식은 `delete protocols static route [상대 LAN/prefix] next-hop [기존 물리 next-hop]`이다. **실제로 존재하는 항목만** 삭제하고 새 GRE 경로를 넣은 뒤 commit한다. 물리 WAN으로 가는 underlay 경로는 그대로 필요하다.

### R2에 잘못 입력했을 때 / 아직 적용하고 싶지 않을 때

VyOS 설정 모드에서 `discard`를 입력하면 아직 commit하지 않은 변경을 모두 버린다. 그다음 `exit`로 일반 모드에 나간다. 반대로 commit 후에는 discard로 과거 설정으로 돌아갈 수 없다. 이미 적용한 항목은 활성 설정을 확인한 뒤 별도로 삭제해야 한다.

**적용 전 편집:** configure → set/delete → show로 확인 → commit → exit. **적용 전 취소:** configure 상태에서 discard → exit. commit 오류가 나면 기존 활성 설정은 유지되고 설정 모드에 남는다. 오류를 해결하기 전에는 성공으로 판단하지 않는다.

## 6. 막혔을 때

- 물리 구간은 [공통 준비의 확인 표](vpn-three-routers-lab.md)를 먼저 점검한다.
- source-address가 자신의 실제 WAN IP인지, remote가 반대 Router의 WAN IP인지 확인한다.
- 터널 IP는 R1 `.1`, R3 `.2`이며 같은 `/30`을 사용한다.
- 반대 LAN으로 가는 정적 경로가 양쪽에 모두 있어야 한다.
- GRE와 IPsec을 각각 연습하려면 공통 준비 JSON을 다시 가져와 새로 시작한다.

[IPsec 실습](ipsec-three-routers-lab.md) · [SSL 실습](ssl-vpn-from-scratch.md)
