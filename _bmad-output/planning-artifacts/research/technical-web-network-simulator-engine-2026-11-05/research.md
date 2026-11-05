---
title: 'technical research: 웹 기반 네트워크 시뮬레이터 실행 엔진'
type: 'technical'
topic: '웹 기반 네트워크 시뮬레이터 실행 엔진'
decision: '실행 엔진 방식 선택 — 브라우저 시뮬레이션 / 서버 에뮬레이션 / 하이브리드 (2인·4주 MVP, 예산 거의 없음, 수강생 수십 명)'
source: 'native run'
status: complete
preset: 'standard'
validation: 'normal'
created: '2026-11-05'
updated: '2026-11-05'
claims_verified: 3
claims_unverified: 9
claims_disputed: 1
---

# technical research: 웹 기반 네트워크 시뮬레이터 실행 엔진

**Decision this research serves:** 실행 엔진 방식 선택 — 브라우저 시뮬레이션 / 서버 에뮬레이션 / 하이브리드 (2인·4주 MVP, 예산 거의 없음, 수강생 수십 명)

팀이 읽는 결정 문서는 `docs/project-plan/01-technical-validation.md`입니다. 이 파일은 그 문서의 근거 원장입니다. 출처 번호는 두 문서가 같습니다.

## 요약

**결론: 4주 MVP는 브라우저 중심 시뮬레이션(자체 엔진)으로 만든다.** 서버 에뮬레이션(FRRouting 컨테이너)은 차점이며, 3차 이후 확장 후보로 남긴다.

결론을 이끈 발견은 세 가지다.

1. 서버 에뮬레이션은 수강생이 조작하는 컨테이너에 `NET_ADMIN`을 줘야 하고 [34][36], 조사한 실습 플랫폼은 모두 신뢰할 수 있는 운영자를 전제로 한다 [10][11][12]. 격리 계층을 직접 만들어야 한다.
2. VyOS는 1.3.x가 지원 종료이고 [23], 1.4 이상은 문서상 인스턴스당 RAM 4GB다 [24][44].
3. Cisco Packet Tracer 자체가 단순화한 모델을 쓰는 시뮬레이터이고 [1], 브라우저 전용 선례(GEduNet)가 있다 [2].

가장 큰 단서: GEduNet은 4명이 약 9.5개월 걸렸다 [54]. 4주 MVP는 범위를 좁혀야 하고, 2인의 구현 속도는 측정된 적이 없다.

검증 수준: 핵심 주장 13개 중 독립 출처로 확인된 것은 3개, 불일치 1개, 나머지 9개는 1차 출처 하나에 기댄다. 실행 검증은 하지 않았다.

## 1. 서버 에뮬레이션 구성요소

- 네트워크 네임스페이스 생성은 소유 사용자 네임스페이스 안의 `CAP_SYS_ADMIN`을 요구한다. 비특권 프로세스도 사용자 네임스페이스를 만들면 그 안에서 권한을 가진다 [18].
- 인터페이스 구성과 라우팅 테이블 변경은 `CAP_NET_ADMIN`의 범위다 [36]. Docker는 이 권한을 기본으로 주지 않는다 [34].
- FRRouting 현행 안정판은 10.7.1 (2026-08-31), 공식 이미지는 `quay.io/frrouting/frr` [19]. Linux에서 OSPFv2/v3, BGP, RIPv2, IS-IS, EIGRP, VRRP 등을 지원한다 [21]. 컴파일 결과물은 GPLv2 이상으로 배포 가능하다는 것이 프로젝트의 설명이다 [20].
- FRRouting은 인스턴스당 메모리 수치를 공개하지 않는다 [21]. 컨테이너 실행 예시는 `NET_ADMIN`과 `SYS_ADMIN`을 함께 준다 (신뢰도: 중, Docker사 이미지 문서) [22].
- VyOS 1.3.x 계열은 지원 종료, 마지막 릴리스 1.3.8 [23]. 최소 사양은 1.3 문서가 512MiB·2GiB [45], 1.4와 rolling 문서가 4GB·10GB [24][44]. 제3자 안내서는 2GB라고 적는다 (신뢰도: 낮음) [46]. 불일치.
- VyOS LTS 이미지는 구독자·기여자·비영리·학술기관 등에 한정, rolling과 Stream은 공개 [24]. 컨테이너 실행은 ISO에서 직접 변환하고 `--privileged`로 실행한다 [25]. 1.4부터 nftables 기반 (신뢰도: 중, 검색 요약) [26].

