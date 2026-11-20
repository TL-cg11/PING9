# GRE·IPsec 공통 준비: R1·R2·R3 물리망

GRE와 IPsec을 각각 실습하기 위한 공통 물리 구성이다. 장비 이름과 물리 IP는 SSL 실습과 같지만, **양쪽 끝 R1과 R3가 VPN을 구성**한다. 가운데 R2는 바깥 패킷만 전달한다.

```text
PC_A ── R1 ── R2 ── R3 ── PC_B
         ╰──── GRE 또는 IPsec ────╯
```

두 모드는 따로 실습한다. GRE를 마친 뒤 IPsec을 시작할 때는 공통 준비 파일을 다시 가져와 GRE 설정을 비운다. 실제 암호화 없는 교육용 시뮬레이터다.

## 1. 실행과 시작 파일

Mac 터미널에서 실행한다. 5175 개발 서버가 이미 실행 중이면 그대로 사용한다.

```sh
cd /Users/seonyeongmin/Goorm/ping9
pnpm --filter @ping9/web exec vite --host 127.0.0.1 --port 5175 --strictPort
```

새 탭에서 <http://127.0.0.1:5175/>를 연다. `?lab=gre`·`?lab=ipsec`은 이전 주소 계획의 기존 예제이므로 이 안내서와 섞지 않는다.

물리망부터 직접 만들려면 아래 2단계부터 진행한다. 바로 VPN 설정부터 연습하려면 [공통 준비 JSON](vpn-three-routers-underlay.ping9.json)을 저장하고 웹 상단 **가져오기**로 연다. IP·케이블·물리 경로만 준비되어 있으며 GRE·IPsec·SSL 설정은 없다.

### 입력 순서와 모드

**물리 준비 순서:** PC IP 입력·적용 → R1 물리 설정 → R2 물리 설정 → R3 물리 설정 → WAN 왕복 ping 확인 → 원하는 VPN 실습으로 이동한다.

| 장비 | 시작 프롬프트 | 설정 시작 | 설정 적용 | 끝난 프롬프트 |
|---|---|---|---|---|
| R1 | vyos@R1:~$ | configure | commit | exit 후 vyos@R1:~$ |
| R2 | R2> | enable → configure terminal | 각 명령이 즉시 적용 | end 후 R2# |
| R3 | vyos@R3:~$ | configure | commit | exit 후 vyos@R3:~$ |

먼저 장비 제목과 프롬프트를 확인한 뒤 아래 **해당 장비 블록 하나만** 입력한다. R1 블록을 R2에 이어 넣지 않는다. set/delete를 입력한 뒤 commit 전에는 실제 설정이 바뀌지 않는다. VyOS에서 show는 임시 설정, run show interfaces는 현재 활성 포트 설정을 보여준다.

## 2. 장비와 케이블

빈 캔버스에 PC 2대, Router 3대를 배치한다. Router는 왼쪽부터 R1·R2·R3, PC는 PC_A·PC_B로 이름을 지정한다. PC OS는 Windows를 선택한다.

**R1과 R3는 속성 패널에서 라우터 CLI 형식을 VyOS 1.4로, R2는 IOS로 설정한다.** 아래 명령은 각 장비의 웹 터미널에 한 줄씩 입력한다. 프롬프트는 입력하지 않는다.

| 첫 장비·포트 | 반대 장비·포트 |
|---|---|
| PC_A Ethernet0 | R1 GigabitEthernet0/0 |
| R1 GigabitEthernet0/1 | R2 GigabitEthernet0/0 |
| R2 GigabitEthernet0/1 | R3 GigabitEthernet0/0 |
| R3 GigabitEthernet0/1 | PC_B Ethernet0 |

VyOS의 `eth0`, `eth1`은 케이블 화면의 `GigabitEthernet0/0`, `GigabitEthernet0/1`과 같다.

## 3. PC와 포트 주소

PC 속성 패널에서 IP·마스크·게이트웨이를 입력하고 적용한다. 포트가 켜져 있어야 한다.

| 장비 | 포트 | IP | 마스크 | PC 게이트웨이 |
|---|---|---|---|---|
| PC_A | Ethernet0 | 198.168.0.2 | 255.255.255.0 | 198.168.0.1 |
| R1 | eth0 | 198.168.0.1 | 255.255.255.0 | — |
| R1 | eth1 | 198.168.1.1 | 255.255.255.252 | — |
| R2 | Gi0/0 | 198.168.1.2 | 255.255.255.252 | — |
| R2 | Gi0/1 | 198.168.2.1 | 255.255.255.252 | — |
| R3 | eth0 | 198.168.2.2 | 255.255.255.252 | — |
| R3 | eth1 | 198.168.3.1 | 255.255.255.0 | — |
| PC_B | Ethernet0 | 198.168.3.2 | 255.255.255.0 | 198.168.3.1 |

