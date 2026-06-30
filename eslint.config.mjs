import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { rule } from "./src/governance/eslint-auth-enforcement.js";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated code (Prisma client, etc.) is not authored source: its lint
    // profile tracks the generator version, not developer intent.
    "src/generated/**",
    // Playwright run artifacts (HTML report, traces) are generated, not source.
    "test-results/**",
    "playwright-report/**",
  ]),
  // PHASE G2: Auth enforcement rules
  {
    rules: {
      "auth-enforcement/strict-auth": "error",
    },
    plugins: {
      "auth-enforcement": {
        rules: {
          "strict-auth": rule,
        },
      },
    },
  },
]);

export default eslintConfig;
