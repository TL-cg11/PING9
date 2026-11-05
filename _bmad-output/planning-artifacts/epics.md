---
status: final
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
inputDocuments:
  - 'docs/project-plan/02-requirements.md'
  - '_bmad-output/planning-artifacts/prds/prd-PacketTracer-WEB-2026-11-05/prd.md'
  - '_bmad-output/planning-artifacts/architecture/architecture-PacketTracer-WEB-2026-11-05/ARCHITECTURE-SPINE.md'
  - 'docs/project-plan/03-system-design.md'
---

# PacketTracer WEB - Epic Breakdown

## Overview

PacketTracer WEB(작업명)의 요구사항과 아키텍처 결정을 구현 가능한 Epic과 Story로 나눈 문서입니다. 요구사항의 원문은 `docs/project-plan/02-requirements.md`, 아키텍처 규칙은 `ARCHITECTURE-SPINE.md`에 있습니다. UX 설계 문서는 없습니다. 작업(Task) 단위의 분해, 추정, 일정은 `docs/project-plan/04-development-plan.md`에 있습니다.

## Requirements Inventory

### Functional Requirements

- FR-1: 사용자는 Google 계정으로 로그인할 수 있다.
- FR-2: 사용자는 로그아웃할 수 있고, 세션이 만료되면 다시 로그인해야 한다. 저장하지 못한 변경은 보관되어 이어서 저장된다.
- FR-3: 사용자는 자기 토폴로지의 목록을 볼 수 있다. 남의 토폴로지는 보이지도 열리지도 않는다.
- FR-4: 사용자는 토폴로지를 만들고, 이름을 바꾸고, 복제하고, 삭제할 수 있다.
- FR-5: 편집 내용은 자동으로 저장되고, 사용자는 직접 저장할 수도 있다.
- FR-6: 사용자는 저장된 토폴로지를 열어 이어서 편집할 수 있다.
- FR-7: 사용자는 토폴로지를 파일로 내보내고, 내보낸 파일을 가져올 수 있다.
- FR-8: 사용자는 준비된 예제 3종에서 시작할 수 있다.
- FR-9: 사용자는 장비 목록에서 장비를 캔버스에 끌어다 놓을 수 있다.
- FR-10: 사용자는 장비를 끌어 옮기고 이름을 바꿀 수 있다.
- FR-11: 사용자는 장비를 삭제할 수 있다. 연결된 링크도 함께 삭제된다.
- FR-12: 사용자는 두 장비의 포트를 골라 링크로 연결할 수 있다.
- FR-13: 사용자는 링크를 삭제할 수 있다.
- FR-14: 사용자는 캔버스를 확대·축소하고 이동할 수 있다.
- FR-15: PC는 포트 1개와 IP 구성을 가지며 ping을 보내고 응답한다.
- FR-16: Switch는 포트 8개를 가지며 프레임을 전달한다.
- FR-17: Router는 인터페이스 4개를 가지며 네트워크 사이에서 패킷을 전달한다. 인터페이스는 처음에 꺼져 있다.
- FR-18: 사용자는 Switch 포트와 Router 인터페이스를 켜고 끌 수 있다. 포트 상태는 네 가지로 구분된다.
- FR-19: 사용자는 장비의 콘솔을 열 수 있다. 여러 콘솔을 열어 두고 전환할 수 있다.
- FR-20: 사용자는 CLI 모드(사용자, 관리자, 전역 설정, 인터페이스 설정, VLAN 설정)를 오갈 수 있다.
- FR-21: 사용자는 명령어를 축약하고, Tab으로 완성하고, `?`로 도움말을 보고, 이전 명령어를 불러올 수 있다.
- FR-22: 사용자는 `no`를 붙여 설정을 되돌릴 수 있다.
- FR-23: 사용자는 `show` 명령어로 구성과 상태를 볼 수 있다. `show running-config` 출력을 다시 입력하면 같은 구성이 된다.
- FR-24: 사용자는 PC 콘솔에서 `ipconfig`, `ping`, `arp`를 쓸 수 있다.
- FR-25: 사용자는 PC의 IP 주소, 서브넷 마스크, 기본 게이트웨이를 설정 패널과 명령어 양쪽에서 설정할 수 있다.
- FR-26: 사용자는 Router 인터페이스에 IP 주소와 서브넷 마스크를 설정할 수 있다.
- FR-27: 잘못된 IP 입력은 거부되고 사유가 표시된다. 중복 IP는 경고한다.
- FR-28: Switch는 출발지 MAC 주소를 학습하고 목적지에 따라 프레임을 전달하거나 flooding한다. 쓰이지 않는 항목은 만료된다.
- FR-29: PC와 Router는 ARP로 MAC 주소를 알아낸다. 응답이 없으면 대기 중인 패킷을 버린다.
- FR-30: 링크가 고리 모양이어도 시뮬레이션이 멈추지 않는다. 이벤트 수 한도를 넘으면 중단하고 경고한다.
- FR-31: 사용자는 Switch에 VLAN을 만들고 지울 수 있다.
- FR-32: 사용자는 포트를 access 모드로 두고 VLAN 하나를 지정할 수 있다.
- FR-33: 사용자는 포트를 trunk 모드로 두고 여러 VLAN의 프레임을 802.1Q 태그로 실어 보낼 수 있다.
- FR-34: Router는 동작 중인 인터페이스의 네트워크를 라우팅 테이블에 올린다.
- FR-35: 사용자는 Router에 Static route와 기본 경로를 넣을 수 있다.
- FR-36: Router는 목적지와 가장 길게 일치하는 경로로 패킷을 보내고, TTL을 줄이고, MAC 주소를 바꾼다.
- FR-37: Router는 경로가 없거나 TTL이 0이 되면 패킷을 버리고 출발지에 ICMP 오류를 보낸다.
- FR-38: 사용자는 PC나 Router의 콘솔에서 ping을 실행하고 회차별 결과와 통계를 볼 수 있다.
- FR-39: 통신이 일어나면 프레임이 링크를 따라 이동하는 모습이 캔버스에 표시된다.
- FR-40: 사용자는 추적의 이벤트를 순서대로 볼 수 있고, 최근 추적 20개를 다시 볼 수 있다.
- FR-41: 사용자는 추적을 멈추고, 한 단계씩 앞뒤로 이동하고, 처음부터 다시 보고, 속도를 바꿀 수 있다.
- FR-42: 사용자는 각 단계의 프레임 내용을 계층별로 볼 수 있다. 앞 단계와 달라진 필드가 강조된다.
- FR-43: 캔버스에서 링크와 포트의 상태를 볼 수 있다.
- FR-44: 사용자는 콘솔 명령어 없이도 장비의 테이블을 패널로 볼 수 있다.
- FR-45: 편집기에서 할 수 없는 동작을 하면 사유가 표시된다.
- FR-46: 잘못된 명령어를 입력하면 틀린 위치와 사유가 표시된다.
- FR-47: 통신이 실패하면 어느 장비에서 왜 폐기되었는지 표시된다.

### NonFunctional Requirements

