# 네 사진 주소로 GRE 설정하기: 1.1.1.x·2.2.2.x

대화에서 만든 **PC1 → R1 → R2 → R3 → PC2** 구성에 맞춘 안내다. `198.168.x.x` 기본 예제를 그대로 복사하지 않고 아래 값으로 통일한다. GRE는 실제 암호화 없이 패킷을 감싸 전달한다.

```text
PC1 ── R1 ── R2 ── R3 ── PC2
        ╰──── GRE 터널 ────╯
```

## 0. 물리 설정부터 확인

이 안내는 아래 물리 IP와 케이블이 이미 구성된 상태에서 시작한다. 사진과 주소/연결 포트가 다르면 해당 포트의 실제 IP를 먼저 확인한다.

| 장비 | 포트 | 자신의 물리 IP | 역할 |
|---|---|---|---|
| PC1 | Ethernet0 | 192.168.0.1/24 | 기본 게이트웨이 192.168.0.254 |
| R1 | Gi0/3 = eth3 | 192.168.0.254/24 | PC1 쪽 |
| R1 | Gi0/0 = eth0 | 1.1.1.1/24 | R2 쪽, R1의 GRE source-address |
| R2 | Gi0/0 | 1.1.1.2/24 | R1 쪽 |
| R2 | Gi0/1 | 2.2.2.1/24 | R3 쪽 |
| R3 | Gi0/0 = eth0 | 2.2.2.2/24 | R2 쪽, R3의 GRE source-address |
| R3 | Gi0/3 = eth3 | 192.168.1.254/24 | PC2 쪽 |
| PC2 | Ethernet0 | 192.168.1.1/24 | 기본 게이트웨이 192.168.1.254 |

PC 게이트웨이는 PC 속성 패널에서 입력·적용한다. 물리 포트는 모두 켜져 있어야 한다. 이 사진은 WAN에도 /24를 사용했으며, 통신을 위해 /30으로 바꿀 필요는 없다. 새 **터널 내부 주소**에는 아래의 별도 /30을 사용한다.

R1과 R3는 **VyOS 1.4**, R2는 기존 물리 설정을 유지한다. R2에 GRE를 만들지 않는다.

### 0-1. R1의 바깥 경로

R1 일반 모드 `vyos@R1:~$`에서 입력한다. R3의 물리 IP 대역으로 가는 길을 먼저 만든다.

```text
configure
set protocols static route 2.2.2.0/24 next-hop 1.1.1.2
commit
exit
```

**한 줄씩 읽기 — 위 코드 블록 순서대로 입력한다.**

| 순서 | 실제 입력할 명령 | 뜻과 입력 이유 |
|---|---|---|
| 1 | `configure` | R1의 일반 모드에서 설정 모드로 들어간다. 아직 실제 통신은 바뀌지 않는다. |
| 2 | `set protocols static route 2.2.2.0/24 next-hop 1.1.1.2` | 목적지 네트워크 2.2.2.0/24로 갈 패킷을 바로 옆 R2의 물리 IP 1.1.1.2로 보내도록 경로를 추가한다. |
| 3 | `commit` | 지금까지 편집한 R1의 설정을 검사하고 적용한다. 반대 Router는 별도로 설정해야 한다. |
| 4 | `exit` | 현재 설정 단계를 나간다. VyOS에서는 commit 뒤 일반 모드로 돌아간다. |

### 0-2. R3의 바깥 경로

R3 일반 모드 `vyos@R3:~$`에서 입력한다.

```text
configure
set protocols static route 1.1.1.0/24 next-hop 2.2.2.1
commit
exit
```

**한 줄씩 읽기 — 위 코드 블록 순서대로 입력한다.**

