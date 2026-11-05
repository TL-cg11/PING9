# PING9

웹 브라우저에서 네트워크 장비를 배치·연결하고 CLI로 설정해 통신을 실습하는 네트워크 시뮬레이터. 3인 팀 프로젝트.

- 저장소: https://github.com/TL-cg11/PING9 (**공개**). 2026-11-05에 새로 만든 저장소이고, 그 전의 저장소는 비공개 `TL-cg11/PING9-archive`로 남아 있다 (옛 PR #1 ~ #4가 거기 있음).
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
5. **커밋 메시지와 Pull Request 제목·설명은 영어로 쓴다.** `Co-Authored-By: Claude ...`, "Generated with Claude Code" 같은 AI 표시 줄을 넣지 않는다. 문서 본문은 한국어로 쓴다.
6. 계획 문서와 다르게 구현했으면 기록 문서의 "계획과 달라진 점"에 적는다. 계획 문서 본문은 팀이 합의한 뒤에 고친다.

## 검사와 배포

- PR을 올리면 GitHub Actions의 `check`가 돈다: 비밀값 형태 검사, 취약점 검사, lint, 타입 검사, 테스트, 빌드. 올리기 전에 `pnpm check`와 `pnpm check:secrets`로 미리 본다.
- `main`에 들어온 커밋에도 같은 검사가 돈다. 배포는 Actions가 아니라 Vercel의 Git 연동이 한다. 저장소가 공개여야 팀원의 커밋이 배포된다. 이유와 경과는 [docs/task-logs/T0.4-public-repo-and-git-deploy.md](docs/task-logs/T0.4-public-repo-and-git-deploy.md).
- 비밀값(토큰, DB 주소, `.env` 파일)은 저장소에 넣지 않는다. Vercel 환경 변수에만 둔다. 저장소가 공개이므로 커밋한 내용은 누구나 본다.
- 커밋에는 개인 이메일 대신 GitHub의 noreply 주소를 쓴다. GitHub 설정의 Emails에서 "Keep my email addresses private"와 "Block command line pushes that expose my email"을 켜고, `git config user.email`을 그 화면에 나오는 `<숫자>+<아이디>@users.noreply.github.com`으로 맞춘다.
- 2026-11-05 전에 받은 폴더에서는 push하지 않는다. 옛 커밋이 공개 저장소에 올라간다. 저장소를 새로 받는다.

## 계획 문서와 달라진 결정

[docs/task-logs/T0.1-repo-and-deploy-setup.md](docs/task-logs/T0.1-repo-and-deploy-setup.md)에 기록. 요약: 배포를 "VM 한 대 + Docker Compose + Caddy"에서 **Vercel**로, DB를 "PostgreSQL 컨테이너"에서 **Vercel Marketplace의 무료 Postgres**로 바꿨다. 03 문서 3.10절과 Story 2.2의 Task는 아직 옛 내용이다.
