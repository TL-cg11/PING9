# Adversarial Divergence Review — ARCHITECTURE-SPINE (PacketTracer WEB)

- Reviewed: `ARCHITECTURE-SPINE.md` (status: draft, 2026-11-05) against `docs/project-plan/02-requirements.md`
- Lens: construct pairs of units one level below the spine that each obey AD-1..AD-15 literally and still cannot be integrated.
- Assumed split: Dev A = `packages/engine` (kernel, device models, CLI). Dev B = `apps/web`, `apps/api`, `deploy`.
- Note: the companion `docs/project-plan/03-system-design.md` named in the front matter does not exist yet, so the spine is currently the only contract.

## Verdict

The spine fixes *where* things live and *which direction* calls flow, and it does that well (AD-1, AD-2, AD-10, AD-11, AD-12 are tight and testable). It does not fix the *shape and timing* of the three surfaces where Dev A and Dev B actually meet: the `Simulator` facade, the `ConsolePort`, and the `Trace`. Each is named but has no signature, no result type and no ownership of the adjacent state. Both developers will code against their own guess in week 1. Three critical and seven high findings; all are fixable with one or two sentences each, before any code is written.

## Summary

| # | Sev | Units | One-line hole |
| --- | --- | --- | --- |
| C1 | critical | engine `Simulator` facade / web store, canvas, save manager | `dispatch` has no return type, no sync/async decision, no read or subscribe contract; "Command" does not say whether ping is one |
| C2 | critical | engine trace producer / web replay view and event list | Event schema semantics undefined: step granularity, flooding, frame identity, link reference, primary failure, trace ownership |
| C3 | critical | engine CLI / web console (xterm) | `ConsolePort.exec` result shape, prompt, completion and `?` API, history and scrollback ownership all undefined |
| H1 | high | CLI command tree / settings panel | AD-3 and AD-8 both validate IP format; rejection and warning shape not defined for the non-CLI path |
| H2 | high | engine switch/link model / web canvas / shared schema | Port and link endpoint reference shape undefined; MAC is both "computed" (AD-5) and "stored in Document" (Conventions) |
| H3 | high | engine and api error producers / web message catalog | AD-14 defines two different API error shapes; params untyped; non-drop event descriptions have no code |
| H4 | high | web import, api validator / engine load | "Same schema" covers shape only; referential invariants live in the reducer, which import and api never run |
| H5 | high | web save manager / api topology store | `revision` start value, incrementer, response contract, in-flight overlap, 409 behaviour and FR-2 local draft undefined |
| H6 | high | engine `DeviceModel` view / web panels, canvas status | AD-7 "web does not branch on device kind" is unenforceable; display-state shape and port-status enum undefined |
| H7 | high | Deferred "Web Worker" / every web call site | Deferral claims callers will not change, but only `ConsolePort.exec` is async |
| M1 | medium | engine reducer / engine kernel / web clock | Runtime invalidation on edit and virtual-clock advancement have no owner |
| M2 | medium | web canvas add/rename / CLI `hostname` | Default-name assignment and name character set undefined |
| M3 | medium | web console / web replay / web table panel | Runtime is already final while replay is mid-trace; console output versus animation order undefined |
| M4 | medium | shared migration / web open / api save | `schemaVersion` has two homes; nobody is named to run migrations; stale SPA versus new API |
| M5 | medium | engine tests / web tests | No contract fixtures or fake engine; determinism is not testable as worded |
| M6 | medium | web UI store / engine Document | Dangling IDs in UI state after delete; xyflow as a second owner of position |
| M7 | medium | web dev server / api / deploy | Local dev contradicts AD-12 same-origin unless a proxy is mandated; migration run point undefined |
| M8 | medium | api topology row / Document / export file | Topology name and `device_count` ownership; export envelope undefined |
| L1 | low | web / api | FR-8 example topologies have no home |
| L2 | low | engine / shared | Simulation constants (2,000 events, 20 traces, 300 s, 2 s) not covered by "limit constants" |
| L3 | low | api / web | FR-4 duplicate: server-side copy or client GET+POST |
| L4 | low | api | AD-12 "no other origin" and AD-2 "lint" name no mechanism; session lifetime undefined |
| L5 | low | Deferred undo / Command shape | Undo deferral holds only if Commands are self-contained plain data |