## 2. 실습 플랫폼

- containerlab: BSD-3-Clause, v0.82.0 (2026-10-23, 신뢰도: 중상) [8]. `frr`, `linux`, `bridge`는 컨테이너, VyOS는 VM 형태 [9]. `sudo` 필요, `clab_admins` 구성원은 사실상 root와 동등 [10].
- clab-api-server: Apache-2.0, root로 실행, 사용자 인증은 Linux 계정(PAM) [11].
- GNS3: GPL-3.0 [13]. controller·compute 구조와 REST API [12]. Dynamips, QEMU/KVM, Docker, VPCS를 구동 [13]. 안정판 표시 2.2.61, 3.1.0은 알파이며 프로젝트 소유 기반 사용자 격리가 알파에서 추가되는 중 (신뢰도: 중상) [14]. 2.x 설계 문서는 기본 인증과 VPN만 안내 [12].
- 자원: FRR 컨테이너 유휴 약 30MB (표본 2개, 업체 블로그, 신뢰도: 낮음) [15]. FRR 실습 호스트 최소 2GB 권장 (검색 요약) [16]. EVE-NG는 VT-x/EPT 필요 (검색 요약) [17].
- 다중 사용자 웹 서비스의 백엔드로 containerlab을 쓴 사례는 찾지 못했다.

## 3. 브라우저 시뮬레이션

- Cisco Packet Tracer는 단순화한 프로토콜·IOS 모델을 쓰고 실제 장비 기능의 일부만 지원한다 [1].
- GEduNet: MIT, 브라우저 전용 TypeScript. ARP, MAC 학습, Static Routing, ICMP echo, TCP, HTTP를 구현. VLAN, 서브넷·게이트웨이, Dynamic Routing 없음 [2]. 기여자 4명, 커밋 185개, 2024-09-23 생성, 마지막 푸시 2025-07-06 [54].
- NetSim Community Edition은 Rust·WebAssembly 엔진과 React Flow를 쓴다고 자체 설명한다. AGPL-3.0, 커밋 5개 (신뢰도: 낮음) [3].
- v86은 한 페이지 안의 게스트끼리 이더넷을 연결할 수 있으나 성능·메모리 수치가 없다 [4]. container2wasm은 실험적 소프트웨어이며 브라우저 네트워킹은 외부 접속용만 문서화한다 [5]. 브라우저에서 라우팅 데몬을 돌린 사례는 찾지 못했다 (검색 1회).
- React Flow는 MIT [6], 표시 배지 제거는 Pro 구독자에 한정 (신뢰도: 중) [52]. xterm.js 6.0.0 [7], MIT 형식 라이선스 [51]. Cytoscape.js 3.34.4, MIT [53].

## 4. 라이선스와 상표

- GNS3는 법적 이유로 Cisco 이미지를 제공하지 않는다 [27]. Cisco 약관 원문은 읽지 못했다.
- Cisco Packet Tracer는 Networking Academy 관련 용도로만 쓸 수 있다 (2025-09-10 개정) [28].
- "Packet Tracer"는 Cisco 공개 상표 목록에 없으나 목록은 전부가 아니라고 밝힌다. "IOS"와 "Cisco IOS"는 등록 상표로 올라 있다 [29]. 정책은 Cisco 상표·이름을 타사 제품명의 일부로 쓰지 말라고 한다 (2009년 문서) [30].
- 등록부(USPTO, WIPO, EUIPO, KIPRIS)는 직접 읽지 못했다. 한 단어 "PACKETTRACER" 미국 출원(2003)이 2008년 포기 상태라는 기록만 검색 요약으로 확인했다 (신뢰도: 중) [50].
- Cisco v. Arista: 배심이 scènes à faire 항변을 근거로 Arista 면책. 2018-08 합의 [31]. 연방항소법원의 제한적 환송 후 1심이 2018-10-01 판결 취소 [43].
- VyOS: 이름은 등록 상표, VyOS 이름의 이미지 배포를 원하지 않는다는 회사 입장 [32].
- GPL: 배포 없이 서버에서 실행만 하면 소스 공개 의무 없음 [33].

