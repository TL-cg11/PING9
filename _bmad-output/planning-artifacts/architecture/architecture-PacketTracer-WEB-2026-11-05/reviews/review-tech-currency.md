# Review: technology currency of the architecture spine

- Reviewed: `ARCHITECTURE-SPINE.md` (status: draft, 2026-11-05)
- Evidence compared: `research/technical-web-network-simulator-engine-2026-11-05/digests/stack-versions-r3-1.md`
- Review date: 2026-11-05
- Lens: was every committed technology decision checked against a live source, does each named technology still exist and fit its role, and do the pieces fit together.

## Verdict

Every version number in the Stack table matches the evidence file and (for the npm rows) the raw registry JSON re-read during this review. The version numbers are current. What the spine did not check is compatibility between the pieces, and one combination does not hold as written: **TypeScript 7.0.2 cannot be used with typescript-eslint**, which AD-2 depends on ("lint 규칙으로 강제한다"). Five further points need a change or an explicit "unverified" mark. Nothing found is deprecated.

## Method and limits

- npm facts (version, `deprecated`, `engines`, `peerDependencies`, dist-tags) were read as raw JSON from `registry.npmjs.org` and parsed locally. This removes the caveat in the evidence file about values passing through a summarising model.
- Docs pages, the PostgreSQL site, the TypeScript blog and the GitHub issue were read with WebFetch, which returns a summary written by a small model. Quotes from those pages are as that summary reported them.
- 20 tool calls were used for research. Nothing below is filled from memory; anything not opened is listed under "Not checked".

## Step 1: Stack table against the evidence file

All 25 rows match the evidence file on version number. No row is without evidence.

| Spine row | Spine version | Evidence file | Result |
| --- | --- | --- | --- |
| Node.js | 24.22.2 (LTS) | v24.22.2 "Krypton", listed as an older LTS line; newest LTS is v26.13.0 "Lithium" | Version matches. The "(LTS)" label needs qualifying, see F2 |
| TypeScript | 7.0.2 | 7.0.2 | Match |
| pnpm | 12.16.1 | 12.16.1 | Match |
| React, React DOM | 19.3.1 | 19.3.1 / 19.3.1 | Match |
| Vite | 8.3.5 | 8.3.5 | Match |
| @xyflow/react | 12.12.1 | 12.12.1 | Match |
| @xterm/xterm | 6.0.0 | 6.0.0 | Match |
| @xterm/addon-fit | 0.11.0 | 0.11.0 | Match |
| Zustand | 5.0.16 | 5.0.16 | Match |
| React Router | 8.5.1 | 8.5.1 | Match |
| Tailwind CSS | 4.3.4 | 4.3.4 | Match |
| Zod | 4.6.7 | 4.6.7 | Match |
| Hono | 4.13.16 | 4.13.16 | Match |
| @hono/node-server | 2.1.6 | 2.1.6 | Match |
| better-auth | 1.7.17 | 1.7.17 | Match |
| Drizzle ORM | 0.45.4 | 0.45.4 (deprecation flag unconfirmed) | Match. Flag now confirmed absent, see F8 |
| Drizzle Kit | 0.31.11 | 0.31.11 | Match |
| pg | 8.23.1 | 8.23.1 | Match |
| PostgreSQL | 18.6 | 18, minor 18.6 (flagged for a second look) | Match. Second look done, see F7 |
| pino | 10.4.0 | 10.4.0 | Match |
| Vitest | 5.1.0 | 5.1.0 | Match |
| fast-check | 4.10.2 | 4.10.2 | Match |
| Playwright Test | 1.64.1 | 1.64.1 | Match |
| Caddy | 2.11.9 | v2.11.9 | Match. Image tag missing, see F6 |
| Docker Compose | 5.7.0 | v5.7.0 | Match |

Rows that differ in version: none.

Rows with no evidence: none.

Gaps on the other side:

- The evidence file lists six "items to re-check". The spine adopted three of the affected technologies (PostgreSQL, drizzle-orm, better-auth) without recording that the re-check was still open.
- Tools that the spine's rules or diagrams require but that appear in neither the Stack table nor (mostly) the evidence: ESLint and typescript-eslint (AD-2), `@better-auth/drizzle-adapter` and the `auth` CLI, `@tailwindcss/vite`, `@vitejs/plugin-react`, `@types/pg`. See F3 and F9.

Re-read as raw registry JSON in this review, all equal to the spine: typescript, pnpm, react, vite, @xyflow/react, @xterm/xterm, @xterm/addon-fit, zustand, react-router, tailwindcss, zod, hono, @hono/node-server, better-auth, drizzle-orm, drizzle-kit, pg, pino, vitest, fast-check, @playwright/test. All have `deprecated: null`. Node 24.22.2 was re-read from `https://nodejs.org/dist/index.json`. react-dom, Caddy's release entry and Docker Compose were not re-read.

