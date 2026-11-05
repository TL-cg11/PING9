# Independent review: security and testing plan

- Reviewed: `docs/project-plan/05-security-and-testing.md` (the plan)
- Against: `docs/project-plan/03-system-design.md` (the design), `ARCHITECTURE-SPINE.md` (AD-1..AD-16), `docs/project-plan/02-requirements.md` (FR/NFR), `docs/project-plan/04-tasks/epic-2-account-and-save.md` (task wording where the plan points at a task)
- Review date: 2026-11-05
- Method: document review only. Nothing was executed. Statements about library or product behaviour that I could not confirm from the documents are marked **uncertain**.

## 1. Verdict

The plan is sound in its core (owner check in the repository layer, server-side cookie sessions, one shared validator, no server-side execution) and has no finding I would rate critical, but it leaves six high-severity gaps: one control that will break the primary classroom scenario as written (per-IP limit), one fail-open bypass of all authentication (test login), and four areas the threat model does not cover at all (backups, the CI/CD deploy path, the account cap as a lockout lever, personal data stored and logged by defaults).

Counts: 0 critical, 6 high, 12 medium, 10 low.

Severity is (likelihood for this deployment) x (impact). "This deployment" means: one small public VM, a 3-person student team as operators, users are a class of about 30 who often sit behind one campus IP and may use shared lab PCs, data is lab topologies plus Google id, email and name.

## 2. Findings, ranked

| # | Severity | Viewpoint | Title |
|---|---|---|---|
| F-01 | High | Defender, Attacker | Pre-login rate limit keyed by IP is wrong behind Caddy and behind a campus NAT |
| F-02 | High | Attacker, Auditor | Test-login gate is fail-open, and the plan's own tests create pressure to enable it in production |
| F-03 | High | Attacker, Defender | Backups: only on the VM they protect, unencrypted, permissions unspecified, contain personal data |
| F-04 | High | Attacker | CI/CD and the deploy path are absent from the threat model |
| F-05 | High | Attacker, Defender | The global account cap is a lockout lever with no recovery path |
| F-06 | High | Auditor | More personal data is stored and logged than NFR-9 allows, and no test checks it |
| F-07 | Medium | Attacker | Shared computers: long sliding sessions, silent Google re-login, drafts not bound to a user |
| F-08 | Medium | Attacker, Defender | Import runs `migrateDocument()` on unvalidated input; no fuzz property for the import path |
| F-09 | Medium | Attacker, Defender | `validateDocument()` rule set has gaps (ids, uniqueness, bounds, lengths, topology name) |
| F-10 | Medium | Defender | Size limits are inconsistent and the storage arithmetic is incomplete |
| F-11 | Medium | Auditor | CSP and header tests check presence only and run where the headers are not applied |
| F-12 | Medium | Auditor | Several tests would pass with the control missing, or cannot run as claimed |
| F-13 | Medium | Attacker | OAuth flow details unspecified: post-login redirect target, dev/prod clients, identity key |
| F-14 | Medium | Auditor | Account deletion (NFR-9) is under-specified and untested |
| F-15 | Medium | Defender | Count limits enforced by check-then-insert are racy |
| F-16 | Medium | Defender | Hardening covers only `app`; database role, Docker socket and firewall layer unstated |
| F-17 | Medium | Auditor | NFR-12 (accessibility) is missing from the test plan |
| F-18 | Medium | Auditor | Requirement id and traceability defects |
| F-19 | Low | Attacker | Terminal sanitisation scope is underspecified |
| F-20 | Low | Attacker | CSRF edge cases and cookie scoping on a shared free domain |
| F-21 | Low | Defender | Session lifetime has no absolute cap; no secret-rotation procedure |
| F-22 | Low | Attacker | Health endpoint: response content and database amplification |
| F-23 | Low | Auditor | Imprecise statements about memory limits and restart; PostgreSQL 18 volume path |
| F-24 | Low | Defender | Vulnerability gate has no exception process; secret scan runs too late |
| F-25 | Low | Defender | No cache-control requirement for API responses and the SPA shell |
| F-26 | Low | Defender | No monitoring or alerting of any kind |
| F-27 | Low | Defender | Rate limiter internals: order, eviction, a second limiter in the auth library |
| F-28 | Low | Defender | DOM sinks other than `dangerouslySetInnerHTML` are not covered by lint |

---

### F-01 (High) Pre-login rate limit keyed by IP is wrong behind Caddy and behind a campus NAT

- **Viewpoint:** Defender, Attacker
- **Plan:** SEC-13 second row (5.5): "로그인 전, IP별 분당 30회", enforced in api middleware. ST-15 tests only the 429 and "other users unaffected". The plan never says where the client IP comes from.
- **Problem:** Three failure modes, at least one of which will occur.
  1. `app` only ever sees Caddy's container address as the socket peer. If the limiter uses the socket address, every unauthenticated visitor in the world shares one bucket of 30 requests per minute; any single client can then keep login unavailable for everyone with one request every two seconds.
  2. If the limiter reads `X-Forwarded-For` without a defined trust rule, a client can choose its own bucket and the limit does nothing.
  3. Even with the correct client IP, a class of 30 behind one campus NAT address exceeds 30 per minute during a normal login: each student produces about three unauthenticated API requests (session probe returning 401, sign-in start, Google callback), so about 90 in the first minute. This contradicts NFR-5 and SM-4.