## 5. 격리, 보안, 호스팅

- `--privileged`는 모든 권한을 준다. `NET_ADMIN`·`SYS_ADMIN`은 기본 미부여, `NET_RAW`는 기본 부여 [34]. Docker는 필요한 권한 외 제거를 권고한다 [35]. `CAP_SYS_ADMIN`은 범위가 매우 넓다 [36].
- Kubernetes Baseline·Restricted는 `NET_ADMIN` 추가를 허용하지 않는다. 샌드박스 런타임을 쓰면 권한 제한의 필요가 줄어든다고 적는다 [37].
- gVisor는 사용자 공간 네트워크 스택을 쓴다. veth·bridge·원시 소켓 지원은 사용자 안내서에 없다 [38]. Firecracker는 `/dev/kvm`이 필요하다 [39].
- Docker bridge는 기본으로 외부 접속을 허용하고, 같은 bridge의 컨테이너는 서로 열려 있다 [40].
- WebSocket 콘솔: Origin 검증, 인증 후 제공, 동작별 권한 확인, `wss://` [41].
- veth 생성 권한 검사 누락 취약점 CVE-2026-31692 (신뢰도: 중, 검색 요약) [42].
- Oracle Cloud Always Free: Arm 합계 2 OCPU·12GB, AMD 1GB 2대, 유휴 분류 규칙 있음 [47]. Cloud Run은 특권 컨테이너와 권한 추가 불가 [48]. Railway는 `NET_ADMIN` 불가라는 직원 답변 (신뢰도: 낮음, 포럼) [49].

## 6. 교차 분석

- 예산은 서버 에뮬레이션을 탈락시키지 않는다. 무료 12GB VM이 있고 [47] FRR 컨테이너는 가볍다는 정황이 있다 [15]. 탈락 요인은 격리 구축 부담이다 [34][35][37].
- 충실도에서 앞서는 방식(에뮬레이션)이 4주·2인 조건에서는 진다. 가중치를 충실도와 확장성 쪽으로 옮기면 순위가 뒤집힌다.
- 커널을 분리하는 격리 수단은 KVM이 필요하거나 [39] 실습용 네트워크 기능 지원이 문서로 확인되지 않는다 [38]. 저가 서버에서 서버 에뮬레이션을 안전하게 운영할 검증된 경로를 이번 조사에서 찾지 못했다.
- 상표와 엔진 선택은 독립이다. 어느 엔진을 택해도 제품 이름 문제는 남는다 [30].

## 7. 선택

요구 프레임(사용자 답변): 필수는 2인 4주 MVP, 예산 거의 없음, 수강생 수십 명, 라이선스 준수, 수강생 격리. 선호는 프로토콜 충실도, 기능 확장, 패킷 흐름 시각화.

선별: VyOS(지원 종료·4GB), GNS3·containerlab 위 구축(운영자 전제), 브라우저 내 실제 Linux(근거 없음) 탈락. 결선은 A 브라우저 시뮬레이션, B1 FRR 컨테이너 직접 구성, C 하이브리드.

| 기준 | 가중치 | A | B1 | C |
|---|---|---|---|---|
| 4주 안에 구현 가능 | 30 | 3 | 2 | 1 |
| 운영 비용과 서버 자원 | 20 | 5 | 3 | 3 |
| 격리·보안 부담 | 20 | 5 | 1 | 2 |
| 프로토콜 충실도 | 15 | 2 | 5 | 4 |
| 기능 확장 용이성 | 10 | 2 | 5 | 4 |
| 패킷 흐름 시각화 | 5 | 5 | 2 | 3 |
| 가중 합계 (500) | | 365 | 275 | 245 |

- 선택: A.
- 차점: B1. Dynamic Routing이 MVP 필수이고, 기간이 4주보다 길고, 사용자가 신원이 확인된 수강생이며, FRR 메모리를 측정해 확인한 경우에 이긴다.
- 가장 강한 반론: 시뮬레이션은 기능마다 프로토콜을 다시 구현해야 하고, 무료 서버가 있으므로 FRRouting으로 대부분을 얻는 편이 장기적으로 싸다.
- 되돌릴 장치: 실행 엔진 경계를 분리하고, 1주차에 최소 엔진으로 구현 속도를 확인한다.