| 순서 | 실제 입력할 명령 | 뜻과 입력 이유 |
|---|---|---|
| 1 | `configure` | R3의 일반 모드에서 설정 모드로 들어간다. 아직 실제 통신은 바뀌지 않는다. |
| 2 | `set protocols static route 1.1.1.0/24 next-hop 2.2.2.1` | 목적지 네트워크 1.1.1.0/24로 갈 패킷을 바로 옆 R2의 물리 IP 2.2.2.1로 보내도록 경로를 추가한다. |
| 3 | `commit` | 지금까지 편집한 R3의 설정을 검사하고 적용한다. 반대 Router는 별도로 설정해야 한다. |
| 4 | `exit` | 현재 설정 단계를 나간다. VyOS에서는 commit 뒤 일반 모드로 돌아간다. |

그다음 R1에서 `ping 2.2.2.2`, R3에서 `ping 1.1.1.1`을 실행한다. 양쪽 모두 응답해야 아래 GRE를 진행한다. 터널을 만드는 중에도 이 물리 WAN 경로는 삭제하지 않는다.

## 1. 앞으로 입력할 값과 순서

| 입력 항목 | R1에서 | R3에서 | 뜻 |
|---|---|---|---|
| source-address | 1.1.1.1 | 2.2.2.2 | 지금 설정 중인 Router 자신의 WAN 물리 IP |
| remote | 2.2.2.2 | 1.1.1.1 | 반대쪽 GRE 끝점 Router의 WAN 물리 IP |
| tun0 address | 172.16.0.1/30 | 172.16.0.2/30 | 터널용으로 새로 부여하는 자신의 가상 IP |
| route 목적지 | 192.168.1.0/24 | 192.168.0.0/24 | 상대 PC가 속한 네트워크 주소 |
| route next-hop | 172.16.0.2 | 172.16.0.1 | 반대 Router의 터널 IP |

물리 IP는 기존 포트에 이미 붙인 주소이고, tun0는 GRE 명령으로 만드는 **가상 포트**다. 가상 포트를 화면에서 따로 추가할 필요는 없다. R1의 가상 IP를 172.16.0.1/30으로 정했다면 R3는 같은 172.16.0.0/30 대역의 172.16.0.2/30을 쓴다. **172.16.1.1/30은 다른 대역**이므로 이번 짝으로 쓰지 않는다.

입력 순서는 **R1 창 확인 → configure → R1의 set/delete → commit → exit → R3 창 확인 → configure → R3의 set/delete → commit → exit → PC 양방향 ping**이다. 일반 모드는 `vyos@R1:~$`, configure 뒤 설정 모드는 `vyos@R1#`다. R3도 같은 방식으로 바뀐다.

### 기존 일반 경로를 삭제하는 줄은 조건부

사진에서 R1에 `192.168.1.0/24 → 1.1.1.2` 일반 경로가 있었다. 아래 R1 블록에는 이 경로 삭제를 포함했다. R3도 반대 LAN의 기존 일반 경로가 있다면 함께 삭제한다.

**일반 모드에서 `show configuration commands`로 해당 경로가 있는지 확인한다. 없으면 아래 블록의 delete 줄만 생략한다.** 물리 경로 2.2.2.0/24 또는 1.1.1.0/24는 지우지 않는다. 같은 목적지의 일반 경로와 GRE 경로를 함께 남기면 의도한 터널 경로 대신 기존 경로가 선택될 수 있다.

## 2. R1: 이 블록을 순서대로 입력

먼저 R1 창과 `vyos@R1:~$`를 확인한다. R2 창에서 입력하지 않는다.

```text
configure
set interfaces tunnel tun0 encapsulation gre
set interfaces tunnel tun0 source-address 1.1.1.1
set interfaces tunnel tun0 remote 2.2.2.2
set interfaces tunnel tun0 address 172.16.0.1/30
delete protocols static route 192.168.1.0/24 next-hop 1.1.1.2
set protocols static route 192.168.1.0/24 next-hop 172.16.0.2
commit
exit
```

**한 줄씩 읽기 — 위 코드 블록 순서대로 입력한다.**

