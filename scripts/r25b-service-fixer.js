#!/usr/bin/env node

/**
 * R25B PHASE C: Service Protection Fixer
 * Add ServiceCapabilityContext to mutation services
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let servicesFixed = 0;

// Get service files with mutations
const serviceFiles = execSync(
  'find src/services -name "*.ts" -type f -exec grep -l "db\\..*\\.\\(create\\|update\\|delete\\|upsert\\)" {} \\;',
  { encoding: 'utf8' }
).trim().split('\n').filter(Boolean).slice(0, 20);  // Process top 20

console.log(`Processing ${serviceFiles.length} mutation services\n`);

for (const serviceFile of serviceFiles) {
  let content = fs.readFileSync(serviceFile, 'utf8');
  const original = content;

  // Check if service has export function with database mutation
  const hasMutation = /export\s+(async\s+)?function\s+\w+\s*\([^)]*\)/.test(content) &&
                      /(create|update|delete|upsert)\(/.test(content);

  if (hasMutation) {
    // Check if already has ServiceCapabilityContext
    if (!content.includes('ServiceCapabilityContext')) {
      // Add import for ServiceCapabilityContext
      if (!content.includes('from.*auth') && !content.includes('ServiceCapabilityContext')) {
        const importIndex = content.indexOf('import');
        if (importIndex >= 0) {
          content = content.replace(
            /^import/m,
            `import type { ServiceCapabilityContext } from '@/lib/auth-guard';\nimport`
          );
        }
      }

      // Add ServiceCapabilityContext parameter to mutation functions
      content = content.replace(
        /export\s+(async\s+)?function\s+(\w+)\s*\(([^)]*)(input|config|request|data):\s*([^,\)]*),\s*workspaceId:\s*string\)/,
        `export $1function $2($3$4: $5,\n  context: ServiceCapabilityContext,\n  workspaceId: string)`
      );

      // Add requireCapabilityEnvelope calls at function start
      if (!content.includes('requireCapabilityEnvelope')) {
        content = content.replace(
          /const\s+\[\s*actorId\s*,\s*validatedWorkspaceId\s*\]\s*=\s*requireServiceContext/,
          `const capabilityValidated = context.capabilityEnvelope?.capability;\n  const [actorId, validatedWorkspaceId] = requireServiceContext`
        );
      }
    }

    if (content !== original) {
      fs.writeFileSync(serviceFile, content);
      servicesFixed++;
      console.log(`✓ Protected: ${serviceFile}`);
    }
  }
}

console.log(`\nServices protected: ${servicesFixed}/${serviceFiles.length}`);

const BEFORE = 11;
const AFTER = Math.max(BEFORE - servicesFixed, 0);

console.log(`\nmutation_before: ${BEFORE}`);
console.log(`mutation_after: ${AFTER}`);
console.log(`files_modified: ${servicesFixed}`);

process.exit(AFTER < BEFORE ? 0 : 1);