- **Fix:** Change SEC-13: "The client IP is the address Caddy writes into the forwarding header; Caddy is configured to discard client-supplied forwarding headers; `app` is reachable only through Caddy. The pre-login budget is sized for one NAT address carrying a whole class (🟡 at least 300 per minute), and applies before the session lookup." Add to ST-15: (a) a request through Caddy with a forged forwarding header is bucketed by the real address, (b) 30 logins from one address inside one minute complete without a 429.

### F-02 (High) Test-login gate is fail-open, and the plan's own tests create pressure to enable it in production

- **Viewpoint:** Attacker, Auditor
- **Plan:** SEC-3, TH-13, ST-12, T2.3.4. "운영 환경에서 켜져 있으면 api가 실행을 거부한다." PERF-4/PERF-5 need 30 authenticated virtual users on the deployed containers. ST-3, ST-4, ST-16 need logins in CI.
- **Problem:**
  1. "Production" is not defined. If it means an environment label such as `NODE_ENV`, the guard needs two variables to be right at once; a VM where the label was never set and the flag was copied from a test compose file starts normally with a route that issues a session for any user. That is a complete authentication bypass.
  2. PERF-4 does not say how 30 sessions are obtained on the production stack. The only mechanism the plan has is the test-login route, so the path of least resistance during release week is to switch it on in production "for the load test".
  3. If the test route creates sessions with its own code rather than through the auth library, ST-3 and ST-4 test the test helper and not the real cookie and session code. ST-16 cannot exercise the real sign-up hook at all (see F-12).
  4. The second half of ST-12 ("운영 주소에서 그 경로는 404") cannot pass "in CI" as 5.15 claims; it needs the deployed address.
- **Fix:** Rewrite SEC-3: "The test-login handler is registered only when the flag is set AND the host of `APP_URL` is a loopback name; the api refuses to start if the flag is set with any other `APP_URL`, regardless of any environment label. The production compose file does not declare the flag. The handler creates sessions through the same library call as the Google callback." Change PERF-4 to run against a separate Compose project with its own database, bound to loopback, never the production instance. Split ST-12 into a start-up refusal test (CI, including the case where the environment label is unset) and a post-deploy smoke check that fails the deployment.

### F-03 (High) Backups: only on the VM they protect, unencrypted, permissions unspecified, contain personal data

- **Viewpoint:** Attacker, Defender
- **Plan:** No SEC and no TH covers backups. 5.15 only checks "백업이 매일 생기고, 백업에서 복원해 보았다". Design 3.6: daily `pg_dump` kept on the server for 7 days, off-server copy undecided (X9). Design X6 flags that the free VM may be reclaimed.
- **Problem:**
  1. Loss or reclamation of the single VM destroys the data and all seven backups together, so NFR-7 is not met by the plan as written.
  2. A dump holds every user's Google id, email, name, session rows and whatever the auth library stores in its account table (see F-06). SEC-19 restricts only the environment file; the dump's owner, mode, location and encryption are unspecified.
  3. Nothing detects a silently failing backup job; the checklist verifies it once.
  4. Seven uncompressed dumps on the data disk multiply the storage worst case (F-10); a full disk stops PostgreSQL for everyone.
  5. Restoring a backup resurrects accounts deleted under NFR-9.
- **Fix:** Add a threat "backup disclosure or loss" and a requirement: "Dumps are compressed, written owner-only into a directory only the operator account can read, exclude the data of the session and verification tables, and are copied off the VM daily after encryption with a public key whose private half is not on the VM. The off-VM copy is a launch blocker (resolves X9)." Add a scripted check: newest backup is younger than 26 hours, non-empty, mode owner-only. Add to the restore procedure: re-apply the account-deletion log after any restore.

### F-04 (High) CI/CD and the deploy path are absent from the threat model

- **Viewpoint:** Attacker
- **Plan:** TH-11, TH-12, TH-15, SEC-19, SEC-20, SEC-22 cover secrets at rest, known-vulnerable dependencies and SSH password logins. Design 3.10: GitHub Actions builds an image, pushes it to a registry, then connects to the server over SSH to pull, migrate and restart.
- **Problem:** The CI system holds a key that gives a shell on the production VM, and the account it logs into must be able to run Docker, which is equivalent to root. The plan has no requirement for: which workflows can read that key, whether pull-request workflows receive secrets, branch protection on `main` (a direct push is a production deploy), pinning of third-party actions, the scope of the registry credential on each side, restricting what the deploy key may execute, or blocking dependency install scripts. A malicious package version or a compromised action is the most realistic route to a full takeover of this service, and ST-19 (known-vulnerability scan) does not detect either. ST-20 looks for committed secrets only at release time, after they are already in history.
- **Fix:** Add a threat "CI/CD or deploy credential compromise" and requirements: "(a) Deploy secrets live in a protected environment usable only by the deploy job on `main`; pull-request workflows receive no secrets and do not run with elevated triggers. (b) `main` requires a reviewed pull request and passing checks. (c) Third-party actions are pinned to a commit; workflow token permissions default to read-only. (d) The deploy key is a dedicated key bound to a forced command that runs only the deploy script, for a dedicated non-root account. (e) The CI registry credential can only push; the server credential can only pull. (f) Installs use the frozen lockfile with dependency lifecycle scripts disabled except an allowlist. (g) Secret scanning with push protection is enabled on the repository and runs on every pull request." Add these as items in 5.15.

