// Check staging seed workflow for real regressions
// Avoids self-matching by checking actual workflow run commands, not error messages

import fs from "fs";

const workflowPath = ".github/workflows/seed-staging.yml";

// Read the workflow file
const workflow = fs.readFileSync(workflowPath, "utf-8");
const lines = workflow.split("\n");

// Forbidden patterns that indicate real regressions
// Each pattern includes context to avoid matching error messages or comments
const forbiddenPatterns = [
  // Check for apt-get install in run commands (not in echo messages)
  {
    name: "apt-get install",
    test: (line: string, nextLines: string[]) =>
      /run:\s*\|/.test(line) && nextLines.some((l) => /apt-get.*install/.test(l)),
  },
  // Check for psql commands in run blocks
  {
    name: "psql command",
    test: (line: string, nextLines: string[]) =>
      /run:\s*\|/.test(line) && nextLines.some((l) => /\bpsql\b/.test(l)),
  },
  // Check for inline bad Prisma import (relative path in quotes)
  {
    name: 'bad Prisma import "./src/generated/prisma/client"',
    test: (line: string) =>
      /from\s+['"]\.\s?\/src\/generated\/prisma\/client['"]/.test(line),
  },
  // Check for raw SQL select count (not in comments)
  {
    name: "raw SQL select count",
    test: (line: string) =>
      /SELECT\s+COUNT|select\s+count/.test(line) && !/^[\s]*#/.test(line),
  },
];

let hasErrors = false;

// Scan workflow
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const nextLines = lines.slice(i + 1, Math.min(i + 20, lines.length));

  for (const pattern of forbiddenPatterns) {
    try {
      if (pattern.test(line, nextLines)) {
        console.error(`[SEED_WORKFLOW_VIOLATION] ${pattern.name} detected at line ${i + 1}`);
        hasErrors = true;
      }
    } catch (error) {
      // Ignore test errors, pattern might not apply
    }
  }
}

// Ensure verification calls the script
if (!workflow.includes("scripts/verify-staging-seed.ts")) {
  console.error("[SEED_WORKFLOW_VIOLATION] Missing verification script call");
  hasErrors = true;
}

if (hasErrors) {
  process.exit(1);
}

console.log("Workflow anti-regression checks passed");
