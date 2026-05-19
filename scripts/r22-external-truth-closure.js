#!/usr/bin/env node

/**
 * R22: External Truth Closure
 * Verify external dependencies with real execution evidence
 * FAIL CLOSED: No mocked execution, no inferred passes, only real evidence counts
 */

const fs = require('fs');
const path = require('path');

class ExternalDependencyVerifier {
  constructor() {
    this.results = [];
    this.requirements = {
      production_url: process.env.PRODUCTION_URL || null,
      staging_url: process.env.STAGING_URL || null,
      database_url: process.env.DATABASE_URL || null,
      stripe_key: process.env.STRIPE_API_KEY ? '***hidden***' : null,
      webhook_secret: process.env.WEBHOOK_SECRET ? '***hidden***' : null,
    };
  }

  /**
   * Verify each external dependency
   * FAIL CLOSED: No evidence = FAIL
   */
  async verifyDependency(name, checks) {
    const result = {
      dependency: name,
      status: 'NOT_VERIFIED',
      infrastructure: {
        code_exists: false,
        handlers_implemented: false,
        error_handling: false,
        logging: false,
      },
      evidence: {
        real_execution_tested: false,
        actual_ids_captured: false,
        actual_timestamps: false,
        actual_logs: false,
        actual_traces: false,
      },
      required_for_closure: [
        'actual_ids_captured',
        'actual_timestamps',
        'actual_logs',
        'real_execution_tested',
      ],
      failures: [],
      pass: false,
      notes: [],
    };

    // Check code infrastructure
    for (const check of checks.files || []) {
      const filePath = path.join(process.cwd(), check);
      if (fs.existsSync(filePath)) {
        result.infrastructure.code_exists = true;
        const content = fs.readFileSync(filePath, 'utf8');
        if (content.includes('emitAuditEvent') || content.includes('logger')) {
          result.infrastructure.logging = true;
        }
        if (content.includes('try') && content.includes('catch')) {
          result.infrastructure.error_handling = true;
        }
      }
    }

    // Check for handlers
    for (const handler of checks.handlers || []) {
      const found = this.findHandler(handler);
      if (found) {
        result.infrastructure.handlers_implemented = true;
      }
    }

    // FAIL CLOSED: Can only pass if all evidence is provided
    if (checks.requiresProduction) {
      result.notes.push('Requires production/staging execution');
      result.notes.push('Real IDs, timestamps, logs, and traces must be captured');
      result.notes.push('Cannot pass without actual execution evidence');
      result.pass = false;
      result.failures.push('requires_production_execution');
    } else {
      // Can be verified locally
      if (result.infrastructure.code_exists && result.infrastructure.handlers_implemented) {
        result.status = 'INFRASTRUCTURE_READY';
        result.notes.push('Ready for production testing');
      } else {
        result.pass = false;
        if (!result.infrastructure.code_exists) {
          result.failures.push('code_not_found');
        }
        if (!result.infrastructure.handlers_implemented) {
          result.failures.push('handlers_not_implemented');
        }
      }
    }

    return result;
  }

  /**
   * Find handler implementation in codebase
   */
  findHandler(pattern) {
    try {
      const result = require('child_process').execSync(
        `grep -r "${pattern}" src --include="*.ts" 2>/dev/null | wc -l`,
        { encoding: 'utf8' }
      );
      return parseInt(result) > 0;
    } catch {
      return false;
    }
  }

  /**
   * Generate evidence template for each dependency
   */
  generateEvidenceTemplate(dependency) {
    return {
      dependency,
      execution_timestamp: '2026-05-19T00:00:00.000Z',
      evidence: {
        session_login: {
          request_id: 'actual-request-id-from-http-logs',
          user_id: 'actual-user-id-from-db',
          session_id: 'actual-session-id-from-db',
          session_token: '***redacted***',
          created_at: 'timestamp-from-session-table',
          ip_address: 'actual-ip-from-request',
          user_agent: 'actual-user-agent',
          cookies_set: true,
          audit_event_id: 'actual-audit-event-id',
          source: 'database_query',
        },
        webhook_execution: {
          webhook_id: 'actual-webhook-id',
          event_type: 'charge.succeeded',
          timestamp: 'actual-webhook-timestamp',
          request_signature: 'verified-stripe-signature',
          http_status: 200,
          response_time_ms: 'actual-milliseconds',
          audit_trail: 'actual-audit-event-id',
          source: 'stripe-webhook-logs',
        },
        stripe_lifecycle: {
          customer_id: 'actual-stripe-customer-id',
          subscription_id: 'actual-stripe-subscription-id',
          invoice_id: 'actual-stripe-invoice-id',
          status_changes: [
            { from: 'trialing', to: 'active', timestamp: 'actual' },
            { from: 'active', to: 'past_due', timestamp: 'actual' },
          ],
          payment_method_id: 'actual-payment-method-id',
          source: 'stripe-api-responses',
        },
        database_persistence: {
          table: 'workspace',
          row_id: 'actual-workspace-id',
          pre_restart_checksum: 'actual-data-hash',
          post_restart_checksum: 'actual-data-hash',
          data_integrity: 'verified',
          restart_timestamp: 'actual-timestamp',
          source: 'database_snapshot',
        },
        deployment_health: {
          instance_id: 'actual-deployment-id',
          health_check_url: '/api/health',
          response_code: 200,
          response_time_ms: 'actual-ms',
          dependencies_healthy: {
            database: true,
            cache: true,
            auth_service: true,
          },
          timestamp: 'actual-timestamp',
          source: 'health-check-endpoint',
        },
      },
    };
  }
}

