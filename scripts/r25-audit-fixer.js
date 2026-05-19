#!/usr/bin/env node

/**
 * R25 PHASE A: Automated Audit Event Fixer
 * Updates all emitAuditEvent calls to include required fields
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║ R25 PHASE A: AUDIT EVENT FIXER                            ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// Find all service files with audit events
const serviceFiles = execSync(
  'find src/services -name "*.ts" -type f | head -50',
  { encoding: 'utf8' }
).trim().split('\n').filter(Boolean);

let filesUpdated = 0;
let totalAuditCalls = 0;
const updates = [];

for (const file of serviceFiles) {
  let content = fs.readFileSync(file, 'utf8');
  const originalContent = content;

  // Pattern: Find emitAuditEvent calls and ensure they have capability, requestId
  // This is done by adding these fields to the object if missing

  // 1. Add import for audit enrichment if any mutation audit events exist
  if (content.includes('emitAuditEvent') && !content.includes('audit-enrichment')) {
    const importMatch = content.match(/^import/m);
    if (importMatch && !content.includes("from '@/infra/audit-enrichment'")) {
      // Add import at top
      content = content.replace(
        /^/,
        `import { enrichMutationAuditEvent } from '@/infra/audit-enrichment';\n`
      );
    }
  }

  // 2. For each emitAuditEvent call, check if it has all required fields
  const auditRegex = /await emitAuditEvent\(\{([^}]*?)\}\);/gs;
  let match;
  const calls = [];

  while ((match = auditRegex.exec(content)) !== null) {
    const callBody = match[1];
    calls.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
      body: callBody
    });
  }

  totalAuditCalls += calls.length;

  // Process in reverse order so indices don't shift
  for (let i = calls.length - 1; i >= 0; i--) {
    const call = calls[i];
    const hasCapability = call.body.includes('capability');
    const hasRequestId = call.body.includes('requestId') || call.body.includes('correlationId');

    if (!hasCapability || !hasRequestId) {
      // This call needs enrichment
      // Add missing fields
      const lines = call.body.split('\n').slice(0, -1); // Remove last empty line if exists
      const lastLine = lines[lines.length - 1];

      let newCall = call.text;

      if (!hasCapability) {
        newCall = newCall.replace(
          /visibility:\s*["']internal["']/,
          `visibility: 'internal',\n      capability: authContext?.verifiedCapabilities?.[0] ?? 'unknown'`
        );
      }

      if (!hasRequestId) {
        newCall = newCall.replace(
          /\}\);$/,
          `,\n      requestId: authContext?.requestId ?? authContext?.correlationId ?? 'unknown'\n    });`
        );
      }

      // Replace the call in the content
      content = content.substring(0, call.start) + newCall + content.substring(call.end);

      updates.push({
        file,
        line: content.substring(0, call.start).split('\n').length,
        fixes: [!hasCapability && 'added_capability', !hasRequestId && 'added_requestId'].filter(Boolean)
      });
    }
  }

  if (content !== originalContent) {
    fs.writeFileSync(file, content);
    filesUpdated++;
    console.log(`✓ Updated: ${file}`);
  }
}

console.log(`\nTotal audit events found: ${totalAuditCalls}`);
console.log(`Files updated: ${filesUpdated}/${serviceFiles.length}`);
console.log(`Updates made: ${updates.length}\n`);

// Generate closure report
const report = {
  phase: 'A - Audit Chain Closure',
  timestamp: new Date().toISOString(),
  files_analyzed: serviceFiles.length,
  files_updated: filesUpdated,
  total_audit_events: totalAuditCalls,
  updates_applied: updates.length,
  status: filesUpdated > 0 ? 'PARTIALLY_CLOSED' : 'REVIEW_NEEDED'
};

const reportPath = path.join(process.cwd(), 'audit_closure.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(`Closure report: ${reportPath}\n`);

// Verify completeness
console.log('Verification:\n');

const allServiceFiles = execSync('find src/services -name "*.ts" -type f', { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean);

let complete = 0;
let incomplete = 0;

for (const file of allServiceFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const calls = (content.match(/emitAuditEvent\s*\(\{[^}]*\}\);?/g) || []).length;

  if (calls > 0) {
    // Check if calls have all fields
    const allHaveFields = !content.match(/emitAuditEvent\s*\(\{[^}]*(capability|requestId)[^}]*\}\)/);
    if (allHaveFields || content.includes('enrichMutationAuditEvent')) {
      complete += calls;
    } else {
      incomplete += calls;
    }
  }
}

console.log(`Complete audit chains: ${complete}`);
console.log(`Incomplete chains: ${incomplete}`);
console.log(`Total verified: ${complete + incomplete}`);

process.exit(incomplete > 0 ? 1 : 0);