## 8. 권고

| 권고 | 근거의 신뢰도 | 반영 위치 |
|---|---|---|
| MVP 엔진은 브라우저 시뮬레이션 | 격리 부담 근거는 높음. 4주 가능성은 판단이며 측정 없음 | 아키텍처 (실행 엔진) |
| VyOS 제외 | 지원 종료는 1차 출처 하나. 사양은 버전별 불일치가 있으나 결론은 같음 | 브리프, 아키텍처 |
| 계층형 CLI 형식을 자체 구현하고 Cisco 문구는 복제하지 않음 | 미국 사건은 판결이 취소됨. 한국 법 근거 없음. 낮음 | PRD (CLI 명세) |
| 공개용 제품 이름에 "Packet Tracer"를 쓰지 않음 | 정책 문구는 높음. 등록 여부는 미확인 | 브리프 |
| 토폴로지 편집기 React Flow, 콘솔 xterm.js | 라이선스는 높음. 적합성은 미검증 | 아키텍처 (프론트엔드) |
| 서버 에뮬레이션 확장은 FRR 메모리와 권한을 실측한 뒤 결정 | 현재 수치는 낮음 | 로드맵 (3차) |

## 9. 미해결 질문

- "PACKET TRACER" 상표의 등록 여부. 등록부를 사람이 직접 검색해야 한다.
- FRR 컨테이너의 실제 메모리와 최소 권한. 실행 측정이 필요하다.
- gVisor에서 veth·bridge·라우팅 데몬이 동작하는지.
- 브라우저 한 탭에서 시뮬레이션할 수 있는 장비 수.
- 한국 법에서 CLI 형식과 유사 UI의 보호 범위.
- Cisco General Terms의 역설계·파생물 조항.
- 정적 호스팅과 API 호스팅의 무료 한도, Oracle 유휴 인스턴스 회수 여부.
- FRRouting vtysh 명령어 형식이 추천 CLI 형식과 맞는지.

## 출처

접근일은 모두 2026-11-05.