- NFR-1: 최신 Chrome, Edge, Firefox, Safari 데스크톱. 화면 너비 1280px 이상. 모바일 미지원.
- NFR-2: 장비 30대 토폴로지에서 ping 1회의 추적 계산이 100ms 안에 끝난다.
- NFR-3: 장비 50대 토폴로지에서 장비 이동과 재생이 끊김 없이 동작한다.
- NFR-4: 첫 화면 3초, 토폴로지 열기 1초 이내.
- NFR-5: 사용자 30명이 동시에 편집·저장해도 저장 요청이 실패하지 않는다.
- NFR-6: 토폴로지당 장비 50대·링크 100개, 계정당 토폴로지 50개, 토폴로지 파일 1MB.
- NFR-7: 저장 완료로 표시된 토폴로지는 서버 재시작 뒤에도 남아 있다.
- NFR-8: 모든 통신은 HTTPS. 사용자는 자기 토폴로지에만 접근한다.
- NFR-9: 소셜 계정 식별자, 이메일, 표시 이름만 저장한다. 요청 시 계정과 토폴로지를 삭제한다(운영자 수동).
- NFR-10: 화면은 한국어. CLI 명령어와 출력은 영어. 오류에는 한국어 설명.
- NFR-11: 같은 토폴로지·구성·명령이면 같은 추적이 나온다.
- NFR-12: 콘솔은 키보드만으로 쓸 수 있다. 상태를 색으로만 구분하지 않는다.

### Additional Requirements

아키텍처 문서에서 나온, 구현에 영향을 주는 요구사항입니다.

- AR-1 (시작 구조, Epic 1의 첫 Story): pnpm workspace 모노레포로 시작한다. `apps/web`(Vite의 React + TypeScript 템플릿에서 시작), `apps/api`(Hono), `packages/shared`, `packages/engine`, `deploy/`.
- AR-2: Stack 표의 버전을 고정하고, 빈 프로젝트에서 lint·타입 검사·테스트·빌드가 함께 도는지 확인한다.
- AR-3: 의존 방향(AD-2)을 `package.json`과 ESLint 규칙으로 강제한다.
- AR-4: 경계 계약의 타입(`Simulator`, `Snapshot`, `Command`, `DispatchResult`, `ConsolePort`, `ConsoleResult`, `Trace`, `TraceEvent`, `DeviceView`)을 `shared`와 `engine`에 가장 먼저 정의한다 (AD-16, AD-8, AD-6, AD-7).
- AR-5: `shared`에 `validateDocument()`, `migrateDocument()`, 값 검증 함수, 코드 열거형과 코드별 `params` 타입, 한도 상수, 예시 Document와 기대 Trace를 둔다 (AD-9, AD-14).
- AR-6: engine 안에서 실제 시계·난수·타이머 함수를 금지하는 lint 규칙을 둔다 (AD-5).
- AR-7: api는 같은 출처에서 SPA와 `/api`를 제공하고, 세션 미들웨어, 요청 ID, 빈도 제한, 본문 크기 제한을 둔다 (AD-12).
- AR-8: 인증은 better-auth, Google 제공자, Drizzle 어댑터로 구현한다. 쿠키 속성을 명시하고 응답 헤더 테스트를 둔다. 먼저 로그인만 되는 최소 서버로 동작을 확인한다 (AD-12).
- AR-9: `topology` 테이블과 `(owner_id, updated_at DESC)` 색인을 만든다. 저장소 모듈의 모든 함수가 `ownerId`를 받는다. `revision` 낙관적 잠금을 구현한다 (AD-10, AD-11).
- AR-10: api 오류 응답은 `{ error: { code, params } }` 한 형태다 (AD-14).
- AR-11: pino로 JSON 한 줄 로그를 남기고, Document 본문·쿠키·토큰·이메일을 기록하지 않는다 (AD-15).
- AR-12: Docker Compose로 `caddy`, `app`, `postgres`를 배포한다. `app`은 root가 아닌 사용자로 실행하고, 시작할 때 환경 변수를 검증한다. 하루 한 번 `pg_dump`를 떠서 7일치를 보관한다.
- AR-13: CI는 Pull Request에서 lint·타입 검사·단위 테스트·빌드를 돌리고, main에서 E2E·이미지 빌드·배포·상태 확인·실패 시 되돌림을 수행한다.
- AR-14: NFR-2를 CI의 성능 테스트로 확인한다 (AD-16).
- AR-15: 배포 위치, 도메인 이름, TLS 발급 경로를 1주차에 확정한다.
- AR-16: web의 저장 관리는 한 번에 요청 하나만 보내고, 409에는 다시 불러오기 또는 사본 저장을 제공하고, 401에는 IndexedDB에 초안을 보관한다 (AD-10).
- AR-17: web의 메시지 카탈로그는 모든 코드를 빠짐없이 다룬다 (AD-14).

### UX Design Requirements

UX 설계 문서가 없습니다. 화면 구성은 `docs/project-plan/03-system-design.md`의 3.3절을 따릅니다.

### FR Coverage Map

| FR | Epic | 내용 |
| --- | --- | --- |
| FR-1 | Epic 2 | Google 로그인 |
| FR-2 | Epic 2 | 로그아웃, 세션 만료 |
| FR-3 | Epic 2 | 토폴로지 목록 |
| FR-4 | Epic 2 | 토폴로지 생성·이름 변경·복제·삭제 |
| FR-5 | Epic 2 | 자동 저장 |
| FR-6 | Epic 2 | 불러오기 |
| FR-7 | Epic 7 | 내보내기, 가져오기 |
| FR-8 | Epic 7 | 예제 토폴로지 |
| FR-9 | Epic 1 | 장비 추가 |
| FR-10 | Epic 1 | 장비 이동, 이름 변경 |
| FR-11 | Epic 1 | 장비 삭제 |
| FR-12 | Epic 1 | 링크 연결 |
| FR-13 | Epic 1 | 링크 삭제 |
| FR-14 | Epic 1 | 캔버스 조작 |
| FR-15 | Epic 1 | PC |
| FR-16 | Epic 1 | Switch |
| FR-17 | Epic 4 | Router |
| FR-18 | Epic 3 | 인터페이스 켜기·끄기, 포트 상태 |
| FR-19 | Epic 1 | 콘솔 열기 |
| FR-20 | Epic 3 | CLI 모드 전환 |
| FR-21 | Epic 3 | 축약, 완성, 도움말, 이력 |
| FR-22 | Epic 3 | `no` 형식 |
| FR-23 | Epic 3 | `show` 명령어 |
| FR-24 | Epic 1 | PC 명령어 |
| FR-25 | Epic 1 | PC의 IP 설정 |
| FR-26 | Epic 4 | Router 인터페이스의 IP 설정 |
| FR-27 | Epic 1 | IP 입력 검증 |
| FR-28 | Epic 1 | 프레임 전달, MAC 학습 |
| FR-29 | Epic 1 | ARP |
| FR-30 | Epic 1 | 루프 보호 |
| FR-31 | Epic 5 | VLAN 생성·삭제 |
| FR-32 | Epic 5 | access 포트 |
| FR-33 | Epic 5 | trunk 포트 |
| FR-34 | Epic 4 | 직접 연결 경로 |
| FR-35 | Epic 4 | Static route |
| FR-36 | Epic 4 | 패킷 전달 규칙 |
| FR-37 | Epic 4 | ICMP 오류 응답 |
| FR-38 | Epic 1 | ping |
| FR-39 | Epic 6 | 패킷 이동 표시 |
| FR-40 | Epic 1 | 이벤트 목록 |
| FR-41 | Epic 6 | 단계별 재생 |
| FR-42 | Epic 6 | 프레임 내용 열람 |
| FR-43 | Epic 6 | 링크·포트 상태 표시 |
| FR-44 | Epic 6 | 장비 테이블 패널 |
| FR-45 | Epic 1 | 편집 오류 안내 (저장 실패·세션 만료 알림은 Epic 2) |
| FR-46 | Epic 3 | CLI 오류 안내 |
| FR-47 | Epic 1 | 통신 실패 사유 안내 |

## Epic List

MVP는 7개 Epic입니다. 사전 부검(advanced elicitation)을 거쳐, 가장 불확실한 엔진을 첫 Epic에 두고 계정·저장을 둘째로 옮긴 구성입니다.