/**
 * Main execution
 */
async function runR22ExternalTruth() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║ R22: EXTERNAL TRUTH CLOSURE                                ║');
  console.log('║ Verify external dependencies with real execution            ║');
  console.log('║ FAIL CLOSED: No mocked execution, no inferred passes        ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  const verifier = new ExternalDependencyVerifier();

  // Define dependencies to verify
  const dependencies = [
    {
      name: 'Real Session Login',
      description: 'Actual HTTP login with real session creation',
      files: ['src/app/api/auth/login/route.ts', 'src/services/auth.ts'],
      handlers: ['POST.*login', 'db.session.create'],
      requiresProduction: true,
      evidenceRequired: [
        'actual-session-id-from-database',
        'actual-user-id-from-database',
        'actual-http-request-logs',
        'actual-session-token',
        'actual-timestamp',
        'actual-audit-event-id',
      ],
    },
    {
      name: 'Real Browser Rendering',
      description: 'NextJS app actual render in browser',
      files: ['src/app/page.tsx', 'next.config.js'],
      handlers: ['export.*Page', 'getServerSideProps', 'generateMetadata'],
      requiresProduction: true,
      evidenceRequired: [
        'actual-html-response',
        'actual-render-timing',
        'actual-browser-console-logs',
        'actual-page-load-metrics',
      ],
    },
    {
      name: 'Real Page Hydration',
      description: 'React hydration on actual client',
      files: ['src/app/layout.tsx', 'package.json'],
      handlers: ['useEffect', 'hydrate', 'ReactDOM'],
      requiresProduction: true,
      evidenceRequired: [
        'actual-js-execution-logs',
        'actual-hydration-timing',
        'actual-state-sync',
        'actual-browser-network-trace',
      ],
    },
    {
      name: 'Real Stripe Webhook',
      description: 'Actual webhook receipt and processing',
      files: [
        'src/app/api/webhooks/stripe/route.ts',
        'src/services/webhooks.service.ts',
      ],
      handlers: ['stripe.webhooks.constructEvent', 'CHECKOUT_SESSION_COMPLETED'],
      requiresProduction: true,
      evidenceRequired: [
        'actual-webhook-event-id-from-stripe',
        'actual-timestamp',
        'actual-signature-verification',
        'actual-processing-logs',
        'actual-audit-events',
      ],
    },
    {
      name: 'Real Subscription Lifecycle',
      description: 'Actual Stripe subscription creation and status changes',
      files: [
        'src/app/api/billing/upgrade/route.ts',
        'src/services/entitlement.ts',
      ],
      handlers: ['stripe.subscriptions.create', 'subscription_updated'],
      requiresProduction: true,
      evidenceRequired: [
        'actual-stripe-customer-id',
        'actual-stripe-subscription-id',
        'actual-status-change-timestamps',
        'actual-payment-intent-id',
        'actual-database-rows-created',
      ],
    },
    {
      name: 'Real Scheduled Jobs',
      description: 'Actual cron job execution',
      files: ['src/cron/jobs', 'src/services/scheduled-tasks.ts'],
      handlers: ['cron', 'schedule', 'job.run'],
      requiresProduction: true,
      evidenceRequired: [
        'actual-execution-timestamp',
        'actual-job-id',
        'actual-execution-logs',
        'actual-rows-modified',
        'actual-completion-status',
      ],
    },
    {
      name: 'Real Deployment Health',
      description: 'Actual deployment instance health checks',
      files: ['src/app/api/health/route.ts', 'src/lib/health-check.ts'],
      handlers: ['health.*check', 'database.*ping', 'cache.*ping'],
      requiresProduction: true,
      evidenceRequired: [
        'actual-instance-id',
        'actual-http-response-code',
        'actual-response-time',
        'actual-dependency-status',
        'actual-timestamp',
      ],
    },
    {
      name: 'Real Database Persistence',
      description: 'Data survival across actual database restart',
      files: ['src/lib/db.ts', 'prisma/schema.prisma'],
      handlers: ['PrismaClient', 'database.*connect'],
      requiresProduction: true,
      evidenceRequired: [
        'actual-data-checksum-before',
        'actual-data-checksum-after',
        'actual-row-count-before',
        'actual-row-count-after',
        'actual-restart-timestamp',
      ],
    },
    {
      name: 'Real Restart Recovery',
      description: 'System recovery after actual failure',
      files: ['src/lib/error-recovery.ts', 'src/services/recovery.ts'],
      handlers: ['try.*catch', 'error.*handler', 'recovery'],
      requiresProduction: true,
      evidenceRequired: [
        'actual-error-id',
        'actual-recovery-timestamp',
        'actual-recovery-action',
        'actual-recovery-logs',
        'actual-recovery-audit-event',
      ],
    },
    {
      name: 'Real Operator Session Replay',
      description: 'Actual session audit trail and replay capability',
      files: ['src/services/session-replay.ts', 'src/lib/audit-trail.ts'],
      handlers: ['replay.*session', 'audit.*event', 'session.*history'],
      requiresProduction: true,
      evidenceRequired: [
        'actual-session-id',
        'actual-request-ids',
        'actual-action-sequence',
        'actual-state-snapshots',
        'actual-audit-event-ids',
      ],
    },
  ];

  // Verify each dependency
  console.log('Verifying External Dependencies:\n');
  for (const dep of dependencies) {
    console.log(`${dep.name}`);
    console.log('─'.repeat(60));
    const result = await verifier.verifyDependency(dep.name, dep);

    console.log(`Infrastructure: ${result.infrastructure.code_exists ? '✓' : '✗'}`);
    console.log(`Status: ${result.status}`);
    console.log(`Pass: ${result.pass ? '✅' : '❌'}`);

    if (result.failures.length > 0) {
      console.log(`Failures: ${result.failures.join(', ')}`);
    }

    if (result.notes.length > 0) {
      console.log(`Notes:`);
      for (const note of result.notes) {
        console.log(`  - ${note}`);
      }
    }

    console.log('');
    verifier.results.push(result);
  }

  // Generate final report
  const report = {
    generated_at: new Date().toISOString(),
    phase: 'R22 - External Truth Closure',
    execution_mode: 'FAIL_CLOSED',
    total_dependencies: dependencies.length,
    infrastructure_ready: verifier.results.filter((r) =>
      r.infrastructure.code_exists
    ).length,
    production_verified: verifier.results.filter((r) => r.pass).length,
    dependencies: verifier.results,
    summary: {
      all_infrastructure_ready:
        verifier.results.filter((r) => r.infrastructure.code_exists).length ===
        dependencies.length,
      production_execution_needed: dependencies.length,
      production_verified_count: verifier.results.filter((r) => r.pass).length,
      evidence_template_available: true,
      fail_closed_enforced: true,
    },
    next_steps: [
      '1. Deploy to production/staging environment',
      '2. Execute each test scenario with real data',
      '3. Capture actual IDs from database',
      '4. Capture actual timestamps from system clock',
      '5. Capture actual logs from application',
      '6. Capture actual request traces from HTTP layer',
      '7. Capture actual database rows',
      '8. Verify all evidence matches requirements',
      '9. Record evidence in workflow_runtime_external_truth.json',
      '10. Mark dependency as verified only if all evidence present',
    ],
    evidence_templates: dependencies.map((d) => verifier.generateEvidenceTemplate(d.name)),
  };

  // Write report
  const outputPath = path.join(process.cwd(), 'workflow_runtime_external_truth.json');
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║ R22 VERIFICATION COMPLETE                                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Infrastructure Ready: ${report.summary.all_infrastructure_ready ? '✅' : '❌'}`);
  console.log(`Production Tests Required: ${report.summary.production_execution_needed}`);
  console.log(`Production Verified: ${report.summary.production_verified_count}`);
  console.log('');
  console.log(`Output: ${outputPath}`);
  console.log('');
  console.log('FAIL CLOSED Status:');
  console.log('  - Cannot pass without production execution');
  console.log('  - All 10 dependencies require real evidence');
  console.log('  - Evidence templates provided for each test');
  console.log('  - Ready for production verification phase');
  console.log('');

  if (report.summary.all_infrastructure_ready) {
    console.log('✅ All infrastructure code exists');
    console.log('⚠️  Production execution required for closure');
    process.exit(0);
  } else {
    console.log('❌ Some infrastructure missing');
    process.exit(1);
  }
}

runR22ExternalTruth().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
