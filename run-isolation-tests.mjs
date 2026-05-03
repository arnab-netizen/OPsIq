#!/usr/bin/env node
/**
 * Tenant Isolation Test Runner
 * Executes deterministic isolation tests with real database
 */

import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

const testFile = path.resolve("src/tenant-isolation.integration.test.ts");

if (!fs.existsSync(testFile)) {
  console.error(`❌ Test file not found: ${testFile}`);
  process.exit(1);
}

console.log("🔒 TENANT ISOLATION TEST RUNNER\n");
console.log(`Running: ${testFile}\n`);

const vitest = spawn("npx", ["vitest", "run", "--reporter=verbose", testFile], {
  stdio: "inherit",
  env: {
    ...process.env,
    VITEST: "true",
  },
});

vitest.on("close", (code) => {
  process.exit(code);
});
