# 스위치와 VLAN 설계

- 작성일: 2026-11-05
- 상태: 승인됨 (2026-11-05)
- 구현 계획: [첫 화면까지](../plans/2026-11-05-switch-vlan-first-screen.md)
- 화면 시안: [2026-11-05-switch-vlan-mockup.html](2026-11-05-switch-vlan-mockup.html) (원본 `apps/web/public/mockup.html`에 스위치용 변경만 더한 것)
- 바탕 문서: `docs/project-plan/04-tasks/epic-5-vlan.md`, `epic-3-cli.md`, `epic-1-first-ping.md`(T1.7.3), `03-system-design.md` 3.4절, 규칙 문서 AD-3, AD-7, AD-8, AD-14, AD-16

## 1. 무엇을, 왜

PING9는 3인이 장비별로 나눠 만든다. PC와 Router는 다른 팀원이 맡고, 이 문서는 **Switch**를 다룬다. Switch 담당이 PC·Router를 기다리지 않고 Switch를 만들고 테스트할 수 있어야 한다.

끝났을 때의 모습:

- Switch의 터미널에서 Packet Tracer와 같은 명령어로 VLAN을 만들고, 포트를 access/trunk로 설정하고, `show`로 확인한다.
- 명령을 치면 속성 패널과 캔버스가 바로 바뀐다.
- VLAN이 다른 포트끼리는 프레임이 전달되지 않고, trunk 구간에서는 802.1Q 태그가 붙는다. PC가 합쳐지기 전에는 이것을 테스트 코드로 확인한다.

## 2. 목표, 하지 않는 것, 실패로 보는 것

### 목표

1. Switch 구성을 바꾸는 Command 처리 (VLAN, switchport, 포트 켜고 끄기)
2. Switch의 프레임 전달 규칙 (MAC 학습, VLAN 분리, trunk 태그)
3. IOS 방식 CLI의 공통 부분과 Switch 명령어
4. 시안대로의 화면: Switch 터미널, 속성 패널, 캔버스의 VLAN 표시
5. 위 전부를 PC·Router·kernel 없이 테스트

### 하지 않는 것

- PC와 Router의 모델, 명령어, 설정 패널
- kernel(가상 시계, 사건 큐, 링크 전달). kernel이 들어오면 연결하는 작업만 이 범위에 있다 (9절의 18번)
- 장비 끌어다 놓기, 케이블 연결, 삭제, 이름 바꾸기 화면
- ping 애니메이션(펭귄), 이벤트 목록, 프레임 보기 패널. 시안에는 있지만 PC와 kernel이 있어야 동작한다
- `interface range`, `switchport trunk allowed vlan add|remove|except`, `do`, native VLAN 변경, STP, VTP, 음성 VLAN
- Tailwind, xterm, `@xyflow/react` 도입 여부의 결정 (8절 참조)
- 운영 배포 경로 변경 (`vercel.json`은 건드리지 않는다)

### 이렇게 되면 실패

- Switch를 테스트하려면 PC나 Router 코드가 먼저 있어야 하는 구조
- Router 담당이 `enable`, `configure terminal`, 줄임 입력, `?` 도움말을 다시 만들어야 하는 구조
- 화면이 VLAN 소속이나 포트 상태를 직접 계산하는 것 (AD-7 위반)
- 도움말·Tab 완성에 나오는 단어와 실제로 입력되는 단어가 다른 것 (AD-8 위반)
- `show running-config` 출력을 다시 입력했을 때 다른 구성이 되는 것 (보장 범위는 7.4절)
- VLAN을 쓰지 않는 기존 예시(`twoPcDocument`, `twoPcSwitchDocument`)의 동작이 달라지는 것

## 3. 제약

- **계약은 이미 있다.** `packages/shared`에 `SwitchConfig`, `Vlan`, `SwitchPortConfig`, VLAN·switchport Command 6개, `MacTableEntryView`, `EthernetHeader.vlanTag`, 폐기 사유 `VLAN_BLOCKED`·`TRUNK_NOT_ALLOWED`, 알림 `VLAN_AUTO_CREATED`, 한도(`maxVlansPerSwitch` 64, `maxAllowedVlanRanges` 64)가 있다. 이 형태를 따른다.
- **`shared`를 바꾸면 세 사람이 모두 영향을 받는다.** 바꾸는 것은 5.1절에 적은 코드 추가뿐이고, PR에서 두 팀원이 모두 확인한다.
- **포트는 `FastEthernet0/1`~`0/8`, 8개다.** Packet Tracer의 2960(24포트)과 다르다.
- **engine의 출력 글은 영어, 오류·알림은 코드다.** 사용자에게 보일 한국어 문장은 web의 메시지 카탈로그가 만든다 (AD-14).
- **`show` 출력의 문구는 직접 설계한다.** T3.4.2가 "다른 제품의 문구를 복제하지 않음"을 요구한다. 명령어 이름과 동작은 IOS와 같게 하되, 출력의 열 구성과 문장은 6.5절의 형식을 쓴다.
- **저장소 규칙** (`CLAUDE.md`): Task마다 브랜치(`feat/<Task ID>-<설명>`)와 기록 문서, `main`에는 PR로만, 커밋·PR은 영어이고 AI 표시 줄 없음, 문서 본문은 한국어, 올리기 전에 `pnpm check`와 `pnpm check:secrets`.
- **운영 주소의 `/`는 지금 `mockup.html`을 보여 준다** (`vercel.json`의 `routes`, 팀원이 T0.3에서 넣음). React 앱은 운영에서 보이지 않으므로 화면 확인은 로컬(`pnpm --filter @ping9/web dev`)에서 한다.