### F-05 (High) The global account cap is a lockout lever with no recovery path

- **Viewpoint:** Attacker, Defender
- **Plan:** D19, TH-8, SEC-14 (200 accounts, sign-up refused above it), Y3 (hook location unknown), ST-16.
- **Problem:** The control that protects storage is itself an availability target: once 200 accounts exist, by deliberate throwaway registrations or simply by the link spreading or cohorts accumulating, the intended class cannot sign up. Accounts never expire, so the cap only fills. The plan has no way to prioritise intended users, no alert before the cap is reached, and no procedure to reclaim slots. Three implementation risks are also untested: the check may run on every callback and lock out existing users, a rejected sign-up may still leave a user row, and a count-then-insert check lets parallel sign-ups exceed the cap.
- **Fix:** Extend SEC-14: "The cap is checked only when a new user would be created, atomically with the insert. A sign-up mode setting (open, allowlist, closed) can be changed without a deploy. An operator script lists and removes accounts that have no topologies and are older than N days. The operator is alerted at 80% of the cap." Extend ST-16: at the cap an existing user still logs in; a rejected sign-up leaves no user, account or session row; N parallel sign-ups at cap minus one create exactly one account. (Note, **uncertain**: a Google OAuth client left in "testing" publishing status only admits listed test users, which is either an unintended block at launch or a usable allowlist; record which in 5.15.)

### F-06 (High) More personal data is stored and logged than NFR-9 allows, and no test checks it

- **Viewpoint:** Auditor
- **Plan:** SEC-1 ("요청하는 정보는 식별자, 이메일, 이름뿐"), SEC-18 and ST-11 (api log only), TH-10. NFR-9 and the FR-1 verification condition say the service *stores* only the Google id, email and display name.
- **Problem:**
  1. The auth library owns the user, account and session tables (design 3.6). Its default schema, as far as I know it, also has a profile-image URL on the user, IP address and user agent on each session, and access, refresh and id tokens on the account row. **Uncertain** for 1.7.x; the generated schema in T2.1.3 will show it. If so, NFR-9 is violated by default and no ST would notice.
  2. SEC-18 and ST-11 cover only the api's own log. The Caddy access log (design 3.9) records the client IP, the user agent and the full request address; for the Google callback the address includes the one-time authorization code and the state value, which SEC-18 says must never be logged.
  3. Design 3.9 says PostgreSQL logs slow queries. Slow-statement logging is off by default; when it is turned on, bind parameter values are logged in full by default, which puts whole documents and emails into the database log.
  4. The plan has no user-facing statement of what is collected or how to ask for deletion, although NFR-9 depends on the user being able to ask.
- **Fix:** Add a requirement: "After a login, the user row holds only id, email and name (plus library bookkeeping); token, image, IP and user-agent columns are empty or absent; the Google request asks only for the basic identity scopes and no offline access." Add a test that logs in and asserts those columns. Widen SEC-18 and ST-11 to the combined output of all three containers, require the proxy log to drop the query string on `/api/auth/*`, require statement-parameter logging to be disabled in PostgreSQL, and decide explicitly whether client IPs are logged and for how long. Add a short privacy note with a contact address to the login screen.

### F-07 (Medium) Shared computers: long sliding sessions, silent Google re-login, drafts not bound to a user

- **Viewpoint:** Attacker
- **Plan:** SEC-2 (7 days, extended on every use), AD-10 and T2.7.2 (IndexedDB record `{ topologyId, baseRevision, document }`), design 3.7 ("브라우저에 임시 보관").
- **Problem:** On a lab PC, the next person at the keyboard is the most likely "attacker" for this product and needs no technique. (1) A student who closes the tab without logging out leaves a session that stays valid as long as anyone keeps using it. (2) After an app logout the browser is usually still signed in to Google, so "Google로 로그인" silently returns the previous student's account. (3) Draft records carry no user id, are not removed on logout, and are read back without validation; a later user can read the previous user's draft, and a resume path that falls back to "save as copy" would move it into the wrong account. Topology deletion is permanent and the backups have no per-user restore.
- **Fix:** SEC-2: idle timeout 🟡 24 hours plus an absolute lifetime; the Google authorization request always shows the account chooser. New requirement: "Draft records include the user id; only drafts of the current user are resumed; logout removes the current user's drafts after a final save attempt; a draft is validated with `validateDocument()` when read; drafts older than N days are purged." Extend E2E-5: with a pending draft from user A, log in as user B and assert that nothing is uploaded and B's list is unchanged.