의존 관계: Epic 1 → (2, 3, 6을 동시에 시작 가능). Epic 3 → (4, 5를 동시에 시작 가능). Epic 2 → 7. Epic 6의 Story 6.4는 Epic 3(포트 끄기), Story 6.3과 6.5의 Router 부분은 Epic 4가 끝난 뒤에 확인한다. Epic 7의 예제는 Epic 4와 5의 결과를 쓴다.

Epic 3, 4, 5는 모두 엔진의 CLI 명령 트리와 장비 모델을 고친다. 하나로 합치지 않은 이유는 CLI 기반(Epic 3)이 끝난 뒤 Router와 VLAN을 두 사람이 동시에 진행할 수 있고, 일정이 밀리면 VLAN만 떼어 줄일 수 있기 때문이다.

### Epic 1: 첫 ping
로그인 없이 브라우저에서 PC와 Switch를 놓고 연결해 ping을 실행하고, 이벤트 목록과 실패 사유를 본다. 프로젝트 시작 구조, 경계 계약 타입, 엔진 커널, 정적 배포를 포함한다. 이 Epic 동안은 새로 고침하면 토폴로지가 사라진다.
**FRs covered:** FR-9, FR-10, FR-11, FR-12, FR-13, FR-14, FR-15, FR-16, FR-19, FR-24, FR-25, FR-27, FR-28, FR-29, FR-30, FR-38, FR-40, FR-45, FR-47

### Epic 2: 계정으로 저장하고 이어서 한다
Google로 로그인하고, 토폴로지를 만들고, 자동 저장된 것을 다른 기기에서 연다. API, 데이터베이스, 운영 서버 배포를 포함한다. 완료 조건에 출시 점검표(백업, 동시 사용 확인)가 들어간다.
**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5, FR-6

### Epic 3: 장비를 명령어로 설정한다
Switch와 Router의 콘솔에서 CLI 모드를 오가고, 명령어를 축약·완성하고, 도움말을 보고, 설정을 되돌리고, `show`로 확인하고, 포트를 켜고 끈다.
**FRs covered:** FR-18, FR-20, FR-21, FR-22, FR-23, FR-46

### Epic 4: Router로 네트워크를 잇는다
Router를 놓고 인터페이스에 IP를 설정하고 Static route를 넣어, 서로 다른 네트워크의 PC끼리 통신한다. 경로가 없으면 ICMP 오류로 알 수 있다.
**FRs covered:** FR-17, FR-26, FR-34, FR-35, FR-36, FR-37

### Epic 5: VLAN으로 네트워크를 나눈다
Switch에 VLAN을 만들고 access·trunk 포트를 설정해 통신 범위를 나눈다.
**FRs covered:** FR-31, FR-32, FR-33

### Epic 6: 패킷 흐름을 재생하며 본다
프레임이 링크를 따라 움직이는 모습을 캔버스에서 보고, 단계별로 재생하고, 프레임 내용과 장비 테이블과 포트 상태를 본다.
**FRs covered:** FR-39, FR-41, FR-42, FR-43, FR-44

### Epic 7: 예제로 시작하고 파일로 주고받는다
준비된 예제 3종에서 시작하고, 토폴로지를 파일로 내보내고 가져온다.
**FRs covered:** FR-7, FR-8

## Epic 1: 첫 ping

로그인 없이 브라우저에서 PC와 Switch를 놓고 연결해 ping을 실행하고, 이벤트 목록과 실패 사유를 본다. 이 Epic 동안 토폴로지는 브라우저 메모리에만 있다.

### Story 1.1: 빈 편집기 화면이 주소에서 열린다

As a 사용자,
I want 주소를 열면 편집기 화면을 보고,
So that 설치 없이 바로 실습을 시작할 수 있다.

**Acceptance Criteria:**

**Given** 저장소를 새로 받은 상태에서
**When** 설치 명령과 검사 명령(lint, 타입 검사, 단위 테스트, 빌드)을 실행하면
**Then** `apps/web`, `apps/api`, `packages/shared`, `packages/engine` 네 패키지가 Stack 표의 버전으로 설치되고 모든 검사가 통과한다
**And** `packages/engine`에서 `apps/web`을 import하거나 engine 안에서 `Date.now`를 쓰면 lint가 실패한다 (AD-2, AD-5)

**Given** Pull Request를 올렸을 때
**When** CI가 실행되면
**Then** lint, 타입 검사, 단위 테스트, 빌드가 돌고 하나라도 실패하면 병합이 막힌다

**Given** main에 병합된 뒤
**When** 배포된 주소를 열면
**Then** 장비 목록, 빈 캔버스, 하단 도크가 있는 편집기 화면이 보인다 (정적 배포)

### Story 1.2: 엔진과 화면의 계약이 타입과 예시 자료로 확정된다

As a 개발팀 구성원,
I want 엔진과 화면이 주고받는 값의 형태가 타입과 예시 자료로 먼저 정해지고,
So that 세 사람이 서로를 기다리지 않고 각자 만든 것이 처음부터 맞물린다.

**Acceptance Criteria:**

**Given** `packages/shared`에서
**When** 타입을 import하면
**Then** `TopologyDocument`, `PortRef`, `Command`, `DispatchResult`, `Notice`, `Snapshot`, `DeviceView`, `PortStatus`, `ConsoleResult`, `ConsoleLine`, `Trace`, `TraceEvent`, 코드 열거형과 코드별 `params` 타입, 한도 상수가 있다 (AD-3, AD-6, AD-7, AD-8, AD-14, AD-16)

**Given** `shared`의 `validateDocument()`에
**When** 링크 끝이 없는 장비를 가리키는 문서, 포트 하나에 링크가 둘인 문서, 이름이 겹치는 문서를 넣으면
**Then** 각각 구별되는 오류 코드로 거부된다 (AD-9)

**Given** `shared`의 예시 자료에
**When** 예시 Document(PC 2대와 Switch 1대)와 그에 대한 기대 Trace를 읽으면
**Then** 둘 다 스키마 검증을 통과하고, 화면 쪽 테스트가 엔진 없이 이 자료만으로 실행된다

**Given** `packages/engine`에서
**When** `Simulator`를 만들어 `load`, `getSnapshot`, `subscribe`를 호출하면
**Then** 빈 동작으로라도 타입대로 응답하고, 사용자 입력 때문에 예외를 던지지 않는다

### Story 1.3: 장비를 놓고 옮기고 이름을 바꾸고 지운다

As a 사용자,
I want 장비 목록에서 PC와 Switch를 캔버스에 끌어다 놓고 옮기고 이름을 바꾸고 지우고,
So that 실습할 네트워크의 모양을 만들 수 있다.

**Acceptance Criteria:**

**Given** 빈 캔버스에서
**When** 장비 목록의 PC를 캔버스에 끌어다 놓으면
**Then** 놓은 위치에 `PC1`이 생기고, 하나 더 놓으면 `PC2`가 된다 (FR-9)

**Given** 캔버스에 장비가 있을 때
**When** 장비를 끌어 옮기고 놓으면
**Then** `device/move`가 한 번 나가고 Document의 위치가 바뀐다 (FR-10, AD-4)

**Given** 장비 `PC1`과 `PC2`가 있을 때
**When** `PC2`의 이름을 `PC1`로 바꾸려 하면
**Then** 거부되고 이름이 그대로다 (FR-10)

**Given** 캔버스에 장비가 있을 때
**When** 장비를 지우면
**Then** 캔버스와 Document에서 사라진다 (FR-11)

