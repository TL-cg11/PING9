# PING9

웹 브라우저에서 네트워크 장비(PC, Switch, Router)를 배치·연결하고, CLI로 설정해 ping의 과정과 실패 원인을 눈으로 확인하는 네트워크 시뮬레이터입니다.

| 내용 | 위치 |
|---|---|
| 지금 진행 중인 목표와 3인 분담 | [docs/project-plan/06-two-pc-ping-plan.md](docs/project-plan/06-two-pc-ping-plan.md) |
| 계획 문서 (요구사항, 설계, 개발 계획) | [docs/project-plan/](docs/project-plan/README.md) |
| 작업 단위(Task) 상세 | [docs/project-plan/04-tasks/](docs/project-plan/04-tasks/) |
| Task별 진행 기록 | [docs/task-logs/](docs/task-logs/README.md) |
| 팀 작업 규칙 | [CLAUDE.md](CLAUDE.md) |

## 시작하기

Node 24와 pnpm 12가 필요합니다.

```bash
corepack enable        # pnpm 명령을 켭니다. 권한 오류가 나면: npm install -g pnpm@12.16.1
pnpm install
pnpm check             # lint, 타입 검사, 테스트, 빌드를 차례로 실행
pnpm dev               # 화면 개발 서버
```

## 구조

| 폴더 | 내용 |
|---|---|
| `packages/shared` | 엔진·화면·서버가 함께 쓰는 타입, 스키마, 예시 자료 |
| `packages/engine` | 시뮬레이션 엔진. 브라우저와 Node의 기능을 쓰지 않는 순수 TypeScript |
| `apps/web` | React 화면 |
| `apps/api` | 인증과 저장을 맡는 서버 |

의존 방향은 `web → engine → shared`, `web → shared`, `api → shared`뿐입니다.
