# 빈 캔버스부터 만드는 SSL VPN 접속 실습

이 안내서는 장비도 설정도 없는 화면에서 시작한다. 장비를 배치하고, 케이블·IP·정적 경로를 설정한 다음 **OFFICE 접속 설정을 직접 만들어** VPN 접속과 해제를 확인한다.

현재 완성된 범위는 교육용 서버 신뢰·사용자 검사와 가상 IP 할당·세션 관리다. **실제 TLS 암호화와 VPN을 통한 내부 PC ping 전달은 아직 구현 전**이다. 이 실습의 성공 기준은 `State: connected`와 가상 IP 표시, 정상 해제다.

**현재 VPN 설정 폼과 서버 설정 명령은 없다.** 따라서 물리 네트워크는 화면·CLI로 만들고, VPN 설정만 내보낸 JSON 파일을 편집해 추가한다. 소스 코드의 예제 파일을 수정하거나 `?lab=ssl`을 열 필요는 없다.

바로 완성된 구성을 불러오려면 [Router 3대 실습 JSON](ssl-vpn-three-routers.ping9.json)을 내려받아 웹 상단 **가져오기**로 연다. 이 파일에는 아래 주소와 OFFICE/서버 설정이 들어 있고 실행 중 세션은 없다. 직접 만들어 보려면 아래 1단계부터 진행한다.

## 1. 서버 실행과 빈 화면 열기

Mac 터미널에서 실행한다. 이미 5175 서버가 실행 중이면 다시 실행하지 않는다.

```sh
cd /Users/seonyeongmin/Goorm/ping9
pnpm --filter @ping9/web exec vite --host 127.0.0.1 --port 5175 --strictPort
```

새 브라우저 탭에서 **<http://127.0.0.1:5175/>** 를 연다. 주소 뒤에 `?lab=ssl`을 붙이지 않는다. 기본 화면은 빈 캔버스다. 기존 실습이 있다면 먼저 내보내기로 보관하고 새 탭에서 기본 주소를 연다.

이후 코드 블록에 나오는 네트워크 명령은 **웹 안의 해당 장비 터미널**에 한 줄씩 입력한다. Mac 터미널에 입력하지 않는다. `R3#`, `PC_A>` 등의 프롬프트는 명령에 포함하지 않는다.

### 명령어 입력 순서를 먼저 확인

SSL 실습의 물리 Router 설정은 **IOS**다. R1 설정 블록 전체 → R2 설정 블록 전체 → R3 설정 블록 전체 → 가까운 게이트웨이 ping → JSON의 PC/서버 설정 편집 → 가져오기 → PC_A 접속 명령 순서로 진행한다. GRE/IPsec의 VyOS set 명령을 이 IOS 화면에 넣지 않는다.

IOS 프롬프트는 R1> → enable → R1# → configure terminal → R1(config)# → interface 선택 → R1(config-if)# 순서로 바뀐다. interface 모드에서 exit하면 한 단계 위 설정 모드, end는 한 번에 관리자 모드로 돌아간다. **IOS는 각 설정을 즉시 적용하므로 commit이 없다.**

PC의 vpn connect OFFICE는 **PC_A 터미널**에서 입력한다. Router에서 입력하는 명령이 아니다. OFFICE는 6단계에서 PC_A의 config.sslVpn.name에 직접 넣는 접속 설정 이름이다.

## 2. 장비 배치와 이름 변경

왼쪽 목록의 장비를 끌어서 다음 순서로 배치한다.

```text
PC_A ── R1 ── R2 ── R3 ── PC_B
외부 PC   중간 라우터  중간 라우터  회사 VPN 서버  내부 PC
```

| 이름 | 추가할 종류 | 역할 |
|---|---|---|
| PC_A | PC | VPN 접속을 요청할 외부 사용자 |
| R1 | Router | 외부 PC와 회사 쪽을 연결하는 중간 라우터 |
| R2 | Router | R1과 회사 VPN 서버 사이를 연결하는 중간 라우터 |
| R3 | Router | VPN 서버와 내부망 게이트웨이 |
| PC_B | PC | 회사 내부 PC; 이번에는 자신의 게이트웨이까지 확인 |