### F-08 (Medium) Import runs `migrateDocument()` on unvalidated input; no fuzz property for the import path

- **Viewpoint:** Attacker, Defender
- **Plan:** SEC-8, MAL-10, T7.1.2 and T2.4.3 ("`migrateDocument()` 뒤 `validateDocument()`"), AD-9. PBT-1..PBT-8.
- **Problem:** The order in the tasks means the migration function is the first code to touch attacker-controlled JSON, before the forbidden-key, depth and shape checks. Today the function is a pass-through, but the first real migration will be written assuming a well-formed old document. None of the property tests feeds arbitrary JSON into the import path; PBT-7 generates topologies, which I read as valid ones. SEC-7 says unknown fields are dropped, but nothing requires the api to store the validator's output rather than the request body, and ST-6 tests only rejections.
- **Fix:** Fix the pipeline order in SEC-8: "size check, parse inside error handling, forbidden-key and depth scan, envelope check (`kind`, integer `schemaVersion` between 1 and current), migrate, `validateDocument()`, then use only the validator's output." Add PBT-9: "Arbitrary JSON values and mutated valid documents never make the import pipeline throw; every accepted document can be loaded, snapshotted and serialised by every device without an exception." Add to ST-6: a document saved with an extra field is returned without it.

### F-09 (Medium) `validateDocument()` rule set has gaps

- **Viewpoint:** Attacker, Defender
- **Plan:** TH-4 (names only), SEC-7, SEC-8, SEC-11 (character rule for device and VLAN names only), design 3.4 and AD-9 (four cross-reference rules).
- **Problem:** The stated rules leave these open, each reachable through an import file or a direct API call:
  1. Device and link ids have no format rule. They become keys of `Snapshot.views` and of runtime tables, DOM attributes and React keys. SEC-8 bans dangerous *keys in the JSON*, not dangerous *values that later become keys*.
  2. Uniqueness of device ids and link ids is not in the rule list; neither is a link whose two ends are the same port or the same device.
  3. No bounds on `position` numbers (JSON allows magnitudes that break canvas arithmetic), and no maximum length stated for every string.
  4. Interface and port maps are keyed objects; keys must be checked against the fixed port names for that device kind rather than against a deny list.
  5. PostgreSQL JSONB cannot store the NUL character inside a string; a document containing it must be a 400 from the validator, not a database error surfacing as 500.
  6. MAL-8 says trunk allowed lists are stored as ranges; the design's document example stores a flat list. The schema must pick one.
  7. The topology `name` lives outside the document (AD-9) and therefore outside `validateDocument()`. No requirement gives it a length or character rule, yet it is rendered in the list and top bar and becomes the export file name. The export file's own `name` field has the same gap.
- **Fix:** Add to SEC-7: "Every string has an allowlist pattern and maximum length, every number a range, every array and keyed object a maximum size; ids match the UUID pattern and are unique; map keys come from the port-name set of the device kind; a link joins two different devices; the topology name is 1 to 🟡 100 characters without control characters and is validated by a `shared` function used by web and api." Add the corresponding rows to the invalid-document table in ST-6 and to the unit tests in 5.9.

### F-10 (Medium) Size limits are inconsistent and the storage arithmetic is incomplete

- **Viewpoint:** Defender
- **Plan:** SEC-12 (request body 1MB at Caddy and api), NFR-6 ("토폴로지 파일 1MB"), design 3.6 ("문서 크기는 1MB"), T7.1.2 (import file 1MB), the note under 5.5 (200 x 50 x 1MB = 10GB).
- **Problem:**
  1. Three different things are limited to the same 1MB: the document, the request body that wraps it (`{ name, document, revision }`) and the export file that wraps it (`{ kind, name, document }`, possibly indented). A document near its limit cannot be saved, and a user may be able to export a file they cannot re-import, which breaks FR-7.
  2. Nothing ties the byte limit to the count limits in SEC-15. A document within all count limits (50 routers with 100 static routes each is roughly 0.4MB) should always fit; nobody has checked.
  3. The 10GB figure counts live rows only. It omits dead row versions between vacuum runs (every autosave rewrites the whole document), the write-ahead log, seven daily dumps on the same disk, container logs and images. With uncompressed dumps the worst case is several times 10GB. **Uncertain:** the usable disk on the recommended free VM may be the default boot volume rather than the full free allowance; check before setting the cap.
  4. One account can churn about 60MB per minute through the write limit by rewriting one large document.
- **Fix:** Define one constant in `shared`: maximum document size as UTF-8 bytes of the compact serialisation (🟡 512KB), with the body limit and the import-file limit set higher (🟡 1MB and 2MB). Add a unit test that builds the largest document the count limits allow and asserts it is under the byte limit and its save request is under the body limit, and an E2E-9 case that round-trips it. Add a per-account total-bytes quota (🟡 5MB). Redo the worst-case arithmetic as live data x bloat factor + write-ahead log + 7 dumps + logs, and derive the account cap from that.

### F-11 (Medium) CSP and header tests check presence only and run where the headers are not applied

