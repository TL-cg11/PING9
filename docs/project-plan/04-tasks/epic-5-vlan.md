# E5. VLAN으로 네트워크를 나눈다 — 작업 상세

- 상위 문서: [04-development-plan.md](../04-development-plan.md)
- 수용 기준: [epics.md](../../../_bmad-output/planning-artifacts/epics.md)의 Epic 5
- 합계: Story 3개, Task 5개, 약 6.5인일 (🟡 추정)
- 선행 Epic: E1 (Switch 모델), E3 (CLI 모드, 인터페이스 모드, `show running-config`)
- 우선순위: 일정이 밀리면 Story 5.3을 먼저, 그다음 Epic 전체를 줄입니다

Switch에 VLAN을 만들고 access·trunk 포트를 설정해 통신 범위를 나눈다.

표 읽는 법과 공통 완료 조건은 [개발 계획 4.3절](../04-development-plan.md#43-분해-구조-읽는-법)에 있습니다.

## F5.1 VLAN

### Story 5.1 VLAN을 만들고 지운다

| ID | 작업과 세부 작업 | 영역 | 선행 | 완료 기준 | 테스트 방법 | 난이도 | 추정 |
|---|---|---|---|---|---|---|---|
| T5.1.1 | **VLAN 구성**<br>· `vlan/create`, `vlan/rename`, `vlan/remove` Command<br>· 검증: 번호 1~4094, VLAN 1 삭제 불가<br>· `vlan <번호>`로 VLAN 설정 모드 진입, `name <이름>`, `no vlan <번호>`<br>· 직렬화<br>· `show vlan brief`: 번호, 이름, 소속 포트<br>· Switch당 VLAN 64개 한도, VLAN 이름의 문자 제한 (SEC-15, SEC-11) | 엔진 | T3.4.1 | VLAN을 만들고 지울 수 있고 `show vlan brief`에 나옴. VLAN 1은 지워지지 않음 (FR-31) | 단위 테스트: 번호 경계, VLAN 1. 왕복 테스트에 VLAN 추가 | 중 | 1.5 |

### Story 5.2 access 포트로 VLAN을 나눈다

| ID | 작업과 세부 작업 | 영역 | 선행 | 완료 기준 | 테스트 방법 | 난이도 | 추정 |
|---|---|---|---|---|---|---|---|
| T5.2.1 | **access 포트 처리**<br>· `switchport/set-mode`, `switchport/set-access-vlan` Command<br>· `switchport mode access`, `switchport access vlan <번호>` 명령어와 직렬화<br>· 들어온 프레임을 포트의 VLAN으로 분류<br>· MAC 주소 테이블을 VLAN별로 관리<br>· 전달과 flooding을 같은 VLAN의 포트로 제한<br>· 없는 VLAN을 지정하면 자동 생성하고 알림<br>· 포트의 VLAN이 지워지면 그 포트는 통신 불가 | 엔진 | T5.1.1, T1.7.3 | 같은 VLAN끼리만 통신됨. `show mac address-table`에 VLAN 번호가 나옴 (FR-32) | 통합 테스트: PC 4대, VLAN 2개. 단위 테스트: flooding 범위 | 중 | 1.5 |
| T5.2.2 | **폐기 사유와 문구**<br>· `VLAN_BLOCKED` 폐기 사유와 원인 지정<br>· VLAN 자동 생성 알림 문구<br>· 실패 사유 문구: Switch 이름, 두 VLAN 번호 | 엔진, 화면 | T5.2.1, T1.10.2 | 다른 VLAN으로의 ping 실패에 VLAN 번호가 들어간 사유가 나옴 (FR-47) | 단위 테스트: 사유 판정. 문구 테스트 | 하 | 0.5 |

### Story 5.3 trunk로 Switch 사이에 VLAN을 잇는다

| ID | 작업과 세부 작업 | 영역 | 선행 | 완료 기준 | 테스트 방법 | 난이도 | 추정 |
|---|---|---|---|---|---|---|---|
| T5.3.1 | **trunk 포트와 802.1Q 태그**<br>· 프레임에 VLAN 태그 필드 추가 (`FrameSnapshot` 포함)<br>· `switchport mode trunk` 명령어<br>· trunk로 내보낼 때 태그를 붙이고, 받을 때 태그의 VLAN으로 분류<br>· access 포트로 내보낼 때 태그 제거<br>· `switchport/set-allowed-vlans`와 `switchport trunk allowed vlan <목록>` (쉼표와 범위). Document에는 범위(시작, 끝)의 목록으로 저장, 최대 64개 (MAL-8)<br>· 허용 목록에 없는 VLAN은 내보내지 않음<br>· 태그 없는 프레임을 trunk에서 받으면 VLAN 1로 처리 | 엔진 | T5.2.1 | Switch 2대를 건너 같은 VLAN의 PC끼리 ping 성공. trunk 구간의 프레임에 태그가 있음 (FR-33) | 통합 테스트: Switch 2대, VLAN 2개. Trace의 프레임 내용 확인. 허용 목록 해석 단위 테스트 | 상 | 2.0 |
| T5.3.2 | **trunk 조회와 폐기 사유**<br>· `show interfaces trunk`: 포트, 허용 VLAN<br>· trunk 설정의 직렬화와 왕복<br>· `TRUNK_NOT_ALLOWED` 폐기 사유와 문구 | 엔진 | T5.3.1 | 허용 목록에서 뺀 VLAN의 ping 실패에 trunk 포트 이름이 들어간 사유가 나옴 (FR-33, FR-47) | 단위 테스트. 왕복 테스트에 trunk 추가 | 하 | 1.0 |

## Epic 5 완료 확인

- [ ] 한 Switch에서 VLAN이 다른 PC끼리 ping이 실패하고 사유가 표시된다.
- [ ] Switch 2대를 trunk로 연결해 같은 VLAN끼리 통신된다.
- [ ] VLAN과 trunk 구성의 `show running-config` 왕복 테스트가 통과한다.
- [ ] VLAN을 쓰지 않는 기존 토폴로지(E1, E4의 예시)가 그대로 동작한다.