**PC 2대와 Router 3대**를 배치한다. 빈 캔버스에서 Router를 왼쪽부터 순서대로 추가하면 기본 이름이 `R1`, `R2`, `R3`가 된다. 이름이 다르면 장비를 선택하고 속성 패널 이름 옆 연필 버튼으로 위 이름을 지정한다. PC 두 대는 각각 `PC_A`, `PC_B`로 바꾸고 OS를 **Windows**로 선택한다.

R1·R2·R3의 **라우터 CLI 형식은 IOS**로 둔다. 아래 물리 인터페이스·경로 명령은 IOS 문법이다. 다른 GRE·IPsec 실습에서 사용한 VyOS 설정을 복사하지 않는다.

## 3. 케이블 연결과 주소 계획

케이블 도구를 클릭하고, 첫 장비와 빈 포트 선택 → 두 번째 장비와 빈 포트 선택 순서로 연결한다. 연결을 마치면 Esc로 케이블 도구를 해제한다.

| 첫 장비·포트 | 반대 장비·포트 |
|---|---|
| PC_A `Ethernet0` | R1 `GigabitEthernet0/0` |
| R1 `GigabitEthernet0/1` | R2 `GigabitEthernet0/0` |
| R2 `GigabitEthernet0/1` | R3 `GigabitEthernet0/0` |
| R3 `GigabitEthernet0/1` | PC_B `Ethernet0` |

Router의 `Gi0/0`, `Gi0/1`은 각각 `GigabitEthernet0/0`, `GigabitEthernet0/1`의 약칭이다.

요청한 `198.168.0.1`부터 시작하는 주소 계획이다. 연결 구간마다 대역을 구분한다. `?lab=ssl` 사전 설정 예제도 같은 Router 3대 구성과 주소 계획을 사용한다. 빈 캔버스에서 직접 구성할 때는 기본 주소를 연다.

| 구간 | 선택한 대역 | 배정 |
|---|---|---|
| PC_A ↔ R1 | `198.168.0.0/24` | R1 `198.168.0.1`, PC_A `198.168.0.2` |
| R1 ↔ R2 | `198.168.1.0/30` | R1 `198.168.1.1`, R2 `198.168.1.2` |
| R2 ↔ R3 | `198.168.2.0/30` | R2 `198.168.2.1`, R3 `198.168.2.2` |
| 회사 내부망 | `198.168.3.0/24` | R3 `198.168.3.1`, PC_B `198.168.3.2` |
| VPN 가상망 | `198.168.4.0/29` | 서버 예약 `198.168.4.1`, 접속 PC `198.168.4.2`부터 |

| 장비 | 포트 | IP | 마스크 | 게이트웨이/기본 경로 |
|---|---|---|---|---|
| PC_A | Ethernet0 | 198.168.0.2 | 255.255.255.0 | 198.168.0.1 |
| R1 | Gi0/0 | 198.168.0.1 | 255.255.255.0 | — |
| R1 | Gi0/1 | 198.168.1.1 | 255.255.255.252 | — |
| R2 | Gi0/0 | 198.168.1.2 | 255.255.255.252 | 198.168.1.1 |
| R2 | Gi0/1 | 198.168.2.1 | 255.255.255.252 | 위 기본 경로 사용 |
| R3 | Gi0/0 | 198.168.2.2 | 255.255.255.252 | 198.168.2.1 |
| R3 | Gi0/1 | 198.168.3.1 | 255.255.255.0 | 위 기본 경로 사용 |
| PC_B | Ethernet0 | 198.168.3.2 | 255.255.255.0 | 198.168.3.1 |

## 4. 물리 IP와 경로 설정

### 4-1. PC_A와 PC_B: 속성 패널

각 PC를 클릭하고 위 표의 **IP 주소·서브넷 마스크·기본 게이트웨이**를 입력한 뒤 **적용**을 누른다. 포트가 `켜짐`인지 확인한다. 두 PC 모두 설정한다.

### 4-2. R1: IOS 터미널

장비를 더블클릭하거나 속성 패널의 **터미널 열기**를 누른다. R1의 초기 프롬프트가 `R1>`인 상태에서 다음 명령을 한 줄씩 입력한다.

```text
enable
configure terminal
interface gi0/0
ip address 198.168.0.1 255.255.255.0
no shutdown
exit
interface gi0/1
ip address 198.168.1.1 255.255.255.252
no shutdown
exit
ip route 198.168.2.0 255.255.255.252 198.168.1.2
end
show ip interface brief
show ip route
```

