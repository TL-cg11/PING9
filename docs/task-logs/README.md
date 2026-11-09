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
| T0.5 운영 첫 화면을 편집기 화면으로 바꾸기 (계획에 없는 새 ID) | [T0.5-app-at-root.md](T0.5-app-at-root.md) | 배포 | SDY | 병합됨 (PR #8, 팀원 검토 없이). T0.3 담당자 확인 필요. 시안은 `/mockup.html`에 남김 |
| T0.6 장비 아이콘과 선택 표시 (계획에 없는 새 ID) | [T0.6-device-icons.md](T0.6-device-icons.md) | 화면 | yysong1249 | 병합됨 (PR #25, 팀원 검토 없이) |
| T1.1.1 모노레포와 패키지 뼈대 | [T1.1.1-monorepo-skeleton.md](T1.1.1-monorepo-skeleton.md) | 공통 | SDY | 완료 (검토 없이 병합) |
| T1.1.3 CI 검사와 운영 배포 | [T1.1.3-ci-and-deploy.md](T1.1.3-ci-and-deploy.md) | 배포 | SDY | 일부 완료. CI 동작 중. Actions 배포는 T0.4에서 없앰 (브랜치 보호 남음) |
| T1.2.1 `shared` 타입과 코드 열거형 | [T1.2.1-shared-types.md](T1.2.1-shared-types.md) | 공통 | SDY | 병합됨 (검토 없이). 팀 합의 필요 |
| T1.2.2 Document 스키마와 검증 | [T1.2.2-document-validation.md](T1.2.2-document-validation.md) | 공통 | SDY | 완료 (검토 없이 병합) |
| T1.2.3 예시 자료와 계약 테스트 | [T1.2.3-example-data.md](T1.2.3-example-data.md) | 공통 | SDY | 완료 (검토 없이 병합) |
| T1.2.4 `Simulator` 뼈대 | [T1.2.4-simulator-skeleton.md](T1.2.4-simulator-skeleton.md) | 엔진 | SDY | 완료 (검토 없이 병합) |
| T1.7.1 가상 시계와 사건 큐 커널 | [T1.7.1-kernel.md](T1.7.1-kernel.md) | 엔진 | ssunyoung2 | 구현·검증 완료, [PR #27](https://github.com/TL-cg11/PING9/pull/27) 팀원 검토 대기 |
| T1.4.1 링크 생성·삭제 명령 | [T1.4.1-link-commands.md](T1.4.1-link-commands.md) | 엔진 | ssunyoung2 | 문서 명령 로컬 검증 완료. 런타임 훅과 PR 검토 남음 |
| T1.4.2 케이블 연결·선택·삭제 화면 | [T1.4.2-link-editor.md](T1.4.2-link-editor.md) | 화면 | ssunyoung2 | 선택 창 연결/삭제 로컬 검증 완료. 드래그 연결과 PR 검토 남음 |
| T1.5.1 reducer `pc/set-ip` | [T1.5.1-pc-set-ip.md](T1.5.1-pc-set-ip.md) | 엔진 | yysong1249 | 완료 (PR #3, SDY가 병합). 오류에 값을 담는 함수는 T5.1.1에서 `describeValue`로 맞춤 (담당자 확인함) |
| T1.5.2 PC 설정 패널 | [T1.5.2-pc-panel.md](T1.5.2-pc-panel.md) | 화면 | yysong1249 | 병합됨 (PR #13, SDY가 검토하고 병합) |
| T1.6.1 PC 명령어 (`ipconfig`) | [T1.6.1-pc-commands.md](T1.6.1-pc-commands.md) | 엔진 | yysong1249 | 병합됨 (PR #9, SDY가 검토하고 병합) |
| T1.6.2 콘솔 화면 (키보드로 열고 나오기) | [T1.6.2-console-screen.md](T1.6.2-console-screen.md) | 화면 | yysong1249 | 검토 대기. xterm과 도크 탭 대신 입력란과 떠 있는 창 (계획과 다름) |
| T3.1.1 명령 트리 확장: 모드와 세션 | [T3.1.1-cli-modes-and-session.md](T3.1.1-cli-modes-and-session.md) | 엔진 | SDY | 병합됨 (PR #4, 팀원 검토 없이) |
| T3.1.2 Switch 기본 명령어 | [T3.1.2-switch-basic-commands.md](T3.1.2-switch-basic-commands.md) | 엔진 | SDY | 병합됨 (PR #5, 팀원 검토 없이). `hostname`은 `device/rename` 처리기 대기 |
| T3.2.1 줄임 입력 | [T3.2.1-abbreviations.md](T3.2.1-abbreviations.md) | 엔진 | SDY | 병합됨 (PR #10, 팀원 검토 없이) |
| T3.2.2 Tab 완성과 `?` 도움말 (engine) | [T3.2.2-complete-and-help.md](T3.2.2-complete-and-help.md) | 엔진 | SDY | 병합됨 (PR #11, 팀원 검토 없이) |
| T3.2.3 터미널 창의 Tab과 `?` | [T3.2.3-terminal-tab-and-help.md](T3.2.3-terminal-tab-and-help.md) | 화면 | SDY | 병합됨 (PR #12, 팀원 검토 없이) |
| T3.3.1 인터페이스 모드 | [T3.3.1-interface-mode.md](T3.3.1-interface-mode.md) | 엔진 | SDY | 병합됨 (PR #14, 팀원 검토 없이) |
| T3.3.2 포트 끄기와 켜기 | [T3.3.2-shutdown.md](T3.3.2-shutdown.md) | 엔진 | SDY | 병합됨 (PR #15, 팀원 검토 없이). ping으로 확인하는 부분은 kernel 뒤 |
| T3.4.1 `show running-config`와 왕복 | [T3.4.1-show-running-config.md](T3.4.1-show-running-config.md) | 엔진 | SDY | 병합됨 (PR #22, 팀원 검토 없이). Switch만 |
| T3.4.2 `show mac address-table` | [T3.4.2-show-mac-address-table.md](T3.4.2-show-mac-address-table.md) | 엔진 | SDY | 병합됨 (PR #23, 팀원 검토 없이). 테이블이 채워지는 것은 kernel 뒤 |
| T3.5.1 CLI 오류 분류 | [T3.5.1-cli-errors.md](T3.5.1-cli-errors.md) | 엔진 | SDY | 병합됨 (PR #20, 팀원 검토 없이) |
| T3.5.2 터미널 창의 오류 위치 표시 | [T3.5.2-terminal-error-marker.md](T3.5.2-terminal-error-marker.md) | 화면 | SDY | 병합됨 (PR #21, 팀원 검토 없이) |
| T4.1.1 Router 생성과 기본 CLI 연결 | [T4.1.1-router-model.md](T4.1.1-router-model.md) | 엔진, 화면 | ssunyoung2 | 생성·CLI 부분 로컬 검증 완료. 프로토콜 모델 조립과 PR 검토 남음 |
| T5.1.1 VLAN 구성 | [T5.1.1-vlan-config.md](T5.1.1-vlan-config.md) | 엔진, 공통 | SDY | 병합됨 (PR #6, 팀원 검토 없이). `shared` 변경은 팀 확인 필요. 직렬화는 T3.4.1에서 |
| T5.2.1 access 포트와 VLAN 분리 | [T5.2.1-access-ports.md](T5.2.1-access-ports.md) | 엔진, 공통, 화면 | SDY | 병합됨 (PR #17, 팀원 검토 없이). `shared` 변경은 팀 확인 필요. ping으로 확인하는 부분은 kernel 뒤 |
| T5.3.1 trunk 포트와 허용 목록 | [T5.3.1-trunk-ports.md](T5.3.1-trunk-ports.md) | 엔진, 화면 | SDY | 병합됨 (PR #18, 팀원 검토 없이). ping으로 확인하는 부분은 kernel 뒤 |
| T5.3.2 `show interfaces trunk` | [T5.3.2-show-interfaces-trunk.md](T5.3.2-show-interfaces-trunk.md) | 엔진 | SDY | 병합됨 (PR #19, 팀원 검토 없이) |
| T5.4.1 Switch 화면 (계획에 없는 새 ID) | [T5.4.1-switch-screen.md](T5.4.1-switch-screen.md) | 화면 | SDY | 병합됨 (PR #7, 팀원 검토 없이). 운영 첫 화면은 T0.5에서 바꿈 |
| T1.7.3 Switch의 전달 규칙 (kernel 없이 되는 부분) | [T1.7.3-switch-forwarding.md](T1.7.3-switch-forwarding.md) | 엔진 | SDY | 일부 병합됨 (PR #16, 팀원 검토 없이). kernel 연결 남음 |
| T1.7.2 Ethernet 포트와 링크 전달 | [T1.7.2-link-transfer.md](T1.7.2-link-transfer.md) | 엔진 | SDY | 병합됨 ([PR #33](https://github.com/TL-cg11/PING9/pull/33), 팀원 검토 없이) |
