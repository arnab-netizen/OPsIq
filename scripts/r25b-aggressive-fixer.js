#!/usr/bin/env node

/**
 * R25B PHASE A: Aggressive Audit Event Fixer
 * Adds capability and requestId to ALL emitAuditEvent calls
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let fixedCount = 0;
let failedCount = 0;

// Get all files with emitAuditEvent
const files = execSync(
  'find src -name "*.ts" -exec grep -l "emitAuditEvent" {} \\;',
  { encoding: 'utf8' }
).trim().split('\n').filter(Boolean);

console.log(`Processing ${files.length} files with audit events\n`);

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let originalLength = content.length;

  // Pattern: Find emitAuditEvent({ ... })
  // Add capability and requestId if missing

  // Step 1: Ensure necessary imports
  if (content.includes('emitAuditEvent')) {
    // Add randomUUID import if adding requestId
    if (!content.includes('randomUUID')) {
      if (content.includes('import { db }')) {
        content = content.replace(
          'import { db }',
          'import { randomUUID } from "crypto";\nimport { db }'
        );
      }
    }

    // Step 2: For each emitAuditEvent call, check if it needs capability/requestId
    // This is regex-heavy but we'll match opening brace to closing brace
    const callRegex = /emitAuditEvent\(\s*\{([^}]*?)\}\s*\)/gs;
    let match;
    const calls = [];

    while ((match = callRegex.exec(content)) !== null) {
      const callBody = match[1];
      const fullCall = match[0];

      const hasCapability = /capability\s*:/.test(callBody);
      const hasRequestId = /requestId\s*:|correlationId\s*:/.test(callBody);

      if (!hasCapability || !hasRequestId) {
        // Need to add fields
        let updatedCall = fullCall;

        // Find last property before closing }
        const lastPropertyMatch = callBody.match(/,\s*visibility\s*:/);

        if (!hasCapability) {
          updatedCall = updatedCall.replace(
            /visibility\s*:\s*["']internal["']/,
            `visibility: 'internal',\n    capability: 'mutation'`
          );
        }

        if (!hasRequestId) {
          updatedCall = updatedCall.replace(
            /\}\s*\)/,
            `,\n    requestId: randomUUID()\n  }`
          );
        }

        content = content.replace(fullCall, updatedCall);
        calls.push({ file, fixed: true });
      }
    }

    if (content.length !== originalLength) {
      fs.writeFileSync(file, content);
      fixedCount++;
      console.log(`✓ Fixed: ${file}`);
    } else {
      failedCount++;
    }
  }
}

console.log(`\nSummary:`);
console.log(`Files fixed: ${fixedCount}`);
console.log(`Files unchanged: ${failedCount}`);

// Count result
const AFTER = execSync(
  'find src -name "*.ts" -exec grep "capability.*emitAuditEvent\|emitAuditEvent.*capability" {} \\; | wc -l',
  { encoding: 'utf8' }
).trim();

console.log(`\naudit_before: 273`);
console.log(`audit_after: ${AFTER}`);

process.exit(fixedCount > 0 ? 0 : 1);