**한 줄씩 읽기 — 위 코드 블록 순서대로 입력한다.**

| 순서 | 실제 입력할 명령 | 뜻과 입력 이유 |
|---|---|---|
| 1 | `enable` | IOS R1>에서 관리자 모드 R1#로 들어간다. |
| 2 | `configure terminal` | IOS 관리자 모드에서 전체 설정 모드로 들어간다. VyOS configure와 문법이 다르다. |
| 3 | `interface gi0/0` | gi0/0 포트를 선택한다. 뒤의 IP/켜짐 명령은 이 포트에 적용된다. |
| 4 | `ip address 198.168.0.1 255.255.255.0` | 선택한 물리 포트에 IP 198.168.0.1와 마스크 255.255.255.0를 준다. |
| 5 | `no shutdown` | 선택한 실제 포트를 켠다. IP만 넣고 포트가 꺼져 있으면 통신하지 못한다. |
| 6 | `exit` | 선택한 포트의 설정을 끝내고 IOS 전체 설정 모드로 한 단계 돌아간다. |
| 7 | `interface gi0/1` | gi0/1 포트를 선택한다. 뒤의 IP/켜짐 명령은 이 포트에 적용된다. |
| 8 | `ip address 198.168.1.1 255.255.255.252` | 선택한 물리 포트에 IP 198.168.1.1와 마스크 255.255.255.252를 준다. |
| 9 | `no shutdown` | 선택한 실제 포트를 켠다. IP만 넣고 포트가 꺼져 있으면 통신하지 못한다. |
| 10 | `exit` | 선택한 포트의 설정을 끝내고 IOS 전체 설정 모드로 한 단계 돌아간다. |
| 11 | `ip route 198.168.2.0 255.255.255.252 198.168.1.2` | 목적지 대역 198.168.2.0 / 마스크 255.255.255.252로 가려면 다음 Router 198.168.1.2로 보내라고 알려준다. |
| 12 | `end` | IOS의 설정 단계를 한 번에 끝내고 관리자 모드로 돌아간다. IOS 명령은 즉시 반영되어 commit이 없다. |
| 13 | `show ip interface brief` | 물리 포트마다 IP와 켜짐 상태를 확인한다. |
| 14 | `show ip route` | 활성 라우팅 표에서 직접 연결 경로와 정적 경로를 확인한다. |


`no shutdown`은 포트를 켠다. 정적 경로는 **회사 VPN 서버가 있는 198.168.2.0/30으로 가려면 R2(198.168.1.2)로 보내라**는 뜻이다. 두 포트가 up이고 경로 표에 정적 경로가 있어야 한다.

### 4-3. R2: IOS 터미널

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
ip route 0.0.0.0 0.0.0.0 198.168.1.1
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
| 11 | `ip route 0.0.0.0 0.0.0.0 198.168.1.1` | 목적지 대역 0.0.0.0 / 마스크 0.0.0.0로 가려면 다음 Router 198.168.1.1로 보내라고 알려준다. |
| 12 | `end` | IOS의 설정 단계를 한 번에 끝내고 관리자 모드로 돌아간다. IOS 명령은 즉시 반영되어 commit이 없다. |
| 13 | `show ip interface brief` | 물리 포트마다 IP와 켜짐 상태를 확인한다. |
| 14 | `show ip route` | 활성 라우팅 표에서 직접 연결 경로와 정적 경로를 확인한다. |


R2는 R1 쪽과 R3 쪽 두 네트워크를 직접 연결한다. 서버의 IP `198.168.2.2`로 가는 패킷은 직접 연결 경로로 R3에 전달한다. 외부 PC로 돌아가는 응답은 기본 경로를 따라 R1(`198.168.1.1`)로 보낸다.

### 4-4. R3: IOS 터미널

```text
enable
configure terminal
interface gi0/0
ip address 198.168.2.2 255.255.255.252
no shutdown
exit
interface gi0/1
ip address 198.168.3.1 255.255.255.0
no shutdown
exit
ip route 0.0.0.0 0.0.0.0 198.168.2.1
end
show ip interface brief
show ip route
```

**한 줄씩 읽기 — 위 코드 블록 순서대로 입력한다.**