| # | 뒷받침하는 내용 | 발행처 | 발행일 | 신뢰도 |
|---|---|---|---|---|
| [1] | Packet Tracer는 단순화한 모델 사용 | [Cisco Networking Academy](https://tutorials.ptnetacad.net/help/default/faqTroubleShoot.htm) | 날짜 없음 | 높음 |
| [2] | GEduNet 구현 범위와 누락 | [GitHub: MegaRedHand](https://github.com/MegaRedHand/network-simulator) | 날짜 없음 | 높음 |
| [3] | NetSim CE 자체 설명 | [GitHub: netsim-labs](https://github.com/netsim-labs/netsim) | 날짜 없음 | 낮음 |
| [4] | v86 게스트 간 네트워킹 | [v86 프로젝트](https://github.com/copy/v86/blob/master/docs/networking.md) | 날짜 없음 | 높음 |
| [5] | container2wasm 실험 단계, 네트워킹 범위 | [container2wasm](https://github.com/container2wasm/container2wasm) | 날짜 없음 | 높음 |
| [6] | React Flow MIT | [xyflow](https://github.com/xyflow/xyflow) | 날짜 없음 | 높음 |
| [7] | xterm.js 6.0.0 | [xterm.js](https://github.com/xtermjs/xterm.js/releases) | 연도 없음 | 높음 |
| [8] | containerlab 라이선스, 버전 | [srl-labs](https://github.com/srl-labs/containerlab/releases) | 2026-10-23 | 중상 |
| [9] | containerlab 지원 장비 종류 | [containerlab 문서](https://containerlab.dev/manual/kinds/) | 날짜 없음 | 높음 |
| [10] | containerlab 권한 요구 | [containerlab 문서](https://containerlab.dev/install/) | 날짜 없음 | 높음 |
| [11] | clab-api-server 구조와 인증 | [srl-labs](https://github.com/srl-labs/clab-api-server) | 날짜 없음 | 높음 |
| [12] | GNS3 구조, 인증 | [GNS3 문서](https://docs.gns3.com/docs/using-gns3/design/architecture) | 날짜 없음 | 높음 |
| [13] | GNS3 라이선스, 에뮬레이터 | [GNS3](https://github.com/GNS3/gns3-server) | 날짜 없음 | 높음 |
| [14] | GNS3 버전, 사용자 격리 진행 상태 | [GNS3 releases](https://github.com/GNS3/gns3-server/releases) | 2026-10-21 | 중상 |
| [15] | FRR 컨테이너 약 30MB | [CodiLime](https://codilime.com/blog/latest-addition-to-network-testing-and-simulation-containerlab/) | 미확인 | 낮음 |
| [16] | FRR 실습 호스트 2GB | [ipSpace.net](https://blog.ipspace.net/2023/06/learn-routing-protocols-frr/) | 2023-06 | 중 |
| [17] | EVE-NG 요구 사양 | [EVE-NG](https://www.eve-ng.net/index.php/documentation/installation/system-requirement/) | 날짜 없음 | 중 |
| [18] | 네임스페이스 권한 규칙 | [man-pages 6.19](https://man7.org/linux/man-pages/man7/user_namespaces.7.html) | 2026-02-08 | 높음 |
| [19] | FRR 10.7.1, 공식 이미지 | [FRRouting](https://github.com/FRRouting/frr/releases) | 2026-08-31 | 높음 |
| [20] | FRR 라이선스 | [FRRouting](https://github.com/FRRouting/frr/blob/master/COPYING) | 날짜 없음 | 높음 |
| [21] | FRR 지원 프로토콜, 메모리 수치 없음 | [FRRouting 문서](https://docs.frrouting.org/en/latest/about.html) | 날짜 없음 | 높음 |
| [22] | FRR 컨테이너 권한 | [Docker, Inc.](https://hub.docker.com/hardened-images/catalog/dhi/frr/guides) | 날짜 없음 | 중 |
| [23] | VyOS 1.3.x 지원 종료 | [VyOS Networks](https://blog.vyos.io/vyos-1.3-has-reached-end-of-life) | 2025-03-18 | 높음 |
| [24] | VyOS 이미지 제공 범위, 최소 사양 (rolling) | [VyOS 문서](https://docs.vyos.io/en/latest/installation/install.html) | 날짜 없음 | 높음 |
| [25] | VyOS 컨테이너 실행 절차 | [VyOS 문서](https://docs.vyos.io/en/latest/installation/virtual/docker.html) | 날짜 없음 | 높음 |
| [26] | VyOS 1.4 nftables | [VyOS Networks](https://blog.vyos.io/vyos-1.4.0-ga-release) | 미확인 | 중 |
| [27] | GNS3는 Cisco 이미지 미제공 | [GNS3 문서](https://docs.gns3.com/docs/troubleshooting-faq/where-do-i-get-ios-images) | 날짜 없음 | 높음 |
| [28] | Packet Tracer 사용 범위 | [Cisco Systems](https://www.cisco.com/c/dam/en_us/about/doing_business/legal/seula/cisco-packet-tracer-software.pdf) | 2025-09-10 | 높음 |
| [29] | Cisco 상표 목록 | [Cisco Systems](https://www.cisco.com/c/en/us/about/legal/trademarks.html) | 날짜 없음 | 높음 |
| [30] | Cisco 상표 정책 | [Cisco Systems](https://www.cisco.com/c/dam/en_us/about/ac50/ac47/downloads/logo/trademark.pdf) | 2009-05 | 중 |
| [31] | Cisco·Arista 합의 | [The Register](https://www.theregister.com/2018/08/06/arista_cisco_agreement/) | 2018-08-07 | 높음 |
| [32] | VyOS 상표와 LTS 정책 | [VyOS Networks](https://blog.vyos.io/community-contributors-userbase-and-lts-builds) | 2024-04-25 | 높음 |
| [33] | GPL 배포 의무 | [Free Software Foundation](https://www.gnu.org/licenses/gpl-faq.html) | 날짜 없음 | 높음 |
| [34] | Docker 권한, 자원 한도 | [Docker Docs](https://docs.docker.com/engine/containers/run/) | 날짜 없음 | 높음 |
| [35] | Docker 보안 권고 | [Docker Docs](https://docs.docker.com/engine/security/) | 날짜 없음 | 높음 |
| [36] | Linux 권한 범위 | [man-pages 6.19](https://man7.org/linux/man-pages/man7/capabilities.7.html) | 2026-02-08 | 높음 |
| [37] | Kubernetes 보안 기준 | [Kubernetes](https://kubernetes.io/docs/concepts/security/pod-security-standards/) | 2026-10-16 | 높음 |
| [38] | gVisor 네트워킹 | [gVisor](https://gvisor.dev/docs/user_guide/networking/) | 날짜 없음 | 높음 |
| [39] | Firecracker 요구 사항 | [Firecracker](https://github.com/firecracker-microvm/firecracker/blob/main/FAQ.md) | 날짜 없음 | 중 |
| [40] | Docker bridge 기본 동작 | [Docker Docs](https://docs.docker.com/engine/network/drivers/bridge/) | 날짜 없음 | 높음 |
| [41] | WebSocket 보안 지침 | [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html) | 날짜 없음 | 높음 |
| [42] | veth 권한 검사 취약점 | [NVD](https://nvd.nist.gov/vuln/detail/CVE-2026-31692) | 2026 | 중 |
| [43] | Cisco v. Arista 평결과 판결 취소 | [EFF](https://www.eff.org/cases/cisco-systems-v-arista-networks) | 날짜 없음 | 높음 |
| [44] | VyOS 1.4 최소 사양 | [VyOS 문서](https://docs.vyos.io/en/1.4/installation/install.html) | 날짜 없음 | 높음 |
| [45] | VyOS 1.3 최소 사양 | [VyOS 문서](https://docs.vyos.io/en/1.3/installation/install.html) | 날짜 없음 | 높음 |
| [46] | VyOS 최소 사양 (제3자) | [8Labs](https://8labs.id/guides/vyos/installation/) | 2026-11-02 | 낮음 |
| [47] | Oracle Always Free 자원 | [Oracle](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm) | 날짜 없음 | 높음 |
| [48] | Cloud Run 권한 제한 | [Google Cloud](https://docs.cloud.google.com/run/docs/container-contract) | 날짜 없음 | 높음 |
| [49] | Railway 권한 제한 | [Railway 포럼](https://station.railway.com/questions/access-to-tun-request-to-host-an-open-vpn-224464bb) | 날짜 없음 | 낮음 |
| [50] | PACKETTRACER 출원 기록 | [Justia Trademarks](https://trademarks.justia.com/783/46/packettracer-78346123.html) | 날짜 없음 | 중 |
| [51] | xterm.js 라이선스 | [xterm.js](https://raw.githubusercontent.com/xtermjs/xterm.js/master/LICENSE) | 날짜 없음 | 높음 |
| [52] | React Flow 배지 규정 | [xyflow](https://reactflow.dev/learn/troubleshooting/remove-attribution) | 날짜 없음 | 중 |
| [53] | Cytoscape.js 버전, 라이선스 | [npm registry](https://registry.npmjs.org/cytoscape/latest) | 날짜 없음 | 높음 |
| [54] | GEduNet 기여자 수, 기간 | [GitHub API](https://api.github.com/repos/MegaRedHand/network-simulator) | 2025-07-06 | 높음 |

## 재확인 일정

가장 빨리 낡는 주장은 버전·호스팅 조건이다.

| 주장 | 분류 | 재확인 시점 |
|---|---|---|
| FRRouting 현행 버전 [19], containerlab [8], GNS3 [14] 버전 | 버전 | 2026-12-05 |
| Oracle Always Free 자원 [47], Cloud Run 제한 [48] | 가격·제공 조건 | 2026-12-05 |
| React Flow 배지 규정 [52], xterm.js 버전 [7] | 버전·라이선스 | 2026-12-05 |
| VyOS 이미지 제공 정책 [24][32] | 생태계 | 2027-05-05 |
| GNS3 사용자 격리 진행 상태 [14] | 생태계 | 2027-05-05 |
| Cisco Packet Tracer 약관 [28], 상표 정책 [30] | 약관 | 2027-05-05 |
| 격리 수단의 지원 범위 [38][39] | 지형 | 2027-11-05 |

기준: 버전·호환성 1개월, 생태계 6개월, 지형 12개월. 선택 보고서는 2분기가 지나면 실행 전에 갱신한다. 가장 이른 재확인일은 2026-12-05다.