## 4. 사용자가 정한 것

- Switch만 맡는다. PC와 Router는 다른 팀원이 한다.
- 터미널은 장비별로 만든다. Switch 터미널은 Switch 담당이 만든다.
- 기능은 Packet Tracer와 비슷하게 한다.
- 디자인은 보내준 HTML을 그대로 따르고, 필요한 부분만 바꾼다. 확정된 시안이 [2026-11-05-switch-vlan-mockup.html](2026-11-05-switch-vlan-mockup.html)이다.
- 첫 결과물에 브라우저에서 Switch 터미널에 직접 쳐 보는 화면까지 넣는다.

## 5. Document 변경 (reducer)

Document를 바꾸는 경로는 reducer 하나다 (AD-3). CLI는 Command를 만들어 dispatch할 뿐이다.

### 5.1 `shared`에 더하는 것

| 종류 | 이름 | 내용 | 쓰는 곳 |
|---|---|---|---|
| 오류 코드 | `VLAN_NOT_FOUND` | `{ deviceId, vlanId }` | 없는 VLAN의 이름 변경·삭제 |
| 오류 코드 | `DEFAULT_VLAN_READONLY` | `{ deviceId }` | VLAN 1의 삭제·이름 변경 |
| 폐기 사유 | `VLAN_INACTIVE` | `{ device, port, vlan }` | 포트의 VLAN이 지워져 통신할 수 없음 |
| 함수 | Switch 구성 읽기 함수 | 포트 하나의 실제 값(켜짐 여부, 모드, access VLAN, 허용 목록)을 기본값까지 채워 돌려주는 함수, VLAN별 소속 포트 목록을 돌려주는 함수, VLAN 1을 포함한 VLAN 목록을 돌려주는 함수 | reducer, 전달 규칙, `show`, 화면 |

`VLAN_BLOCKED`는 params가 "프레임의 VLAN과 포트의 VLAN이 다름"을 뜻해서 "VLAN이 지워짐"에 쓰면 사유 문장이 틀리게 나온다. 그래서 `VLAN_INACTIVE`를 따로 둔다.

구성 읽기 함수를 `shared`에 두는 이유: "`ports`에 없는 포트는 켜짐·access·VLAN 1"이라는 기본값 규칙과 "어느 포트가 어느 VLAN에 속하는가"를 engine과 화면이 각자 계산하면 어긋난다. `view.ts`는 구성 값을 `DeviceView`에 다시 담지 않기로 했으므로, 화면은 Document를 이 함수로 읽는다. 화면은 engine에서 `Simulator`만 가져올 수 있으므로(AD-16) 함수의 자리는 `shared`다.

### 5.2 Command별 규칙

모든 Command에 공통: 장비가 없으면 `DEVICE_NOT_FOUND`, Switch가 아니면 `DEVICE_KIND_MISMATCH`, 포트 이름이 틀리면 `UNKNOWN_PORT`. 거부되면 Document는 바뀌지 않는다.

| Command | 규칙 |
|---|---|
| `vlan/create` | 번호는 `checkVlanId`(1~4094). 이미 있으면 `DUPLICATE_VLAN`. 64개를 넘으면 `LIMIT_EXCEEDED`. 이름이 없으면 `VLAN0010`처럼 번호를 4자리로 채운 기본 이름. 이름은 `checkVlanName` |
| `vlan/rename` | 없는 VLAN이면 `VLAN_NOT_FOUND`. VLAN 1이면 `DEFAULT_VLAN_READONLY` |
| `vlan/remove` | VLAN 1이면 `DEFAULT_VLAN_READONLY`. 없으면 `VLAN_NOT_FOUND`. 그 VLAN을 쓰던 포트의 `accessVlan`은 그대로 둔다 (그 포트는 통신 불가, 6.2절) |
| `switchport/set-mode` | `mode`만 바꾼다. `accessVlan`과 `allowedVlans`는 유지한다 (IOS와 같음) |
| `switchport/set-access-vlan` | 번호 검증. 없는 VLAN이면 기본 이름으로 **자동 생성**하고 알림 `VLAN_AUTO_CREATED`를 돌려준다. 자동 생성으로 64개를 넘으면 `LIMIT_EXCEEDED`로 거부. 포트가 trunk 모드여도 값은 저장된다 |
| `switchport/set-allowed-vlans` | 각 범위는 시작 ≤ 끝이고 1~4094. 정렬하고 겹치거나 이어진 범위를 합친다. 합친 뒤 64개를 넘으면 `LIMIT_EXCEEDED`. 빈 배열은 "아무 VLAN도 허용하지 않음" |
| `interface/set-admin` | Switch 포트의 `adminUp`만 다룬다. Router 쪽 처리는 Router 담당이 같은 처리기에 더한다 |

### 5.3 저장 형태의 정규화

같은 구성은 항상 같은 Document가 되어야 `show running-config` 왕복을 비교할 수 있다.

