#!/usr/bin/env node

/**
 * Extract all DEAD_EMPTY_STATE patterns for inventory
 */

import fs from "fs";
import { glob } from "glob";

interface Match {
  file: string;
  line: number;
  code: string;
  pattern: string;
}

async function extractMatches(): Promise<void> {
  const matches: Match[] = [];

  const componentFiles = await glob([
    "src/**/*.tsx",
    "src/**/*.ts",
    "!src/**/node_modules/**",
    "!src/**/*.test.ts",
    "!src/**/*.test.tsx",
  ]);

  for (const file of componentFiles) {
    const content = fs.readFileSync(file, "utf-8");
    const lines = content.split("\n");

    lines.forEach((line, index) => {
      const lineNumber = index + 1;

      // Pattern 1: return null
      if (/return\s+null\s*[;{]/i.test(line)) {
        if (
          !line.includes("GovernedEmptyState") &&
          !line.includes("CompactEmptyState")
        ) {
          matches.push({
            file,
            line: lineNumber,
            code: line.trim(),
            pattern: "return_null",
          });
        }
      }

      // Pattern 2: !data && <div>No
      if (/!data.*?&&\s*<div>No/i.test(line)) {
        if (
          !line.includes("GovernedEmptyState") &&
          !line.includes("CompactEmptyState")
        ) {
          matches.push({
            file,
            line: lineNumber,
            code: line.trim(),
            pattern: "conditional_no_content",
          });
        }
      }

      // Pattern 3: if (!...) return null
      if (/if\s*\(!.*?\)\s*return\s+null/i.test(line)) {
        if (
          !line.includes("GovernedEmptyState") &&
          !line.includes("CompactEmptyState")
        ) {
          matches.push({
            file,
            line: lineNumber,
            code: line.trim(),
            pattern: "if_guard_return_null",
          });
        }
      }
    });
  }

  // Output to JSON
  fs.writeFileSync(
    ".claude/dead_empty_state_all_matches.json",
    JSON.stringify(matches, null, 2)
  );

  console.log(`Found ${matches.length} DEAD_EMPTY_STATE matches`);
  console.log(`Output: .claude/dead_empty_state_all_matches.json`);
}

extractMatches().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