**Given** 캔버스에서
**When** 확대·축소하고 화면을 옮긴 뒤 장비를 놓으면
**Then** 마우스 위치에 정확히 놓인다 (FR-14)

### Story 1.4: 포트를 골라 링크로 연결하고 지운다

As a 사용자,
I want 두 장비의 포트를 골라 연결하고 연결을 지우고,
So that 장비들이 통신할 수 있게 배선할 수 있다.

**Acceptance Criteria:**

**Given** PC와 Switch가 있을 때
**When** PC에서 Switch로 선을 끌면
**Then** 양쪽의 비어 있는 포트 목록이 뜨고, 고르면 링크가 생기며 양 끝에 포트 이름이 표시된다 (FR-12)

**Given** PC의 포트가 이미 연결되어 있을 때
**When** 그 PC에서 다른 장비로 선을 끌면
**Then** 연결할 포트가 없다는 안내가 나오고 링크가 생기지 않는다 (FR-12)

**Given** 링크가 있을 때
**When** 링크를 지우면
**Then** 양쪽 포트가 비어 다시 연결할 수 있다 (FR-13)

**Given** 링크가 연결된 장비를
**When** 지우려 하면
**Then** 확인을 거친 뒤 장비와 그 링크가 함께 지워진다 (FR-11)

### Story 1.5: PC에 IP를 설정한다

As a 사용자,
I want PC의 IP 주소, 서브넷 마스크, 기본 게이트웨이를 설정 패널에서 입력하고,
So that PC가 네트워크에서 통신할 주소를 가질 수 있다.

**Acceptance Criteria:**

**Given** PC를 선택했을 때
**When** 설정 패널에 `192.168.1.10`과 `255.255.255.0`을 입력하면
**Then** `pc/set-ip`가 나가고 Document에 반영된다 (FR-25)

**Given** 설정 패널에서
**When** `192.168.1.300`, 연속되지 않은 마스크 `255.0.255.0`, 네트워크 주소 `192.168.1.0`을 넣으면
**Then** 각각 거부되고 입력란 옆에 사유가 표시된다 (FR-27)

**Given** `PC1`이 `192.168.1.10`을 쓰고 있을 때
**When** `PC2`에 같은 주소를 넣으면
**Then** 설정은 되고 중복 경고가 표시된다 (FR-27)

### Story 1.6: 콘솔을 열어 PC 명령어를 쓴다

As a 사용자,
I want 장비를 눌러 콘솔을 열고 `ipconfig`를 입력하고,
So that 명령어로 PC의 설정을 보고 바꿀 수 있다.

**Acceptance Criteria:**

**Given** PC가 있을 때
**When** PC의 콘솔을 열면
**Then** 하단 도크에 그 PC의 콘솔 탭이 생기고 프롬프트가 보인다 (FR-19)

**Given** PC 콘솔에서
**When** `ipconfig`를 입력하면
**Then** IP 주소, 서브넷 마스크, 기본 게이트웨이, MAC 주소가 출력된다 (FR-24)

**Given** PC 콘솔에서
**When** `ipconfig 192.168.1.20 255.255.255.0 192.168.1.1`을 입력하면
**Then** 설정 패널의 값이 함께 바뀐다 (FR-25, AD-3)

**Given** 콘솔 두 개를 열어 둔 상태에서
**When** 탭을 오가거나 닫았다 다시 열면
**Then** 각 콘솔의 이전 출력이 남아 있고, 위·아래 화살표로 이전 명령어가 나온다 (FR-19)

**Given** 콘솔에서
**When** 마우스 없이 키보드만 쓰면
**Then** 입력, 실행, 이력 조회를 모두 할 수 있다 (NFR-12)

### Story 1.7: Switch가 프레임을 전달하고 MAC 주소를 학습한다

As a 사용자,
I want Switch에 연결한 장비들이 설정 없이 서로 프레임을 주고받고,
So that 같은 Switch의 PC끼리 통신할 수 있다.

**Acceptance Criteria:**

**Given** PC 3대가 Switch 1대에 연결된 Document에서
**When** `PC1`이 브로드캐스트 프레임을 보내면
**Then** Switch는 받은 포트를 뺀 모든 포트로 내보내고, `PC1`의 MAC 주소를 받은 포트와 함께 기록한다 (FR-28)

**Given** Switch가 `PC2`의 MAC 주소를 알고 있을 때
**When** `PC1`이 `PC2` 앞으로 프레임을 보내면
**Then** `PC2`의 포트로만 나가고, 모르는 목적지면 flooding한다 (FR-28)

**Given** 같은 Document와 같은 입력으로
**When** 계산을 두 번 실행하면
**Then** 두 Trace가 완전히 같다 (NFR-11, AD-5)

**Given** MAC 주소 항목이 기록된 뒤
**When** 가상 시간으로 300초 동안 쓰이지 않거나 그 포트의 링크를 지우면
**Then** 그 항목이 지워진다 (FR-28, FR-13)

**Given** 포트 8개를 가진 Switch를 놓고 설정 없이 장비를 연결했을 때
**When** 장비들이 프레임을 보내면
**Then** 모든 포트가 켜져 있고 VLAN 1에 속해 서로 전달된다 (FR-16)

### Story 1.8: PC에서 ping을 실행해 결과를 본다

As a 사용자,
I want PC 콘솔에서 `ping`을 실행해 응답을 받고,
So that 구성한 네트워크가 실제로 통신되는지 확인할 수 있다.

**Acceptance Criteria:**

**Given** 같은 네트워크의 IP를 가진 PC 2대가 Switch에 연결되어 있을 때
**When** `PC1`에서 `ping 192.168.1.20`을 실행하면
**Then** 회차마다 결과가 한 줄씩 나오고, 끝에 보낸 수·받은 수·손실률이 나온다 (FR-38)

**Given** `PC1`의 ARP 테이블이 비어 있을 때
**When** ping을 실행하면
**Then** ARP 요청이 브로드캐스트로 먼저 나가고, 응답을 받은 뒤 ICMP 요청이 나가며, `arp -a`에 상대의 주소가 보이고 `arp -d`로 비울 수 있다 (FR-29, FR-24)

**Given** 자기 IP에 대한 ARP 요청이나 ICMP 요청을 받은 PC는
**When** 프레임을 처리하면
**Then** 응답하고, 자기 것이 아니면 응답하지 않는다 (FR-15, FR-29)

**Given** ARP 응답이 오지 않을 때
**When** 가상 시간으로 2초가 지나면
**Then** 대기 중인 패킷을 버리고 그 회차가 실패로 출력된다 (FR-29)

### Story 1.9: 이벤트 목록으로 통신 과정을 본다

As a 사용자,
I want ping이 일으킨 일을 순서대로 목록으로 보고,
So that ARP와 스위치 전달이 어떤 순서로 일어났는지 이해할 수 있다.

**Acceptance Criteria:**

**Given** ping을 실행한 뒤
**When** 이벤트 목록 탭을 열면
**Then** 그 회차의 이벤트가 순서대로 나오고, 각 줄에 장비, 계층, 동작, 한국어 설명이 있다 (FR-40)

**Given** 이벤트 목록에서
**When** 한 줄을 누르면
**Then** 해당 장비와 링크가 캔버스에서 강조된다 (FR-40)

**Given** ping을 여러 번 실행했을 때
**When** 추적 선택 목록을 열면
**Then** 최근 20개까지의 추적이 있고, 콘솔의 회차 줄에서도 그 추적을 열 수 있다 (FR-40, FR-38)

**Given** 메시지 카탈로그에서
**When** `shared`에 새 코드를 추가하고 문구를 넣지 않으면
**Then** 타입 검사가 실패한다 (AD-14)

