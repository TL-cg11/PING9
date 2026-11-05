# Stack versions digest (r3-1)

Retrieved: 2026-11-05. Every value below came from a page fetched in this run; nothing is filled from memory.

Method caveat: pages were fetched with WebFetch, which extracts fields through a small summarising model rather than returning raw JSON. Values are as that extraction reported them. The npm `/latest` endpoint does not carry a publish date, so that column is "not shown" for all npm rows.

## Items to re-check before relying on them

- **arctic is deprecated.** The npm registry carries a `deprecated` field ("Package no longer supported. Contact Support at https://www.npmjs.com/support for more info.") and the GitHub README states "Arctic was deprecated on July 2026."
- **prisma `latest` returned a release candidate (8.0.0-rc.30).** No confirmed stable version was retrieved for prisma.
- **Node.js newest overall entry is an alpha (v27.0.0-alpha.0.0.0).** The newest release with an LTS codename is v26.13.0 "Lithium".
- **PostgreSQL page lists 18 as the newest major.** Majors 14 to 18 in the same table each have a first release in September or October of consecutive years, and there is no 2026 row, so this is worth a second look.
- **drizzle-orm**: `deprecated` and `engines.node` were not visible in either chunk of a 135,914-character response, so absence of a deprecation flag is not confirmed.
- **Hono Node requirement mismatch**: the Hono docs page states Node 18.14.1+, while `@hono/node-server` 2.1.6 declares `engines.node >=20`.

## Version table