- **Viewpoint:** Auditor
- **Plan:** SEC-10, SEC-23, ST-9 ("운영 주소의 응답에 HSTS, 콘텐츠 보안 정책, 틀 표시 금지 헤더가 있음"), Y2. 5.15 lists ST-9 among tests that pass in CI.
- **Problem:** ST-9 would pass with a policy that allows everything, so it does not verify SEC-10. It also omits two of SEC-23's four headers (content-type sniffing, referrer). The headers are added by Caddy; the Vite dev server and the Vitest integration tests do not go through Caddy, so a policy that breaks the canvas or the terminal (Y2) would first be seen in production, and ST-9 "in CI" is only possible if the CI Compose stack includes Caddy with the production configuration, which the plan does not say.
- **Fix:** Write the exact policy into SEC-10 (self-only for scripts, connections and default; no objects; no base; forms to self; no framing; images self plus data URIs if the canvas needs them; inline styles allowed only if Y2 proves it necessary; inline or evaluated script never). ST-9 asserts the directive values and all four SEC-23 headers. State that E2E runs through Caddy with the production Caddyfile and fails on any policy-violation console message, and add one negative E2E check that an injected inline script does not run.

### F-12 (Medium) Several tests would pass with the control missing, or cannot run as claimed

- **Viewpoint:** Auditor
- **Plan:** 5.13, 5.12, 5.15.
- **Problem and fix, per test:**

| Test | Problem | Change |
|---|---|---|
| ST-3 | Cookie attributes depend on the configuration profile. In CI over plain HTTP with a non-production profile, either the test fails or `Secure` is quietly dropped from the assertion. Also depends on the test-login path (F-02). | Boot the app with the production configuration profile and assert the header from the library's own session creation. |
| ST-4 | Does not cover two SEC-2 claims: a new session identifier at login (Y1 mentions it, no ST does) and server-side storage. | Add: identifier differs before and after login; deleting the session row makes the cookie useless. |
| ST-5 | Only a *different* Origin. | Add: absent Origin, the literal `null` origin, and the auth library's own POST routes. |
| ST-8 | Pass criterion "거부되거나 글자로만 표시" is two different outcomes; "displayed as text" needs a concrete DOM and terminal assertion. | Fix the expected outcome per field (names: rejected). Add a unit test on the single terminal write function. |
| ST-10 | "서버 오류를 일으켜" has no method. | Name the fault (database unavailable, handler throwing). |
| ST-11 | Searches only the api log, and uses device names such as `PC1` as the needle, which is not distinctive. Does not search for the OAuth code. | Use unique marker strings in every sensitive field; search all container logs, including after a validation failure and a 500. |
| ST-12 | Second half needs the production address. | See F-02. |
| ST-13 | List omits memory, CPU and process limits, privilege-escalation setting and the absence of the Docker socket. | Assert each SEC-21 property by name. |
| ST-16 | Sign-up cannot be driven through real Google in CI; through the test-login route it does not exercise the library's sign-up hook (Y3). | Use a local stand-in identity provider in CI, or state that ST-16 is manual. |
| ST-17 | "Both layers" is only testable if CI traffic passes through Caddy. **Uncertain** whether Caddy returns 413 or a gateway error when the limit trips mid-stream. | Run through Caddy; include a body sent without a declared length. |
| ST-18 | Mapped to SEC-1, which does not contain the state requirement. Tests a wrong state, not a valid state replayed in a different browser (login CSRF). | Give the state check its own SEC id; add the replay case (manual, or automated with the stand-in provider). |
| PERF-4 | No way to obtain 30 sessions on production (F-02). | See F-02. |
| PERF-6 | "화면이 응답함" is not measurable in a Node test on a pull request. | Assert a compute-time bound in Node; keep the screen check manual. |
| PERF-1 | A 100ms wall-clock bound on shared CI runners will be flaky. | Use a median over runs with a documented margin. |

  Also: SEC-15's console limits (512 characters, 5,000 lines), the 20-trace limit, the query timeout, the environment-file permission in SEC-19 and the OS-update clause of SEC-22 have no test or check at all. ST-1, ST-2, ST-5 and ST-6 are cheap and guard the most important controls; run them on pull requests rather than only after merge.

### F-13 (Medium) OAuth flow details unspecified

- **Viewpoint:** Attacker
- **Plan:** SEC-1, the state paragraph in 5.3, ST-18, 5.15 ("Google OAuth에 등록된 주소가 운영 주소뿐이다").
- **Problem:**
  1. No requirement fixes where the user lands after login. The auth library accepts a destination supplied by the client when sign-in starts (**uncertain** whether and how 1.7 validates it), and T2.7.2's "log in again and reopen that topology" invites a return-to parameter in the SPA. Either is an open-redirect path that makes a phishing link look like the real service.
  2. The checklist item is incompatible with local development unless development uses a separate OAuth client. With one shared client, either a loopback address stays registered in production or the production secret sits on three laptops.
  3. Nothing says the account is identified by Google's stable subject identifier rather than by email, or that implicit linking by email is off; an email address that changes hands would inherit the old account.