- `accessVlan`이 1이면 저장하지 않는다 (없음 = VLAN 1).
- `allowedVlans`가 `[[1, 4094]]`이면 저장하지 않는다 (없음 = 전부 허용).
- 포트의 값이 전부 기본값(켜짐, access, VLAN 1, 전부 허용)이면 `ports`에서 그 포트 항목을 지운다.
- `vlans`는 번호 오름차순으로 둔다.
- Switch를 새로 만들 때의 기본 구성은 `{ vlans: [{ id: 1, name: "default" }], ports: {} }`이다. (`device/add`는 이 범위가 아니지만, 그 처리기를 만드는 사람이 이 값을 써야 한다.)
- reducer는 Command가 건드린 Switch의 구성을 정규화해서 돌려준다. `load()`는 문서를 고치지 않는다 (정규화되지 않은 문서도 그대로 연다).

### 5.4 VLAN 1

- **VLAN 1은 항상 있는 것으로 친다.** `validateDocument`는 `vlans`에 VLAN 1이 없는 문서도 통과시키므로, engine은 `vlans`의 내용과 상관없이 VLAN 1이 있다고 보고 전달하고 `show`에 보여 준다. 목록에 없으면 이름은 `default`다. 검증 규칙(`shared`)은 바꾸지 않는다.
- reducer로는 VLAN 1을 지우거나 이름을 바꿀 수 없다. 가져온 문서에 이름이 바뀐 VLAN 1이 있으면 그 이름을 그대로 보여 주되, 왕복 보장(7.4절)의 대상은 아니다.

## 6. 프레임 전달 규칙

### 6.1 형태

kernel이 아직 없으므로 전달 규칙을 **순수 함수 하나**로 만든다. 입력만으로 결과가 정해지고, 손으로 만든 프레임으로 테스트한다.

```ts
// packages/engine/src/devices/switch/forwarding.ts (이름은 제안)
function switchForward(input: {
  config: SwitchConfig;
  isPortUp: (port: string) => boolean;   // PortStatus가 "up"인지
  macTable: MacTable;                    // 변경 불가능한 값
  now: number;                           // 가상 시각 (마이크로초)
  inPort: string;
  frame: { sourceMac: string; destinationMac: string; vlanTag?: number };
}): {
  macTable: MacTable;                                             // 학습·만료가 반영된 새 테이블
  vlan?: number;                                                  // 분류된 VLAN. 들어오다 폐기되면 없음
  learned?: { mac: string; port: string; vlan: number };
  ingressDrop?: Drop;                                             // 들어오다 폐기된 경우
  samePort?: true;                                                // 목적지 포트가 받은 포트와 같아 내보내지 않음
  outputs: { port: string; vlanTag?: number; flooded: boolean }[]; // 포트 순번 오름차순
  blocked: Drop[];                                                // flooding에서 VLAN 때문에 빠진 포트
}
// Drop = { reason, params }. params는 codes.ts의 그 폐기 사유 params에서 `device`만 뺀 것 전부다.
// 예: VLAN_BLOCKED는 { frameVlan, port, portVlan }, TRUNK_NOT_ALLOWED는 { port, vlan }
```

### 6.2 규칙

**들어올 때 (VLAN 분류)**

| 받은 포트 | 프레임 | 결과 |
|---|---|---|
| 꺼진 포트 | — | 폐기 `IF_DOWN` |
| access | 태그 없음 | 포트의 access VLAN (없으면 1) |
| access | 태그 있음, access VLAN과 같음 | 그 VLAN |
| access | 태그 있음, access VLAN과 다름 | 폐기 `VLAN_BLOCKED` (`frameVlan` = 태그, `portVlan` = access VLAN) |
| trunk | 태그 있음 | 태그의 VLAN. 허용 목록에 없으면 폐기 `TRUNK_NOT_ALLOWED` |
| trunk | 태그 없음 | VLAN 1. 허용 목록에 1이 없으면 폐기 `TRUNK_NOT_ALLOWED` |
| 어느 포트든 | 분류된 VLAN이 `config.vlans`에 없음 | 폐기 `VLAN_INACTIVE` |

**학습**: `(VLAN, 출발 MAC)` → 받은 포트. 출발 MAC이 브로드캐스트면 학습하지 않는다. 항목은 마지막으로 본 가상 시각을 기억하고, 300초(가상 시간) 동안 다시 보이지 않으면 조회할 때 없는 것으로 친다 (T1.7.3).

**내보낼 포트 정하기**

- 목적지가 브로드캐스트이거나 `(VLAN, 목적 MAC)`이 테이블에 없으면 flooding: 받은 포트를 뺀 포트 중 **켜져 있고 그 VLAN에 속한** 포트 전부.
- 테이블에 있으면 그 포트 하나. 그 포트가 받은 포트와 같으면 내보내지 않고 `samePort`로 표시한다. 실패가 아닌 정상 동작이다. 이것을 Trace에 어떤 코드로 적을지는 kernel 연결 때 정한다 (지금의 `NOT_FOR_ME`는 뜻이 "받은 장비가 목적지가 아님"이라 맞지 않을 수 있다).
- 포트가 VLAN에 속한다는 것: access 포트는 access VLAN이 같을 때, trunk 포트는 허용 목록에 그 VLAN이 있을 때.

**나갈 때 (태그)**

- access 포트: 태그 없이.
- trunk 포트: VLAN 1이면 태그 없이, 그 밖의 VLAN이면 `vlanTag` = VLAN 번호. (native VLAN은 1로 고정. 바꾸는 기능은 2차 E12.1)