## Step 2: answers to the open questions

| Question | Answer | Source |
| --- | --- | --- |
| a. better-auth mounts on Hono | Yes. `app.all("/api/auth/*", (c) => auth.handler(c.req.raw))`; the route must match `basePath` (default `/api/auth`); "Register the auth route before any catch-all route" | https://better-auth.com/docs/integrations/hono.md |
| a. Google sign-in | Yes. `socialProviders.google` with `clientId`, `clientSecret`; callback path `/api/auth/callback/google`; `baseURL` must be set | https://better-auth.com/docs/authentication/google.md |
| a. PostgreSQL through Drizzle | Yes. `drizzleAdapter(db, { provider: "pg" })`, imported from the separate package `@better-auth/drizzle-adapter`; schema from `npx auth@latest generate`, then `drizzle-kit generate` and `migrate` | https://better-auth.com/docs/adapters/drizzle.md |
| a. Cookie-based server sessions | Yes. "traditional cookie-based session management"; "The session table stores the session data"; stateless mode only when no database is configured | https://better-auth.com/docs/concepts/session-management.md |
| a. Version constraints | better-auth 1.7.17 peers: `drizzle-orm ^0.45.2 \|\| >=1.0.0-rc.1 <2.0.0`, `drizzle-kit >=0.31.4 \|\| >=1.0.0-beta.1`, `pg ^8.0.0`, `react ^18 \|\| ^19`, `vitest ^2 … ^5` (all optional, all satisfied). No `engines`. The `auth` CLI declares `node >=22.12.0`. The docs pages state no Node or Hono version | https://registry.npmjs.org/better-auth/latest , https://registry.npmjs.org/auth/latest |
| b. Is PostgreSQL 18 the newest major | 18 is the newest generally available major (18.6, 2026-08-13). PostgreSQL 19 RC 1 was released 2026-10-15; no 19.0 release is listed | https://www.postgresql.org/ |
| c. What TypeScript 7.0 is | A native port of the compiler ("10x faster"), released 2026-07-08. "it does not ship with an API"; a new API is expected in 7.1 (7.1 Beta announced 2026-10-20) | https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/ |
| c. typescript-eslint | Peer range `typescript >=4.8.4 <6.1.0`. Excludes 7.x. See F1 | https://registry.npmjs.org/typescript-eslint/latest |
| c. Vite 8, Vitest 5 | Neither declares a `typescript` peer dependency, so there is no stated incompatibility and no stated compatibility | https://registry.npmjs.org/vite/latest , https://registry.npmjs.org/vitest/latest |
| d. drizzle-orm 0.45.4 | Not deprecated. No `engines`. Peer `pg >=8` (optional), satisfied by pg 8.23.1. No PostgreSQL server version is stated anywhere in the metadata | https://registry.npmjs.org/drizzle-orm/latest |
| e. React 19 peers | @xyflow/react: `react >=17`. zustand: `react >=18.0.0` (optional). react-router: `react >=19.2.7`, `engines.node >=22.22.0`. All accept React 19.3.1 and Node 24.22.2 | registry `/latest` entries |
| f. Hono on Node 24 | hono `engines.node >=16.9.0`; @hono/node-server `engines.node >=20`, peer `hono ^4 \|\| ^5.0.0-0`. Node 24 is not excluded | registry `/latest` entries |
| g. Tailwind 4 with Vite 8 | The install guide (documents v4.3) names no Vite range. `@tailwindcss/vite` 4.3.4 peer is `vite ^5.2.0 \|\| ^6 \|\| ^7 \|\| ^8`, so Vite 8.3.5 is accepted | https://tailwindcss.com/docs/installation/using-vite , https://registry.npmjs.org/@tailwindcss%2Fvite/latest |

## Findings

### F1 (high) TypeScript 7.0.2 excludes typescript-eslint, which AD-2 relies on