- **Fix:** Add: "After login the destination is a fixed path, or a same-origin path matching the topology route pattern; absolute URLs and other schemes are ignored." with a test that starts sign-in with an external destination and ends on `/topologies`. Add: "Production and development use different OAuth clients; the production client lists exactly one redirect address." Add: "Users are keyed by the provider's subject identifier; linking by email is disabled; unverified emails are rejected."

### F-14 (Medium) Account deletion (NFR-9) is under-specified and untested

- **Viewpoint:** Auditor
- **Plan:** 5.3 "계정 삭제" (operator deletes account, sessions, topologies; run once), 5.15.
- **Problem:** The procedure omits the account and verification rows, the backups (deleted data survives up to seven days, and returns on restore), how the requester is shown to own the account, and how a user learns whom to ask. Doing it by hand-typed SQL as a database superuser on production invites deleting the wrong user. "Run it once" is not a regression test.
- **Fix:** Requirement: "Deletion is a script that takes a user id, removes topology, session, account, verification and user rows in one transaction, and appends the id to a deletion log; requests are accepted only from the account's own email address; the privacy note states the seven-day backup retention." Add an integration test: after the script, no row references the user id and the user's old session cookie returns 401.

### F-15 (Medium) Count limits enforced by check-then-insert are racy

- **Viewpoint:** Defender
- **Plan:** SEC-14 (50 topologies per account, 200 accounts), ST-16, T2.3.2.
- **Problem:** A count followed by an insert in separate statements lets parallel requests pass the check together. The per-user rate limit caps volume, not concurrency. Combined with F-10 this is how the storage ceiling is exceeded.
- **Fix:** Requirement: "Both limits are enforced inside one transaction that serialises on the owner (or on a global key for the account cap)." Test: 20 parallel create requests at 49 topologies leave exactly 50.

### F-16 (Medium) Hardening covers only `app`; database role, Docker socket and firewall layer unstated

- **Viewpoint:** Defender
- **Plan:** SEC-21, SEC-22, TH-14, ST-13, ST-14.
- **Problem:**
  1. SEC-21's non-root, read-only and capability rules name only `app`. Caddy is the only container facing the internet and PostgreSQL holds all the data; neither has a stated rule.
  2. Nothing says which database role the api uses. The image's default is a superuser, which can read server files and run programs; least privilege here is cheap.
  3. No statement that no container mounts the Docker socket and that membership of the Docker group is treated as root.
  4. SEC-22 says "방화벽" without the layer. A host firewall of the common kind does not filter ports that Docker publishes; only the cloud firewall and the absence of published ports protect 5432 and 3000.
  5. A read-only root filesystem needs an explicit writable temporary mount or the first library that writes a temp file fails in production only.
- **Fix:** Extend SEC-21: "Caddy and PostgreSQL drop all capabilities except those they need and forbid privilege escalation; only Caddy publishes ports; no container mounts the Docker socket; the api connects as a non-superuser role that owns only the application schema; `app` has a size-limited temporary mount." Extend SEC-22: "The port rule is enforced at the cloud firewall; root login over SSH is disabled." Add each to ST-13 and ST-14.

### F-17 (Medium) NFR-12 (accessibility) is missing from the test plan

- **Viewpoint:** Auditor
- **Plan:** No SEC, ST, E2E or checklist item mentions NFR-12. T1.6.2 has "수동: 키보드만으로 사용" only.
- **Problem:** NFR-12 requires a keyboard-only console and status not conveyed by colour alone. The terminal component captures the Tab key (it is used for completion), so a keyboard user can enter the console and not leave it unless an exit key is designed. Nothing checks the port-status colours for a text or shape equivalent.
- **Fix:** Add E2E-10: "Using the keyboard only: focus the console, run a command, leave the console with the documented key, reach the replay controls." Add a component test that each of the four port states renders a distinct text or shape, and add both to 5.15.

### F-18 (Medium) Requirement id and traceability defects

- **Viewpoint:** Auditor
- **Plan:** 5.2 to 5.6, 5.13.
- **Problem:**
  1. SEC-17 is used for two requirements: the query timeout (5.5) and error-response content (5.6). ST-10 covers only the second; the timeout has no test.
  2. ST-18 maps to SEC-1, but the state check is prose without an id.
  3. TH-16 points at "5.6절" with an anchor for the malicious-configuration section, which is 5.7. The MAL items have no SEC ids and no ST mapping.
  4. Every TH-n does map to at least one SEC, but the threat list has no entry for: account-cap lockout (F-05), backup disclosure or loss (F-03), CI/CD compromise (F-04), shared-device access (F-07), open redirect and login CSRF (F-13), proxy and database logs (F-06), disk exhaustion as an outage (F-10).
  5. 5.3 "계정 삭제" is a requirement without an id.
- **Fix:** Renumber so each id names one requirement, give the state check, account deletion and backups their own ids, correct the section link, add the missing threats, and add a closing table "SEC id to test id" that CI or a reviewer can check for empty cells.

### F-19 (Low) Terminal sanitisation scope is underspecified