| 순서 | 실제 입력할 명령 | 뜻과 입력 이유 |
|---|---|---|
| 1 | `configure` | R1의 일반 모드에서 설정 모드로 들어간다. 아직 실제 통신은 바뀌지 않는다. |
| 2 | `set interfaces tunnel tun0 encapsulation gre` | 가상 인터페이스 tun0을 GRE 터널로 설정한다. 실제 케이블 포트를 추가하는 명령은 아니다. |
| 3 | `set interfaces tunnel tun0 source-address 1.1.1.1` | 바깥 GRE 패킷의 출발 IP를 1.1.1.1로 정한다. R1 자신의 기존 WAN 포트 IP다. |
| 4 | `set interfaces tunnel tun0 remote 2.2.2.2` | 바깥 GRE 패킷을 받을 R3의 물리 IP 2.2.2.2를 지정한다. PC나 R2의 IP가 아니다. |
| 5 | `set interfaces tunnel tun0 address 172.16.0.1/30` | tun0 자체에 새 가상 IP 172.16.0.1/30를 준다. 반대편 tun0과 같은 대역의 다른 주소를 사용한다. |
| 6 | `delete protocols static route 192.168.1.0/24 next-hop 1.1.1.2` | 같은 목적지로 가던 기존 일반 경로를 지운다. GRE 경로 대신 옛 경로가 선택되는 것을 막는다. 해당 경로가 있을 때만 입력한다. |
| 7 | `set protocols static route 192.168.1.0/24 next-hop 172.16.0.2` | 목적지 네트워크 192.168.1.0/24로 갈 패킷을 R3의 가상 터널 IP 172.16.0.2로 보내도록 경로를 추가한다. |
| 8 | `commit` | 지금까지 편집한 R1의 설정을 검사하고 적용한다. 반대 Router는 별도로 설정해야 한다. |
| 9 | `exit` | 현재 설정 단계를 나간다. VyOS에서는 commit 뒤 일반 모드로 돌아간다. |

R1 remote가 2.2.2.2인 이유는 그 주소가 상대 R3이기 때문이다. **PC2의 192.168.1.1을 remote에 넣지 않는다.** 192.168.1.0/24는 다음 줄의 목적지 LAN이다.

## 3. R3: 창을 바꾼 뒤 이 블록을 입력

R3 창과 `vyos@R3:~$`를 확인한다. 기존 일반 경로가 없다면 delete 줄을 생략한다.

```text
configure
set interfaces tunnel tun0 encapsulation gre
set interfaces tunnel tun0 source-address 2.2.2.2
set interfaces tunnel tun0 remote 1.1.1.1
set interfaces tunnel tun0 address 172.16.0.2/30
delete protocols static route 192.168.0.0/24 next-hop 2.2.2.1
set protocols static route 192.168.0.0/24 next-hop 172.16.0.1
commit
exit
```

**한 줄씩 읽기 — 위 코드 블록 순서대로 입력한다.**

| 순서 | 실제 입력할 명령 | 뜻과 입력 이유 |
|---|---|---|
| 1 | `configure` | R3의 일반 모드에서 설정 모드로 들어간다. 아직 실제 통신은 바뀌지 않는다. |
| 2 | `set interfaces tunnel tun0 encapsulation gre` | 가상 인터페이스 tun0을 GRE 터널로 설정한다. 실제 케이블 포트를 추가하는 명령은 아니다. |
| 3 | `set interfaces tunnel tun0 source-address 2.2.2.2` | 바깥 GRE 패킷의 출발 IP를 2.2.2.2로 정한다. R3 자신의 기존 WAN 포트 IP다. |
| 4 | `set interfaces tunnel tun0 remote 1.1.1.1` | 바깥 GRE 패킷을 받을 R1의 물리 IP 1.1.1.1를 지정한다. PC나 R2의 IP가 아니다. |
| 5 | `set interfaces tunnel tun0 address 172.16.0.2/30` | tun0 자체에 새 가상 IP 172.16.0.2/30를 준다. 반대편 tun0과 같은 대역의 다른 주소를 사용한다. |
| 6 | `delete protocols static route 192.168.0.0/24 next-hop 2.2.2.1` | 같은 목적지로 가던 기존 일반 경로를 지운다. GRE 경로 대신 옛 경로가 선택되는 것을 막는다. 해당 경로가 있을 때만 입력한다. |
| 7 | `set protocols static route 192.168.0.0/24 next-hop 172.16.0.1` | 목적지 네트워크 192.168.0.0/24로 갈 패킷을 R1의 가상 터널 IP 172.16.0.1로 보내도록 경로를 추가한다. |
| 8 | `commit` | 지금까지 편집한 R3의 설정을 검사하고 적용한다. 반대 Router는 별도로 설정해야 한다. |
| 9 | `exit` | 현재 설정 단계를 나간다. VyOS에서는 commit 뒤 일반 모드로 돌아간다. |