| 순서 | 실제 입력할 명령 | 뜻과 입력 이유 |
|---|---|---|
| 1 | `enable` | IOS R3>에서 관리자 모드 R3#로 들어간다. |
| 2 | `configure terminal` | IOS 관리자 모드에서 전체 설정 모드로 들어간다. VyOS configure와 문법이 다르다. |
| 3 | `interface gi0/0` | gi0/0 포트를 선택한다. 뒤의 IP/켜짐 명령은 이 포트에 적용된다. |
| 4 | `ip address 198.168.2.2 255.255.255.252` | 선택한 물리 포트에 IP 198.168.2.2와 마스크 255.255.255.252를 준다. |
| 5 | `no shutdown` | 선택한 실제 포트를 켠다. IP만 넣고 포트가 꺼져 있으면 통신하지 못한다. |
| 6 | `exit` | 선택한 포트의 설정을 끝내고 IOS 전체 설정 모드로 한 단계 돌아간다. |
| 7 | `interface gi0/1` | gi0/1 포트를 선택한다. 뒤의 IP/켜짐 명령은 이 포트에 적용된다. |
| 8 | `ip address 198.168.3.1 255.255.255.0` | 선택한 물리 포트에 IP 198.168.3.1와 마스크 255.255.255.0를 준다. |
| 9 | `no shutdown` | 선택한 실제 포트를 켠다. IP만 넣고 포트가 꺼져 있으면 통신하지 못한다. |
| 10 | `exit` | 선택한 포트의 설정을 끝내고 IOS 전체 설정 모드로 한 단계 돌아간다. |
| 11 | `ip route 0.0.0.0 0.0.0.0 198.168.2.1` | 목적지 대역 0.0.0.0 / 마스크 0.0.0.0로 가려면 다음 Router 198.168.2.1로 보내라고 알려준다. |
| 12 | `end` | IOS의 설정 단계를 한 번에 끝내고 관리자 모드로 돌아간다. IOS 명령은 즉시 반영되어 commit이 없다. |
| 13 | `show ip interface brief` | 물리 포트마다 IP와 켜짐 상태를 확인한다. |
| 14 | `show ip route` | 활성 라우팅 표에서 직접 연결 경로와 정적 경로를 확인한다. |


기본 경로는 **직접 연결하지 않은 목적지로 가는 응답을 R2(198.168.2.1)로 보내라**는 뜻이다. Gi0/0과 Gi0/1이 up이어야 한다.

### 4-5. 가까운 게이트웨이부터 확인

PC_A 터미널:

```text
ipconfig
ping 198.168.0.1
```

PC_B 터미널:

```text
ipconfig
ping 198.168.3.1
```

각 PC의 IP·게이트웨이가 표와 같고, 각자의 게이트웨이에서 Reply가 오면 된다. 이 두 ping은 R2를 통과하지 않는다. 실패하면 VPN 설정으로 넘어가기 전에 케이블 포트·IP·마스크·포트 켜짐을 먼저 확인한다.

PC_A에서 VPN 서버의 물리 IP까지도 확인한다.

```text
ping 198.168.2.2
```

Reply가 오면 PC_A → R1 → R2 → R3의 경로와 응답 경로가 연결된 것이다. 이 ping은 일반 IP 통신이며 VPN 접속 성공을 뜻하지는 않는다.

## 5. 물리 구성을 내보내기

상단 토폴로지 이름을 `ssl-vpn-start`로 바꾼 뒤 **⤓ 내보내기**를 누른다. `ssl-vpn-start.ping9.json` 파일을 받는다. 다운로드한 파일을 코드 편집기로 연다. 이 파일은 다음 구조다.

```text
파일
 ├─ kind: topology-export
 ├─ name: ssl-vpn-start
 └─ document
     ├─ schemaVersion
     ├─ devices ← PC_A와 R3의 config를 아래에서 편집
     └─ links
```

이 파일은 TypeScript 소스가 아닌 **실습 설정 JSON**이다. 장비의 `id`, `kind`, `name`, `position`과 케이블 `links`는 그대로 둔다. 아래에서 지정한 두 장비의 **config 객체만 교체**한다. 파일 최상위에 `sslVpn`을 붙이지 않는다.

## 6. PC_A에 OFFICE 접속 설정 만들기

