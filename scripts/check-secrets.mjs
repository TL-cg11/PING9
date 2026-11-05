// 저장소에 비밀값 형태의 글자가 들어갔는지 검사한다 (SEC-19).
//
//   node scripts/check-secrets.mjs                  추적 중인 모든 파일을 검사
//   node scripts/check-secrets.mjs --range A..B     위에 더해, A..B 사이 커밋이 추가한 줄도 검사
//                                                   (커밋했다가 지운 비밀값을 찾는다)
//
// 의도한 예시 값이라면 그 줄에 `secret-scan: allow`라고 적는다.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** 비밀값의 형태. 형식이 뚜렷해 잘못 걸릴 일이 적은 것만 둔다 */
export const RULES = [
  { name: "GitHub 토큰", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: "GitHub 세분화 토큰", pattern: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/ },
  { name: "AWS 액세스 키", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: "Google API 키", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "Google OAuth 클라이언트 비밀값", pattern: /\bGOCSPX-[A-Za-z0-9_-]{20,}/ },
  { name: "개인 키", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "Neon 데이터베이스 비밀번호", pattern: /\bnpg_[A-Za-z0-9]{12,}\b/ },
  { name: "Slack 토큰", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: "Stripe 운영 키", pattern: /\b[sr]k_live_[A-Za-z0-9]{16,}\b/ },
  { name: "Anthropic API 키", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: "OpenAI API 키", pattern: /\bsk-proj-[A-Za-z0-9_-]{20,}/ },
  { name: "JWT", pattern: /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/ },
  {
    name: "비밀번호가 든 데이터베이스 주소",
    pattern: /\bpostgres(?:ql)?:\/\/[^\s:@/]+:(?!(?:password|pass|secret|changeme|postgres|example|user|\*+|<[^>]*>|\$\{?[A-Za-z_]+\}?)@)[^\s@/]{6,}@/i,
  },
  {
    name: "비밀값을 직접 적은 설정",
    pattern: /\b[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY)\s*[=:]\s*["']?[A-Za-z0-9+/_-]{24,}["']?\s*$/,
  },
];

/** 저장소에 있으면 안 되는 파일 */
const FORBIDDEN_FILES = [
  { name: "환경 변수 파일", pattern: /(^|\/)\.env(\.(?!example$)[^/]*)?$/ },
  { name: "키 파일", pattern: /\.(pem|key|p12|pfx)$/ },
  { name: "Vercel 로컬 연결 정보", pattern: /(^|\/)\.vercel\// },
];

const ALLOW_MARK = "secret-scan: allow";
const MAX_FILE_BYTES = 1024 * 1024;

/** 글자에서 비밀값 형태를 찾는다. 찾은 것마다 줄 번호와 규칙 이름을 돌려준다 */
export function findSecrets(text) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (line.includes(ALLOW_MARK)) continue;
    for (const rule of RULES) {
      if (rule.pattern.test(line)) findings.push({ line: index + 1, rule: rule.name });
    }
  }
  return findings;
}

/** 저장소에 있으면 안 되는 파일 이름이면 그 이유를, 아니면 null을 돌려준다 */
export function forbiddenFileReason(path) {
  return FORBIDDEN_FILES.find((rule) => rule.pattern.test(path))?.name ?? null;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

function scanTrackedFiles() {
  const problems = [];
  const files = git(["ls-files", "-z"]).split("\0").filter(Boolean);

  for (const file of files) {
    const reason = forbiddenFileReason(file);
    if (reason) problems.push(`${file}: ${reason}은 저장소에 넣지 않습니다`);

    let content;
    try {
      content = readFileSync(file);
    } catch {
      continue; // 작업 폴더에서 지운 파일
    }
    if (content.length > MAX_FILE_BYTES || content.includes(0)) continue; // 큰 파일과 이진 파일

    for (const finding of findSecrets(content.toString("utf8"))) {
      problems.push(`${file}:${finding.line}: ${finding.rule}`);
    }
  }
  return { fileCount: files.length, problems };
}

function scanAddedLines(range) {
  const problems = [];
  const diff = git(["log", "--patch", "--unified=0", "--no-color", "--format=commit %h", range]);

  let commit = "";
  let file = "";
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("commit ")) commit = line.slice(7);
    else if (line.startsWith("+++ b/")) file = line.slice(6);
    else if (line.startsWith("+") && !line.startsWith("+++")) {
      for (const finding of findSecrets(line.slice(1))) {
        problems.push(`${file} (커밋 ${commit}): ${finding.rule}`);
      }
    }
  }
  return problems;
}

function main(argv) {
  const rangeIndex = argv.indexOf("--range");
  const range = rangeIndex === -1 ? null : argv[rangeIndex + 1];

  const { fileCount, problems } = scanTrackedFiles();
  if (range) problems.push(...scanAddedLines(range));

  if (problems.length > 0) {
    console.error(`비밀값 형태를 ${problems.length}곳에서 찾았습니다:`);
    for (const problem of problems) console.error(`  ${problem}`);
    console.error(`\n실제 비밀값이면 지우고, 이미 push했다면 그 값을 폐기하고 새로 발급하세요.`);
    console.error(`의도한 예시 값이면 그 줄에 "${ALLOW_MARK}"라고 적으세요.`);
    process.exitCode = 1;
    return;
  }
  console.log(`비밀값 검사 통과: 파일 ${fileCount}개${range ? `, 커밋 범위 ${range}` : ""}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2));
}
