# 로컬에서 라우터 통신을 직접 확인하기

## 1. 이번에 달라진 것

이전에는 목적지에 대해 “어느 포트와 다음 홉을 사용할지”만 계산했다. 이제 그 결과로 패킷을 케이블에 내보내고, 목적지의 응답이 돌아오는 것까지 실행한다.

1. PC는 목적지가 다른 네트워크이면 기본 게이트웨이에게 패킷을 보낸다.
2. Router는 라우팅 테이블에서 경로를 고른다.
3. 다음 홉의 MAC을 모르면 ARP로 물어보고 패킷을 기다리게 한다.
4. MAC을 알게 되면 TTL을 1 줄이고 출발지/목적지 MAC을 다음 케이블 구간에 맞춰 바꾼다. 최종 출발지·목적지 IP는 유지한다.
5. 목적지 PC가 echo 응답을 보내고, 돌아오는 경로도 같은 과정을 거친다.

라우터 자기 IP로 온 ping에는 라우터가 응답한다. Router 콘솔의 `ping <IP>`와 `show arp`도 사용할 수 있다. 경로 없음과 TTL 소진 때는 출발지까지 ICMP 오류를 보낸다. 귀환 경로 자체가 없으면 오류도 돌아올 수 없다.

## 2. 실행 준비

프로젝트 폴더의 터미널에서 실행한다.

```bash
pnpm dev
```

터미널에 표시된 주소를 **새 브라우저 탭**에서 연다. 기본은 `http://localhost:5173`이며 이미 사용 중이면 다른 포트가 표시된다. 기존 탭은 남겨 두고 새 탭에서 실습하면 기존 배치를 보존할 수 있다. 현재 실습은 메모리에 있어서 새로고침하면 예시 배치로 돌아간다.

기본으로 보이는 Switch 예시는 그대로 두고, 빈 공간에 **PC 2대와 Router 2대**를 새로 끌어 놓는다. 이번 실습 케이블은 Switch를 통과하지 않는다. 현재 Switch의 실행 모델은 별도 작업이다.

이 문서의 PC-A, PC-B, R1, R2는 **역할 이름**이다. 실제 새 장비가 PC5, PC6, R3, R4처럼 표시돼도 괜찮다. 왼쪽/오른쪽 역할에 맞는 장비에 입력하면 된다. 장비 이름을 바꾸라는 의미가 아니다.

## 3. 케이블 연결

```text
PC-A ── Gi0/0 [R1] Gi0/1 ── Gi0/0 [R2] Gi0/1 ── PC-B
```

| 왼쪽 끝 | 오른쪽 끝 |
|---|---|
| PC-A Ethernet0 | R1 GigabitEthernet0/0 |
| R1 GigabitEthernet0/1 | R2 GigabitEthernet0/0 |
| R2 GigabitEthernet0/1 | PC-B Ethernet0 |

케이블 버튼 → 첫 장비 → 빈 포트 → 두 번째 장비 → 빈 포트 순으로 연결한다. 연결을 마쳤으면 Esc로 케이블 도구를 해제한다.

`Gi0/1`은 `GigabitEthernet0/1`의 줄임말이다. 케이블 연결 창에는 전체 이름, CLI에는 줄임말을 사용해도 된다.

## 4. PC 주소 설정

PC를 한 번 클릭하고 오른쪽 패널에서 **Windows**를 선택한다. 아래 값을 입력한 뒤 각각 **적용**을 누른다.

| PC | IP 주소 | 서브넷 마스크 | 기본 게이트웨이 |
|---|---|---|---|
| PC-A | 192.168.1.10 | 255.255.255.0 | 192.168.1.1 |
| PC-B | 192.168.2.10 | 255.255.255.0 | 192.168.2.1 |

기본 게이트웨이는 “다른 네트워크로 보낼 때 처음 맡길 라우터 주소”다. 비워 두면 다른 네트워크로 ping을 보낼 수 없다.

## 5. 왼쪽 Router R1 설정

라우터 더블클릭 또는 선택 후 **터미널 열기**. 아래를 **한 줄씩 입력하고 Enter**를 누른다. `R1#` 같은 프롬프트 글자는 입력하지 않는다.

```text
enable
configure terminal
interface gi0/0
ip address 192.168.1.1 255.255.255.0
no shutdown
exit
interface gi0/1
ip address 10.0.12.1 255.255.255.252
no shutdown
exit
ip route 192.168.2.0 255.255.255.0 10.0.12.2
end
```

Gi0/0은 PC-A 쪽, Gi0/1은 R2 쪽이다. 마지막 경로는 “192.168.2.0/24로 갈 때 R2의 10.0.12.2에게 보내라”는 뜻이다. **다음 홉 주소까지 입력**해야 명령이 끝난다.

## 6. 오른쪽 Router R2 설정

```text
enable
configure terminal
interface gi0/0
ip address 10.0.12.2 255.255.255.252
no shutdown
exit
interface gi0/1
ip address 192.168.2.1 255.255.255.0
no shutdown
exit
ip route 192.168.1.0 255.255.255.0 10.0.12.1
end
```

R2의 정적 경로는 **PC-A 쪽으로 응답이 돌아오는 길**이다. 요청이 도착해도 이 길이 없으면 PC-A는 응답을 받지 못한다.

## 7. 상태와 ping 확인

각 Router에서:

```text
show ip interface brief
show ip route
```

사용한 Gi0/0, Gi0/1은 `up`이어야 한다. `admin-down`이면 해당 포트에서 `no shutdown`, `no-link`이면 케이블, `peer-down`이면 반대편 포트 상태를 확인한다. 사용하지 않은 포트의 `admin-down`은 정상이다.

R1에서 목적지 경로 확인:

```text
show ip route 192.168.2.10
```

다음 홉 `10.0.12.2`, 출력 포트 `GigabitEthernet0/1`이 나와야 한다.

**PC-A의 터미널**에서:

```text
ping 192.168.2.10
```

정상 출력 예:

```text
Reply from 192.168.2.10: bytes=32 time=12ms TTL=126
...
Packets: Sent = 4, Received = 4, Lost = 0 (0% loss)
```

가상 시간은 ARP 캐시 여부에 따라 달라진다. `bytes=32`, `TTL=126`인 응답 네 줄이 성공 기준이다. Windows PC 응답 TTL 128이 라우터 두 대를 지나 126이 된 것이다.

반대 방향은 **PC-B의 터미널**에서:

```text
ping 192.168.1.10
```

PC에서 ARP 확인은 `arp -a`, Router에서는 `show arp`다. Router 자체에서 `ping 192.168.2.10`도 가능하다. Linux PC를 선택했다면 `ping -c 1 <IP>`로 한 회만 보낼 수 있고, Linux PC가 만든 응답의 초기 TTL은 64다.

상단의 버튼 대신 **각 장비 터미널의 ping 명령**으로 실습한다. 상세 패킷 추적 화면은 후속 UI 작업이고, 현재 자동 검사에서 TTL·MAC·경유 포트·추적의 유효성을 확인한다.

## 8. 일부러 실패시켜 보기와 복구

### 가는 경로를 지우기

R1에서:

```text
configure terminal
no ip route 192.168.2.0 255.255.255.0 10.0.12.2
end
```

PC-A가 PC-B에 ping하면 `Reply from 192.168.1.1: Destination net unreachable.`이 나온다. R1이 “목적지로 갈 경로가 없다”고 돌려준 오류다. **Reply라는 단어가 있어도 목적지의 echo 응답이 아니므로 성공이 아니다.** 기존 Windows 출력 규칙상 오류 수신도 Received에 포함되므로 통계 숫자만 보지 말고 `bytes=32` 응답 여부를 확인한다.

R1에서 복구:

```text
configure terminal
ip route 192.168.2.0 255.255.255.0 10.0.12.2
end
```

### 돌아오는 경로를 지우기

R2에서:

```text
configure terminal
no ip route 192.168.1.0 255.255.255.0 10.0.12.1
end
```

PC-A가 PC-B에 ping하면 `Request timed out.`이 나온다. PC-B의 응답이 PC-A까지 돌아오지 못했기 때문이다. R2에서 복구한다.

```text
configure terminal
ip route 192.168.1.0 255.255.255.0 10.0.12.1
end
```

### 포트를 끄기

R1에서:

```text
configure terminal
interface gi0/1
shutdown
end
show ip route
```

해당 직접 연결 경로와 그 포트를 사용하는 정적 경로가 활성 테이블에서 빠지고 ping이 실패한다. 설정은 `show running-config`에 남는다. R1에서 복구한다.

```text
configure terminal
interface gi0/1
no shutdown
end
```

### 순환 경로로 TTL 소진 확인

R1에 `ip route 8.8.8.0 255.255.255.0 10.0.12.2`, R2에 `ip route 8.8.8.0 255.255.255.0 10.0.12.1`을 config 모드에서 넣고 end로 나온다. PC-A에서 `ping 8.8.8.8`을 하면 두 라우터 사이를 반복하다 `TTL expired in transit.`이 나온다. 정적 경로를 추가한 라우터별로 `no ip route`에 같은 세 주소 값을 넣으면 제거할 수 있다.

## 9. Router 한 대만 빠르게 확인하기

새 구성에서 PC-A—R1 Gi0/0, R1 Gi0/1—PC-B로 연결한다. PC 주소·게이트웨이는 위 표 그대로 사용한다. R1의 Gi0/0은 192.168.1.1/24, Gi0/1은 192.168.2.1/24로 설정하고 둘 다 no shutdown한다. 이 구성은 두 LAN이 R1에 직접 연결되어 **정적 경로 없이** ping이 된다. Windows PC의 정상 응답 TTL은 127이다.

## 10. 자동 검사 직접 실행

```bash
pnpm --filter @ping9/engine exec vitest run src/devices/router src/cli/router/network-commands.test.ts
pnpm check
pnpm check:secrets
```

첫 명령은 라우터 기능 중심 검사, 두 번째는 lint·타입·전체 테스트·빌드, 세 번째는 저장소 비밀값 형태 검사다. 실제 Chrome에서도 한 Router를 거치는 ping 4/4, TTL=127, 손실 0%를 확인했다. 두 Router의 양방향 정적 경로 통신은 CLI 구성부터 시작하는 자동 통합 검사로 검증했다.


## 최신 메인 통합 후 Switch 경유 실습

2026-11-10 통합에서 Switch 모델을 Router Runtime과 함께 등록했다.
기존 PC·Router의 IP·게이트웨이는 유지하고, 직접 연결 케이블을 제거한 뒤 양쪽 LAN에 Switch를 한 대씩 넣는다.
각 Switch의 Fa0/1은 PC, Fa0/2는 Router LAN 포트에 연결한다. 두 포트는 access VLAN 1이고 켜져 있어야 한다.
PC 양방향 ping과 Router의 show arp, Switch의 show mac address-table로 확인한다.
Switch는 TTL을 감소시키지 않으므로 Router 1대 구성은 PC 응답 TTL 127, Router 2대 구성은 126이다.
최신 메인에서 가져온 peer-down 판정 때문에 반대편 포트가 꺼져 있으면 Router 경로도 비활성화된다.

자동 통합 검사:

```bash
pnpm --filter @ping9/engine exec vitest run src/devices/router/switched-router-lab.test.ts
```