파일에서 `"name": "PC_A"`를 찾는다. 같은 장비 객체에 있는 `"config": { ... }`의 **중괄호를 포함한 값 전체**를 다음 JSON으로 교체한다. 아래는 config의 값 전체이며, `"config":`를 중복해서 넣지 않는다.

```json
{
  "os": "windows",
  "adminUp": true,
  "ip": "198.168.0.2",
  "mask": "255.255.255.0",
  "gateway": "198.168.0.1",
  "sslVpn": {
    "enabled": true,
    "name": "OFFICE",
    "serverIp": "198.168.2.2",
    "serverPort": 443,
    "expectedServerName": "vpn.office.test",
    "trustCaId": "LAB_CA",
    "username": "student",
    "authId": "LAB_USER"
  }
}
```

**여기서 OFFICE를 처음 만든다.** `vpn connect OFFICE`는 이 `name`이 OFFICE인 설정을 읽어 서버 주소와 사용자 정보를 가져온다. OFFICE라는 서버를 자동 검색하는 기능이 아니다.

| 필드 | 뜻 |
|---|---|
| `enabled` | 이 접속 설정을 사용할지 선택 |
| `name` | 접속할 때 부를 설정 이름: OFFICE |
| `serverIp`, `serverPort` | 접속할 서버의 물리 IP와 TCP 포트 |
| `expectedServerName` | 서버가 알려주는 이름과 비교할 값 |
| `trustCaId` | 신뢰하는 교육용 CA 식별자 |
| `username`, `authId` | 서버의 사용자 목록과 비교할 교육용 사용자 정보 |

## 7. R3를 VPN 서버로 설정

같은 파일에서 `"name": "R3"`을 찾는다. 그 장비의 config 값을 아래 전체 JSON으로 교체한다. 앞서 직접 만든 물리 IP·기본 경로를 유지하면서 서버 설정을 추가한 내용이다. R1나 R2의 config를 바꾸지 않도록 이름을 확인한다.

```json
{
  "cliStyle": "ios",
  "interfaces": {
    "GigabitEthernet0/0": {
      "adminUp": true,
      "ip": "198.168.2.2",
      "mask": "255.255.255.252"
    },
    "GigabitEthernet0/1": {
      "adminUp": true,
      "ip": "198.168.3.1",
      "mask": "255.255.255.0"
    }
  },
  "staticRoutes": [
    {
      "network": "0.0.0.0",
      "mask": "0.0.0.0",
      "nextHop": "198.168.2.1"
    }
  ],
  "sslVpn": {
    "enabled": true,
    "listenAddress": "198.168.2.2",
    "listenPort": 443,
    "serverName": "vpn.office.test",
    "caId": "LAB_CA",
    "certificateExpiresAtSeconds": 3600,
    "poolNetwork": "198.168.4.0",
    "poolMask": "255.255.255.248",
    "tunnelIp": "198.168.4.1",
    "allowedNetworks": [
      { "network": "198.168.3.0", "mask": "255.255.255.0" }
    ],
    "users": [
      { "name": "student", "authId": "LAB_USER" }
    ],
    "lifetimeSeconds": 600,
    "maxClients": 4
  }
}
```

| 서버 필드 | 뜻 |
|---|---|
| `enabled` | VPN 서버 사용 여부 |
| `listenAddress`, `listenPort` | 접속 요청을 받을 자신의 물리 IP·포트 |
| `serverName`, `caId` | PC가 기대하는 서버 이름·CA 식별자와 맞아야 하는 값 |
| `certificateExpiresAtSeconds` | 커널 초기화 이후 3600 가상 초에 만료되는 교육용 신뢰 정보 |
| `poolNetwork`, `poolMask` | 클라이언트에게 나눠 줄 가상 IP 대역: 198.168.4.0/29 |
| `tunnelIp` | 그 대역에서 서버용으로 예약하는 주소: 198.168.4.1 |
| `allowedNetworks` | 허용할 내부 대역을 저장하는 설정; 현재 내부 패킷 전달에는 아직 적용되지 않음 |
| `users` | 접속을 허용할 교육용 사용자 목록 |
| `lifetimeSeconds` | 세션 수명: 600 가상 초 |
| `maxClients` | 이 서버에 동시에 연결할 수 있는 PC 수: 4 |