R3의 source-address는 자신의 2.2.2.2다. R2의 2.2.2.1이 아니다. R3의 remote는 R1의 1.1.1.1이며, R3에서 PC1로 돌아가는 next-hop은 R1의 **터널 IP 172.16.0.1**이다.

## 4. 적용 후 확인

양쪽에서 commit까지 성공한 뒤 일반 모드에서 실행한다.

| 장비 | 명령 | 무엇을 확인하나? |
|---|---|---|
| R1 | `show interfaces tunnel tun0` | source 1.1.1.1, remote 2.2.2.2, 터널 IP 172.16.0.1/30 |
| R3 | `show interfaces tunnel tun0` | source 2.2.2.2, remote 1.1.1.1, 터널 IP 172.16.0.2/30 |
| R1 | `show ip route` | 192.168.1.0/24의 next-hop이 172.16.0.2 |
| R3 | `show ip route` | 192.168.0.0/24의 next-hop이 172.16.0.1 |
| PC1 | `ping 192.168.1.1` | PC2의 정상 bytes=32 응답 |
| PC2 | `ping 192.168.0.1` | PC1의 정상 bytes=32 응답 |

명령을 입력한 직후가 아니라 **commit 성공 후** 실제 설정이 바뀐다. ping 성공만으로 GRE 여부가 헷갈리면 시뮬레이션 이벤트에서 GRE 캡슐화/복원도 함께 확인한다.

## 5. 자주 틀리는 부분

| 상황 | 해결 |
|---|---|
| configure에 “명령어가 끝나지 않았어요” | 현재 IOS인지 확인하고 R1/R3를 VyOS로 변경한다. |
| set interface tunnel ... 오류 | **interfaces**로 s를 붙인다. |
| `<IPv4>`를 그대로 입력 | 설명 자리다. 실제 자신의 IP를 적는다. |
| source-address에 R2 IP 입력 | 지금 입력하는 R1/R3 자신의 WAN IP로 바꾼다. |
| remote에 PC IP 입력 | 상대 Router의 WAN IP로 바꾼다. |
| R3 터널을 172.16.1.1로 설정 | R1과 같은 대역인 172.16.0.2/30으로 바꾼다. |
| commit 전에 취소하고 싶음 | 설정 모드에서 discard → exit. 아직 적용하지 않은 변경을 모두 버린다. |
| R2에 잘못 입력했지만 commit 전 | R2의 VyOS 설정 모드에서 discard → exit한다. |
| 이미 commit한 설정을 취소하고 싶음 | discard는 적용 전 취소다. 현재 활성 설정을 확인하고 잘못 적용한 항목을 별도 삭제해야 한다. |
| 설정 모드에서 포트 IP 확인 | `run show interfaces ethernet eth0`을 사용한다. |
| 새 set 값이 맞는지 적용 전에 확인 | 설정 모드에서 `show`로 candidate를 본다. run show는 아직 활성 설정을 본다. |

[198.168 예제 GRE](gre-three-routers-lab.md) · [공통 물리망](vpn-three-routers-lab.md) · [IPsec](ipsec-three-routers-lab.md)
