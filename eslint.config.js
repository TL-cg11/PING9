import js from "@eslint/js";
import tseslint from "typescript-eslint";

// 의존 방향(AD-2), engine의 금지 함수(AD-5), 화면의 금지 API(SEC-9) 규칙은 T1.1.2에서 추가한다.
export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      ".claude/**",
      ".specify/**",
      ".vercel/**",
      "_bmad/**",
      "_bmad-output/**",
      "docs/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
  },
  {
    // 저장소 관리용 Node 스크립트
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: { console: "readonly", process: "readonly" },
    },
  },
);