---

## Critical

### C1 — The `Simulator` facade has a name but no contract

- **Units:** engine `Simulator` (Dev A) versus web store, canvas and save manager (Dev B).
- **How they diverge while obeying the ADs:** AD-3 says the only write path is `Simulator.dispatch(Command)`; AD-4 says web "only reads" Document and Runtime. Neither says what `dispatch` returns, whether it is synchronous, how web learns that state changed, or whether reads are live references or snapshots. Dev A ships `dispatch(cmd): void` that mutates an internal object and exposes getters; Dev B builds Zustand selectors that expect a new immutable `document` reference per accepted Command, plus a returned result to show errors. React never re-renders, and the save manager cannot detect "dirty". Second ambiguity: the paradigm table defines core as `(state, Command) → (state, events)`, AD-3 scopes Command to Document changes. So is `ping`, `arp -d` or `enable` a Command? Dev A returns the Trace from `ConsolePort.exec`; Dev B waits for it in a `dispatch` result or a Runtime list. Third: nothing says whether the engine throws on bad input (FR-30 requires the editor to survive).
- **Proposed rule:** Add an AD: web imports from engine only `Simulator` with `load(document)`, `dispatch(command): DispatchResult`, `console(deviceId): ConsolePort`, `getSnapshot()` and `subscribe(listener)`; a snapshot is immutable plain JSON `{ document, docVersion, view, traces }`, and `document` gets a new reference and `docVersion` increments by one if and only if a Command is accepted. `Command` means Document change only; Runtime effects (ping, `arp -d`, mode change) enter only through `ConsolePort.exec`; the engine never throws for user-caused conditions.

### C2 — `Trace` is "one schema in shared" with no semantics

- **Units:** engine trace producer (Dev A) versus web replay view, event list and frame inspector (Dev B).
- **How they diverge while obeying the ADs:** AD-6 fixes the location of the event schema and the six action names, nothing else.
  1. **Step granularity.** A switch floods to 7 ports: Dev A emits one `forward` event with a port list; Dev B animates one frame per event and needs seven. Or Dev A emits seven events with the same virtual time and Dev B plays them one after another instead of in parallel. "단계 번호" is undefined: event index, or group of events at one virtual time.
  2. **Movement.** Animating a frame along a link (FR-39) needs "from port, to port, link". Events carry "장비, 포트" only; Dev B must infer the link from the Document, which may have changed since.
  3. **Frame identity.** FR-42 highlights fields changed "since the previous step". After a flood there are several concurrent frames; without `frameId` and a parent reference Dev B diffs against the wrong frame.
  4. **Primary failure.** FR-47 jumps from the failure text to "the" event. A normal trace is full of `NOT_FOR_ME` drops; Dev B picks first or last drop, Dev A meant another.
  5. **Document dependency.** AD-6 says replay draws from `(Trace, step)` alone. That is impossible: positions come from the Document. A trace kept in the 20-item history (FR-40) may reference a deleted device or link.
  6. **Ownership.** `Trace` appears in none of the three AD-4 state rows. The 20-trace history, trace IDs (the engine may not generate random IDs) and eviction have no owner.
- **Proposed rule:** Tighten AD-6: each event is exactly one frame at one place and carries `seq`, `time` (relative to trace start), `frameId`, `parentSeq`, `deviceId`, `inPort`/`outPort` as `PortRef`, `linkId` for movements, a frame snapshot and `{ code, params }`; a flood is N `forward` events, and a replay step is the set of events sharing one `time`. A `Trace` carries `id` (engine counter), `docVersion` and `result: { status, primaryDropSeq }`; the engine owns the last-20 list as Runtime; replay reads the current Document for geometry only and marks a trace stale when a referenced ID is missing.

### C3 — `ConsolePort` is one method name

