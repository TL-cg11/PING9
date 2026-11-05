# PING9

웹 브라우저에서 네트워크 장비를 배치·연결하고 CLI로 설정해 통신을 실습하는 네트워크 시뮬레이터. 3인 팀 프로젝트.

- 저장소: https://github.com/TL-cg11/PING9
- 배포: Vercel 프로젝트 `ping9`, 운영 주소 https://ping9.vercel.app. `main`에 push하면 자동 배포.
- DB: Vercel Marketplace의 Neon `ping9-db` (PostgreSQL 18, 무료 플랜, 싱가포르). 운영 환경에만 연결. 접속 주소는 Vercel 환경 변수 `DATABASE_URL`에 있고 저장소에 넣지 않는다.
- 계획 문서: [docs/project-plan/README.md](docs/project-plan/README.md) — 문서의 "PacketTracer WEB"은 이 프로젝트의 옛 이름
- 작업 단위 상세: [docs/project-plan/04-tasks/](docs/project-plan/04-tasks/)
- 규칙 문서(AD): `_bmad-output/planning-artifacts/architecture/architecture-PacketTracer-WEB-2026-11-05/ARCHITECTURE-SPINE.md`

## 반드시 지킬 작업 규칙

1. **Task 하나를 진행할 때마다 기록 문서를 새로 만든다.** 위치는 `docs/task-logs/`, 파일 이름은 `<Task ID>-<짧은-영문-설명>.md`, 형식은 [docs/task-logs/_TEMPLATE.md](docs/task-logs/_TEMPLATE.md). 진행 방식, 결과, 검증 출력, 계획과 달라진 점을 적는다. 기존 기록 문서에 다른 Task를 이어 쓰지 않는다.
2. 기록 문서는 그 Task의 코드와 **같은 Pull Request**에 넣고, [docs/task-logs/README.md](docs/task-logs/README.md)의 목록에 한 줄을 추가한다.
3. Task마다 브랜치를 만든다: `feat/<Task ID>-<설명>` (예: `feat/T1.3.1-device-commands`). `main`에는 Pull Request로만 넣고, 다른 팀원 한 명이 검토한다.
4. 완료 판단은 [개발 계획 4.3절의 공통 완료 조건](docs/project-plan/04-development-plan.md#43-분해-구조-읽는-법)을 따른다.
5. 계획 문서와 다르게 구현했으면 기록 문서의 "계획과 달라진 점"에 적는다. 계획 문서 본문은 팀이 합의한 뒤에 고친다.

## 계획 문서와 달라진 결정

[docs/task-logs/T0.1-repo-and-deploy-setup.md](docs/task-logs/T0.1-repo-and-deploy-setup.md)에 기록. 요약: 배포를 "VM 한 대 + Docker Compose + Caddy"에서 **Vercel**로, DB를 "PostgreSQL 컨테이너"에서 **Vercel Marketplace의 무료 Postgres**로 바꿨다. 03 문서 3.10절과 Story 2.2의 Task는 아직 옛 내용이다.