가상 IP 대역은 물리 네트워크와 겹치면 안 된다. 첫 PC는 서버 예약 주소 .1 다음의 **198.168.4.2**를 받는다. 실제 인증서 파일이나 비밀번호는 필요하지 않으며 `LAB_CA`, `LAB_USER`는 공개 실습용 값이다.

JSON은 큰따옴표와 쉼표 위치가 정확해야 한다. 주석이나 마지막 항목 뒤 쉼표를 넣지 않는다. 편집한 파일을 `ssl-vpn-ready.ping9.json`으로 따로 저장하면 물리 구성 원본도 보존할 수 있다.

## 8. 가져와서 접속·상태·해제 확인

웹 상단의 **⤒ 가져오기**로 `ssl-vpn-ready.ping9.json`을 선택한다. 현재 토폴로지 교체 안내를 확인하고 가져온다. 성공하면 장비와 케이블은 그대로이며, PC_A와 R3에 VPN 설정이 들어간다. 기존 터미널 기록·ARP·실행 세션은 초기화된다.

PC_A 터미널에서 한 줄씩 입력한다.

```text
vpn status
vpn connect OFFICE
vpn status
vpn disconnect
vpn status
vpn connect OFFICE
```

**한 줄씩 읽기 — 위 코드 블록 순서대로 입력한다.**

| 순서 | 실제 입력할 명령 | 뜻과 입력 이유 |
|---|---|---|
| 1 | `vpn status` | PC의 교육용 SSL 세션 상태를 확인한다. 접속 요청을 새로 보내지는 않는다. |
| 2 | `vpn connect OFFICE` | PC에 저장한 이름 OFFICE의 설정을 읽어 서버에 접속하고 가상 IP를 받는다. |
| 3 | `vpn status` | PC의 교육용 SSL 세션 상태를 확인한다. 접속 요청을 새로 보내지는 않는다. |
| 4 | `vpn disconnect` | 현재 SSL 접속을 해제하고 정상 경로에서는 할당 IP를 서버에 반환한다. |
| 5 | `vpn status` | PC의 교육용 SSL 세션 상태를 확인한다. 접속 요청을 새로 보내지는 않는다. |
| 6 | `vpn connect OFFICE` | PC에 저장한 이름 OFFICE의 설정을 읽어 서버에 접속하고 가상 IP를 받는다. |


| 순서 | 기대 결과 |
|---|---|
| 첫 status | `State: disconnected` |
| connect OFFICE | `State: connected`, `Virtual IP: 198.168.4.2` |
| 두 번째 status | 같은 가상 IP와 세션 ID 유지 |
| disconnect | `State: disconnected`, `virtual IP released` |
| 해제 후 status | disconnected 유지 |
| 재접속 | 다시 connected, 사용 가능한 가상 IP 할당 |

세션 ID는 접속 시도를 구분한다. 접속을 여러 번 시도했다면 꼭 `ssl-1`일 필요는 없다. 가상 IP는 PC_A의 물리 IP 198.168.0.2를 바꾸지 않는다.

출력의 `NO TLS/encryption`은 실제 암호화가 없다는 뜻이고 `data tunnel not implemented`는 내부 패킷 전달이 다음 단계라는 뜻이다. **현재 `ping 198.168.3.2`는 접속 후에도 실패한다.** 이번 실습에서는 그 결과를 VPN 접속 실패로 판단하지 않는다. `Reply from 198.168.0.1: Destination net unreachable.`처럼 중간 라우터가 보낸 오류 응답은 내부 PC의 정상 ping 응답이 아니다.

펭귄과 이벤트 경로를 보려면 상단을 시뮬레이션 모드로 전환한 뒤 접속을 다시 실행한다. 메시지는 PC_A → R1 → R2 → R3 경로로 왕복한다.

## 9. 중간 라우터 포트 끄기 → 실패 → 복구

1. PC_A에서 `vpn disconnect`로 먼저 해제한다.
2. R2 터미널에서 R3 방향 포트를 끈다. 가져오기 후에는 `R2>`로 시작하므로 `enable`로 관리자 모드에 들어간다. 이미 `R2#`이면 첫 줄은 생략한다.

```text
enable
configure terminal
interface gi0/1
shutdown
end
show ip interface brief
```

**한 줄씩 읽기 — 위 코드 블록 순서대로 입력한다.**

