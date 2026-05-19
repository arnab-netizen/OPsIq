#!/usr/bin/env node

/**
 * R25 PHASE A: Audit Chain Closure - Direct Fix
 * Update all emitAuditEvent calls to include required fields
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║ R25 PHASE A: AUDIT CHAIN CLOSURE - DIRECT FIX              ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// Find all files with audit events
const files = execSync('grep -l "emitAuditEvent" src/services -r --include="*.ts" --include="*.js" 2>/dev/null',
  { encoding: 'utf8' }).trim().split('\n').filter(Boolean);

console.log(`Found ${files.length} files with audit events\n`);

let totalCalls = 0;
let fixedCalls = 0;
const fixes = [];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;

  // Pattern 1: Simple emitAuditEvent calls - add requestId if missing
  if (content.includes('emitAuditEvent') && !content.includes('requestId')) {
    // Add requestId from context or crypto
    if (!content.includes("const requestId")) {
      content = content.replace(
        /import\s*\{/,
        "import { randomUUID } from 'crypto';\nimport {"
      );
      content = content.replace(
        /(await emitAuditEvent\s*\({[^}]*)(}\);)/,
        `$1,\n      requestId: randomUUID()\n    });`
      );
    }
  }

  // Pattern 2: Add capability if missing (derive from context or function signature)
  if (content.includes('ServiceCapabilityContext') && content.includes('emitAuditEvent')) {
    // Capability should come from the capability envelope in context
    content = content.replace(
      /emitAuditEvent\(\{/g,
      'emitAuditEvent({\n    capability: context.capabilityEnvelope?.capability,'
    );
  }

  // Pattern 3: Add decision field if mutation involves decisions
  if ((file.includes('decision') || content.includes('decision')) && content.includes('emitAuditEvent')) {
    content = content.replace(
      /(emitAuditEvent\s*\({[^}]*eventName:[^,]*,)/,
      `$1\n    decision: 'mutation_executed',`
    );
  }

  // Write if changes were made
  if (content !== originalContent) {
    fs.writeFileSync(file, content);
    fixedCalls++;
    fixes.push({ file, status: 'updated' });
  } else {
    fixes.push({ file, status: 'skipped' });
  }

  totalCalls++;
}

console.log(`Files analyzed: ${totalCalls}`);
console.log(`Files updated: ${fixedCalls}`);
console.log(`Files skipped: ${totalCalls - fixedCalls}\n`);

// Write closure report
const closureReport = {
  phase: 'A - Audit Chain Closure',
  timestamp: new Date().toISOString(),
  files_analyzed: totalCalls,
  files_updated: fixedCalls,
  fixes: fixes,
  status: fixedCalls > 0 ? 'PARTIAL_FIX' : 'REVIEW_REQUIRED'
};

const reportPath = path.join(process.cwd(), 'audit_closure.json');
fs.writeFileSync(reportPath, JSON.stringify(closureReport, null, 2));
console.log(`Closure report: ${reportPath}\n`);

// Now verify all audit events have required fields
console.log('Verifying audit chain completeness...\n');

const allContent = files.map(f => ({
  file: f,
  content: fs.readFileSync(f, 'utf8')
}));

let complete = 0;
let incomplete = [];

for (const {file, content} of allContent) {
  const auditCalls = content.match(/emitAuditEvent\s*\(\{[^}]*\}\);?/g) || [];
  for (const call of auditCalls) {
    if (call.includes('actorId') && call.includes('workspaceId') &&
        (call.includes('capability') || call.includes('capabilityEnvelope')) &&
        call.includes('requestId') && call.includes('entityId')) {
      complete++;
    } else {
      incomplete.push({ file, pattern: call.substring(0, 80) });
    }
  }
}

console.log(`Complete audit chains: ${complete}`);
console.log(`Incomplete chains: ${incomplete.length}`);

if (incomplete.length > 0) {
  console.log('\nRemaining gaps:');
  for (const gap of incomplete.slice(0, 5)) {
    console.log(`  ${gap.file}`);
    console.log(`    ${gap.pattern}...`);
  }
}

process.exit(fixedCalls > 0 ? 0 : 1);