- **Units:** engine CLI and device console (Dev A) versus web console view on xterm (Dev B).
- **How they diverge while obeying the ADs:** AD-7 gives only "`ConsolePort.exec` returns a `Promise`". Open points, each of which both sides must guess:
  - **Result shape.** Dev A resolves a string; Dev B needs structured lines to attach a Korean explanation (AD-14 forbids Korean in engine), a caret position (FR-46) and a "open this trace" link per failed ping round (FR-38).
  - **Prompt.** `R1(config-if)#` depends on hostname and mode. Dev A returns it with each result; Dev B computes it from Document and a mode it cannot read.
  - **Completion and help.** FR-21 needs Tab and `?` on a partial line. AD-8 says they are computed from the tree, but `DeviceModel` lists only "콘솔 명령 실행". Dev B has nothing to call, or re-implements prefix matching in web, which is exactly what AD-8 exists to prevent.
  - **Session state.** AD-4 puts "CLI 세션 모드" in Runtime. FR-19 also requires previous output to survive closing the console, and FR-21 requires history. Scrollback and history have no owner: Dev B keeps them in the xterm instance (lost on unmount), Dev A assumes web keeps them.
  - **Cardinality.** One session per device or per console window is not stated; nor what happens to a session in `config-if` when that device is deleted.
- **Proposed rule:** Define `ConsolePort` in the spine as `exec(line): Promise<ConsoleResult>`, `complete(line): Completion` and `help(line): HelpEntry[]`, where `ConsoleResult = { lines: Array<text | error{code, params, position?} | notice{code, params} | traceRef{traceId}>, prompt }`. There is exactly one session per `deviceId`, created lazily and destroyed with the device; the engine owns mode, sub-mode target and prompt; the web UI store owns scrollback and command history keyed by `deviceId`.

---

## High

### H1 — Two validators and two rejection shapes for one change

- **Units:** CLI command tree (Dev A) versus settings panel (Dev B).
- **How they diverge:** AD-3 says validation (IP format, duplicates, limits) happens only in the reducer. AD-8 gives every command "매개변수 타입", and FR-46 requires "형식이 틀린 값" with a word position, so the CLI parser necessarily validates IP format too. The same bad mask is rejected by the parser for CLI input and by the reducer for panel input, with different codes. AD-14 names "CLI errors and drop reasons" as `{ code, params }` but never mentions reducer rejections, so the panel has no defined error shape. FR-27 (duplicate IP: accepted with a warning) and FR-32 (VLAN auto-created with a notice) need a non-error channel that neither path defines.
- **Proposed rule:** Parsing and validating a value type (IP, mask, VLAN id, port name) is one function per type in `shared`, used by both the CLI parameter types and the reducer, returning the same code. `DispatchResult = { ok: true, notices: Notice[] } | { ok: false, error: { code, params } }`; the console wraps it unchanged and adds only `position`.

### H2 — Port, link endpoint and MAC identity

- **Units:** engine switch and link model (Dev A), web canvas on xyflow (Dev B), Document schema in shared (whoever writes it first).
- **How they diverge:** The spine fixes port display names but not how a port is referenced. Candidates all obey the ADs: `{ deviceId, portName }`, `{ deviceId, portIndex }`, a separate `portId`. xyflow edges are directed (`source`/`target` plus handle ids); an engine link is an unordered pair. AD-5 says MAC is "computed from device ID and port number", yet the Conventions table says the Document stores MAC as a string and shows `02:00:00:00:00:01`, a sequential value that cannot come from a web-generated string ID. The ID format itself is only "문자열".
- **Proposed rule:** `PortRef = { deviceId, port }` where `port` is the canonical full name from the Conventions table, and a link is `{ id, ends: [PortRef, PortRef] }` with no direction; web maps `ends` to xyflow source/target at render time only. Entity IDs are `crypto.randomUUID()` strings; MAC is never stored in the Document and is derived by one exported engine function (strike the MAC example from the Document row of the Conventions table).

### H3 — AD-14 contradicts itself and leaves params untyped

- **Units:** engine and api error producers versus the web message catalog.
- **How they diverge:** The Rule says api errors are `{ code, params }` and, two sentences later, that the response shape is `{ "error": { "code", "message", "details" } }`. Dev B's catalog cannot know whether to read `params` or `details`, and `message` invites the server-side text the AD prevents. Param names are free-form: producer sends `{ device, iface }`, catalog expects `{ deviceName, port }`. FR-47 needs device names in text; if params carry names they go stale after a rename, if they carry IDs the lookup fails after a delete. The event "설명" for non-drop events (for example "MAC not in table, flooded to VLAN 10") has no code at all: the six action values are not enough to produce it, so Dev A will write an English or Korean string into the event.
- **Proposed rule:** One shape everywhere: `{ code, params }`; the HTTP body is `{ "error": { "code", "params" } }` with no `message`. `shared` exports a map type from each code to its params type, the web catalog is typed `Record<Code, (params) => string>` so a missing entry fails compilation, every trace event carries a `reason` code from a shared enum (not only drops), and params carry IDs plus the display name captured at event time.

