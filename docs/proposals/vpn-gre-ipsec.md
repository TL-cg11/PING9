# GRE·IPsec 구현 계획

- 작성 2026-11-11, 사용자 범위 변경 반영 2026-11-12.
- 기준 코드: main 5d887b0. 작업 브랜치: `feat/T15.1.1-vpn-gre-ipsec`.
- **이번 범위: GRE, IPsec 단독. GRE+IPsec은 제외. SSL VPN은 시간이 남으면 별도 계획한다.**
- 기존 [E15 로드맵](../project-plan/04-development-plan.md#410-3차-범위)은 팀 합의 전까지 고치지 않는다.

## 구현 순서

| 순서 | 작업 | 검증 |
|---|---|---|
| 1 | GRE 논리 Tunnel, 저장·검증·Command, 터널망 정적 경로, CLI, 캡슐화/역캡슐화 | PC 양방향·Router 출발 ping, 실제 중간망 전달, 장애와 복원 |
| 2 | IPsec 구현 수준 확정, peer·정책·보호 subnet·SA 계약 | GRE 의존성 없이 양 끝 구성이 대응하는지 검사 |
| 3 | IPsec 단독 ESP tunnel mode 송수신, 보호 실패 시 폐기 | 상대·키·SA 만료·재전송 오류와 양방향 ping |
| 4 | IPsec CLI/조회·상태·재생·고정 예시·로컬 안내 | 저장/복원, 기존 기능 회귀, 브라우저 검증 |
| 추후 | SSL VPN | 남은 일정과 원격 사용자 접속 범위를 따로 결정 |

단계마다 작업 기록과 검증을 남긴다. GRE+IPsec과 SSL VPN 코드는 이번 변경에 넣지 않는다.
2026-11-12 사용자 선택: **교육용 시뮬레이션**. 실제 암호화와 IKE는 구현하지 않는다.
수동 SA, 서로 반대인 inbound/outbound SPI, 공개 key-id, selector, sequence, 64개 anti-replay 창, 가상 lifetime을 모델링한다.
화면·CLI에 실제 암호화/IKE/암호학적 인증이 없음이 드러난다. 실제 VPN 장비와 호환되는 구현은 아니다.

## GRE 첫 구현의 계약

- Router마다 `Tunnel0`~`Tunnel3`의 논리 인터페이스. 기존 물리 포트와 케이블 선택 목록은 유지한다.
- `interface tunnel 0`, `tunnel mode gre ip`, `tunnel source gi0/1`, `tunnel destination <바깥 IP>`.
- 터널 IP와 `no shutdown`, 상대 터널 IP를 다음 홉으로 지정한 `ip route`.
- GRE version 0 / IPv4 protocol 47 / payload protocol type 0x0800을 모델링한다.
- IPv4 ICMP 요청·응답·오류를 한 단계 캡슐화한다. checksum/key/sequence 확장·중첩 GRE·IPv6·터널 내 RIP는 첫 범위 밖이다.
- 안쪽/바깥쪽 TTL을 별도로 처리한다. 상대까지의 바깥 경로는 기존 물리 ARP·MAC·케이블로 전달한다.
- 같은 Tunnel을 다시 가리키는 상대 경로는 송신 시 차단한다. Tunnel 자체에는 ARP하지 않는다.
- GRE의 `up`은 로컬 source·바깥 경로 상태다. 상대 확인 handshake/keepalive 성공을 뜻하지 않는다.
- 패킷 길이가 고정인 현재 ping 모델에 맞춘다. MTU·가변 payload·조각화·바깥 ICMP 오류를 안쪽 송신자에게 번역하는 기능은 아직 없다.
- 저장 설정은 Document에, ARP 등의 동적 상태는 Runtime에 둔다. 옛 Document도 그대로 읽는다.

## 검증 구성

```text
PC_A — R1 — ISP — R2 — PC_B
```

| 구간 | 주소 |
|---|---|
| LAN A | PC_A 192.168.1.10/24, R1 Gi0/0 192.168.1.1 |
| R1—ISP | R1 Gi0/1 10.0.13.1/30, ISP Gi0/0 10.0.13.2 |
| ISP—R2 | ISP Gi0/1 10.0.23.1/30, R2 Gi0/0 10.0.23.2 |
| LAN B | R2 Gi0/1 192.168.2.1/24, PC_B 192.168.2.10 |
| GRE 논리망 | R1 Tunnel0 172.16.12.1/30, R2 Tunnel0 172.16.12.2 |

ISP에는 사설 LAN 경로를 넣지 않는다. GRE 없이도 우연히 통과하는 테스트를 방지한다.
R1/R2는 상대 바깥 주소에 대한 물리 정적 경로를 갖는다.
IPsec 단독은 `Tunnel0`나 GRE 설정 없이 같은 구성에서 검증한다.

## 완료 조건

- 설정 검증·CLI·running-config 왕복·JSON 로드·장애/복구 자동 테스트.
- 중간 Router에서 바깥 주소를 보고 전달하고 안쪽 IP/TTL을 유지하는지 확인.
- PC/Switch/Static/RIP/traceroute/루프 ping 회귀 검사.
- 원본 Trace 보존, 화면 재생은 기존 시간 상한 유지.
- `pnpm check`, `pnpm check:secrets`, 브라우저 확인 및 PR/팀원 리뷰.

GRE 구현의 결과·제한은 [T15.1.1 기록](../task-logs/T15.1.1-vpn-gre-ipsec.md)에 남긴다.
규격 참고: [RFC 2784](https://www.rfc-editor.org/rfc/rfc2784.html), [RFC 4301](https://www.rfc-editor.org/rfc/rfc4301.html).

## IPsec 첫 구현의 계약

- GRE 설정 없이 물리 인터페이스에 연결된 보호 subnet 정책과 ESP tunnel 모델을 사용한다.
- `crypto ipsec profile <이름>`으로 PING9의 `config-ipsec` 모드에 진입한다. 실제 IOS 전체 문법이 아니다.
- `source-interface`, `peer`, `local-subnet`, `remote-subnet`, 공개 `key-id`, 수동 `spi inbound/outbound`, `lifetime`, `no shutdown`.
- 송신 selector가 일치하면 미완성/꺼짐/만료/출구 불일치 때 폐기한다. 평문 전송으로 우회하지 않는다.
- 수신은 peer·바깥 주소·물리 포트·inbound SPI·키 식별자·안쪽 selector·sequence를 검사한다. 보호 필수 트래픽의 평문 수신도 폐기한다.
- 실제 암호문/ICV가 없다. Trace의 `esp.payload`와 `esp.simulation.keyId`는 관찰을 위한 평문 모델 자료다. 실제 기밀성·변조 방지를 제공하지 않는다.
- SA는 첫 사용 때 가상 시각을 기록하며 자동 IKE/rekey가 없다. `active`는 로컬 사용 상태이며 상대와의 협상 완료를 뜻하지 않는다.
- 정책을 바꾸면 해당 SA만 초기화한다. 배치·일반 경로·링크/물리 포트 장애와 복구에서는 sequence를 유지한다.
- 문서 load/페이지 새로고침은 전체 실습 세션을 새로 시작한다. 실제 수동 키의 재부팅 간 sequence 보존은 구현하지 않는다.
- 고정 IPv4 ICMP 한 단 캡슐화. GRE+IPsec·NAT-T·실제 IKE·SSL VPN·가변 payload/MTU·조각화·바깥 ICMP 번역은 지원 범위 밖이다.
- [로컬 실습 안내](../guides/vpn-local-lab.md)에서 개발 서버의 GRE/IPsec 고정 예시를 각각 열 수 있다.
