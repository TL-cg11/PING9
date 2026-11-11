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
| T0.7 Windows·Linux PC (계획에 없는 새 ID. 첫 회의의 목표) | [T0.7-pc-os.md](T0.7-pc-os.md) | 엔진, 화면 | yysong1249 | 병합됨 ([PR #29](https://github.com/TL-cg11/PING9/pull/29)) |
| T0.8 케이블 그림 (계획에 없는 새 ID) | [T0.8-cable-look.md](T0.8-cable-look.md) | 화면 | yysong1249 | 병합됨 ([PR #35](https://github.com/TL-cg11/PING9/pull/35)). 포트 이름 위치 후속은 T6.1.2 PR |
| T0.9 PC 콘솔의 입력 규칙과 help (계획에 없는 새 ID. T0.7 후속) | [T0.9-pc-input-rules.md](T0.9-pc-input-rules.md) | 엔진, 공통 | yysong1249 | 검토 대기 ([PR #39](https://github.com/TL-cg11/PING9/pull/39)) |
| T1.1.1 모노레포와 패키지 뼈대 | [T1.1.1-monorepo-skeleton.md](T1.1.1-monorepo-skeleton.md) | 공통 | SDY | 완료 (검토 없이 병합) |
| T1.1.3 CI 검사와 운영 배포 | [T1.1.3-ci-and-deploy.md](T1.1.3-ci-and-deploy.md) | 배포 | SDY | 일부 완료. CI 동작 중. Actions 배포는 T0.4에서 없앰 (브랜치 보호 남음) |
| T1.2.1 `shared` 타입과 코드 열거형 | [T1.2.1-shared-types.md](T1.2.1-shared-types.md) | 공통 | SDY | 병합됨 (검토 없이). 팀 합의 필요 |
| T1.2.2 Document 스키마와 검증 | [T1.2.2-document-validation.md](T1.2.2-document-validation.md) | 공통 | SDY | 완료 (검토 없이 병합) |
| T1.2.3 예시 자료와 계약 테스트 | [T1.2.3-example-data.md](T1.2.3-example-data.md) | 공통 | SDY | 완료 (검토 없이 병합) |
| T1.2.4 `Simulator` 뼈대 | [T1.2.4-simulator-skeleton.md](T1.2.4-simulator-skeleton.md) | 엔진 | SDY | 완료 (검토 없이 병합) |
| T1.7.1 가상 시계와 사건 큐 커널 | [T1.7.1-kernel.md](T1.7.1-kernel.md) | 엔진 | ssunyoung2 | 구현·검증 완료, [PR #27](https://github.com/TL-cg11/PING9/pull/27) 팀원 검토 대기 |
| T1.3.2 장비 드래그 배치·이동과 포트 선택 연결 | [T1.3.2-drag-editor.md](T1.3.2-drag-editor.md) | 화면, 엔진 | ssunyoung2 | 로컬 구현·검증 완료, PR/팀원 검토 대기 |
| T1.3.2 후속: 실습 확대·축소 버튼 | [T1.3.2-canvas-zoom.md](T1.3.2-canvas-zoom.md) | 화면 | ssunyoung2 | 로컬 구현·검증 완료, PR/팀원 검토 대기 |
| T1.8.1 ARP 모듈 | [T1.8.1-arp.md](T1.8.1-arp.md) | 엔진 | yysong1249 | 병합됨 ([PR #30](https://github.com/TL-cg11/PING9/pull/30)) |
| T1.8.2 IPv4 호스트 처리와 ICMP echo | [T1.8.2-ipv4-icmp.md](T1.8.2-ipv4-icmp.md) | 엔진 | yysong1249 | 병합됨 ([PR #32](https://github.com/TL-cg11/PING9/pull/32)) |
| T1.8.3 PC 모델과 `ping` 명령어 | [T1.8.3-pc-ping.md](T1.8.3-pc-ping.md) | 엔진 | yysong1249 | 병합됨 ([PR #34](https://github.com/TL-cg11/PING9/pull/34), 회차를 하나씩 보이기와 Ctrl+C는 [PR #37](https://github.com/TL-cg11/PING9/pull/37)) |
| T1.4.1 링크 생성·삭제 명령 | [T1.4.1-link-commands.md](T1.4.1-link-commands.md) | 엔진 | ssunyoung2 | 문서 명령 로컬 검증 완료. 런타임 훅과 PR 검토 남음 |
| T1.4.2 케이블 연결·선택·삭제 화면 | [T1.4.2-link-editor.md](T1.4.2-link-editor.md) | 화면 | ssunyoung2 | 선택 창 연결/삭제 로컬 검증 완료. 드래그 연결과 PR 검토 남음 |
| T1.5.1 reducer `pc/set-ip` | [T1.5.1-pc-set-ip.md](T1.5.1-pc-set-ip.md) | 엔진 | yysong1249 | 완료 (PR #3, SDY가 병합). 오류에 값을 담는 함수는 T5.1.1에서 `describeValue`로 맞춤 (담당자 확인함) |
| T1.5.2 PC 설정 패널 | [T1.5.2-pc-panel.md](T1.5.2-pc-panel.md) | 화면 | yysong1249 | 병합됨 (PR #13, SDY가 검토하고 병합) |
| T1.6.1 PC 명령어 (`ipconfig`) | [T1.6.1-pc-commands.md](T1.6.1-pc-commands.md) | 엔진 | yysong1249 | 병합됨 (PR #9, SDY가 검토하고 병합) |
| T1.6.2 콘솔 화면 (키보드로 열고 나오기) | [T1.6.2-console-screen.md](T1.6.2-console-screen.md) | 화면 | yysong1249 | 병합됨 ([PR #26](https://github.com/TL-cg11/PING9/pull/26)). xterm과 도크 탭 대신 입력란과 떠 있는 창 (계획과 다름) |
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
| T4.1.2 Router 인터페이스 IP 설정 | [T4.1.2-router-ip.md](T4.1.2-router-ip.md) | 엔진, 공통 | ssunyoung2 | 로컬 구현·검증 완료, PR/팀원 검토 대기 |
| T4.1.3 직접 연결 라우팅 테이블 | [T4.1.3-connected-routes.md](T4.1.3-connected-routes.md) | 엔진, 공통 | ssunyoung2 | 구현·개별 검증 완료, PR/팀원 검토 대기 |
| T4.2.1 Router 패킷 수신·전달 | [T4.2.1-router-forwarding.md](T4.2.1-router-forwarding.md) | 엔진, 공통 | ssunyoung2 | 로컬 구현·개별 검사 완료, 리뷰 대기 |
| T4.2.2 Router ping·ARP 명령 | [T4.2.2-router-network-cli.md](T4.2.2-router-network-cli.md) | 엔진 | ssunyoung2 | 로컬 구현·개별 검사 완료, 리뷰 대기 |
| T4.4.1 Router ICMP 오류 응답 | [T4.4.1-router-icmp-errors.md](T4.4.1-router-icmp-errors.md) | 엔진, 공통 | ssunyoung2 | 로컬 구현·개별 검사 완료, 리뷰 대기 |
| T4.3.1 정적 경로 설정과 활성화 | [T4.3.1-static-routes.md](T4.3.1-static-routes.md) | 엔진, 공통 | ssunyoung2 | 구현·개별 검증 완료, PR/팀원 검토 대기 |
| T4.3.2 목적지 경로 선택 | [T4.3.2-route-lookup.md](T4.3.2-route-lookup.md) | 엔진 | ssunyoung2 | 로컬 구현·전체 검증 완료, PR/팀원 검토 대기 |
| T4.3.2 후속: 전송·PC ping main 통합 | [T4.3.2-runtime-main-merge.md](T4.3.2-runtime-main-merge.md) | 엔진 | ssunyoung2 | 로컬 병합·검증 완료, PR/팀원 검토 대기 |
| T4.3.3 라우터 실습 통합 검사·안내 | [T4.3.3-router-lab.md](T4.3.3-router-lab.md) | 엔진, 문서 | ssunyoung2 | 요청 범위 로컬 검증 완료, Switch 포함 예시는 후속 |
| T5.1.1 VLAN 구성 | [T5.1.1-vlan-config.md](T5.1.1-vlan-config.md) | 엔진, 공통 | SDY | 병합됨 (PR #6, 팀원 검토 없이). `shared` 변경은 팀 확인 필요. 직렬화는 T3.4.1에서 |
| T5.2.1 access 포트와 VLAN 분리 | [T5.2.1-access-ports.md](T5.2.1-access-ports.md) | 엔진, 공통, 화면 | SDY | 병합됨 (PR #17, 팀원 검토 없이). `shared` 변경은 팀 확인 필요. ping으로 확인하는 부분은 kernel 뒤 |
| T5.3.1 trunk 포트와 허용 목록 | [T5.3.1-trunk-ports.md](T5.3.1-trunk-ports.md) | 엔진, 화면 | SDY | 병합됨 (PR #18, 팀원 검토 없이). ping으로 확인하는 부분은 kernel 뒤 |
| T5.3.2 `show interfaces trunk` | [T5.3.2-show-interfaces-trunk.md](T5.3.2-show-interfaces-trunk.md) | 엔진 | SDY | 병합됨 (PR #19, 팀원 검토 없이) |
| T5.4.1 Switch 화면 (계획에 없는 새 ID) | [T5.4.1-switch-screen.md](T5.4.1-switch-screen.md) | 화면 | SDY | 병합됨 (PR #7, 팀원 검토 없이). 운영 첫 화면은 T0.5에서 바꿈 |
| T1.7.3 Switch의 전달 규칙 (kernel 없이 되는 부분) | [T1.7.3-switch-forwarding.md](T1.7.3-switch-forwarding.md) | 엔진 | SDY | 일부 병합됨 (PR #16, 팀원 검토 없이). kernel 연결은 T5.2.2 |
| T1.7.2 Ethernet 포트와 링크 전달 | [T1.7.2-link-transfer.md](T1.7.2-link-transfer.md) | 엔진 | SDY | 병합됨 ([PR #33](https://github.com/TL-cg11/PING9/pull/33), 팀원 검토 없이) |
| T5.2.2 Switch 모델: kernel 연결 | [T5.2.2-switch-model.md](T5.2.2-switch-model.md) | 엔진 | SDY | 병합됨 ([PR #36](https://github.com/TL-cg11/PING9/pull/36), 팀원 검토 없이). 계획의 T5.2.2(문구)와 다름: 설계 9절 18번 |
| T6.1.1 재생 단계 계산 | [T6.1.1-replay-steps.md](T6.1.1-replay-steps.md) | 화면 | yysong1249 | 검토 대기 ([PR #38](https://github.com/TL-cg11/PING9/pull/38), T6.1.2와 같은 PR) |
| T6.1.2 캔버스 위 프레임 그리기 (펭귄) | [T6.1.2-packet-walk.md](T6.1.2-packet-walk.md) | 화면 | yysong1249 | 검토 대기 ([PR #38](https://github.com/TL-cg11/PING9/pull/38)) |
| T4.3.3 Switch·Router 통합 | [T4.3.3-switch-runtime-merge.md](T4.3.3-switch-runtime-merge.md) | 엔진·공통 | ssunyoung2 | 로컬 통합 검증 |
| T11.2.1 RIP 구성과 명령어 | [T11.2.1-rip-config.md](T11.2.1-rip-config.md) | 엔진, 공통 | yysong1249 | 검토 대기 ([PR #41](https://github.com/TL-cg11/PING9/pull/41)) |
| T11.1.1 경로 출처와 AD | [T11.1.1-route-distance.md](T11.1.1-route-distance.md) | 엔진, 공통 | yysong1249 | 검토 대기 ([PR #42](https://github.com/TL-cg11/PING9/pull/42), PR #41 위) |
| T11.2.2 RIP 모듈 (경로 주고받기와 배우기) | [T11.2.2-rip-module.md](T11.2.2-rip-module.md) | 엔진, 공통 | yysong1249 | 검토 대기 ([PR #44](https://github.com/TL-cg11/PING9/pull/44), T11.2.3과 같은 PR) |
| T11.2.3 경로 교환을 저절로 실행하고 보관하기 | [T11.2.3-route-exchange-run.md](T11.2.3-route-exchange-run.md) | 엔진, 공통, 화면 | yysong1249 | 검토 대기 ([PR #44](https://github.com/TL-cg11/PING9/pull/44), T11.2.2와 같은 PR) |
| T11.2.4 RIP 확인 명령어 | [T11.2.4-rip-show.md](T11.2.4-rip-show.md) | 엔진 | yysong1249 | 검토 대기 ([PR #45](https://github.com/TL-cg11/PING9/pull/45), T11.3.1과 같은 PR) |
| T11.3.1 링크가 끊기면 경로가 바뀐다 (재수렴) | [T11.3.1-reconverge.md](T11.3.1-reconverge.md) | 엔진, 공통 | yysong1249 | 검토 대기 ([PR #45](https://github.com/TL-cg11/PING9/pull/45), T11.2.4와 같은 PR) |
| T1.8.3 버그 수정: 한글 입력 상태의 Ctrl+C | [T1.8.3-ctrl-c-korean-fix.md](T1.8.3-ctrl-c-korean-fix.md) | 화면 | yysong1249 | 검토 대기 ([PR #43](https://github.com/TL-cg11/PING9/pull/43)) |
| T0.9 캔버스 이동·표시 순서·터미널 경계 | [T0.9-canvas-navigation.md](T0.9-canvas-navigation.md) | 화면 | ssunyoung2 | [PR #46](https://github.com/TL-cg11/PING9/pull/46) 리뷰 대기 |
| T0.10 터미널 네 면 조절·휠 확대 | [T0.10-terminal-resize-wheel.md](T0.10-terminal-resize-wheel.md) | 화면 | ssunyoung2 | [PR #46](https://github.com/TL-cg11/PING9/pull/46) 리뷰 대기 |
| T0.10 최신 메인 통합 | [T0.10-latest-main-sync.md](T0.10-latest-main-sync.md) | 화면·통합 | ssunyoung2 | [PR #46](https://github.com/TL-cg11/PING9/pull/46) 리뷰 대기 |
| T4.4.1 Router 자체 순환 ping·재생 지연 수정 | [T4.4.1-router-loop-ping.md](T4.4.1-router-loop-ping.md) | 엔진·화면 | ssunyoung2 | [PR #46](https://github.com/TL-cg11/PING9/pull/46) 리뷰 대기 |
| T11.4.1 traceroute (계획에 없는 새 ID) | [T11.4.1-traceroute.md](T11.4.1-traceroute.md) | 엔진·공통 | yysong1249 | 검토 대기 ([PR #47](https://github.com/TL-cg11/PING9/pull/47)) |
| T0.11 처음 화면을 빈 캔버스로 (계획에 없는 새 ID) | [T0.11-empty-start.md](T0.11-empty-start.md) | 화면 | SDY | 병합됨 ([PR #48](https://github.com/TL-cg11/PING9/pull/48), 팀원 검토 없이) |
| T1.3.3 이름 변경, 삭제 (T1.4.3 삭제 확인, T1.3.1의 `device/rename` 포함) | [T1.3.3-rename-delete.md](T1.3.3-rename-delete.md) | 엔진·화면 | SDY | 진행 중 |
| T0.12 끌던 것을 장비 목록에 놓아 취소 (계획에 없는 새 ID) | [T0.12-drag-cancel.md](T0.12-drag-cancel.md) | 화면 | SDY | 진행 중 (T1.3.3과 같은 PR) |