**`blocked`**: flooding에서 VLAN 때문에 빠진 **켜진** 포트의 목록이다. access VLAN이 다르면 `VLAN_BLOCKED`, trunk 허용 목록에 없으면 `TRUNK_NOT_ALLOWED`. "다른 VLAN으로의 ping이 왜 실패했는가"(T5.2.2)를 설명할 재료이며, 이것을 Trace의 폐기 이벤트로 적고 실패 원인으로 고르는 일은 kernel 연결(9절의 18번)과 T1.10.1에서 한다.

### 6.3 MAC 주소 테이블이 비는 경우

`onConfigChanged`에 해당하는 정리 함수를 함께 만든다: 링크가 지워진 포트, 꺼진 포트, access VLAN이나 모드가 바뀐 포트, 지워진 VLAN의 항목을 지운다.

### 6.4 kernel 연결 (나중)

kernel(T1.7.1, T1.7.2)이 들어오면 `DeviceModel`을 구현하는 얇은 Switch 모델이 `switchForward`를 부르고, 결과를 `SimContext`의 프레임 보내기와 이벤트 기록(`FRAME_RECEIVED`, `MAC_LEARNED`, `FRAME_FORWARDED`, `FRAME_FLOODED`, 폐기)으로 옮긴다. `view()`는 MAC 주소 테이블을 `MacTableEntryView[]`로 돌려준다. 그전까지 `DeviceView.macTable`은 비어 있다.

## 7. CLI

### 7.1 나누기

| 폴더 (제안) | 내용 | 담당 |
|---|---|---|
| `packages/engine/src/cli/ios` | 명령 정의 형태, 해석과 줄임, 모드와 세션, 프롬프트, `no` 형식, Tab 완성, `?` 도움말, 오류 위치, `show running-config` 조립. 장비 종류를 모른다 | Switch 담당 |
| `packages/engine/src/cli/switch` | Switch 명령 정의 목록 | Switch 담당 |
| `packages/engine/src/cli/router` | Router 명령 정의 목록. `ios` 위에 얹는다 | Router 담당 |
| `packages/engine/src/cli/pc` | PC 명령어. `ios`를 쓰지 않아도 된다 | PC 담당 |

`packages/engine/src/console.ts`는 장비 종류를 보고 해당 폴더로 넘긴다. Switch가 아닌 장비는 지금처럼 "알 수 없는 명령어"를 돌려준다. `ConsolePort`의 형태(`prompt`, `exec`, `complete`, `help`)는 바꾸지 않는다 (AD-8).

명령어 하나는 정의 하나다. 03 문서의 `defineCommand` 형태(`modes`, `devices`, `tokens`, `help`, `run`, `serialize`, `no` 처리기)를 따른다. 해석, 줄임, 완성, 도움말, `show running-config`가 모두 이 목록에서 계산된다.

### 7.2 모드와 프롬프트

| 모드 | 프롬프트 | 들어가는 명령 |
|---|---|---|
| user | `SW1>` | (처음 상태) |
| privileged | `SW1#` | `enable` |
| config | `SW1(config)#` | `configure terminal` |
| config-if | `SW1(config-if)#` | `interface <이름>` |
| config-vlan | `SW1(config-vlan)#` | `vlan <번호>` |

- `exit`는 한 단계 위로, `end`는 privileged로, `disable`은 user로 간다.
- config-if나 config-vlan에서 config 모드의 명령(`vlan 20`, `interface fa0/2` 등)을 치면 config 모드의 명령으로 해석한다 (IOS와 같음).
- 세션(현재 모드, 대상 인터페이스, 대상 VLAN)은 Simulator 안에 장비별로 하나 둔다. 터미널을 닫았다 열어도 유지되고 (FR-19), `load()`하면 처음 상태로 돌아간다.
- 대상 인터페이스나 VLAN이 다른 경로로 사라지면 (예: 다른 터미널에서 `no vlan 10`) 세션은 config 모드로 돌아간다.

### 7.3 Switch 명령어

| 모드 | 명령어 | 동작 |
|---|---|---|
| user | `enable` | privileged로 |
| privileged | `disable`, `configure terminal` | 모드 전환 |
| privileged | `show vlan brief` (`show vlan`도 같음) | VLAN 목록 |
| privileged | `show mac address-table` | MAC 주소 테이블 |
| privileged | `show interfaces trunk` | trunk 포트와 허용 VLAN |
| privileged | `show running-config` | 구성을 명령어 줄로 |
| config | `hostname <이름>` | `device/rename` dispatch. 그 처리기는 다른 담당 것이며, 들어오기 전에는 `UNKNOWN_COMMAND` 오류가 그대로 나온다 |
| config | `vlan <번호>` | 없으면 `vlan/create` 후 config-vlan으로. 있으면 그냥 들어간다 |
| config | `no vlan <번호>` | `vlan/remove` |
| config | `interface <이름>` | config-if로 |
| config-vlan | `name <이름>` | `vlan/rename` |
| config-if | `switchport mode access` \| `trunk` | `switchport/set-mode` |
| config-if | `switchport access vlan <번호>` | `switchport/set-access-vlan`. 자동 생성 알림은 콘솔에 notice 줄로 나온다 |
| config-if | `no switchport access vlan` | VLAN 1로 |
| config-if | `switchport trunk allowed vlan <목록>` | 목록은 `10,20-30` 형태, 또는 `all`, `none`. `switchport/set-allowed-vlans` |
| config-if | `no switchport trunk allowed vlan` | 전부 허용으로 |
| config-if | `shutdown`, `no shutdown` | `interface/set-admin` |
| 모든 모드 | `exit`, `end` (user에서는 `exit`만) | 모드 전환 |

