import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { rule as authEnforcementRule } from "./src/governance/eslint-auth-enforcement.js";

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
  ]),
  // PHASE G2: Auth enforcement rules
  {
    rules: {
      "auth-enforcement/no-any": "off",  // Using TypeScript compiler instead
      "auth-enforcement/no-union": "off",  // Using TypeScript compiler instead
      "auth-enforcement/no-unsafe-cast": "error",  // ESLint catches casts
      "auth-enforcement/no-legacy-in-canonical": "error",  // ESLint catches imports
    },
    plugins: {
      "auth-enforcement": {
        rules: {
          "no-any": authEnforcementRule.rule,
          "no-union": authEnforcementRule.rule,
          "no-unsafe-cast": authEnforcementRule.rule,
          "no-legacy-in-canonical": authEnforcementRule.rule,
        },
      },
    },
  },
]);

export default eslintConfig;