### H4 — Shape-valid Documents that the engine cannot load

- **Units:** web import feature and api validator versus engine load.
- **How they diverge:** AD-9 makes all three validate "with the same schema". AD-3 puts duplicates and limits "only in the reducer", and api may not import engine (AD-1). A file with a link whose `ends` name a missing device, two links on one port, duplicate hostnames, or VLAN 5000 passes Zod in web and api, is stored, and then breaks reducer and kernel assumptions on open. Each unit obeyed its AD.
- **Proposed rule:** `shared` exports `validateDocument(input)` = schema plus referential and uniqueness invariants as pure functions; web import, api save and engine `load` all call it and nothing else. The reducer's per-Command checks must be expressible as "the resulting Document passes `validateDocument`", enforced by a property test.

### H5 — `revision` lifecycle and the save protocol

- **Units:** web save manager versus api topology store (and two browser tabs).
- **How they diverge:** AD-10 says "send the revision you read; mismatch gives 409". Undefined: the initial value, that the server increments, that the success response returns the new value (without it the second autosave 409s against itself), where it travels (body, header, or inside the Document), and that saves must not overlap (a 3-second debounce plus a manual save produces two in-flight requests with the same revision). Client behaviour on 409 is undefined, and PRD Q3 still proposes "later save overwrites with a warning", the opposite of AD-10. FR-2 requires unsaved changes to survive a re-login, which is a full-page OAuth redirect; the spine names no browser storage, key or conflict rule for that draft.
- **Proposed rule:** `revision` lives only in the row and the API envelope (never inside the Document), starts at 1, and is incremented only by the server on a successful write; every write response returns the new value. The save manager is single-flight (at most one request in flight, latest snapshot wins); on 409 it stops autosave and offers "reload" or "save as copy"; on 401 it writes `{ topologyId, baseRevision, document }` to IndexedDB and replays it after login through the same 409 path.

### H6 — AD-7's "web does not branch on device kind" cannot be obeyed

- **Units:** engine `DeviceModel` display-state query (Dev A) versus web settings panel, table panel, palette and canvas status (Dev B).
- **How they diverge:** Web must branch on kind for icons, palette, the PC settings form and the FR-44 tables (MAC table for a switch, routing table for a router). The rule is broken on day 1, after which it restrains nothing. The "표시용 상태 조회" return shape is undefined: Dev A returns kind-specific objects, Dev B expects generic `{ columns, rows }`. Port status is also unowned: FR-18 lists three states, FR-43 adds "상대 쪽이 꺼짐"; Dev B derives it from Document, Dev A from Runtime.
- **Proposed rule:** Narrow AD-7: web may switch on `kind` for presentation only (icon, palette, panel layout); every derived value comes from `DeviceModel.view()`, whose return type is a `kind`-discriminated union defined in `shared`. `PortStatus = 'up' | 'admin-down' | 'no-link' | 'peer-down'` is a shared enum computed only by the engine.

### H7 — The Web Worker deferral is not safe as written

- **Units:** the Deferred row versus every web call site.
- **How they diverge:** The row claims "나중에 옮겨도 호출 쪽이 바뀌지 않는다" because of AD-1 and AD-7. Only `ConsolePort.exec` is asynchronous. `dispatch` and all reads are unspecified and will be written synchronously; moving to a Worker after week 1 changes every one of them and forbids shared references. This is a decision that lets both developers diverge now.
- **Proposed rule:** Decide now and delete the row. Either "MVP runs the engine on the main thread; NFR-2's 100 ms budget is checked in CI", or "`dispatch` returns a `Promise` and web reads only pushed snapshots". In both cases every value crossing the engine boundary is structured-clone-safe plain data.

---

## Medium

### M1 — Runtime invalidation on edit, and who moves the virtual clock