- 줄임: 단어마다 접두사가 유일하면 인정한다 (`conf t`, `sh vl br`, `sw mo acc`). 후보가 둘 이상이면 `CLI_AMBIGUOUS_COMMAND`. 매개변수 자리는 줄이지 않는다.
- 인터페이스 이름: `FastEthernet0/1`, `fastethernet 0/1`, `fa0/1`, `f0/1`을 모두 `FastEthernet0/1`로 해석한다. 대소문자를 가리지 않는다. 없는 포트는 `CLI_INVALID_VALUE`.
- 오류: `CLI_UNKNOWN_COMMAND`, `CLI_INCOMPLETE_COMMAND`, `CLI_AMBIGUOUS_COMMAND`, `CLI_INVALID_VALUE`, `CLI_WRONG_MODE`. 틀린 단어가 시작하는 위치를 `position`에 담는다. 값 형식 오류는 `shared` 값 검증 함수의 코드를 그대로 쓴다.
- Tab 완성(`complete`)과 `?` 도움말(`help`)은 해석과 같은 일치 결과에서 나온다. 도움말에 나온 단어는 모두 입력할 수 있고, 입력할 수 있는 단어는 모두 도움말에 나온다.

### 7.4 `show running-config`

기본값과 같은 설정은 출력하지 않는다. 출력을 새 Switch에 그대로 입력하면 같은 구성이 되어야 한다.

```text
hostname SW1
!
vlan 10
 name SALES
!
vlan 20
 name DEV
!
interface FastEthernet0/1
 switchport access vlan 10
!
interface FastEthernet0/8
 switchport mode trunk
 switchport trunk allowed vlan 10,20
!
end
```

- VLAN 1은 출력하지 않는다. 이름이 기본 이름(`VLAN0010`)인 VLAN은 `name` 줄을 생략한다.
- 포트는 기본값과 다른 것만, 포트 순번대로 출력한다. 꺼진 포트는 ` shutdown` 줄이 나온다.
- 다시 입력할 때 `!`로 시작하는 줄과 `end`는 무시·처리된다.

**왕복이 보장되는 범위**: 새 Switch에서 reducer로 만들 수 있는 구성 중, 포트가 가리키는 access VLAN이 모두 존재하는 것. 비교는 정규화한 형태(5.3절)로 한다.

**범위 밖 (알고 두는 예외)**: VLAN을 지운 뒤에도 포트에 그 번호가 남아 있는 구성. 출력에 `switchport access vlan 10`은 있고 `vlan 10`은 없으므로, 다시 입력하면 VLAN 10이 자동 생성된다. 실제 IOS도 같다.

### 7.5 `show` 출력 형식 (직접 설계)

```text
SW1# show vlan brief
VLAN  Name     Status  Ports
1     default  active  Fa0/3, Fa0/4, Fa0/5
                       Fa0/6, Fa0/7
10    SALES    active  Fa0/1
20    DEV      active  Fa0/2

SW1# show interfaces trunk
Port   Status  Allowed VLANs
Fa0/8  up      10,20

SW1# show mac address-table
VLAN  MAC address        Port
10    02:00:00:00:01:00  Fa0/1
```

- `show vlan brief`의 Ports에는 access 모드 포트만 나온다. trunk 포트는 나오지 않는다. 포트는 한 줄에 3개까지 쓰고, 넘으면 Ports 열에 맞춰 다음 줄에 이어 쓴다 (시안과 같음).
- 열 너비는 머리글과 값 중 가장 긴 것에 맞추고, 열 사이는 공백 2칸이다. 줄 끝의 공백은 지운다. 표에 줄이 없으면 머리줄만 나온다.
- **이 절이 기준이다.** 시안의 터미널에 적힌 출력(`Port Mode Vlans allowed` 등)은 모양을 보여 주려는 예시였고, 실제 출력은 이 절을 따른다.

## 8. 화면

기준은 확정된 시안이다. 색, 글꼴, 간격, 모서리, 터미널 창의 모양은 시안의 CSS를 그대로 옮긴다.

### 8.1 이번에 만드는 것

| 부분 | 내용 |
|---|---|
| 화면 틀 | 상단 막대, 왼쪽 장비 목록, 가운데 캔버스, 오른쪽 속성 패널. 시안의 배치 그대로. 상단의 내보내기·가져오기·모드 전환·ping 실행 버튼과 장비 목록은 모양만 있고 동작하지 않는다 |
| 캔버스 | 스냅샷의 Document에서 장비 노드와 링크를 SVG로 그린다 (읽기 전용). 노드를 누르면 선택, 더블클릭하면 터미널이 열린다 |
| 링크의 VLAN 표시 | Switch의 access 포트에 연결된 링크에는 `VLAN n` 표시. 한쪽 끝이라도 trunk 포트이면 굵은 보라색 선과 `trunk` 표시, 각 trunk 끝 옆에 그 끝의 허용 목록 (`허용 10, 20`, 전부 허용이면 `허용 전체`) |
| 속성 패널 (Switch) | 장비 이름과 종류, 포트 수와 연결 수, VLAN 목록(번호, 이름, 소속 포트), 포트 목록(상태 점, 이름, VLAN 또는 trunk 표시, 연결된 장비 이름 또는 허용 목록), MAC 주소 테이블, "터미널 열기" 버튼 |
| 터미널 창 | 시안의 어두운 창. 끌어서 옮기기, 크기 바꾸기, 닫기, 다시 열기. 입력은 창 안의 입력란 한 줄 |
| 터미널 입력 | Enter로 `exec`, Tab으로 `complete`, `?`로 `help`(입력 중인 줄 유지), 위·아래로 이전 명령어. 오류 줄에는 틀린 위치를 가리키는 `^` 줄과 한국어 설명 |
| 예시 불러오기 | 화면이 열릴 때 8.3절의 예시 Document를 `Simulator.load`에 넣는다 |