- **Spine states:** TypeScript 7.0.2 in the Stack table. AD-2: the dependency directions are "lint 규칙으로 강제한다". No lint tool is named.
- **Evidence:**
  - typescript-eslint 8.72.1 and @typescript-eslint/parser 8.72.1 declare `peerDependencies.typescript: ">=4.8.4 <6.1.0"`. https://registry.npmjs.org/typescript-eslint/latest , https://registry.npmjs.org/@typescript-eslint%2Fparser/latest
  - The typescript-eslint docs give the same supported range and do not mention TypeScript 7. https://typescript-eslint.io/users/dependency-versions/
  - Issue #12518 "TypeScript 7.0.2 Support" is closed. Maintainer: "typescript-eslint isn't compatible with TS 7 at this time, because there is no TS 7 API at this time." It is tracked under #10940. https://github.com/typescript-eslint/typescript-eslint/issues/12518
  - TypeScript 7.0 announcement: "While TypeScript 7.0 is here, it does not ship with an API"; tools that embed TypeScript "can only currently rely on TypeScript 6.0". A compatibility package `@typescript/typescript6` (6.0.2 on npm, binary `tsc6`) re-exports the 6.0 API. https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/
  - The same post lists breaking changes that affect a new monorepo's tsconfig: `baseUrl` no longer supported, `moduleResolution: node/node10` no longer supported, `target: es5` no longer supported, default `types` is now `[]`, `strict` default changed.
  - Stable 6.x releases on npm: 6.0.2 and 6.0.3. https://registry.npmjs.org/typescript
