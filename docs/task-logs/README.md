# Task 진행 기록

Task 하나를 진행할 때마다 이 폴더에 기록 문서를 **새로** 만듭니다. 진행 방식, 결과, 검증 출력, 계획과 달라진 점을 남겨 다른 팀원이 코드를 읽지 않고도 무엇이 어떻게 끝났는지 알 수 있게 합니다.

## 규칙

- 파일 이름: `<Task ID>-<짧은-영문-설명>.md` (예: `T1.3.1-device-commands.md`)
- 형식: [_TEMPLATE.md](_TEMPLATE.md)를 복사해 채웁니다.
- Task ID는 [04-tasks/](../project-plan/04-tasks/)의 것을 씁니다. 계획에 없던 작업은 `T0.x` 번호를 씁니다.
- 기록 문서는 그 Task의 코드와 같은 Pull Request에 넣고, 아래 목록에 한 줄을 추가합니다.
- Task 하나에 문서 하나입니다. 끝난 기록 문서에 다른 Task를 이어 쓰지 않습니다.

## 목록

| Task | 문서 | 영역 | 담당 | 상태 |
|---|---|---|---|---|
| T0.1 저장소와 배포 연결 | [T0.1-repo-and-deploy-setup.md](T0.1-repo-and-deploy-setup.md) | 배포 | SDY | 완료 |
| T0.4 저장소 공개 전환과 Vercel Git 연동 배포 | [T0.4-public-repo-and-git-deploy.md](T0.4-public-repo-and-git-deploy.md) | 배포 | SDY | 진행 중. 저장소 이전, 공개, Vercel 연결은 끝남 (팀원이 직접 병합했을 때의 배포 확인 남음) |
| T1.1.1 모노레포와 패키지 뼈대 | [T1.1.1-monorepo-skeleton.md](T1.1.1-monorepo-skeleton.md) | 공통 | SDY | 완료 (검토 없이 병합) |
| T1.1.3 CI 검사와 운영 배포 | [T1.1.3-ci-and-deploy.md](T1.1.3-ci-and-deploy.md) | 배포 | SDY | 일부 완료. CI 동작 중. Actions 배포는 T0.4에서 없앰 (브랜치 보호 남음) |
| T1.2.1 `shared` 타입과 코드 열거형 | [T1.2.1-shared-types.md](T1.2.1-shared-types.md) | 공통 | SDY | 병합됨 (검토 없이). 팀 합의 필요 |
| T1.2.2 Document 스키마와 검증 | [T1.2.2-document-validation.md](T1.2.2-document-validation.md) | 공통 | SDY | 완료 (검토 없이 병합) |
| T1.2.3 예시 자료와 계약 테스트 | [T1.2.3-example-data.md](T1.2.3-example-data.md) | 공통 | SDY | 완료 (검토 없이 병합) |
| T1.2.4 `Simulator` 뼈대 | [T1.2.4-simulator-skeleton.md](T1.2.4-simulator-skeleton.md) | 엔진 | SDY | 완료 (검토 없이 병합) |
| T1.5.1 reducer `pc/set-ip` | [T1.5.1-pc-set-ip.md](T1.5.1-pc-set-ip.md) | 엔진 | yysong1249 | 검토 대기 |
| T3.1.1 명령 트리 확장: 모드와 세션 | [T3.1.1-cli-modes-and-session.md](T3.1.1-cli-modes-and-session.md) | 엔진 | SDY | 구현 완료. PR과 검토 남음 |
| T3.1.2 Switch 기본 명령어 | [T3.1.2-switch-basic-commands.md](T3.1.2-switch-basic-commands.md) | 엔진 | SDY | 구현 완료. PR과 검토 남음 (`hostname`은 `device/rename` 처리기 대기) |
| T5.1.1 VLAN 구성 | [T5.1.1-vlan-config.md](T5.1.1-vlan-config.md) | 엔진, 공통 | SDY | 구현 완료. PR과 검토 남음 (`shared` 변경은 팀 확인 필요. 직렬화는 T3.4.1에서) |
| T5.4.1 Switch 화면 (계획에 없는 새 ID) | [T5.4.1-switch-screen.md](T5.4.1-switch-screen.md) | 화면 | SDY | 구현 완료. PR과 검토 남음 (운영 주소에서는 아직 보이지 않음) |
