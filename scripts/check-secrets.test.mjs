// 실행: node --test scripts/
// 비밀값처럼 보이는 글자를 이 파일에 그대로 적으면 검사에 걸리므로 조각을 이어 붙여 만든다.
import assert from "node:assert/strict";
import { test } from "node:test";

import { findSecrets, forbiddenFileReason } from "./check-secrets.mjs";

const join = (...parts) => parts.join("");
const letters = (count) => "aB3dE5gH7jK9mN1pQ2rS4tU6vW8xY0zA".repeat(4).slice(0, count);

const SECRETS = [
  ["GitHub 토큰", join("gh", "p_", letters(36))],
  ["GitHub 토큰", join("gh", "o_", letters(40))],
  ["GitHub 세분화 토큰", join("github", "_pat_", letters(60))],
  ["AWS 액세스 키", join("AK", "IA", "ABCDEFGHIJKLMNOP")],
  ["Google API 키", join("AI", "za", letters(35))],
  ["Google OAuth 클라이언트 비밀값", join("GOC", "SPX-", letters(28))],
  ["개인 키", join("-----BEGIN ", "RSA PRIVATE", " KEY-----")],
  ["개인 키", join("-----BEGIN ", "PRIVATE", " KEY-----")],
  ["Neon 데이터베이스 비밀번호", join("np", "g_", letters(16))],
  ["Slack 토큰", join("xo", "xb-", "1234567890-abcdefghij")],
  ["Stripe 운영 키", join("sk", "_live_", letters(24))],
  ["Anthropic API 키", join("sk", "-ant-", letters(40))],
  ["OpenAI API 키", join("sk", "-proj-", letters(40))],
  ["JWT", join("ey", "J", letters(20), ".", "ey", "J", letters(20), ".", letters(20))],
  ["비밀번호가 든 데이터베이스 주소", join("postgres", "ql://neondb_owner:", letters(16), "@ep-example.aws.neon.tech/neondb")],
  ["비밀값을 직접 적은 설정", join("VERCEL_", "TOKEN=", letters(24))],
  ["비밀값을 직접 적은 설정", join("AUTH_", "SECRET: \"", letters(32), "\"")],
  ["비밀값을 직접 적은 설정", join("  GOOGLE_CLIENT_", "SECRET = ", letters(30))],
];

for (const [rule, text] of SECRETS) {
  test(`찾는다: ${rule}`, () => {
    const findings = findSecrets(`첫 줄\n앞 ${text}\n끝 줄`);

    assert.ok(findings.length >= 1, "찾지 못함");
    assert.ok(findings.some((finding) => finding.rule === rule && finding.line === 2));
  });
}

const SAFE = [
  "VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}",
  "env.VERCEL_TOKEN != ''",
  "DATABASE_URL=postgres://user:password@localhost:5432/ping9",
  "postgresql://postgres:postgres@localhost/test",
  "postgres://app:${DB_PASSWORD}@db/ping9",
  "| `AUTH_SECRET` | 세션 서명에 쓰는 비밀값 |",
  "Token: gho_************************************",
  "GITHUB_TOKEN=",
  "const token = process.env.VERCEL_TOKEN;",
  "sha512-9aB3dE5gH7jK9mN1pQ2rS4tU6vW8xY0zAaB3dE5gH7jK9mN1pQ2rS4tU6vW8xY0zA==",
  "00000000-0000-4000-8000-000000000001",
  "02:00:00:00:01:00",
  "export const MAX_TOKEN = 2000;",
  "id: 3d3c42e5aac5ba805825da76410c181273ba90b1",
];

for (const text of SAFE) {
  test(`걸리지 않는다: ${text.slice(0, 48)}`, () => {
    assert.deepEqual(findSecrets(text), []);
  });
}

test("허용 표시가 있는 줄은 건너뛴다", () => {
  const secret = join("gh", "p_", letters(36));

  assert.equal(findSecrets(secret).length, 1);
  assert.deepEqual(findSecrets(`${secret} // secret-scan: allow`), []);
});

test("여러 줄에서 줄 번호를 맞게 돌려준다", () => {
  const text = ["a", join("AK", "IA", "ABCDEFGHIJKLMNOP"), "b", join("np", "g_", letters(16))].join("\r\n");

  assert.deepEqual(
    findSecrets(text).map((finding) => finding.line),
    [2, 4],
  );
});

test("저장소에 있으면 안 되는 파일을 가려낸다", () => {
  for (const path of [".env", ".env.local", ".env.production", "apps/api/.env", "deploy/server.pem", "id_rsa.key", ".vercel/project.json"]) {
    assert.notEqual(forbiddenFileReason(path), null, path);
  }
  for (const path of [".env.example", "apps/api/.env.example", "docs/environment.md", "vercel.json", "src/keyboard.ts", "packages/shared/src/index.ts"]) {
    assert.equal(forbiddenFileReason(path), null, path);
  }
});