### R1: VyOS 물리 설정

```text
configure
set interfaces ethernet eth0 address 198.168.0.1/24
delete interfaces ethernet eth0 disable
set interfaces ethernet eth1 address 198.168.1.1/30
delete interfaces ethernet eth1 disable
set protocols static route 198.168.2.0/30 next-hop 198.168.1.2
commit
exit
```

**한 줄씩 읽기 — 위 코드 블록 순서대로 입력한다.**

| 순서 | 실제 입력할 명령 | 뜻과 입력 이유 |
|---|---|---|
| 1 | `configure` | R1의 일반 모드에서 설정 모드로 들어간다. 아직 실제 통신은 바뀌지 않는다. |
| 2 | `set interfaces ethernet eth0 address 198.168.0.1/24` | 물리 포트 eth0에 자신의 IP/prefix 198.168.0.1/24를 임시 설정한다. prefix는 마스크 길이다. |
| 3 | `delete interfaces ethernet eth0 disable` | 물리 포트 eth0의 disable 항목을 지운다. commit하면 그 포트가 켜진다. |
| 4 | `set interfaces ethernet eth1 address 198.168.1.1/30` | 물리 포트 eth1에 자신의 IP/prefix 198.168.1.1/30를 임시 설정한다. prefix는 마스크 길이다. |
| 5 | `delete interfaces ethernet eth1 disable` | 물리 포트 eth1의 disable 항목을 지운다. commit하면 그 포트가 켜진다. |
| 6 | `set protocols static route 198.168.2.0/30 next-hop 198.168.1.2` | 목적지 네트워크 198.168.2.0/30로 갈 패킷을 바로 옆 R2의 물리 IP 198.168.1.2로 보내도록 경로를 추가한다. |
| 7 | `commit` | 지금까지 편집한 R1의 설정을 검사하고 적용한다. 반대 Router는 별도로 설정해야 한다. |
| 8 | `exit` | 현재 설정 단계를 나간다. VyOS에서는 commit 뒤 일반 모드로 돌아간다. |


처음 추가한 Router는 포트가 꺼져 있다. `delete ... disable`은 해당 포트를 켜는 명령이다. 이미 켜진 포트에 disable 항목이 없다면 그 delete 줄은 생략한다. `set`은 임시 설정을 편집하고 `commit`부터 실제 구성에 적용한다.

### R2: IOS 물리 설정

```text
enable
configure terminal
interface gi0/0
ip address 198.168.1.2 255.255.255.252
no shutdown
exit
interface gi0/1
ip address 198.168.2.1 255.255.255.252
no shutdown
exit
end
show ip interface brief
show ip route
```

**한 줄씩 읽기 — 위 코드 블록 순서대로 입력한다.**

| 순서 | 실제 입력할 명령 | 뜻과 입력 이유 |
|---|---|---|
| 1 | `enable` | IOS R2>에서 관리자 모드 R2#로 들어간다. |
| 2 | `configure terminal` | IOS 관리자 모드에서 전체 설정 모드로 들어간다. VyOS configure와 문법이 다르다. |
| 3 | `interface gi0/0` | gi0/0 포트를 선택한다. 뒤의 IP/켜짐 명령은 이 포트에 적용된다. |
| 4 | `ip address 198.168.1.2 255.255.255.252` | 선택한 물리 포트에 IP 198.168.1.2와 마스크 255.255.255.252를 준다. |
| 5 | `no shutdown` | 선택한 실제 포트를 켠다. IP만 넣고 포트가 꺼져 있으면 통신하지 못한다. |
| 6 | `exit` | 선택한 포트의 설정을 끝내고 IOS 전체 설정 모드로 한 단계 돌아간다. |
| 7 | `interface gi0/1` | gi0/1 포트를 선택한다. 뒤의 IP/켜짐 명령은 이 포트에 적용된다. |
| 8 | `ip address 198.168.2.1 255.255.255.252` | 선택한 물리 포트에 IP 198.168.2.1와 마스크 255.255.255.252를 준다. |
| 9 | `no shutdown` | 선택한 실제 포트를 켠다. IP만 넣고 포트가 꺼져 있으면 통신하지 못한다. |
| 10 | `exit` | 선택한 포트의 설정을 끝내고 IOS 전체 설정 모드로 한 단계 돌아간다. |
| 11 | `end` | IOS의 설정 단계를 한 번에 끝내고 관리자 모드로 돌아간다. IOS 명령은 즉시 반영되어 commit이 없다. |
| 12 | `show ip interface brief` | 물리 포트마다 IP와 켜짐 상태를 확인한다. |
| 13 | `show ip route` | 활성 라우팅 표에서 직접 연결 경로와 정적 경로를 확인한다. |