터미널 창은 장비 종류를 모른다. `ConsolePort`만 쓰므로 PC와 Router 담당도 같은 창을 쓴다.

**시안에 있지만 이번에 넣지 않는 것**: 캔버스 위의 실패 알림 띠, 장비 노드의 빨간 느낌표, 속성 패널의 빨간 경고 줄("trunk Fa0/8에 VLAN 10 허용 없음"), 하단의 실시간 막대, 하단의 이벤트·프레임 패널, 펭귄, 처음부터 열려 있는 터미널 3개와 그 안의 미리 적힌 내용. 모두 ping이 실제로 실행되고 engine이 실패 원인을 계산해야 나오는 것이라 kernel 연결 뒤에 넣는다. 자리만 차지하는 빈 껍데기로도 그리지 않는다. PC 노드는 예시 문서에 있으므로 캔버스에 그려지고, 더블클릭하면 터미널이 열리지만 PC 명령어는 PC 담당이 넣기 전까지 "알 수 없는 명령어"가 나온다.

장비 목록 아래의 장비 수는 시안의 `6 / 30`이 아니라 `LIMITS.maxDevices`(50)를 쓴다.

### 8.2 값의 출처 (AD-4, AD-7)

- VLAN 목록, 포트의 모드와 VLAN, 허용 목록, VLAN별 소속 포트: `snapshot.document`의 Switch 구성을 5.1절의 `shared` 함수로 읽는다. 화면이 기본값 규칙이나 소속을 직접 계산하지 않는다
- 포트 상태, MAC 주소 테이블: `snapshot.views`
- 프롬프트, 출력, 완성, 도움말: `ConsolePort`
- 화면이 직접 계산하는 것은 표현뿐이다: VLAN 번호별 색, 포트 이름 줄임(`Fa0/1`), 줄 배치.
- VLAN 색은 시안의 세 가지(1: 회색, 10: 청록, 20: 주황)를 시작으로, 번호에 따라 정해진 색 목록에서 고른다.

### 8.3 예시 자료

`packages/shared/src/examples`에 시안과 같은 문서를 더한다: PC 4대, Switch 2대, VLAN 10(SALES)·20(DEV), `Fa0/1`은 VLAN 10, `Fa0/2`는 VLAN 20, `Fa0/8`끼리 trunk. SW1의 trunk는 10,20 허용, SW2의 trunk는 20만 허용 (시안의 실패 장면). 기존 예시 테스트처럼 `validateDocument` 통과를 확인한다.

### 8.4 한국어 문구

오류 코드와 알림 코드의 한국어 문구를 `apps/web`에 둔다. AD-14대로 **모든 오류 코드와 모든 알림 코드를 다루는 `Record`**로 만들어, 코드를 더하고 문구를 빠뜨리면 타입 검사가 실패하게 한다. 이벤트 설명과 폐기 사유의 문구는 이벤트 목록을 만드는 Task(T1.9.1)의 몫으로 남긴다.

## 9. 작업 나누기

저장소 규칙이 "Task 하나에 브랜치 하나, 기록 문서 하나"이므로 계획 문서의 Task ID를 그대로 쓴다. 순서는 위에서 아래이고, 4번이 끝나면 브라우저에서 처음으로 직접 쳐 볼 수 있다.

| 순서 | Task ID | 이 Task에서 만드는 것 | 기대는 것 |
|---|---|---|---|
| 1 | T3.1.1 | `cli/ios`: 명령 정의 형태, 해석기(단어가 정확히 일치), 모드와 세션, 프롬프트, 모드에 맞지 않는 명령 거부 | 없음 |
| 2 | T3.1.2 | Switch 기본 명령어(`enable`, `disable`, `configure terminal`, `exit`, `end`, `hostname`), `console.ts`의 Switch 분기 | 1 |
| 3 | T5.1.1 | `shared`의 오류 코드 2개와 구성 읽기 함수, 예시 문서, `vlan/*` reducer와 정규화, `vlan`·`name`·`no vlan`, `show vlan brief` | 2 |
| 4 | T5.4.1 (새 ID) | 화면: 틀, 읽기 전용 캔버스, Switch 속성 패널, 터미널 창(Enter, 이전 명령어), 오류·알림의 한국어 문구 | 3 |
| 5 | T3.3.1 | `interface <이름>`과 인터페이스 이름 해석, config-if 모드 | 2 |
| 6 | T3.3.2 | `interface/set-admin`(Switch 분기), `shutdown`·`no shutdown`, `no` 형식 | 5 |
| 7 | T1.7.3 | 전달 규칙 `switchForward`의 바탕: 포트별 VLAN 분류의 틀, 학습, 알려진 목적지 전달, flooding, 같은 포트, 300초 만료, MAC 테이블 정리 | 3 (구성 읽기 함수) |
| 8 | T5.2.1 | `switchport/set-mode`·`set-access-vlan` reducer와 명령어, 자동 생성 알림, 전달 규칙의 access VLAN 분리와 `blocked`, 폐기 사유 `VLAN_INACTIVE`, 화면의 포트·링크 VLAN 표시 | 6, 7 |
| 9 | T5.3.1 | `switchport/set-allowed-vlans` reducer와 명령어(목록 해석), 전달 규칙의 trunk 태그와 허용 목록, 화면의 trunk 표시 | 8 |
| 10 | T5.3.2 | `show interfaces trunk` | 9 |
| 11 | T3.2.1 | 줄임 입력 | 2 |
| 12 | T3.2.2 | Tab 완성과 `?` 도움말 (engine) | 11 |
| 13 | T3.2.3 | 터미널 창의 Tab과 `?` | 4, 12 |
| 14 | T3.5.1 | CLI 오류 다섯 가지와 틀린 위치 | 11 |
| 15 | T3.5.2 | 터미널 창의 오류 위치 표시(`^`)와 한국어 설명 | 4, 14 |
| 16 | T3.4.1 | `show running-config`와 왕복 테스트 (그때까지 만든 모든 명령 정의에 `serialize`) | 10 |
| 17 | T3.4.2 | `show mac address-table` | 7 |
| 18 | T5.2.2 | kernel 연결: `DeviceModel`을 구현하는 Switch 모델, Trace 이벤트, `blocked`를 폐기 이벤트로, 실패 사유 문구 | kernel (다른 담당) |