| 순서 | 실제 입력할 명령 | 뜻과 입력 이유 |
|---|---|---|
| 1 | `enable` | IOS R2>에서 관리자 모드 R2#로 들어간다. |
| 2 | `configure terminal` | IOS 관리자 모드에서 전체 설정 모드로 들어간다. VyOS configure와 문법이 다르다. |
| 3 | `interface gi0/1` | gi0/1 포트를 선택한다. 뒤의 IP/켜짐 명령은 이 포트에 적용된다. |
| 4 | `shutdown` | 선택한 포트를 끈다. 이 포트를 지나던 통신이 중단된다. |
| 5 | `end` | IOS의 설정 단계를 한 번에 끝내고 관리자 모드로 돌아간다. IOS 명령은 즉시 반영되어 commit이 없다. |
| 6 | `show ip interface brief` | 물리 포트마다 IP와 켜짐 상태를 확인한다. |


3. PC_A에서 `vpn connect OFFICE`를 실행한다. `State: failed`와 `Connection timed out`이 예상 결과다. R2의 출력 포트가 꺼져 서버까지 메시지가 도착하지 못한다.
4. R2에서 포트를 다시 켠다.

```text
configure terminal
interface gi0/1
no shutdown
end
show ip interface brief
```

**한 줄씩 읽기 — 위 코드 블록 순서대로 입력한다.**

| 순서 | 실제 입력할 명령 | 뜻과 입력 이유 |
|---|---|---|
| 1 | `configure terminal` | IOS 관리자 모드에서 전체 설정 모드로 들어간다. VyOS configure와 문법이 다르다. |
| 2 | `interface gi0/1` | gi0/1 포트를 선택한다. 뒤의 IP/켜짐 명령은 이 포트에 적용된다. |
| 3 | `no shutdown` | 선택한 실제 포트를 켠다. IP만 넣고 포트가 꺼져 있으면 통신하지 못한다. |
| 4 | `end` | IOS의 설정 단계를 한 번에 끝내고 관리자 모드로 돌아간다. IOS 명령은 즉시 반영되어 commit이 없다. |
| 5 | `show ip interface brief` | 물리 포트마다 IP와 켜짐 상태를 확인한다. |


5. PC_A에서 `vpn connect OFFICE`를 다시 실행한다. connected와 가상 IP `198.168.4.2`가 다시 표시되어야 한다.

이미 연결된 상태에서 connect를 다시 치면 기존 세션을 보여준다. 먼저 해제한 뒤 실패·복구를 실습한다.

## 10. 실패했을 때 확인할 것

| 증상 | 확인 |
|---|---|
| `vpn connect OFFICE`가 프로필 안내/값 오류를 출력 | PC_A의 `config.sslVpn.name`이 OFFICE인지, 편집한 파일을 가져왔는지 |
| `Server name mismatch` | PC의 expectedServerName과 서버 serverName 일치 여부 |
| `Untrusted CA identifier` | PC의 trustCaId와 서버 caId 일치 여부 |
| `Authentication failed` | PC의 username/authId와 서버 users 항목 일치 여부 |
| `Connection timed out` | 케이블·포트 up·물리 IP·R1 정적 경로·R2/R3 반환 기본 경로·서버 IP/포트 |
| 가져오기에서 JSON 오류 | 따옴표·쉼표·중괄호, 최상위 kind/name/document 구조 |
| VPN 설정 검증 오류 | 서버 listenAddress가 자신의 IP인지, 풀과 물리 대역이 겹치지 않는지 |
| 새로 열면 접속이 풀림 | 세션은 실행 상태라 저장되지 않음. 내보낸 JSON을 가져온 뒤 다시 connect |

실습 후 **내보내기**로 저장하면 직접 만든 OFFICE와 서버 설정도 보관된다. 로컬 기본 주소를 새로 열면 빈 캔버스에서 시작하며, 저장한 파일을 가져와야 이전 구성을 복원한다.

[구현 현황과 자동 테스트](ssl-vpn-implementation-status.md) · [전체 SSL VPN 계획](../proposals/ssl-vpn-plan.md)

다른 방식도 연습하려면 [GRE 실습](gre-three-routers-lab.md) 또는 [IPsec 실습](ipsec-three-routers-lab.md)을 참고한다.