- **Units:** engine reducer (owns Document), engine kernel (owns Runtime), web (owns real time).
- **Divergence:** AD-4 resets Runtime only "when a Document is opened". FR-13 (link removed → MAC entries for that port cleared), FR-34 (interface down → connected route gone), an IP change (stale ARP entries) and device deletion all need Runtime changes caused by a Document Command; the reducer may not touch Runtime and the kernel is not told. FR-28 ages MAC entries after 300 virtual seconds, but AD-5 forbids the engine a clock and no unit is named to advance virtual time between user actions.
- **Proposed rule:** Every accepted Command is passed to the kernel as `onDocumentChanged(prev, next, command)`, the only place Runtime is invalidated; tables derivable from the Document (routing table, VLAN membership) are never stored in Runtime. Virtual time advances only while a simulation run executes, plus a fixed gap (state the value) between console commands; web never sends wall-clock time.

### M2 — Default names and the name character set

- **Units:** web canvas add/rename versus engine reducer and CLI `hostname`.
- **Divergence:** FR-9 needs unique default names (PC1, SW1, R1). Web creates IDs (AD-5), so Dev B may also compute the name; Dev A may assign it in the reducer; both, or neither. Canvas rename accepts spaces or Korean; `hostname` is a single CLI token, so `show running-config` no longer round-trips (FR-23). Names from an imported file are written into xterm, so control characters become terminal escape sequences.
- **Proposed rule:** `device/add` carries `{ id, kind, position }` and no name; the reducer assigns the lowest unused `<prefix><n>`. Device and VLAN names match one `shared` pattern (ASCII letters, digits, `-`, `_`, 1–32 characters) enforced by `validateDocument`.

### M3 — Final Runtime versus mid-replay canvas

- **Units:** web console, web replay view, web table panel (all reading one engine).
- **Divergence:** AD-6 computes a whole trace before replay starts. When step 3 of 20 is on screen, the MAC table panel (FR-44) and port colours already show the end state, and the console has already printed all four ping lines, while UJ-1 describes packets moving and then replies appearing. Whether four traces autoplay in sequence, and what an edit during playback does, is undefined.
- **Proposed rule:** State it: console output and Runtime panels always show post-run state; replay is an independent viewer and never gates console output. Autoplay starts with the first trace of a ping, and any accepted Command stops playback.

### M4 — `schemaVersion` has two homes and no caller

- **Units:** shared migration functions, web open/import, api save.
- **Divergence:** The version is both a table column and (per AD-9) a Document field. AD-9 puts migration functions in `shared` but names no caller: api "does not interpret" Documents (AD-10), web may migrate on open and save back, or not. A tab running an older SPA bundle saves an old-version Document to a newer api.
- **Proposed rule:** `schemaVersion` inside the Document is the source of truth and the column is a copy written by api. api accepts only the current version and answers `SCHEMA_VERSION_MISMATCH` otherwise; migration runs in exactly two places, api on read and web on file import.

### M5 — No test boundary guards the contract

- **Units:** engine tests versus web tests.
- **Divergence:** The stack lists Vitest, fast-check and Playwright, but no rule says what proves the two halves agree. Dev B needs Traces and view data in week 1, before the engine exists, and will hand-write them in a guessed shape. NFR-11 ("same input, same trace") is not testable as worded, because Runtime (warm ARP cache, absolute virtual time) is part of the input.
- **Proposed rule:** `packages/shared/fixtures` holds sample Documents and golden Traces; engine tests must reproduce the golden Traces byte-for-byte from `load(document)` plus a scripted console input, and web replay tests must render the same files. Determinism is defined as: equal `(Document, console script)` from a fresh `load` gives equal Traces.

### M6 — UI state pointing at deleted entities; a second owner of position

- **Units:** web UI store and xyflow versus engine Document.
- **Divergence:** Selection, open consoles and the replay cursor hold IDs; after `device/remove` they dangle. xyflow keeps its own node positions during a drag; dispatching `device/move` per pointer event floods autosave, while dispatching nothing makes xyflow a second owner of a Document field.
- **Proposed rule:** xyflow nodes and edges are derived from the snapshot on every render and are never stored; a drag is UI state until drop, then exactly one `device/move`. On each new snapshot the UI store drops IDs that no longer exist.

### M7 — Local development contradicts AD-12

