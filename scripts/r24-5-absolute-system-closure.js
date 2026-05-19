#!/usr/bin/env node

/**
 * R24.5: ABSOLUTE SYSTEM CLOSURE
 * Convert all system status into deterministic truth
 * FAIL CLOSED: implemented ≠ wired ≠ runtime proven ≠ deployment proven
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class AbsoluteSystemClosureAuditor {
  constructor() {
    this.routes = [];
    this.services = [];
    this.auditChain = [];
    this.workflows = [];
    this.telemetry = [];
    this.falseGreenClaims = [];
    this.regressionGates = [];
    this.truth = {
      routes: { total: 0, fully_closed: 0, partial: 0, failed: 0, intentional_public: 0 },
      services: { total: 0, read_only: 0, mutation_closed: 0, mutation_partial: 0, background_exempt: 0 },
      audit: { coverage_percent: 0, missing: [] },
      telemetry: { coverage_percent: 0, missing: [] },
      workflows: { total: 0, closed: 0, partial: 0 },
      runtime: { proven: 0, unproven: 0 },
      regression: { locked: false, unlocked_rules: [] },
      deployment: { internal_alpha: 'BLOCKED', controlled_beta: 'BLOCKED', production: 'BLOCKED' },
      blockers: []
    };
  }

  // PHASE A: Complete Route Closure
  async phaseA() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║ PHASE A: COMPLETE ROUTE CLOSURE                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    try {
      const routeFiles = execSync('find src/app/api -type f \\( -name "route.ts" -o -name "route.js" \\) | sort', {
        encoding: 'utf8'
      }).trim().split('\n').filter(Boolean);

      console.log(`Scanning ${routeFiles.length} routes...\n`);

      for (const routeFile of routeFiles) {
        const routePath = routeFile.replace('src/app/api', '').replace('/route.ts', '').replace('/route.js', '') || '/';
        const content = fs.readFileSync(routeFile, 'utf8');

        const route = {
          path: routePath,
          file: routeFile,
          auth_enforced: false,
          workspace_verified: false,
          capability_enforced: false,
          audit_emitted: false,
          telemetry_emitted: false,
          idempotent: false,
          service_context_verified: false,
          status: 'UNKNOWN',
          gaps: []
        };

        // Check auth enforcement
        if (content.includes('withCanonicalEnforcement') || content.includes('withAuth') || content.includes('requireAuth')) {
          route.auth_enforced = true;
        } else if (content.includes('public') || content.includes('PUBLIC')) {
          route.status = 'INTENTIONAL_PUBLIC';
        } else {
          route.gaps.push('NO_AUTH_ENFORCED');
        }

        // Check workspace verification
        if (content.includes('verifiedWorkspaceId') || content.includes('ctx.authContext.verifiedWorkspaceId') ||
            content.includes('context.workspace') || content.includes('workspaceId')) {
          route.workspace_verified = true;
        } else if (route.status !== 'INTENTIONAL_PUBLIC') {
          route.gaps.push('NO_WORKSPACE_VERIFIED');
        }

        // Check capability enforcement
        if (content.includes('requireCapabilities') || content.includes('capability_enforced') ||
            content.includes('CAPABILITIES.')) {
          route.capability_enforced = true;
        } else if (route.status !== 'INTENTIONAL_PUBLIC' && content.includes('POST') || content.includes('PATCH') || content.includes('DELETE')) {
          route.gaps.push('NO_CAPABILITY_ENFORCED');
        }

        // Check audit emission
        if (content.includes('emitAuditEvent') || content.includes('auditEvent') || content.includes('AUDIT_EVENTS.')) {
          route.audit_emitted = true;
        } else if (route.status !== 'INTENTIONAL_PUBLIC' && (content.includes('POST') || content.includes('PATCH') || content.includes('DELETE'))) {
          route.gaps.push('NO_AUDIT_EMITTED');
        }

        // Check telemetry
        if (content.includes('emitTelemetry') || content.includes('CanonicalEvent') || content.includes('telemetry')) {
          route.telemetry_emitted = true;
        }

        // Check idempotency
        if (content.includes('idempotencyKey') || content.includes('idempotent') || content.includes('deduplication')) {
          route.idempotent = true;
        }

        // Check service context
        if (content.includes('ServiceCapabilityContext') || content.includes('ctx.') || content.includes('context.')) {
          route.service_context_verified = true;
        }

        // Determine status
        if (route.status === 'INTENTIONAL_PUBLIC') {
          // Already set
        } else if (route.auth_enforced && route.workspace_verified && route.capability_enforced &&
                   route.audit_emitted && route.service_context_verified) {
          route.status = 'FULLY_CLOSED';
        } else if (route.gaps.length > 0) {
          if (route.gaps.length >= 3) {
            route.status = 'FAILED';
          } else {
            route.status = 'PARTIAL';
          }
        } else {
          route.status = 'PARTIAL';
        }

        this.routes.push(route);
        this.truth.routes.total++;
        this.truth.routes[route.status.toLowerCase()]++;

        if (route.status === 'FAILED') {
          this.truth.blockers.push({
            phase: 'A',
            type: 'route_failed',
            path: route.path,
            gaps: route.gaps
          });
        }
      }

      console.log(`✓ Routes scanned: ${this.truth.routes.total}`);
      console.log(`  FULLY_CLOSED: ${this.truth.routes.fully_closed}`);
      console.log(`  PARTIAL: ${this.truth.routes.partial}`);
      console.log(`  FAILED: ${this.truth.routes.failed}`);
      console.log(`  INTENTIONAL_PUBLIC: ${this.truth.routes.intentional_public}\n`);

    } catch (err) {
      console.error('PHASE A ERROR:', err.message);
      this.truth.blockers.push({ phase: 'A', error: err.message });
    }
  }

  // PHASE B: Complete Service Closure
  async phaseB() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║ PHASE B: COMPLETE SERVICE CLOSURE                          ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    try {
      const serviceFiles = execSync('find src/services src/lib -type f \\( -name "*.ts" -o -name "*.js" \\) ! -name "*.test.*" ! -name "*.spec.*" | sort', {
        encoding: 'utf8'
      }).trim().split('\n').filter(Boolean);

      console.log(`Scanning ${serviceFiles.length} service files...\n`);

      const exportedServices = new Set();

      for (const serviceFile of serviceFiles) {
        const content = fs.readFileSync(serviceFile, 'utf8');
        const exportMatches = content.match(/export\s+(async\s+)?function\s+(\w+)/g) || [];
        const exportConsts = content.match(/export\s+const\s+(\w+)/g) || [];

        for (const match of [...exportMatches, ...exportConsts]) {
          const funcName = match.replace(/export\s+(async\s+)?function\s+/, '').replace(/export\s+const\s+/, '');
          exportedServices.add(`${serviceFile}:${funcName}`);
        }
      }

      const servicesArray = Array.from(exportedServices);
      console.log(`Found ${servicesArray.length} service exports\n`);

      for (const serviceExport of servicesArray.slice(0, 661)) { // Cap at 661
        const [file, func] = serviceExport.split(':');
        const content = fs.readFileSync(file, 'utf8');

        // Find function definition
        const funcPattern = new RegExp(`(export\\s+)?(async\\s+)?function\\s+${func}\\s*\\([^)]*\\)|export\\s+const\\s+${func}\\s*=`);
        const funcMatch = content.match(funcPattern);

        if (!funcMatch) continue;

        const serviceIndex = content.indexOf(funcMatch[0]);
        const funcBody = content.substring(serviceIndex, serviceIndex + 2000); // Look at first 2000 chars of function

        const service = {
          name: func,
          file: file,
          type: 'UNKNOWN',
          gaps: []
        };

        // Classify service
        if (funcBody.includes('readonly') || funcBody.includes('select') || funcBody.match(/db\.\w+\.find/)) {
          service.type = 'READ_ONLY';
        } else if (funcBody.includes('ServiceCapabilityContext') && funcBody.includes('requireCapabilityEnvelope')) {
          service.type = 'MUTATION_CLOSED';

          // Verify all required fields
          if (!funcBody.includes('emitAuditEvent')) service.gaps.push('missing_audit');
          if (!funcBody.includes('verifiedActorId')) service.gaps.push('actor_not_verified');
          if (!funcBody.includes('verifiedWorkspaceId')) service.gaps.push('workspace_not_verified');
        } else if (funcBody.match(/db\.\w+\.(create|update|delete|upsert)/)) {
          service.type = 'MUTATION_PARTIAL';
          service.gaps.push('no_capability_context');
          if (!funcBody.includes('ServiceCapabilityContext')) service.gaps.push('missing_service_context');
          if (!funcBody.includes('emitAuditEvent')) service.gaps.push('missing_audit');
        } else if (funcBody.includes('cron') || funcBody.includes('schedule') || funcBody.includes('background')) {
          service.type = 'BACKGROUND_EXEMPT';
        }

        this.services.push(service);
        this.truth.services.total++;
        this.truth.services[service.type.toLowerCase()]++;

        if (service.type === 'MUTATION_PARTIAL') {
          this.truth.blockers.push({
            phase: 'B',
            type: 'service_partial',
            name: func,
            file: file,
            gaps: service.gaps
          });
        }
      }

      console.log(`✓ Services scanned: ${this.truth.services.total}`);
      console.log(`  READ_ONLY: ${this.truth.services.read_only}`);
      console.log(`  MUTATION_CLOSED: ${this.truth.services.mutation_closed}`);
      console.log(`  MUTATION_PARTIAL: ${this.truth.services.mutation_partial}`);
      console.log(`  BACKGROUND_EXEMPT: ${this.truth.services.background_exempt}\n`);

    } catch (err) {
      console.error('PHASE B ERROR:', err.message);
      this.truth.blockers.push({ phase: 'B', error: err.message });
    }
  }

  // PHASE C: Audit Chain Closure
  async phaseC() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║ PHASE C: AUDIT CHAIN CLOSURE                              ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    try {
      const requiredFields = ['actor', 'workspace', 'capability', 'entity', 'decision', 'timestamp', 'requestId'];
      let auditEventCalls = 0;
      let completeAuditCalls = 0;

      const auditFiles = execSync('grep -r "emitAuditEvent" src --include="*.ts" --include="*.js" -l', {
        encoding: 'utf8'
      }).trim().split('\n').filter(Boolean);

      for (const file of auditFiles) {
        const content = fs.readFileSync(file, 'utf8');
        const auditMatches = content.match(/emitAuditEvent\s*\([^)]+\)/g) || [];

        for (const auditCall of auditMatches) {
          auditEventCalls++;
          let hasAllFields = true;
          const missingFields = [];

          for (const field of requiredFields) {
            if (!auditCall.includes(field)) {
              hasAllFields = false;
              missingFields.push(field);
            }
          }

          if (hasAllFields) {
            completeAuditCalls++;
          } else {
            this.truth.blockers.push({
              phase: 'C',
              type: 'incomplete_audit',
              file: file,
              missing: missingFields
            });
          }

          this.auditChain.push({
            file: file,
            complete: hasAllFields,
            missing: missingFields
          });
        }
      }

      const auditCoverage = auditEventCalls > 0 ? Math.round((completeAuditCalls / auditEventCalls) * 100) : 0;
      this.truth.audit.coverage_percent = auditCoverage;
      this.truth.audit.missing = this.auditChain.filter(a => !a.complete).map(a => ({ file: a.file, missing: a.missing }));

      console.log(`✓ Audit chain verified`);
      console.log(`  Total audit events: ${auditEventCalls}`);
      console.log(`  Complete audit chains: ${completeAuditCalls}`);
      console.log(`  Coverage: ${auditCoverage}%\n`);

    } catch (err) {
      console.error('PHASE C ERROR:', err.message);
      this.truth.blockers.push({ phase: 'C', error: err.message });
    }
  }

  // PHASE D: Telemetry Closure
  async phaseD() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║ PHASE D: TELEMETRY CLOSURE                                ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    try {
      const telemetryEvents = [
        'page_enter', 'page_exit', 'mutation_start', 'mutation_complete',
        'mutation_fail', 'retry', 'support_request', 'feedback'
      ];

      let telemetryMatches = 0;

      for (const event of telemetryEvents) {
        try {
          const count = execSync(`grep -r "${event}" src --include="*.ts" --include="*.js" 2>/dev/null | wc -l`, {
            encoding: 'utf8'
          }).trim();
          telemetryMatches += parseInt(count) || 0;
        } catch {
          // Event not found
        }
      }

      const telemetryCoverage = telemetryMatches > 0 ? Math.round((telemetryMatches / (telemetryEvents.length * 50)) * 100) : 0;
      this.truth.telemetry.coverage_percent = Math.min(telemetryCoverage, 100);

      console.log(`✓ Telemetry tracked: ${telemetryMatches} event references`);
      console.log(`  Coverage: ${Math.min(telemetryCoverage, 100)}%\n`);

    } catch (err) {
      console.error('PHASE D ERROR:', err.message);
      this.truth.blockers.push({ phase: 'D', error: err.message });
    }
  }

  // PHASE E: Workflow Truth Closure
  async phaseE() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║ PHASE E: WORKFLOW TRUTH CLOSURE                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const workflowNames = [
      'login', 'engagement', 'decision', 'action', 'recommendation',
      'deliverable', 'billing', 'notification', 'reporting', 'owner_mode'
    ];

    try {
      for (const workflow of workflowNames) {
        const files = execSync(`find src -type f \\( -name "*${workflow}*" -o -path "*/${workflow}/*" \\) 2>/dev/null | head -10`, {
          encoding: 'utf8'
        }).trim().split('\n').filter(Boolean);

        const w = {
          name: workflow,
          files: files.length,
          has_route: false,
          has_service: false,
          has_audit: false,
          has_telemetry: false,
          status: 'UNKNOWN'
        };

        if (files.length === 0) {
          w.status = 'NOT_FOUND';
          this.truth.blockers.push({ phase: 'E', workflow, status: 'NOT_FOUND' });
        } else {
          const fileContent = files.map(f => {
            try { return fs.readFileSync(f, 'utf8').substring(0, 1000); } catch { return ''; }
          }).join('');

          w.has_route = fileContent.includes('route.ts') || fileContent.includes('export const');
          w.has_service = fileContent.includes('export function') || fileContent.includes('export const');
          w.has_audit = fileContent.includes('emitAuditEvent');
          w.has_telemetry = fileContent.includes('CanonicalEvent') || fileContent.includes('telemetry');

          if (w.has_route && w.has_service && w.has_audit) {
            w.status = 'CLOSED';
            this.truth.workflows.closed++;
          } else {
            w.status = 'PARTIAL';
            this.truth.workflows.partial++;
          }
        }

        this.workflows.push(w);
        this.truth.workflows.total++;
      }

      console.log(`✓ Workflows inventoried: ${this.truth.workflows.total}`);
      console.log(`  Closed: ${this.truth.workflows.closed}`);
      console.log(`  Partial: ${this.truth.workflows.partial}\n`);

    } catch (err) {
      console.error('PHASE E ERROR:', err.message);
      this.truth.blockers.push({ phase: 'E', error: err.message });
    }
  }

  // PHASE F: False Green Elimination
  async phaseF() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║ PHASE F: FALSE GREEN ELIMINATION                           ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const falseGreenPatterns = [
      'production-ready', 'fully operational', '100%', 'runtime proven',
      'alpha ready', 'complete', 'green'
    ];

    try {
      const docFiles = execSync('find . -type f \\( -name "*.md" -o -name "*.json" \\) ! -path "./node_modules/*" ! -path "./.git/*" 2>/dev/null', {
        encoding: 'utf8'
      }).trim().split('\n').filter(Boolean);

      for (const pattern of falseGreenPatterns) {
        try {
          const matches = execSync(`grep -r "${pattern}" ${docFiles.join(' ')} 2>/dev/null | head -20`, {
            encoding: 'utf8'
          }).trim().split('\n').filter(Boolean);

          for (const match of matches) {
            if (match.length > 0) {
              this.falseGreenClaims.push({
                pattern: pattern,
                match: match.substring(0, 150)
              });
            }
          }
        } catch {
          // Pattern not found
        }
      }

      console.log(`✓ Documentation scanned`);
      console.log(`  False green claims found: ${this.falseGreenClaims.length}`);

      if (this.falseGreenClaims.length > 0) {
        this.truth.blockers.push({
          phase: 'F',
          type: 'false_green_claims',
          count: this.falseGreenClaims.length,
          examples: this.falseGreenClaims.slice(0, 5)
        });
      }
      console.log('');

    } catch (err) {
      console.error('PHASE F ERROR:', err.message);
    }
  }

  // PHASE G: Regression Lock
  async phaseG() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║ PHASE G: REGRESSION LOCK GATES                             ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const gateRules = [
      'route_partial', 'service_partial', 'missing_audit',
      'missing_capability', 'missing_telemetry', 'direct_actor_trust',
      'direct_workspace_trust', 'header_trust', 'missing_envelope',
      'missing_runtime_evidence', 'false_green_claim'
    ];

    const failedGates = this.truth.blockers.map(b => b.type || b.phase).filter(Boolean);
    const unlocked = gateRules.filter(rule => failedGates.includes(rule) || this.truth.blockers.some(b => b.type === rule));

    this.truth.regression.locked = unlocked.length === 0;
    this.truth.regression.unlocked_rules = unlocked;

    console.log(`✓ Regression gates: ${this.truth.regression.locked ? 'LOCKED' : 'UNLOCKED'}`);
    if (!this.truth.regression.locked) {
      console.log(`  Unlocked rules: ${unlocked.length}`);
      console.log(`  ${unlocked.slice(0, 5).join(', ')}${unlocked.length > 5 ? '...' : ''}\n`);
    } else {
      console.log('');
    }
  }

  // PHASE H: Final Authoritative State
  async phaseH() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║ PHASE H: FINAL AUTHORITATIVE STATE                         ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Calculate runtime proof
    try {
      const runtimeFile = path.join(process.cwd(), '.claude/runtime_truth_state.json');
      if (fs.existsSync(runtimeFile)) {
        const runtime = JSON.parse(fs.readFileSync(runtimeFile, 'utf8'));
        const provenCount = (runtime.subsystems || []).filter(s => s.regression_locked).length;
        this.truth.runtime.proven = provenCount;
        this.truth.runtime.unproven = 10 - provenCount;
      }
    } catch {
      this.truth.runtime.unproven = 10;
    }

    // Determine deployment status
    if (this.truth.blockers.length > 0) {
      this.truth.deployment.internal_alpha = 'BLOCKED';
      this.truth.deployment.controlled_beta = 'BLOCKED';
      this.truth.deployment.production = 'BLOCKED';
    } else if (this.truth.routes.partial > 0 || this.truth.services.mutation_partial > 0) {
      this.truth.deployment.internal_alpha = 'BLOCKED';
      this.truth.deployment.controlled_beta = 'BLOCKED';
      this.truth.deployment.production = 'BLOCKED';
    } else if (this.truth.regression.locked && this.truth.routes.fully_closed === this.truth.routes.total) {
      this.truth.deployment.internal_alpha = 'READY';
      this.truth.deployment.controlled_beta = 'READY';
      this.truth.deployment.production = 'READY';
    }

    // Write authoritative truth state
    const outputPath = path.join(process.cwd(), '.claude/system_truth.json');
    fs.writeFileSync(outputPath, JSON.stringify(this.truth, null, 2));

    // Calculate percentages
    const routesClosedPercent = this.truth.routes.total > 0
      ? Math.round((this.truth.routes.fully_closed / this.truth.routes.total) * 100)
      : 0;
    const servicesClosedPercent = this.truth.services.total > 0
      ? Math.round((this.truth.services.mutation_closed / (this.truth.services.mutation_closed + this.truth.services.mutation_partial)) * 100)
      : 0;
    const workflowClosurePercent = this.truth.workflows.total > 0
      ? Math.round((this.truth.workflows.closed / this.truth.workflows.total) * 100)
      : 0;
    const auditClosurePercent = this.truth.audit.coverage_percent || 0;
    const telemetryClosurePercent = this.truth.telemetry.coverage_percent || 0;
    const runtimeProofPercent = (this.truth.runtime.proven / 10) * 100;
    const regressionLockPercent = this.truth.regression.locked ? 100 : 0;

    console.log(`✓ System truth generated: ${outputPath}\n`);
    console.log('═'.repeat(60));
    console.log('FINAL AUTHORITATIVE STATE');
    console.log('═'.repeat(60));
    console.log(`routes closed: ${routesClosedPercent}%`);
    console.log(`services closed: ${servicesClosedPercent}%`);
    console.log(`workflow closure: ${workflowClosurePercent}%`);
    console.log(`audit closure: ${auditClosurePercent}%`);
    console.log(`telemetry closure: ${telemetryClosurePercent}%`);
    console.log(`runtime proof: ${runtimeProofPercent}%`);
    console.log(`regression lock: ${regressionLockPercent}%`);
    console.log(`remaining blockers: ${this.truth.blockers.length}`);
    console.log('═'.repeat(60));
  }

  async run() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║ R24.5: ABSOLUTE SYSTEM CLOSURE                             ║');
    console.log('║ Convert all system status into deterministic truth         ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    await this.phaseA();
    await this.phaseB();
    await this.phaseC();
    await this.phaseD();
    await this.phaseE();
    await this.phaseF();
    await this.phaseG();
    await this.phaseH();

    // Final status
    if (this.truth.blockers.length === 0 && this.truth.routes.partial === 0 && this.truth.services.mutation_partial === 0) {
      console.log('\n✅ SYSTEM CLOSED\n');
      process.exit(0);
    } else {
      console.log('\n❌ SYSTEM OPEN - BLOCKERS REMAINING\n');
      process.exit(1);
    }
  }
}

const auditor = new AbsoluteSystemClosureAuditor();
auditor.run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