R2는 양쪽 WAN을 직접 연결한다. PC_A/PC_B의 LAN으로 가는 경로는 추가하지 않는다.

### R3: VyOS 물리 설정

```text
configure
set interfaces ethernet eth0 address 198.168.2.2/30
delete interfaces ethernet eth0 disable
set interfaces ethernet eth1 address 198.168.3.1/24
delete interfaces ethernet eth1 disable
set protocols static route 198.168.1.0/30 next-hop 198.168.2.1
commit
exit
```

**한 줄씩 읽기 — 위 코드 블록 순서대로 입력한다.**

| 순서 | 실제 입력할 명령 | 뜻과 입력 이유 |
|---|---|---|
| 1 | `configure` | R3의 일반 모드에서 설정 모드로 들어간다. 아직 실제 통신은 바뀌지 않는다. |
| 2 | `set interfaces ethernet eth0 address 198.168.2.2/30` | 물리 포트 eth0에 자신의 IP/prefix 198.168.2.2/30를 임시 설정한다. prefix는 마스크 길이다. |
| 3 | `delete interfaces ethernet eth0 disable` | 물리 포트 eth0의 disable 항목을 지운다. commit하면 그 포트가 켜진다. |
| 4 | `set interfaces ethernet eth1 address 198.168.3.1/24` | 물리 포트 eth1에 자신의 IP/prefix 198.168.3.1/24를 임시 설정한다. prefix는 마스크 길이다. |
| 5 | `delete interfaces ethernet eth1 disable` | 물리 포트 eth1의 disable 항목을 지운다. commit하면 그 포트가 켜진다. |
| 6 | `set protocols static route 198.168.1.0/30 next-hop 198.168.2.1` | 목적지 네트워크 198.168.1.0/30로 갈 패킷을 바로 옆 R2의 물리 IP 198.168.2.1로 보내도록 경로를 추가한다. |
| 7 | `commit` | 지금까지 편집한 R3의 설정을 검사하고 적용한다. 반대 Router는 별도로 설정해야 한다. |
| 8 | `exit` | 현재 설정 단계를 나간다. VyOS에서는 commit 뒤 일반 모드로 돌아간다. |


### IP와 마스크를 고르는 기준

서로 케이블로 직접 연결된 두 포트는 같은 네트워크에 두고, Router를 사이에 둔 다른 구간은 대역을 구분했다. PC LAN에는 /24(255.255.255.0), Router 두 대가 연결된 구간에는 /30(255.255.255.252)을 사용한다. /30에서는 네트워크·브로드캐스트를 제외하고 IP 2개를 배정할 수 있다. .1을 Router에 주는 것은 기억하기 쉽게 정한 배정이며 필수 규칙이 아니다. PC의 기본 게이트웨이는 자신과 연결된 Router 포트의 IP로 맞춘다.

물리 경로 명령 `set protocols static route 198.168.2.0/30 next-hop 198.168.1.2`는 “상대 WAN 대역으로 가려면 R2로 보내라”는 뜻이다. **포트에 IP를 할당하는 명령이 아니라 목적지까지 가는 길을 등록하는 명령**이다.

## 4. VPN 설정 전 확인

| 실행 장비 | 명령 | 예상 |
|---|---|---|
| PC_A | `ping 198.168.0.1` | 자신의 게이트웨이 응답 |
| PC_B | `ping 198.168.3.1` | 자신의 게이트웨이 응답 |
| R1 | `ping 198.168.2.2` | R3의 물리 IP 응답 |
| R3 | `ping 198.168.1.1` | R1의 물리 IP 응답 |
| PC_A | `ping 198.168.3.2` | 실패: VPN 경로를 아직 추가하지 않음 |

중간 Router가 보내는 `Destination ... unreachable`은 오류 응답이다. 정상 통신은 목적지 PC에서 `Reply from ...: bytes=32`가 오는지 확인한다.

R1과 R3의 일반 모드에서 `show interfaces`, `show ip route`로 활성 물리 설정을 확인할 수 있다. 설정 모드에서는 조회 명령 앞에 `run`을 붙인다.

## 5. 원하는 실습으로 진행

- [GRE 설정·정상 통신·터널 중단과 복구](gre-three-routers-lab.md)
- [IPsec 설정·상태·정책 중단과 복구](ipsec-three-routers-lab.md)

양쪽 PC 간 통신을 만드는 GRE/IPsec 실습과, PC 사용자의 접속·가상 IP 할당을 만드는 [SSL 실습](ssl-vpn-from-scratch.md)은 설정 목적과 명령이 다르다.