- **Viewpoint:** Attacker
- **Plan:** SEC-11, TH-5, MAL-11.
- **Problem:** "제어 문자" is not defined and the place is "before writing". The strong control is that names are restricted to a safe alphabet (F-09 extends that to every string); the write-time filter is the backstop and should be exact. Terminal emulators also answer certain queries by injecting text into the input stream, which here would feed the line editor as if typed.
- **Fix:** "All terminal output passes through one function that removes C0 controls except newline, DEL, and the C1 range (**uncertain** whether the terminal acts on C1 in this input mode; removing it costs nothing). Terminal-generated replies are not forwarded to the line editor. No link-detection add-on is loaded." Unit-test that function with each class.

### F-20 (Low) CSRF edge cases and cookie scoping on a shared free domain

- **Viewpoint:** Attacker
- **Plan:** SEC-4, TH-3, design X7 ("무료 도메인 서비스 조사").
- **Problem:** The layered design (Lax cookie, Origin check, JSON only) is correct; Lax rather than Strict is also required for the Google callback to work. Gaps: behaviour for a missing Origin is implied but untested; "JSON only" must not reject bodiless DELETE; it is unstated whether the check also fronts the auth library's POST routes; no rule that GET never changes state. Separately, `SameSite` works per registrable site, not per origin: if the free domain's parent is not on the public suffix list, sibling subdomains owned by strangers count as same-site and can also plant cookies for the parent.
- **Fix:** SEC-4: "A state-changing request without an Origin header is rejected; the check runs in front of every route including the auth library's; no GET route changes state other than the OAuth callback." Add to T2.2.1's decision record: "The domain is one the team registers, or a subdomain whose parent is on the public suffix list; the session cookie has no Domain attribute and uses the host-only name prefix if the library allows it (**uncertain**)."

### F-21 (Low) Session lifetime has no absolute cap; no secret-rotation procedure

- **Viewpoint:** Defender
- **Plan:** SEC-2, SEC-19.
- **Problem:** A sliding 7-day expiry with no maximum means a copied cookie never expires while it is used. If the library's optional cookie-side session cache were enabled, logout would not take effect immediately (**uncertain**; keep it off). The plan says where secrets live but not what to do when one leaks.
- **Fix:** Add an absolute lifetime (🟡 30 days) to SEC-2 and a one-paragraph runbook: rotate the session secret (all users log in again), the Google client secret and the database password, and delete all session rows.

### F-22 (Low) Health endpoint: response content and database amplification

- **Viewpoint:** Attacker
- **Plan:** SEC-6 exempts `/api/health`; design 3.5 says it includes a database check.
- **Problem:** It is the one unauthenticated route that reaches the database on every call, and its body is unspecified.
- **Fix:** "The health response is a fixed status value with no version, host or error text; the database probe result is cached for a few seconds; the route is inside the pre-login rate limit."

### F-23 (Low) Imprecise statements about memory limits and restart; PostgreSQL 18 volume path

- **Viewpoint:** Auditor
- **Plan:** 5.5 SEC-21 row ("넘으면 컨테이너 재시작"), 5.15 ("서버를 재시작해도 토폴로지가 남아 있다").
- **Problem:** Exceeding a memory limit kills a process; the container comes back only if a restart policy is set, and for PostgreSQL the usual effect is that all connections are dropped while it recovers. The restart check as worded passes even when the data directory is not on the named volume, because a plain restart keeps the container's own filesystem. **Uncertain:** the official PostgreSQL 18 image moved its data directory and expected mount point compared with earlier major versions, so a compose file copied from an older example may not persist data where the team thinks.
- **Fix:** State the restart policy in SEC-21. Reword the checklist item: "After removing and recreating all containers (not only restarting), topologies are still there."

### F-24 (Low) Vulnerability gate has no exception process; secret scan runs too late

- **Viewpoint:** Defender
- **Plan:** SEC-20, ST-19, ST-20.
- **Problem:** A gate that fails on any high-severity advisory will, sooner or later, block every merge on an advisory with no fixed version, and the usual response is to remove the gate. ST-20 runs at release.
- **Fix:** "An advisory may be waived in a tracked file with a reason and an expiry date." Move the secret scan to pull requests (see F-04). Decide Y6 now: enable automatic OS security updates.

### F-25 (Low) No cache-control requirement

- **Viewpoint:** Defender
- **Plan:** SEC-23.
- **Problem:** On shared PCs, cached API responses and the back button can show the previous user's topology after logout.
- **Fix:** Add to SEC-23: "API responses are not stored by the browser; the SPA shell is revalidated on each load; hashed assets are immutable." Add the API header to ST-9.

### F-26 (Low) No monitoring or alerting of any kind

- **Viewpoint:** Defender
- **Plan:** Design defers metrics; the plan relies on logs read over SSH.
- **Problem:** The four conditions that take this service down without anyone noticing are disk full, an expired certificate, a failed backup and a full account cap.
- **Fix:** One external uptime check on the health endpoint and one daily script that reports disk use, newest backup age, certificate days remaining and account count to the team. Add to 5.15.