### Story 1.10: 실패한 ping의 원인을 안다

As a 사용자,
I want ping이 실패했을 때 어느 장비에서 왜 막혔는지 보고,
So that 무엇을 고쳐야 하는지 알 수 있다.

**Acceptance Criteria:**

**Given** `PC2`에 IP가 없을 때
**When** `PC1`에서 `PC2`의 예정 주소로 ping하면
**Then** 실패 사유로 ARP 응답이 없다는 문구가 장비 이름·주소와 함께 표시된다 (FR-47)

**Given** PC의 포트에 링크가 없거나, PC에 IP가 없거나, 다른 네트워크인데 게이트웨이가 없을 때
**When** ping하면
**Then** 각각 `NO_LINK`, `NO_IP`, `NO_GATEWAY`에 해당하는 서로 다른 문구가 표시된다 (FR-47)

**Given** 실패한 추적에서
**When** 실패 사유를 누르면
**Then** 원인 이벤트(`primaryDropSeq`)로 이동하고, 목적지가 아닌 장비의 정상적인 폐기(`NOT_FOR_ME`)는 회색으로 구분된다 (FR-47, AD-6)

### Story 1.11: 고리 모양으로 연결해도 멈추지 않는다

As a 사용자,
I want Switch들을 고리 모양으로 잘못 연결해도 화면이 멈추지 않고,
So that 실수로 실습 전체를 잃지 않는다.

**Acceptance Criteria:**

**Given** Switch 2대가 링크 2개로 서로 연결된 Document에서
**When** PC가 브로드캐스트를 일으키는 ping을 실행하면
**Then** 이벤트 2,000개에서 계산이 멈추고 "루프가 의심됩니다"와 관련 장비가 표시된다 (FR-30)

**Given** 계산이 중단된 뒤
**When** 편집기와 콘솔을 계속 쓰면
**Then** 정상 동작한다 (FR-30)

**Given** 장비 30대의 예시 Document에서
**When** CI의 성능 테스트가 ping 1회를 계산하면
**Then** 100ms 안에 끝나고, 넘으면 CI가 실패한다 (NFR-2, AD-16)

### Story 1.12: 편집 중 할 수 없는 동작의 사유를 본다

As a 사용자,
I want 편집기에서 안 되는 동작을 했을 때 이유를 보고,
So that 왜 안 되는지 추측하지 않아도 된다.

**Acceptance Criteria:**

**Given** 장비가 50대인 토폴로지에서
**When** 장비를 하나 더 놓으려 하면
**Then** 한도를 넘었다는 문구가 표시되고 장비가 생기지 않는다 (FR-45, NFR-6)

**Given** 같은 장비의 두 포트를
**When** 서로 연결하려 하면
**Then** 사유가 표시되고 링크가 생기지 않는다 (FR-45)

**Given** 편집 오류 문구는
**When** 표시될 때
**Then** 무엇이 문제인지와 어떻게 고치는지를 함께 담는다 (FR-45)

## Epic 2: 계정으로 저장하고 이어서 한다

Google로 로그인하고, 토폴로지를 만들고, 자동 저장된 것을 다른 기기에서 연다.

### Story 2.1: Google로 로그인한다

As a 사용자,
I want Google 계정으로 로그인하고,
So that 비밀번호를 새로 만들지 않고 내 작업 공간을 가질 수 있다.

**Acceptance Criteria:**

**Given** 로그인하지 않은 상태에서
**When** 편집기 주소를 열면
**Then** 로그인 화면으로 이동하고, 로그인을 마치면 편집기로 돌아온다 (FR-1)

**Given** 로그인 화면에서
**When** "Google로 로그인"을 눌러 인증을 마치면
**Then** 계정이 만들어지고 세션 쿠키가 발급된다 (FR-1)
**And** 응답의 쿠키에 `HttpOnly`, `Secure`, `SameSite=Lax`가 있음을 테스트가 확인한다 (AD-12)

**Given** api가 시작할 때
**When** 필요한 환경 변수가 빠져 있으면
**Then** 실행되지 않고 빠진 변수 이름을 출력한다

**Given** 로그인 요청이 처리될 때
**When** 서버 로그를 보면
**Then** 요청 ID와 `auth.login` 사건이 JSON 한 줄로 있고, 이메일·쿠키·토큰은 없다 (AD-15)

**Given** 데이터베이스에
**When** 저장된 사용자 정보를 보면
**Then** Google 계정 식별자, 이메일, 표시 이름만 있다 (NFR-9)

### Story 2.2: 운영 주소에서 서비스가 열린다

As a 사용자,
I want 공개된 주소에서 HTTPS로 접속해 로그인하고,
So that 어느 기기에서든 서비스를 쓸 수 있다.

**Acceptance Criteria:**

**Given** 운영 서버에서
**When** Compose로 `caddy`, `app`, `postgres`를 올리면
**Then** 공개 주소가 HTTPS로 열리고 Google 로그인이 끝까지 된다 (NFR-8)
**And** `postgres`와 `app`은 외부에 포트를 열지 않고, `app`은 root가 아닌 사용자로 실행된다

**Given** main에 병합되었을 때
**When** 배포 작업이 실행되면
**Then** 이미지 빌드, 마이그레이션, 재시작, `/api/health` 확인이 순서대로 되고, 확인이 실패하면 이전 이미지로 돌아간다

**Given** 화면과 API는
**When** 운영과 로컬 어디서든
**Then** 같은 출처에서 제공된다 (AD-12)

### Story 2.3: 토폴로지를 만들고 목록에서 본다

As a 사용자,
I want 새 토폴로지를 만들고 내 토폴로지 목록을 보고,
So that 여러 실습을 따로 보관할 수 있다.

**Acceptance Criteria:**

**Given** 로그인한 상태에서
**When** 목록 화면을 열면
**Then** 내 토폴로지의 이름, 마지막 수정 시각, 장비 수가 최근 수정 순으로 보인다 (FR-3)

**Given** 목록 화면에서
**When** "새 토폴로지"를 누르면
**Then** 토폴로지가 만들어지고 편집기가 열린다 (FR-4)

**Given** 다른 사용자의 토폴로지 ID로
**When** 주소를 직접 열거나 API를 호출하면
**Then** 404가 돌아온다 (FR-3, AD-11)

**Given** API가 오류를 돌려줄 때
**When** 응답 본문을 보면
**Then** `{ "error": { "code", "params" } }` 형태다 (AD-14)

### Story 2.4: 편집 내용이 자동으로 저장되고 다시 열린다

As a 사용자,
I want 편집한 내용이 저절로 저장되고 나중에 그대로 열리고,
So that 저장을 신경 쓰지 않고 다른 날 이어서 할 수 있다.

**Acceptance Criteria:**

**Given** 편집기에서
**When** 장비나 구성을 바꾸고 3초 동안 입력이 없으면
**Then** 저장되고 "저장됨"과 시각이 표시된다 (FR-5)

**Given** 저장 요청이 진행 중일 때
**When** 또 편집하면
**Then** 요청이 겹치지 않고, 응답을 받은 뒤 새 `revision`으로 이어서 저장된다 (AD-10)

**Given** 저장된 토폴로지를
**When** 다른 기기에서 열면
**Then** 장비 위치, 링크, 구성이 같고 MAC 주소 테이블과 ARP 테이블은 비어 있다 (FR-6)

**Given** 네트워크가 끊겼을 때
**When** 저장이 실패하면
**Then** "저장 실패"가 표시되고 자동으로 다시 시도한다 (FR-5, FR-45)

**Given** 한도를 넘거나 유효하지 않은 문서를
**When** API에 저장하려 하면
**Then** 거부된다 (NFR-6, AD-9)