| item | version | published/released | licence | deprecated? | notes | URL |
|---|---|---|---|---|---|---|
| react | 19.3.1 | not shown | MIT | no | engines.node >=0.10.0 | https://registry.npmjs.org/react/latest |
| react-dom | 19.3.1 | not shown | MIT | no | no engines.node | https://registry.npmjs.org/react-dom/latest |
| vite | 8.3.5 | not shown | MIT | no | engines.node ^20.19.0 \|\| >=22.12.0 | https://registry.npmjs.org/vite/latest |
| typescript | 7.0.2 | not shown | Apache-2.0 | no | engines.node >=16.20.0 | https://registry.npmjs.org/typescript/latest |
| @xyflow/react | 12.12.1 | not shown | MIT | no | no engines.node | https://registry.npmjs.org/@xyflow%2Freact/latest |
| @xterm/xterm | 6.0.0 | not shown | MIT | no | no engines.node | https://registry.npmjs.org/@xterm%2Fxterm/latest |
| @xterm/addon-fit | 0.11.0 | not shown | MIT | no | no engines.node | https://registry.npmjs.org/@xterm%2Faddon-fit/latest |
| zustand | 5.0.16 | not shown | MIT | no | engines.node >=12.20.0 | https://registry.npmjs.org/zustand/latest |
| immer | 11.2.9 | not shown | MIT | no | no engines.node | https://registry.npmjs.org/immer/latest |
| zod | 4.6.7 | not shown | MIT | no | no engines.node | https://registry.npmjs.org/zod/latest |
| @tanstack/react-query | 5.106.0 | not shown | MIT | no | no engines.node | https://registry.npmjs.org/@tanstack%2Freact-query/latest |
| react-router | 8.5.1 | not shown | MIT | no | engines.node >=22.22.0 | https://registry.npmjs.org/react-router/latest |
| tailwindcss | 4.3.4 | not shown | MIT | no | no engines.node | https://registry.npmjs.org/tailwindcss/latest |
| vitest | 5.1.0 | not shown | MIT | no | engines.node ^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0 | https://registry.npmjs.org/vitest/latest |
| @playwright/test | 1.64.1 | not shown | Apache-2.0 | no | engines.node >=20 | https://registry.npmjs.org/@playwright%2Ftest/latest |
| fast-check | 4.10.2 | not shown | MIT | no | engines.node >=12.17.0 | https://registry.npmjs.org/fast-check/latest |
| eslint | 10.14.0 | not shown | MIT | no | engines.node ^20.19.0 \|\| ^22.13.0 \|\| >=24 | https://registry.npmjs.org/eslint/latest |
| prettier | 3.9.10 | not shown | MIT | no | engines.node >=14 | https://registry.npmjs.org/prettier/latest |
| pnpm | 12.16.1 | not shown | MIT | no | engines.node >=18 | https://registry.npmjs.org/pnpm/latest |
| hono | 4.13.16 | not shown | MIT | no | engines.node >=16.9.0 | https://registry.npmjs.org/hono/latest |
| @hono/node-server | 2.1.6 | not shown | MIT | no | engines.node >=20 | https://registry.npmjs.org/@hono%2Fnode-server/latest |
| fastify | 5.12.8 | not shown | MIT | no | no engines.node | https://registry.npmjs.org/fastify/latest |
| drizzle-orm | 0.45.4 | not shown | Apache-2.0 | not visible (unconfirmed) | response too long for one read; deprecated and engines.node not visible in either chunk | https://registry.npmjs.org/drizzle-orm/latest |
| drizzle-kit | 0.31.11 | not shown | MIT | no | no engines.node | https://registry.npmjs.org/drizzle-kit/latest |
| prisma | 8.0.0-rc.30 (release candidate on the `latest` tag; stable version not confirmed) | not shown | Apache-2.0 | no | engines.node ^22.18.0 \|\| ^24.11.0 \|\| >=26.0.0 | https://registry.npmjs.org/prisma/latest |
| pg | 8.23.1 | not shown | MIT | no | engines.node >= 16.0.0 | https://registry.npmjs.org/pg/latest |
| postgres | 4.0.0 | not shown | Unlicense | no | engines.node >=20 | https://registry.npmjs.org/postgres/latest |
| better-auth | 1.7.17 | not shown | MIT | no | no engines.node | https://registry.npmjs.org/better-auth/latest |
| arctic | 3.7.0 | not shown | MIT | **YES** | deprecated field: "Package no longer supported. Contact Support at https://www.npmjs.com/support for more info." README also says deprecated July 2026 | https://registry.npmjs.org/arctic/latest |
| @auth/core | 0.41.3 | not shown | ISC | no | no engines.node | https://registry.npmjs.org/@auth%2Fcore/latest |
| pino | 10.4.0 | not shown | MIT | no | no engines.node | https://registry.npmjs.org/pino/latest |
| @supabase/supabase-js | 2.119.0 | not shown | MIT | no | engines.node >=22.0.0 | https://registry.npmjs.org/@supabase%2Fsupabase-js/latest |
| Node.js (newest with LTS codename) | v26.13.0 "Lithium" | 2026-10-28 | not retrieved | n/a | other LTS-codenamed lines: v24.22.2 "Krypton" (2026-10-27), v22.23.4 "Jod" (2026-10-20) | https://nodejs.org/dist/index.json |
| Node.js (newest overall) | v27.0.0-alpha.0.0.0 | 2026-10-29 | not retrieved | n/a | alpha, lts: false. Newest non-LTS stable lines seen: v25.9.0 (2026-03-31), v23.11.1 (2025-05-14) | https://nodejs.org/dist/index.json |
| PostgreSQL | 18 (current minor 18.6) | first release 2025-09-25 | not retrieved | n/a | supported until 2030-11-14. Also supported: 17.11 (to 2029-11-08), 16.15 (to 2028-11-09), 15.19 (to 2027-11-11), 14.24 (to 2026-11-12). 13 and older unsupported | https://www.postgresql.org/support/versioning/ |
| Caddy | v2.11.9 | 2026-11-05T01:30:24Z | not retrieved | n/a | prerelease: false, draft: false | https://api.github.com/repos/caddyserver/caddy/releases/latest |
| Docker Compose | v5.7.0 | 2026-11-02T15:01:54Z | not retrieved | n/a | prerelease: false, draft: false | https://api.github.com/repos/docker/compose/releases/latest |

### Node version floor implied by the retrieved engines fields

The strictest declared ranges are react-router (>=22.22.0), vitest (^22.12.0 || ^24.0.0 || >=26.0.0), eslint (^20.19.0 || ^22.13.0 || >=24), prisma rc (^22.18.0 || ^24.11.0 || >=26.0.0), @supabase/supabase-js (>=22.0.0) and vite (^20.19.0 || >=22.12.0). The current releases of the three LTS-codenamed lines (22.23.4, 24.22.2, 26.13.0) satisfy all of them; Node 20 does not (react-router, vitest, supabase-js exclude it).