- **Why it matters:** ESLint needs a TypeScript parser to read `.ts` files, and the standard one cannot load TypeScript 7. AD-2 is the rule that keeps `engine` free of UI and server code, so the enforcement tool has to work on day one.
- **Recommended change (choose one and write it in the spine):**
  1. Pin `typescript` to 6.0.3 for the MVP. This is inside the typescript-eslint peer range. Optionally add TypeScript 7 under an npm alias for fast type checks.
  2. Keep TypeScript 7.0.2 as the compiler and add `@typescript/typescript6` for tools that need the API. How typescript-eslint is pointed at that package was not verified in this review (the maintainer refers to Microsoft's "Running side by side with TypeScript 6.0" guidance, which was not opened), so option 2 needs a short spike before it is committed.
  3. Enforce AD-2 with a tool that does not use the TypeScript API. No such tool was researched here, so this option is unverified.
- Also add ESLint and typescript-eslint as Stack rows (see F9).

### F2 (medium) Node.js 24 is labelled "(LTS)" but is now the maintenance line

- **Spine states:** Node.js 24.22.2 (LTS).
- **Evidence:** The Node release schedule gives v24 "Krypton" `maintenance: 2026-10-20`, `end: 2028-04-30`, and v26 "Lithium" `lts: 2026-10-28`, `end: 2029-04-30`. Newest releases: v24.22.2 (2026-10-27) and v26.13.0 (2026-10-28). https://raw.githubusercontent.com/nodejs/Release/main/schedule.json , https://nodejs.org/dist/index.json
- Every `engines` range read in this review accepts both 24 and 26 (vitest `^22.12.0 || ^24.0.0 || >=26.0.0`, react-router `>=22.22.0`, `auth` CLI `>=22.12.0`, eslint `^20.19.0 || ^22.13.0 || >=24`, vite `^20.19.0 || >=22.12.0`, @hono/node-server `>=20`). The Docker image `node:24.22.2-slim` exists. https://hub.docker.com/v2/repositories/library/node/tags/24.22.2-slim
- **Recommended change:** Either keep 24.22.2 and say why (Node 26 became LTS eight days ago; 24 is supported to 2028-04-30), or move to 26.13.0. In both cases replace "(LTS)" with the actual phase and add the chosen range to the root `package.json` `engines`.

### F3 (medium) better-auth needs two packages the Stack table does not list

- **Spine states:** better-auth 1.7.17, Drizzle ORM 0.45.4, Drizzle Kit 0.31.11. "`USER`, `SESSION`, `ACCOUNT`의 열은 인증 라이브러리가 정한다."
- **Evidence:** The Drizzle adapter is imported from `@better-auth/drizzle-adapter` (1.7.17; peers `drizzle-orm ^0.45.2 || >=1.0.0-rc.1 <2.0.0`, `@better-auth/core ^1.7.17`). The auth tables are generated with the `auth` CLI (1.7.17, `engines.node >=22.12.0`), followed by `drizzle-kit generate` and `drizzle-kit migrate`. https://better-auth.com/docs/adapters/drizzle.md , https://registry.npmjs.org/@better-auth%2Fdrizzle-adapter/latest , https://registry.npmjs.org/auth/latest
- The pinned versions satisfy every peer range, so this is an omission, not a conflict. The database page lists four required tables: `user`, `session`, `account`, `verification`; the spine's ER diagram shows three. https://better-auth.com/docs/concepts/database.md
- **Recommended change:** Add `@better-auth/drizzle-adapter 1.7.17` and the `auth` CLI to the Stack table. Add `VERIFICATION` to the note under the ER diagram. Record the migration order (auth CLI generate, then Drizzle Kit).

### F4 (medium) AD-12's cookie attributes are not confirmed as better-auth defaults

- **Spine states:** AD-12: the session identifier is only in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie.
- **Evidence:**
  - "All cookies are `httpOnly` and `secure` when the server is running in production mode." "By default, cookies are secure only when the server is running in production mode." `useSecureCookies` forces secure cookies. The cookie name is `better-auth.session_token`. https://better-auth.com/docs/concepts/cookies.md
  - No default `SameSite` value is stated on the cookies page, the session page or the Hono page.
  - Google page: "You must configure the `baseURL` to avoid `redirect_uri_mismatch` errors"; without it "the callback URL may default to `localhost`". The spine puts the app behind Caddy, so the app process itself does not see the public HTTPS origin. https://better-auth.com/docs/authentication/google.md
  - The Hono page describes CORS with `credentials: true` for cross-origin setups. The spine's local setup runs `vite dev` and the API as separate processes, which are different origins unless the dev server proxies `/api`.
- **Recommended change:** In AD-12, state that the three attributes are set explicitly in the better-auth configuration, not inherited, and that an API test asserts them on the `Set-Cookie` header. Add `baseURL` (the public HTTPS origin) to the required environment variables. State that local development reaches the API through the Vite dev proxy so that AD-12's single origin also holds locally. The option name for setting `SameSite` was not found in the pages read; mark it unverified until the options reference is opened.

### F5 (medium) `uuid owner_id` depends on a better-auth setting the spine does not commit

- **Spine states:** `TOPOLOGY.owner_id` is `uuid`; "서버가 만드는 ID는 UUID".
- **Evidence:** "By default, Better-Auth will generate UUIDs for the `id` field for all tables." The CLI generates the `id` column "as a UUID type" when `advanced.database.generateId` is set to `"uuid"`; otherwise the column type falls back to a string. The docs also warn "Do NOT set useNumberId". The per-table field types were not visible in the fetched page. https://better-auth.com/docs/concepts/database.md
- **Why it matters:** `topology.owner_id` references `user.id`. If the generated `user.id` column is text and `owner_id` is uuid, the foreign key cannot be created.
- **Recommended change:** Commit `advanced.database.generateId: "uuid"` in the spine (Consistency Conventions, ID row), or change `owner_id` to the type the generated schema uses. Confirm by running the CLI once in week 1 and reading the generated schema. Partly verified: the column types were read through a summary, not from the rendered tables.

### F6 (medium) Caddy 2.11.9 has no official Docker image tag yet

- **Spine states:** Caddy 2.11.9, deployed as a container under Docker Compose.
- **Evidence:** The GitHub release was published 2026-11-05T01:30Z (today, per the evidence file). `https://hub.docker.com/v2/repositories/library/caddy/tags/2.11.9` returned 404. The tag `caddy:2.11` exists, last updated 2026-11-04T20:53Z, which is before the 2.11.9 release. https://hub.docker.com/v2/repositories/library/caddy/tags/2.11
- **Recommended change:** Pin the Caddy row to an image tag that exists (for example `caddy:2.11`, or the exact patch once it is published) and note that the row is an image tag, not a binary release. Re-check before the first deployment.

### F7 (low) PostgreSQL 18.6 is current, with two dated caveats

- **Spine states:** PostgreSQL 18.6.
- **Evidence:** Latest releases on the home page: 18.6, 17.11, 16.15, 15.19, 14.24 (all 2026-08-13). "PostgreSQL 19 RC 1 Released!" dated 2026-10-15. The roadmap says the 19 release "is planned for October 2026" and lists the next minor release for 2026-11-12. `postgres:18.6` exists on Docker Hub (updated 2026-10-31). https://www.postgresql.org/ , https://www.postgresql.org/developer/roadmap/ , https://hub.docker.com/v2/repositories/library/postgres/tags/18.6
- **Recommended change:** Keep major 18. Write the row as "18 (18.6 on 2026-11-05)" so that the minor expected on 2026-11-12 does not make the spine stale, and add one line that 19 is at RC and is not adopted for the MVP. Neither `pg` nor `drizzle-orm` states a supported PostgreSQL server version in its registry metadata, so "pg 8.23.1 works with PostgreSQL 18" remains unverified by a primary source.

### F8 (low) Drizzle 0.45.4 is not deprecated, but 1.0 is at release candidate

- **Spine states:** Drizzle ORM 0.45.4, Drizzle Kit 0.31.11.
- **Evidence:** `deprecated: null` on both. dist-tags: drizzle-orm `latest 0.45.4`, `rc 1.0.0-rc.5`; drizzle-kit `latest 0.31.11`, `rc 1.0.0-rc.5`. better-auth already accepts `>=1.0.0-rc.1 <2.0.0`. https://registry.npmjs.org/-/package/drizzle-orm/dist-tags
- **Recommended change:** Keep 0.45.4 and 0.31.11 for the MVP. Add a line to Deferred: Drizzle 1.0 migration, not before the MVP ships. This closes the evidence file's open item on the deprecation flag.

### F9 (low) Tooling that the rules depend on is missing from the Stack table

- **Spine states:** 25 rows; no lint tool, no Vite plugins.
- **Evidence (all current, none deprecated):** eslint 10.14.0 (`engines.node ^20.19.0 || ^22.13.0 || >=24`); typescript-eslint 8.72.1 (peer `eslint ^8.57.0 || ^9.0.0 || ^10.0.0`); @vitejs/plugin-react 6.2.1 (peer `vite ^8.0.0`); @tailwindcss/vite 4.3.4 (peer `vite ^5.2.0 || ^6 || ^7 || ^8`); @types/pg 8.23.1. A boundaries plugin exists (eslint-plugin-boundaries 7.4.1, peer `eslint >=6.0.0`); it was not evaluated for fit. Sources: the matching `https://registry.npmjs.org/<name>/latest` entries.
- **Recommended change:** Add ESLint, typescript-eslint, @vitejs/plugin-react and @tailwindcss/vite to the Stack table, and name the mechanism that enforces AD-2.

### F10 (low) The Stack sentence claims more than was checked

- **Spine states:** "2026-11-05에 npm registry와 각 프로젝트의 배포 목록에서 확인한 버전이다."
- **Evidence:** The evidence file confirms version numbers only. It says the better-auth integration pages were not opened, the drizzle-orm deprecation flag was not confirmed, and PostgreSQL needed a second look.
- **Recommended change:** Add one sentence: versions were confirmed on 2026-11-05; compatibility between packages was checked in this review, with the exceptions listed below under "Not checked".

### F11 (low) @xterm/addon-fit 0.11.0 with @xterm/xterm 6.0.0 is an unstated pairing

- **Spine states:** both versions, side by side.
- **Evidence:** Neither package declares `peerDependencies`, so the registry does not state which addon version belongs to xterm 6.0.0. Both are the `latest` tag. https://registry.npmjs.org/@xterm%2Faddon-fit/latest
- **Recommended change:** Mark as unverified. Confirm in the week-1 console spike.

## Confirmed without change

- React 19.3.1 is accepted by @xyflow/react 12.12.1, zustand 5.0.16, react-router 8.5.1 and better-auth 1.7.17.
- Vite 8.3.5 is accepted by vitest 5.1.0 (`vite ^6.4.0 || ^7.0.0 || ^8.0.0`), @tailwindcss/vite 4.3.4 and @vitejs/plugin-react 6.2.1.
- Node 24.22.2 satisfies every `engines` range read.
- hono 4.13.16 is inside @hono/node-server 2.1.6's peer range.
- better-auth fits the role AD-12 gives it: mounted on Hono at `/api/auth/*`, Google provider, PostgreSQL through Drizzle, server-side sessions identified by a cookie.
- The spine's convention that `/api/auth/*` bypasses the session middleware matches how better-auth is mounted. Because the same app serves the SPA files, note the docs' instruction to register the auth route before any catch-all route.
- arctic (deprecated) and prisma (release candidate on `latest`) are in the evidence file but are not used by the spine.

## Not checked

- react-dom, Caddy's GitHub release entry and Docker Compose 5.7.0 were not re-read (evidence file only).
- Whether TypeScript 7.1 Beta ships the new API, and the peer range of typescript-eslint's canary (8.72.2-alpha.11).
- Microsoft's "Running side by side with TypeScript 6.0" guidance, so the exact wiring for F1 option 2.
- better-auth's default `SameSite` value and the option name for cookie attributes.
- The column types of better-auth's generated tables (the field tables did not render in the fetched page).
- Any primary statement that pg 8.23.1 or drizzle-orm 0.45.4 supports PostgreSQL 18.
- Any explicit statement from Vite 8 or Vitest 5 about TypeScript 7 (only the absence of a peer dependency was seen).
- Which editor and language-service setup works with TypeScript 7.0.
- Fit of pino, Zod, fast-check and Playwright Test beyond version and deprecation flag.
- pnpm 12 workspace behaviour and how it treats peer-range mismatches.
- The general-availability date of PostgreSQL 19.
- Publish dates of the npm packages.
- The Vite dev-proxy setup assumed in F4.