### Story 2.5: 토폴로지의 이름을 바꾸고 복제하고 삭제한다

As a 사용자,
I want 토폴로지의 이름을 바꾸고 복제하고 삭제하고,
So that 목록을 정리하고 기존 실습에서 새 실습을 시작할 수 있다.

**Acceptance Criteria:**

**Given** 목록 화면에서
**When** 토폴로지를 복제한 뒤 복제본을 고치면
**Then** 원본은 바뀌지 않는다 (FR-4)

**Given** 목록 화면에서
**When** 삭제를 누르면
**Then** 확인을 거친 뒤 목록에서 사라진다 (FR-4)

**Given** 토폴로지가 50개일 때
**When** 하나 더 만들려 하면
**Then** 거부되고 사유가 표시된다 (FR-4, NFR-6)

### Story 2.6: 두 곳에서 편집해도 어느 쪽도 잃지 않는다

As a 사용자,
I want 같은 토폴로지를 두 탭에서 고쳤을 때 알림을 받고 선택하고,
So that 한쪽의 작업이 소리 없이 사라지지 않는다.

**Acceptance Criteria:**

**Given** 같은 토폴로지를 두 탭에서 연 상태에서
**When** 한 탭이 저장한 뒤 다른 탭이 저장하려 하면
**Then** 나중 탭에 충돌 알림이 뜨고 자동 저장이 멈춘다 (AD-10)

**Given** 충돌 알림에서
**When** "다시 불러오기"를 고르면 서버의 것이 열리고, "사본으로 저장"을 고르면
**Then** 내 것이 새 토폴로지로 저장된다. 덮어쓰기는 없다 (AD-10)

### Story 2.7: 로그아웃하고, 세션이 끊겨도 이어서 저장된다

As a 사용자,
I want 로그아웃할 수 있고 세션이 끊겨도 하던 작업이 남아 있고,
So that 공용 기기에서 안전하게 쓰고, 오래 켜 둔 화면의 작업을 잃지 않는다.

**Acceptance Criteria:**

**Given** 로그인한 상태에서
**When** 로그아웃하면
**Then** 서버의 세션이 지워지고 이후 API 호출은 401을 받는다 (FR-2)

**Given** 편집 중 세션이 만료되었을 때
**When** 저장이 401을 받으면
**Then** 문서와 기준 `revision`이 IndexedDB에 보관되고 로그인 화면으로 이동한다 (FR-2, AD-10)

**Given** 다시 로그인한 뒤
**When** 그 토폴로지를 열면
**Then** 보관된 변경이 이어서 저장된다 (FR-2)

**Given** 사용자 A의 초안이 브라우저에 남아 있을 때
**When** 같은 컴퓨터에서 사용자 B가 로그인하면
**Then** A의 초안은 올라가지 않고 B의 목록이 그대로다. 로그아웃하면 그 사용자의 초안이 지워진다 (SEC-28)

### Story 2.8: 출시 점검을 통과한다

As a 운영자,
I want 공개 전에 백업, 동시 사용, 데이터 보존을 확인하고,
So that 여러 사람이 동시에 써도 작업이 사라지지 않는다.

**Acceptance Criteria:**

**Given** 운영 서버에서
**When** 하루가 지나면
**Then** `pg_dump` 백업이 생기고 7일치가 보관되며, 암호화된 사본이 서버 밖에도 있고, 백업에서 복원하는 절차를 한 번 실행해 확인했다 (SEC-26)

**Given** 계정 삭제 요청이 왔을 때
**When** 운영자가 삭제 스크립트를 실행하면
**Then** 그 사용자의 토폴로지, 세션, 계정 정보가 모두 지워지고 삭제 기록이 남는다 (NFR-9, SEC-31)

**Given** 가상 사용자 30명이
**When** 동시에 저장 요청을 반복하면
**Then** 실패한 요청이 없다 (NFR-5)

**Given** 저장이 끝난 뒤
**When** 서버를 재시작하면
**Then** 토폴로지가 그대로 있다 (NFR-7)

**Given** 운영 주소에서
**When** 최신 Chrome, Edge, Firefox, Safari 데스크톱으로 핵심 시나리오(로그인, 만들기, ping, 저장, 다시 열기)를 해 보면
**Then** 네 브라우저 모두에서 동작한다 (NFR-1)

**Given** 운영 주소에서
**When** 첫 화면과 토폴로지 열기의 소요 시간을 재면
**Then** 첫 화면은 3초, 토폴로지 열기는 1초 안에 끝난다 (NFR-4)

## Epic 3: 장비를 명령어로 설정한다

Switch의 콘솔에서 계층형 CLI를 쓴다. Router는 Epic 4에서 같은 명령 트리를 이어 쓴다.

### Story 3.1: 콘솔에서 CLI 모드를 오간다

As a 사용자,
I want Switch 콘솔에서 `enable`, `configure terminal`로 모드를 오가고 `hostname`으로 이름을 바꾸고,
So that 교재에서 배운 순서대로 장비를 설정할 수 있다.

**Acceptance Criteria:**

**Given** Switch 콘솔의 사용자 모드에서
**When** `enable`, `configure terminal`, `exit`, `end`, `disable`을 입력하면
**Then** 상태도대로 모드가 바뀌고 프롬프트가 `SW1>`, `SW1#`, `SW1(config)#`로 바뀐다 (FR-20)

**Given** 전역 설정 모드에서
**When** `hostname CORE`를 입력하면
**Then** 캔버스의 이름과 프롬프트가 함께 바뀐다 (FR-10, FR-20, AD-3)

**Given** 사용자 모드에서
**When** `configure terminal`을 입력하면
**Then** 실행되지 않고 오류가 나온다 (FR-20)

**Given** 명령어를 추가할 때
**When** 명령 정의 목록에 항목 하나를 넣으면
**Then** 해석과 프롬프트 처리가 따로 수정 없이 동작한다 (AD-8)

### Story 3.2: 명령어를 축약하고 Tab과 `?`를 쓴다

As a 사용자,
I want 명령어를 줄여 쓰고 Tab으로 완성하고 `?`로 다음에 올 단어를 보고,
So that 긴 명령어를 외우지 않고도 빠르게 입력할 수 있다.

**Acceptance Criteria:**

**Given** 관리자 모드에서
**When** `conf t`를 입력하면
**Then** `configure terminal`로 실행된다 (FR-21)

**Given** 여러 명령어와 일치하는 축약을
**When** 입력하면
**Then** 모호하다는 오류가 나온다 (FR-21, FR-46)

**Given** 명령어의 앞부분을 입력한 상태에서
**When** Tab을 누르면 유일한 일치로 완성되고, `?`를 누르면
**Then** 그 자리에서 입력할 수 있는 단어와 설명이 나온다 (FR-21)

### Story 3.3: 포트를 끄고 켠다

As a 사용자,
I want `interface`로 포트를 골라 `shutdown`과 `no shutdown`으로 끄고 켜고,
So that 포트 상태가 통신에 주는 영향을 실습할 수 있다.

**Acceptance Criteria:**

**Given** 전역 설정 모드에서
**When** `interface fa0/1`을 입력하면
**Then** 프롬프트가 `SW1(config-if)#`가 된다 (FR-20)

**Given** 인터페이스 설정 모드에서
**When** `shutdown`을 입력하면
**Then** 그 포트가 프레임을 보내지도 받지도 않고, `no shutdown`으로 되돌아온다 (FR-18, FR-22)

**Given** 꺼진 포트를 지나야 하는 ping이
**When** 실패하면
**Then** 사유로 그 포트가 꺼져 있다는 문구가 나온다 (FR-47)