### F-27 (Low) Rate limiter internals

- **Viewpoint:** Defender
- **Plan:** SEC-13, Y5; design 3.5 shows the session check before the rate limit.
- **Problem:** With that order, requests carrying a made-up cookie cause a session lookup each without ever being limited. An in-memory limiter keyed by a client-influenced value needs eviction or it grows without bound inside a 512MB container. The auth library may ship its own limiter for its routes with different thresholds (**uncertain**), in which case ST-15 cannot tell which one answered.
- **Fix:** "The IP limit runs before the session lookup; limiter state has a bounded size; exactly one limiter governs `/api/auth/*` and its numbers are the ones in 5.5." The save manager should honour the retry delay on 429.

### F-28 (Low) DOM sinks other than `dangerouslySetInnerHTML`

- **Viewpoint:** Defender
- **Plan:** SEC-9.
- **Problem:** The lint rule names one sink. Direct HTML-assigning DOM properties, link targets built from document values, and string-to-code functions are not named. CSP blocks the script cases, but SEC-9 is meant to stand on its own.
- **Fix:** Extend the lint rule to those sinks and add: "No value from a document or an import file is used as a link target, style text or class name."

---

## 3. Numeric consistency check

| Pair | Result |
|---|---|
| Autosave (3s debounce, one request in flight) vs write limit 60 per minute per user | Consistent. One tab can produce at most about 20 writes per minute; three tabs reach the limit, which is acceptable. |
| PERF-4 (30 users, one save per 5s) vs write limit | Consistent: 12 per minute per user. |
| Read limit 300 per minute per user | Consistent with the described screens. |
| Pre-login 30 per minute per IP vs 30 students behind one address | **Inconsistent** (F-01). |
| Body limit 1MB vs document limit 1MB vs file limit 1MB | **Inconsistent** (F-10). |
| 200 x 50 x 1MB = 10GB | Arithmetic correct, model incomplete (F-10, F-03). |
| Byte limit vs count limits (SEC-15) | Unverified; maximal valid document is roughly 0.4MB by my estimate (F-10). |
| Container memory 512 + 512 + 128MB vs design's "about 1GB" | Consistent as a ceiling; PERF-5 measures it. |
| 2,000-event guard vs 50 devices, 100 links | Plausible; PERF-6 and NET-6 cover it. |

## 4. NFR coverage

| NFR | Covered by the plan? |
|---|---|
| NFR-5 concurrency | PERF-4 exists but cannot be run as written (F-02) and ignores the login burst (F-01). |
| NFR-6 limits | Covered, with the inconsistencies in F-10 and the race in F-15. |
| NFR-7 durability | Backup and restore drill exist; off-VM copy and failure detection missing (F-03); restart check too weak (F-23). |
| NFR-8 HTTPS, own data only | ST-1, ST-2, ST-9 cover it. Add an explicit check that plain HTTP redirects and that the app port is unreachable from outside. |
| NFR-9 minimal personal data, deletion | **Not verified by any test** (F-06); deletion under-specified (F-14). |
| NFR-12 accessibility | **Absent** (F-17). |
| NFR-1 browsers | Manual four-browser check in 5.15; adequate for the scale. |

## 5. Factual accuracy

Statements in the plan or design that I checked:

- `SameSite=Lax` with a same-origin SPA, plus an Origin check and JSON-only bodies, is a correct CSRF design, and Lax (not Strict) is needed for the redirect back from Google. Correct.
- `HttpOnly` prevents script from reading the cookie (TH-2). Correct; note it does not stop an injected script from acting with the session, which is why SEC-9 and SEC-10 matter.
- "IndexedDB survives the full-page navigation to Google" (design 3.7). Correct. Caveat: some browsers discard script-written storage after a period without visits or in private windows, so a draft is not a durable store.
- "Memory limit exceeded leads to container restart" (5.5). Imprecise (F-23).
- "PostgreSQL default log: errors, slow queries" (design 3.9). Slow-statement logging is off by default, and enabling it logs parameter values unless that is disabled (F-06).
- "Firewall opens only 80, 443, 22" (SEC-22). Correct only at the cloud layer; a host firewall does not reliably filter Docker-published ports (F-16).
- "Protection relies on the owner condition, not on the id being unguessable" (5.3). Correct and well put.
- JSONB cannot hold the NUL character in strings. Not mentioned by the plan; relevant to SEC-7 (F-09).
- Items I could not confirm and have marked **uncertain** in place: the auth library's default columns, destination validation, built-in limiter and cookie naming in 1.7.x; Caddy's status code when a body limit trips; the PostgreSQL 18 image's data path; the free VM's default disk size; whether the terminal acts on C1 controls.

## 6. What should not change

So that fixes do not weaken what is already right: owner check in the repository layer with 404 for foreign ids (SEC-5, AD-11); default-deny session middleware with a route list generated from the router (SEC-6, ST-2); one shared validator used by import, api and engine (AD-9); "opening a topology starts no computation" (5.7); no admin endpoints (SEC-24); secrets validated at start-up; refusing overwrite on conflict (AD-10).