- 11~17은 서로 거의 기대지 않으므로 순서를 바꿀 수 있다. 18은 kernel이 들어온 뒤다.
- **Task를 계획과 다르게 자른 곳**: T1.6.1의 "명령 정의 형태와 해석기"는 아직 아무도 만들지 않았으므로 1번(T3.1.1)에서 함께 만든다. T1.7.3은 kernel 없이 되는 부분(7번)과 kernel 연결(18번, T5.2.2의 기록에 적음)로 나뉜다. T5.1.1·T5.2.1·T5.3.1의 `serialize`는 16번(T3.4.1)에서 넣는다. 각 Task의 기록 문서 "계획과 달라진 점"과 "남은 일"에 적는다.
- **T5.4.1은 계획 문서에 없는 ID다.** Switch의 화면은 계획에 Task가 없고, 틀(T1.1.4)과 콘솔(T1.6.2)은 범위가 훨씬 넓어 그 ID를 쓰면 "끝났다"고 읽힌다. 그래서 E5의 다음 번호를 새로 붙였다. 계획 문서 본문은 팀이 합의한 뒤에 고친다.

## 10. 테스트

| 대상 | 방법 |
|---|---|
| reducer | 단위 테스트: 번호 경계(0, 1, 4094, 4095), VLAN 1 삭제·이름 변경 거부, 64개 한도, 자동 생성과 알림, 허용 목록 합치기, 정규화. 속성 기반 테스트: 임의의 Command 열을 적용한 Document가 항상 `validateDocument`를 통과 |
| 전달 규칙 | 단위 테스트(손으로 만든 프레임): 6.2절 표의 각 줄, flooding 범위, 학습 뒤 한 포트 전달, 같은 포트 폐기, 300초 만료, 꺼진 포트. 장면 테스트: Switch 2대의 구성으로 `switchForward`를 두 번 이어 불러 "VLAN 10 프레임이 trunk에서 태그 10을 달고 건너가 VLAN 10 포트로만 나온다"와 "허용 목록에 없으면 SW2에서 `TRUNK_NOT_ALLOWED`" 확인 |
| CLI 공통 | 단위 테스트: 모드 전환 표, 줄임 표, 오류 다섯 가지와 위치. 속성 기반 테스트: 유일한 접두사는 원래 명령어로 해석, 도움말 후보와 해석기의 일치 |
| Switch 명령어 | 통합 테스트: 명령 줄의 열을 `exec`로 실행하고 프롬프트·출력·Document 비교. 속성 기반 테스트: 임의의 Switch 구성 → `show running-config` → 새 Switch에 입력 → 같은 구성 |
| 화면 | 컴포넌트 테스트: 예시 문서로 속성 패널과 링크 표시 렌더링, 터미널 입력(Enter, Tab, `?`, 이력). 수동: 로컬에서 시안의 명령 순서(`vlan 10` → `name SALES` → `int fa0/1` → `sw acc vlan 10` → `show vlan brief`)를 쳐서 패널과 캔버스가 바뀌는지 확인 |
| 회귀 | 기존 예시(`twoPcDocument`, `twoPcSwitchDocument`, 30대 예시)의 테스트가 그대로 통과 |

## 11. 다른 담당과 만나는 지점

| 지점 | 상대 | 맞출 것 |
|---|---|---|
| `shared`의 코드와 함수 추가 (9절의 3번, 8번) | 전원 | PR에서 두 사람 모두 확인 |
| `reducer.ts`의 `handlers` 목록 | 전원 | 각자 자기 Command의 줄만 더한다. 처리기 본문은 각자 파일에 둔다 |
| `console.ts`의 장비 종류별 분기 | 전원 | Switch 분기를 먼저 넣는다. PC·Router 담당은 자기 분기를 더한다 |
| `cli/ios` | Router 담당 | `enable`, `configure terminal`, `interface`, 줄임, 도움말, `show running-config` 조립을 다시 만들지 않고 이 위에 명령 정의만 더한다. Router에 필요한 매개변수 타입(IPv4, 마스크)은 Router 담당이 `ios`에 더한다 |
| `interface/set-admin` | Router 담당 | 한 처리기에 Switch 분기와 Router 분기 |
| `device/rename` | 장비 reducer 담당 | `hostname`이 이것을 dispatch한다 |
| 화면 틀과 터미널 창 | 화면을 만드는 사람 전원 | 9절의 4번이 먼저 들어가면 이것을 이어 쓴다. 다른 사람이 틀을 먼저 만들면 4번은 속성 패널·링크 표시·터미널 입력만 그 틀에 얹는다 |
| kernel과 `DeviceModel` | kernel 담당 | 9절의 18번에서 `switchForward`를 감싼다 |