**Given** 포트 상태는
**When** 엔진이 계산하면
**Then** `up`, `admin-down`, `no-link`, `peer-down` 중 하나다 (FR-18, AD-7)

### Story 3.4: `show` 명령어로 구성과 상태를 확인한다

As a 사용자,
I want `show running-config`, `show ip interface brief`, `show mac address-table`로 장비를 확인하고,
So that 설정한 내용과 현재 상태를 명령어로 볼 수 있다.

**Acceptance Criteria:**

**Given** Switch를 설정한 뒤
**When** `show running-config`를 입력하면
**Then** 현재 구성이 명령어 줄로 나온다 (FR-23)

**Given** `show running-config`의 출력을
**When** 새 장비에 그대로 입력하면
**Then** 같은 구성이 된다. 속성 기반 테스트가 임의의 구성에 대해 확인한다 (FR-23, AD-8)

**Given** 통신이 일어난 뒤
**When** `show mac address-table`과 `show ip interface brief`를 입력하면
**Then** 그 시점의 MAC 주소 테이블과 포트 상태가 나온다 (FR-23)

### Story 3.5: 잘못된 명령어의 위치와 사유를 본다

As a 사용자,
I want 명령어를 틀렸을 때 어느 단어가 왜 틀렸는지 보고,
So that 오타와 문법 실수를 바로 고칠 수 있다.

**Acceptance Criteria:**

**Given** 콘솔에서
**When** 없는 명령어, 인자가 모자란 명령어, 형식이 틀린 값, 현재 모드에서 쓸 수 없는 명령어를 입력하면
**Then** 서로 다른 오류가 나오고 틀린 단어의 위치가 표시된다 (FR-46)

**Given** CLI 오류에는
**When** 표시될 때
**Then** 한국어 설명이 한 줄 붙는다 (FR-46, NFR-10)

## Epic 4: Router로 네트워크를 잇는다

### Story 4.1: Router를 놓고 인터페이스에 IP를 주고 켠다

As a 사용자,
I want Router를 놓고 인터페이스에 IP를 설정한 뒤 켜고,
So that Router가 연결된 네트워크를 알게 할 수 있다.

**Acceptance Criteria:**

**Given** 장비 목록에서
**When** Router를 캔버스에 놓으면
**Then** 인터페이스 4개를 가진 `R1`이 생기고 모든 인터페이스가 꺼져 있다 (FR-17)

**Given** Router의 인터페이스 설정 모드에서
**When** `ip address 10.0.1.1 255.255.255.0`과 `no shutdown`을 입력하면
**Then** `show ip route`에 `10.0.1.0/24`가 직접 연결 경로로 나온다 (FR-26, FR-34)

**Given** 한 Router의 두 인터페이스에
**When** 겹치는 네트워크를 넣으려 하면
**Then** 거부되고 사유가 나온다 (FR-27)

**Given** 인터페이스가 꺼지거나 링크가 끊기면
**When** `show ip route`를 보면
**Then** 그 경로가 없다 (FR-34)

### Story 4.2: Router를 거쳐 옆 네트워크와 통신한다

As a 사용자,
I want PC가 Router를 게이트웨이로 써서 Router의 다른 인터페이스에 붙은 네트워크와 ping하고,
So that Router가 네트워크 사이를 잇는 것을 확인할 수 있다.

**Acceptance Criteria:**

**Given** Router 1대의 두 인터페이스에 각각 네트워크가 연결되고 PC들의 게이트웨이가 Router일 때
**When** 한쪽 PC에서 다른 쪽 PC로 ping하면
**Then** 성공한다 (FR-36)

**Given** Router가 패킷을 전달할 때
**When** 이벤트를 보면
**Then** TTL이 1 줄고 출발지·목적지 MAC 주소가 다음 구간의 것으로 바뀌어 있다 (FR-36)

**Given** Router의 인터페이스 IP로
**When** ping하거나 Router 콘솔에서 `ping`을 실행하면
**Then** 응답을 주고받고, `show arp`에 학습된 주소가 나온다 (FR-36, FR-38, FR-23)

### Story 4.3: Static route로 먼 네트워크와 통신한다

As a 사용자,
I want Router에 `ip route`로 경로를 넣고,
So that Router 여러 대를 거쳐야 하는 네트워크와 통신할 수 있다.

**Acceptance Criteria:**

**Given** 화이트보드의 예시 토폴로지(Router 2대, Switch 2대, PC 2대)에서
**When** 두 Router에 상대 네트워크로 가는 `ip route`를 넣으면
**Then** 양 끝 PC 사이의 ping이 성공하고 `show ip route`에 Static 경로가 구분되어 나온다 (FR-35)

**Given** 일치하는 경로가 여럿일 때
**When** 패킷을 전달하면
**Then** 접두사가 가장 긴 경로를 고르고, 없으면 기본 경로 `0.0.0.0/0`을 쓴다 (FR-35, FR-36)

**Given** 다음 홉이 직접 연결된 네트워크에 없는 `ip route`를
**When** 넣으면
**Then** 구성에는 남지만 라우팅 테이블에는 올라가지 않는다 (FR-35)

**Given** 넣은 경로를
**When** `no ip route …`로 지우면
**Then** 구성과 라우팅 테이블에서 사라진다 (FR-22)

### Story 4.4: 경로가 없거나 TTL이 다하면 알 수 있다

As a 사용자,
I want Router가 패킷을 전달하지 못했을 때 그 사실과 이유를 알고,
So that 빠진 경로나 순환 경로를 찾아 고칠 수 있다.

**Acceptance Criteria:**

**Given** 돌아오는 경로를 넣지 않은 예시 토폴로지에서
**When** ping하면
**Then** 실패 사유로 "R2의 라우팅 테이블에 … 로 가는 경로가 없습니다"가 나온다 (FR-37, FR-47)

**Given** Router가 경로 없는 패킷을 버릴 때
**When** 이벤트를 보면
**Then** 출발지로 ICMP 목적지 도달 불가가 돌아가고, ping 출력에 그 회차가 도달 불가로 나온다 (FR-37)

**Given** 두 Router가 서로를 다음 홉으로 가리킬 때
**When** ping하면
**Then** TTL이 0이 된 Router가 패킷을 버리고 ICMP 시간 초과를 보내며, 사유에 순환을 확인하라는 문구가 나온다 (FR-37, FR-47)

## Epic 5: VLAN으로 네트워크를 나눈다

### Story 5.1: VLAN을 만들고 지운다

As a 사용자,
I want Switch에서 `vlan`으로 VLAN을 만들고 이름을 붙이고 지우고,
So that 나눌 네트워크를 준비할 수 있다.

**Acceptance Criteria:**

**Given** 전역 설정 모드에서
**When** `vlan 10`과 `name sales`를 입력하면
**Then** `show vlan brief`에 VLAN 10이 `sales`로 나온다 (FR-31)

**Given** VLAN 번호로
**When** 0이나 4095를 넣으면 거부되고, `no vlan 1`을 입력하면
**Then** VLAN 1은 지울 수 없다는 오류가 나온다 (FR-31)

### Story 5.2: access 포트로 VLAN을 나눈다

As a 사용자,
I want 포트마다 `switchport access vlan`으로 VLAN을 지정하고,
So that 같은 Switch에서도 VLAN이 다르면 통신이 안 되는 것을 확인할 수 있다.

**Acceptance Criteria:**

**Given** PC 4대가 한 Switch에 있고 두 대씩 VLAN 10과 20에 속할 때
**When** 같은 VLAN끼리 ping하면 성공하고, 다른 VLAN으로 ping하면
**Then** 실패하며 사유로 VLAN이 달라 내보내지 않았다는 문구가 나온다 (FR-32, FR-47)