## Q1. @xyflow/react: major version and multiple handles

- Current major is **12** (12.12.1). Source: https://registry.npmjs.org/@xyflow%2Freact/latest
- Multiple handles on custom nodes are supported. The Handles docs page says "you need to specify each handle with a unique `id`", which is how edges are attached to a specific handle. The page's import examples use `@xyflow/react`; it shows no version number. Source: https://reactflow.dev/learn/customization/handles

## Q2. better-auth and arctic

**better-auth** (docs index for the 1.7.x documentation, https://better-auth.com/docs/llms.txt):
- Google and GitHub sign-in: yes. Listed as "Google provider setup and usage" (https://better-auth.com/docs/authentication/google.md) and "GitHub provider setup and usage" (https://better-auth.com/docs/authentication/github.md).
- Hono and Fastify: yes. "Integrate Better Auth with Hono" (https://better-auth.com/docs/integrations/hono.md); Fastify integration (https://better-auth.com/docs/integrations/fastify.md). Express is also listed (https://better-auth.com/docs/integrations/express.md). There is no plain "Node" entry.
- PostgreSQL: yes. "Integrate Better Auth with PostgreSQL" (https://better-auth.com/docs/adapters/postgresql.md), plus Drizzle (https://better-auth.com/docs/adapters/drizzle.md) and Prisma (https://better-auth.com/docs/adapters/prisma.md) adapters.
- Deprecated or unmaintained: no such notice on the index, and no `deprecated` field on npm. The parent index (https://www.better-auth.com/llms.txt) also lists a v1.8 beta docs set.
- Limitation: these are index entries with one-line descriptions; the individual integration pages were not opened.

**arctic** (https://github.com/pilcrowonpaper/arctic and https://registry.npmjs.org/arctic/latest):
- **Deprecated.** README: "Arctic was deprecated on July 2026", pointing to replacement example code under `/code` and a deprecation announcement. The npm registry also carries a `deprecated` field. The repository page showed no archived banner.
- The repository describes it as "OAuth 2.0 clients for popular providers".
- Google and GitHub support: **not confirmed**. The page retrieved names no providers.
- Hono/Fastify and PostgreSQL: **not stated**. The page mentions no frameworks, databases, Node versions or runtime requirements.

## Q3. hono on Node.js with static files

Yes to both. The Node.js getting-started page describes running Hono through the Node.js adapter `@hono/node-server` with `serve(app)`, and serving static files with `serveStatic` imported from `@hono/node-server/serve-static`. The page states Node requirements of 18.14.1+, 19.7.0+ or 20.0.0+; note that `@hono/node-server` 2.1.6 declares `engines.node >=20`.
- https://hono.dev/docs/getting-started/nodejs
- https://registry.npmjs.org/@hono%2Fnode-server/latest

## Q4. Vite Node.js requirement

Vite 8.3.5 (current major 8) declares `engines.node: ^20.19.0 || >=22.12.0`, i.e. Node 20.19+ or 22.12+. Taken from the package's engines field; the Vite docs page was not opened.
- https://registry.npmjs.org/vite/latest

## Could not retrieve

- Publish dates for all 32 npm packages (the `/latest` endpoint does not include them; the full packument `time` field was not fetched).
- A confirmed stable prisma version (`latest` returned 8.0.0-rc.30; dist-tags were not checked).
- drizzle-orm `deprecated` and `engines.node` fields (not visible in the truncated response).
- Licences for Node.js, PostgreSQL, Caddy and Docker Compose (not present on the endpoints specified).
- arctic: provider list (Google/GitHub), runtime and framework compatibility. Not on the page retrieved; arcticjs.dev was not opened.
- better-auth: the individual Hono, Fastify, PostgreSQL, Google and GitHub doc pages (only the docs index was read).
- https://www.better-auth.com/llms.txt was fetched but held only links to the versioned indexes, no content for Q2.
- Tool budget: 45 calls used of 45. No WebSearch calls were made.