## 12. 계획 문서와 달라지는 점

Task 기록 문서의 "계획과 달라진 점"에 적는다.

- **분담이 계층별에서 장비별로 바뀌었다.** `06-two-pc-ping-plan.md` 6.3절과 6.5절은 A(통신 엔진), B(화면), C(계약과 구성 변경)로 나누고 폴더도 그렇게 배정했다. 지금은 PC, Switch, Router로 나눈다. 그래서 이 설계는 Switch 담당이 `reducer`, `cli`, `devices`, `apps/web`을 모두 건드린다.
- **Switch 모델이 처음부터 VLAN을 안다.** 계획은 T1.7.3(VLAN 1만) 뒤에 E5에서 VLAN을 더한다. VLAN을 쓰지 않는 구성에서는 결과가 같다.
- **전달 규칙이 kernel보다 먼저 나온다.** 계획은 T1.7.3이 T1.7.2(kernel의 링크 전달)에 기댄다.
- **CLI의 순서가 바뀐다.** 계획은 E3 전체 뒤에 E5지만, 여기서는 모드(T3.1.1, T3.1.2) 뒤에 바로 VLAN(T5.1.1)과 화면을 만들어 일찍 눈으로 확인한다.
- **PC의 CLI는 명령 트리를 함께 쓰지 않을 수 있다.** AD-8은 "명령 트리 하나"를 전제로 한다. Switch와 Router는 `cli/ios` 하나를 쓰고, PC는 담당의 판단에 맡긴다.
- **`shared`에 오류 코드 2개, 폐기 사유 1개, 구성 읽기 함수를 더한다** (5.1절).
- **계획에 없는 Task ID T5.4.1을 쓴다** (9절).
- **캔버스를 `@xyflow/react`가 아닌 SVG로, 터미널을 xterm이 아닌 입력란으로 시작한다.** 시안이 그렇게 되어 있고, 끌어다 놓기와 연결이 이번 범위에 없기 때문이다. 03 문서 3.12절이 입력란 대체를 허용한다. 캔버스 라이브러리는 끌어다 놓기를 만드는 Task에서 정한다.
- **Tailwind를 쓰지 않고 시안의 CSS를 옮긴다.**
- **오류·알림의 메시지 카탈로그를 T1.9.1보다 먼저 만든다.** 이벤트 설명과 폐기 사유의 문구는 T1.9.1에 남긴다.

## 13. 만드는 사람에게 맡기는 것

- 폴더와 파일의 정확한 이름, 함수 이름, 내부 자료구조 (`MacTable`의 형태 등)
- `defineCommand`의 세부 타입, 매개변수 타입의 구현
- 속성 기반 테스트의 생성기
- VLAN 색 목록의 나머지 색 (시안의 색 계열 안에서)
- React 컴포넌트의 나누기, 상태 보관 방식 (선택한 장비, 열린 터미널, 입력 이력)
- 터미널 창의 처음 위치 규칙

## 14. 사용자가 말하지 않아 내가 정한 것

읽으면서 확인해 주세요. 틀린 것이 있으면 고칩니다.

1. Switch 모델(T1.7.3)과 IOS 방식 CLI의 바탕(E3의 대부분)도 Switch 담당의 범위로 넣었다.
2. `shared`에 오류 코드 2개, 폐기 사유 1개, 구성 읽기 함수를 더한다 (5.1절).
3. VLAN 1은 지울 수도, 이름을 바꿀 수도 없다. 문서에 VLAN 1이 없어도 있는 것으로 친다.
4. VLAN을 지워도 포트의 access VLAN 값은 그대로 두고, 그 포트는 통신할 수 없게 한다. 이 상태는 `show running-config` 왕복 보장에서 뺀다.
5. trunk에서 VLAN 1은 태그 없이 나간다.
6. `interface range`, `allowed vlan add/remove`, `do`는 이번에 넣지 않는다.
7. `show` 출력은 Packet Tracer의 문구를 그대로 베끼지 않고 7.5절의 형식을 쓴다 (계획 문서 T3.4.2의 요구). 시안의 터미널에 적힌 출력과 조금 다르다.
8. 화면은 예시 문서를 불러와 보여 주는 읽기 전용 캔버스로 시작한다. 장비 놓기와 연결은 넣지 않는다.
9. 시안의 실패 알림 띠, 경고 줄, 하단 패널, 펭귄은 kernel 연결 뒤로 미룬다 (8.1절).
10. 캔버스는 SVG, 터미널은 입력란, 스타일은 시안의 CSS로 시작한다.
11. 운영 주소의 `/`는 건드리지 않는다. 화면 확인은 로컬에서 한다.
12. 작업을 계획 문서의 Task ID대로 18개로 나누고, Switch 화면에는 새 ID T5.4.1을 붙였다 (9절).
13. 오류·알림 코드의 한국어 문구 전체를 이 범위에서 쓴다 (8.4절).