**Given** 없는 VLAN을
**When** `switchport access vlan 30`으로 지정하면
**Then** VLAN 30이 자동으로 만들어지고 알림이 나온다 (FR-32)

**Given** VLAN을 나눈 뒤
**When** `show mac address-table`을 보면
**Then** 항목마다 VLAN 번호가 있다 (FR-28, FR-32)

**Given** 포트가 속한 VLAN을 지웠을 때
**When** 그 포트로 통신하려 하면
**Then** 통신되지 않는다 (FR-31)

### Story 5.3: trunk로 Switch 사이에 VLAN을 잇는다

As a 사용자,
I want Switch 사이의 포트를 trunk로 두어 여러 VLAN을 함께 보내고,
So that Switch를 건너서도 같은 VLAN끼리 통신할 수 있다.

**Acceptance Criteria:**

**Given** Switch 2대가 trunk로 연결되고 양쪽에 VLAN 10의 PC가 있을 때
**When** 두 PC 사이에 ping하면
**Then** 성공하고, trunk를 지나는 프레임에 VLAN 10 태그가 있다 (FR-33)

**Given** trunk의 허용 목록에서 VLAN 20을 뺐을 때
**When** VLAN 20의 PC끼리 Switch를 건너 ping하면
**Then** 실패하며 사유로 trunk가 그 VLAN을 허용하지 않는다는 문구가 나온다 (FR-33, FR-47)

**Given** trunk를 설정한 뒤
**When** `show interfaces trunk`와 `show running-config`를 보면
**Then** trunk 포트와 허용 VLAN이 나온다 (FR-23, FR-33)

## Epic 6: 패킷 흐름을 재생하며 본다

### Story 6.1: 프레임이 링크를 따라 움직이는 것을 본다

As a 사용자,
I want ping을 실행하면 프레임이 링크를 따라 움직이는 것을 캔버스에서 보고,
So that 통신 과정을 눈으로 따라갈 수 있다.

**Acceptance Criteria:**

**Given** ping을 실행했을 때
**When** 계산이 끝나면
**Then** 캔버스에서 프레임이 링크를 따라 움직이고, ARP·ICMP 요청·ICMP 응답이 색과 모양으로 구분된다 (FR-39, NFR-12)

**Given** 프레임이 폐기되는 추적에서
**When** 재생이 그 지점에 닿으면
**Then** 폐기 표시가 나타난다 (FR-39)

**Given** 장비 50대의 예시 Document에서
**When** 재생하고 장비를 옮기면
**Then** 끊김 없이 동작한다 (NFR-3)

### Story 6.2: 재생을 멈추고 한 단계씩 따라간다

As a 사용자,
I want 재생을 멈추고 다음 단계, 이전 단계, 처음으로 이동하고 속도를 바꾸고,
So that 내 속도로 한 단계씩 확인할 수 있다.

**Acceptance Criteria:**

**Given** 재생 중에
**When** 멈춤, 다음 단계, 이전 단계, 처음으로를 누르면
**Then** 캔버스의 프레임 위치와 이벤트 목록의 선택이 같은 단계를 가리킨다 (FR-41, AD-6)

**Given** Switch가 여러 포트로 flooding한 추적에서
**When** 다음 단계를 누르면
**Then** 같은 가상 시각의 프레임들이 함께 움직인다 (FR-41)

**Given** 재생 속도를
**When** 0.5배, 1배, 2배로 바꾸면
**Then** 그 속도로 재생된다 (FR-41)

**Given** 추적을 만든 뒤 관련 장비를 지웠을 때
**When** 그 추적을 고르면
**Then** "토폴로지가 바뀜"으로 표시되고 캔버스 재생이 막히며 이벤트 목록은 볼 수 있다 (FR-41, AD-6)

### Story 6.3: 프레임 내용을 계층별로 본다

As a 사용자,
I want 각 단계에서 프레임 안의 주소와 필드를 계층별로 보고,
So that Router를 지날 때 무엇이 바뀌는지 알 수 있다.

**Acceptance Criteria:**

**Given** 재생의 한 단계에서
**When** 프레임 보기 탭을 열면
**Then** Ethernet, VLAN 태그, ARP 또는 IPv4, ICMP의 필드가 계층별로 나뉘어 보인다 (FR-42)

**Given** Router를 지난 단계에서
**When** 프레임 보기를 보면
**Then** 앞 단계와 달라진 MAC 주소와 TTL이 강조된다 (FR-42)

### Story 6.4: 포트 상태와 인터페이스 정보를 캔버스에서 본다

As a 사용자,
I want 링크 양 끝의 포트 상태와 장비의 IP를 캔버스에서 보고,
So that 콘솔을 열지 않고도 어디가 꺼져 있는지 알 수 있다.

**Acceptance Criteria:**

**Given** 링크가 있을 때
**When** 한쪽 포트를 `shutdown`하면
**Then** 그 끝은 "사용자가 끔", 반대쪽 끝은 "상대 쪽이 꺼짐"으로 색과 모양이 바뀐다 (FR-43, NFR-12)

**Given** 장비에
**When** 마우스를 올리면
**Then** 인터페이스별 IP 주소와 상태가 보인다 (FR-43)

### Story 6.5: 장비 테이블을 패널로 본다

As a 사용자,
I want 장비를 선택하면 그 장비의 테이블을 패널로 보고,
So that 명령어를 몰라도 MAC 주소 테이블과 라우팅 테이블을 볼 수 있다.

**Acceptance Criteria:**

**Given** Switch를 선택했을 때 MAC 주소 테이블과 VLAN 목록이, Router를 선택했을 때 라우팅 테이블과 ARP 테이블이, PC를 선택했을 때
**When** 속성 패널을 보면
**Then** ARP 테이블이 보인다 (FR-44)

**Given** 패널을 연 상태에서
**When** ping을 실행하면
**Then** 패널의 내용이 갱신된다. 재생 위치와 무관하게 현재 상태를 보여 준다 (FR-44, AD-4)

## Epic 7: 예제로 시작하고 파일로 주고받는다

### Story 7.1: 토폴로지를 파일로 내보내고 가져온다

As a 사용자,
I want 토폴로지를 파일로 받고 그 파일을 다시 올리고,
So that 다른 사람과 실습을 주고받을 수 있다.

**Acceptance Criteria:**

**Given** 편집기에서
**When** "내보내기"를 누르면
**Then** `{ kind, name, document }` 형태의 파일이 받아지고 문서 안에 `schemaVersion`이 있다 (FR-7, AD-9)

**Given** 내보낸 파일을
**When** 목록 화면에서 가져오면
**Then** 같은 장비·링크·구성을 가진 새 토폴로지가 만들어진다 (FR-7)

**Given** 형식이 맞지 않거나, 참조가 깨졌거나, 한도를 넘는 파일을
**When** 가져오면
**Then** 거부되고 사유가 표시된다 (FR-7, FR-45)

### Story 7.2: 예제에서 시작한다

As a 사용자,
I want 준비된 예제를 골라 내 토폴로지로 복사하고,
So that 빈 화면에서 시작하지 않고 동작하는 구성을 보며 배울 수 있다.

**Acceptance Criteria:**

**Given** 목록 화면에서
**When** 예제 3종(Switch 1대 LAN, VLAN 2개, Router 2대 Static Routing) 중 하나를 고르면
**Then** 내 토폴로지로 복사되어 편집기가 열린다 (FR-8)

**Given** 예제 파일은
**When** CI에서 `validateDocument()`로 검사하면
**Then** 모두 통과하고, 각 예제의 대표 ping이 성공한다 (FR-8)