- **Units:** web dev server, api, deploy.
- **Divergence:** The deployment diagram shows "vite dev + api" locally, which is two origins; AD-12 forbids cross-origin requests and requires `Secure` cookies. Without a stated proxy rule, CORS code appears "for dev only". When database migrations run (image build, container start, by hand) is undefined, and Dev A needs Google OAuth credentials and Postgres just to run the canvas.
- **Proposed rule:** Locally, Vite proxies `/api` to the api process and the browser uses a single origin; no CORS middleware exists in any environment. Migrations run at app start before listening; `apps/web` can start with fixture Documents and no api.

### M8 — Topology metadata versus Document

- **Units:** api topology row, Document schema, export file.
- **Divergence:** `name` and `device_count` are columns; it is not stated whether `name` is also inside the Document, whether a rename bumps `revision` (a rename in the list tab would 409 the editor tab), or who computes `device_count` given that the server "does not interpret" content. The export file format (bare Document, or an envelope with the name) is undefined.
- **Proposed rule:** `name` lives only in the row and a rename does not change `revision`; `device_count` is computed by api from the validated Document on every write. The export file is `{ format: 'ptweb-topology', schemaVersion, name, document }`.

---

## Low

- **L1 — Example topologies (FR-8) have no home.** They could be web static files, api seed rows or shared fixtures. Rule: examples are Documents in `packages/shared/fixtures`, validated in CI, and instantiated through the normal create endpoint.
- **L2 — Simulation constants.** AD-9 covers "한도 상수" for Documents; the 2,000-event guard, 20-trace history, 300 s MAC ageing and 2 s ARP wait are not placed. Rule: all numeric limits and timers are named constants in `shared`.
- **L3 — Duplicate (FR-4).** Server-side copy and client GET+POST both satisfy AD-10. Rule: one `POST /api/topologies/:id/duplicate`, performed inside the repository module so AD-11 applies; entity IDs inside the Document are preserved.
- **L4 — Unnamed mechanisms.** AD-2 says "lint 규칙으로 강제" and AD-12 says "다른 출처의 요청을 허용하지 않는다" without naming the tool or check, and session lifetime (FR-2) has no value. Rule: name the boundary lint tool in the Stack table, reject state-changing requests whose `Origin` differs from the configured origin, and state the session TTL.
- **L5 — Undo deferral.** It holds only if Commands are self-contained. Rule: a Command is plain JSON with every ID it needs and no reference to current state.

---

## Rules that are unenforceable or too vague to test as written

| AD | Problem | Covered by |
| --- | --- | --- |
| AD-3 "같은 변경은 … 같은 Command 타입" | No list of Commands and no test; nothing stops a second validator in the CLI parser | C1, H1 |
| AD-4 "web은 읽기만 한다" | Not enforceable without immutable snapshots or a readonly type | C1 |
| AD-6 "(Trace, 단계 번호)만으로 그린다" | Literally false (geometry comes from the Document); "단계" undefined | C2 |
| AD-7 "web은 장비 종류로 분기하지 않고" | Violated by the palette and settings panel on day 1 | H6 |
| AD-9 "같은 스키마로 검증" | True for shape, silent on invariants; no caller named for migrations | H4, M4 |
| AD-10 "Document 내용을 해석하지 않고" | Conflicts with the `device_count` column | M8 |
| AD-14 | Two response shapes in one Rule | H3 |

## Silent dimensions

- **Testing boundaries:** silent (M5).
- **Environments:** local dev shape contradicts AD-12 (M7); the staging deferral is acceptable.
- **Operations:** migrations run point and session TTL missing (M7, L4); backup restore is not exercised, which is acceptable for an MVP if stated.
- **Error handling inside the browser:** engine exceptions versus returned errors undefined (C1).
- **Security:** AD-11, AD-12 and AD-15 are solid; the gaps are input character sets reaching xterm (M2) and the unnamed origin check (L4).
- **Deployment:** adequately covered for this scale; domain and TLS are honestly deferred.

## What should not change

AD-1, AD-2, AD-5 (apart from the MAC wording), AD-10's whole-document storage, AD-11, AD-12, AD-13 and AD-15 are specific, testable and leave no room for the two halves to drift. The fixes above add contracts at the three seams; none of them reverses an existing decision.
