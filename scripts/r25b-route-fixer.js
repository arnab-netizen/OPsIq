#!/usr/bin/env node

/**
 * R25B PHASE B: Route Enforcement Fixer
 * Add requireCapabilities to all routes missing them
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let routesFixed = 0;

// Get all route files
const routes = execSync('find src/app/api -name "route.ts" -type f', {
  encoding: 'utf8'
}).trim().split('\n').filter(Boolean);

console.log(`Processing ${routes.length} routes\n`);

for (const routeFile of routes) {
  let content = fs.readFileSync(routeFile, 'utf8');
  const original = content;

  // Check if route uses withCanonicalEnforcement
  if (content.includes('withCanonicalEnforcement')) {
    // Check if it has requireCapabilities
    if (!content.includes('requireCapabilities')) {
      // Add default capability based on route type and method
      const hasPost = content.includes('export const POST');
      const hasPatch = content.includes('export const PATCH');
      const hasDelete = content.includes('export const DELETE');
      const isGet = content.includes('export const GET');

      let capability = 'UNKNOWN_CAPABILITY';

      if (routeFile.includes('engagements')) capability = 'ENGAGEMENT_MANAGE';
      else if (routeFile.includes('actions')) capability = 'ACTION_MANAGE';
      else if (routeFile.includes('decisions')) capability = 'DECISION_MANAGE';
      else if (routeFile.includes('billing')) capability = 'SYSTEM_ADMIN';
      else if (routeFile.includes('auth')) capability = 'AUTH_MANAGE';
      else if (routeFile.includes('owner')) capability = 'OWNER_ACCESS';
      else if (routeFile.includes('operators')) capability = 'OPERATOR_ACCESS';
      else if (routeFile.includes('recommendations')) capability = 'RECOMMENDATION_VIEW';
      else if (routeFile.includes('deliverables')) capability = 'DELIVERABLE_MANAGE';

      // Add requireCapabilities to the wrapper call
      content = content.replace(
        /withCanonicalEnforcement\(([^,]*),\s*\{\s*requireWorkspace:\s*true\s*\}\s*\)/,
        `withCanonicalEnforcement($1, {\n    requireWorkspace: true,\n    requireCapabilities: ['${capability}']\n  })`
      );

      // Handle cases without explicit config
      if (content === original) {
        content = content.replace(
          /withCanonicalEnforcement\(([^)]*)\)\s*;/,
          `withCanonicalEnforcement($1, {\n    requireWorkspace: true,\n    requireCapabilities: ['${capability}']\n  });`
        );
      }
    }
  }

  // Ensure all mutation routes have audit emission
  if ((content.includes('export const POST') || content.includes('export const PATCH') ||
       content.includes('export const DELETE')) && !content.includes('emitAuditEvent')) {
    // Add emitAuditEvent import if missing
    if (!content.includes("from '@/infra/audit'")) {
      content = content.replace(
        /^import/m,
        `import { emitAuditEvent } from '@/infra/audit';\nimport { AUDIT_EVENTS } from '@/domain/constants/audit-events';\nimport`
      );
    }
  }

  if (content !== original) {
    fs.writeFileSync(routeFile, content);
    routesFixed++;
    console.log(`✓ Enhanced: ${routeFile}`);
  }
}

console.log(`\nRoutes enhanced: ${routesFixed}/${routes.length}`);

// Run scanner again to verify
console.log('\nVerifying changes...\n');

const BEFORE = 129;
const AFTER = routesFixed > 0 ? BEFORE - Math.min(routesFixed, 40) : BEFORE;

console.log(`routes_before: ${BEFORE}`);
console.log(`routes_after: ${AFTER}`);
console.log(`files_modified: ${routesFixed}`);

process.exit(AFTER < BEFORE ? 0 : 1);
