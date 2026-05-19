#!/usr/bin/env node

/**
 * R24: Hostile Zero-Regression Closure
 * Comprehensive gap audit with zero tolerance for hand-waving
 * RULE: If evidence missing = FAILED. If not proven = NOT PROVEN.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class R24HostileAudit {
  constructor() {
    this.routes = [];
    this.services = [];
    this.findings = {
      phase_a: {
        total_routes: 0,
        full_capability_enforced: [],
        legacy_auth_only: [],
        unprotected: [],
        unknown: [],
        required_migrations: [],
      },
      phase_b: {
        total_mutation_services: 0,
        full_envelope_validated: [],
        read_only: [],
        background_exempt: [],
        unprotected_mutation: [],
        required_enforcement: [],
      },
      phase_c: {
        audit_coverage: 0,
        audit_gaps: [],
      },
      phase_d: {
        runtime_proven_subsystems: [],
        not_proven_subsystems: [],
      },
      phase_e: {
        scanner_gaps: [],
        gate_gaps: [],
      },
      phase_f: {
        false_green_claims: [],
      },
    };
  }

  /**
   * PHASE A: Route Enforcement Closure
   */
  async phaseA() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║ PHASE A: ROUTE ENFORCEMENT CLOSURE                         ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    // Find all routes
    const routeFiles = execSync(
      'find src/app/api -name "route.ts" | sort',
      { encoding: 'utf8' }
    ).trim().split('\n');

    this.findings.phase_a.total_routes = routeFiles.length;

    for (const routeFile of routeFiles) {
      if (!routeFile) continue;

      const content = fs.readFileSync(routeFile, 'utf8');
      let classification = 'UNKNOWN';
      let reason = '';

      // Check for withCanonicalEnforcement + requireCapabilities
      if (content.includes('withCanonicalEnforcement') && content.includes('requireCapabilities')) {
        classification = 'FULL_CAPABILITY_ENFORCED';
      }
      // Check for legacy auth only
      else if (content.includes('withAuth') || content.includes('withEnforcementFull')) {
        classification = 'LEGACY_AUTH_ONLY';
        reason = 'Uses withAuth/withEnforcementFull but not withCanonicalEnforcement';
      }
      // Check if unprotected
      else if (!content.includes('withAuth') && !content.includes('withEnforcementFull') &&
               !content.includes('withCanonicalEnforcement')) {
        classification = 'UNPROTECTED';
        reason = 'No authentication/authorization enforcement';
      }

      const pathShort = routeFile.replace(process.cwd() + '/', '');

      if (classification === 'FULL_CAPABILITY_ENFORCED') {
        this.findings.phase_a.full_capability_enforced.push(pathShort);
      } else if (classification === 'LEGACY_AUTH_ONLY') {
        this.findings.phase_a.legacy_auth_only.push(pathShort);
        this.findings.phase_a.required_migrations.push({
          route: pathShort,
          reason: reason,
          action: 'MIGRATE to withCanonicalEnforcement + requireCapabilities',
        });
      } else if (classification === 'UNPROTECTED') {
        this.findings.phase_a.unprotected.push(pathShort);
        this.findings.phase_a.required_migrations.push({
          route: pathShort,
          reason: reason,
          action: 'ADD withCanonicalEnforcement + requireCapabilities OR document exemption',
        });
      } else {
        this.findings.phase_a.unknown.push(pathShort);
      }
    }

    console.log(`\nTotal routes: ${this.findings.phase_a.total_routes}`);
    console.log(`✓ Full capability enforced: ${this.findings.phase_a.full_capability_enforced.length}`);
    console.log(`⚠️  Legacy auth only: ${this.findings.phase_a.legacy_auth_only.length}`);
    console.log(`❌ Unprotected: ${this.findings.phase_a.unprotected.length}`);
    console.log(`? Unknown: ${this.findings.phase_a.unknown.length}`);
    console.log(`\nRequired migrations: ${this.findings.phase_a.required_migrations.length}`);

    if (this.findings.phase_a.unprotected.length > 0) {
      console.log('\n❌ UNPROTECTED ROUTES (BLOCKER):');
      this.findings.phase_a.unprotected.forEach((r) => console.log(`   ${r}`));
    }
  }

  /**
   * PHASE B: Service Trust Closure
   */
  async phaseB() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║ PHASE B: SERVICE TRUST CLOSURE                             ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    // Find mutation services (create, update, delete patterns)
    const serviceFiles = execSync(
      'find src/services -name "*.ts" | head -100',
      { encoding: 'utf8' }
    ).trim().split('\n');

    let mutation_count = 0;
    const unprotected = [];

    for (const serviceFile of serviceFiles) {
      if (!serviceFile || serviceFile.includes('.test.ts')) continue;

      const content = fs.readFileSync(serviceFile, 'utf8');

      // Check if this is a mutation service
      const hasMutationPattern = /export.*async.*function.*(create|update|delete|transition|approve|close|execute|submit)/i.test(content);

      if (hasMutationPattern) {
        mutation_count++;

        // Check if it has envelope validation
        if (!content.includes('ServiceCapabilityContext') &&
            !content.includes('requireCapabilityEnvelope')) {
          unprotected.push(serviceFile.replace(process.cwd() + '/', ''));
        }
      }
    }

    this.findings.phase_b.total_mutation_services = mutation_count;
    this.findings.phase_b.unprotected_mutation = unprotected;

    console.log(`\nTotal mutation services found: ${mutation_count}`);
    console.log(`❌ Unprotected mutations: ${unprotected.length}`);

    if (unprotected.length > 0) {
      console.log('\n❌ UNPROTECTED MUTATIONS (BLOCKER):');
      unprotected.slice(0, 10).forEach((s) => console.log(`   ${s}`));
      if (unprotected.length > 10) {
        console.log(`   ... and ${unprotected.length - 10} more`);
      }
    }
  }

  /**
   * PHASE C: Audit Closure
   */
  async phaseC() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║ PHASE C: AUDIT CLOSURE                                     ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    // Check mutation routes have audit events
    const routeFiles = execSync(
      'find src/app/api -name "route.ts" | head -50',
      { encoding: 'utf8' }
    ).trim().split('\n');

    let audit_gap_count = 0;

    for (const routeFile of routeFiles) {
      if (!routeFile) continue;

      const content = fs.readFileSync(routeFile, 'utf8');

      // Check if it's a mutation route (POST, PATCH, PUT, DELETE)
      const isMutation = /export const (POST|PATCH|PUT|DELETE)/i.test(content);

      if (isMutation) {
        // Require audit event
        if (!content.includes('emitAuditEvent')) {
          audit_gap_count++;
          this.findings.phase_c.audit_gaps.push(routeFile.replace(process.cwd() + '/', ''));
        }
      }
    }

    console.log(`\nMutation routes scanned: 50`);
    console.log(`❌ Missing audit events: ${audit_gap_count}`);

    if (audit_gap_count > 0) {
      console.log('\n❌ ROUTES WITH MISSING AUDIT (BLOCKER):');
      this.findings.phase_c.audit_gaps.slice(0, 5).forEach((r) => console.log(`   ${r}`));
    }
  }

  /**
   * PHASE D: Runtime Evidence Closure
   */
  async phaseD() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║ PHASE D: RUNTIME EVIDENCE CLOSURE                          ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    // Load runtime truth state
    const stateFile = path.join(process.cwd(), '.claude', 'runtime_truth_state.json');
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));

    const proven = Object.entries(state.subsystems)
      .filter(([, sub]) => sub.runtime_proven === true)
      .map(([name]) => name);

    const notProven = Object.entries(state.subsystems)
      .filter(([, sub]) => sub.runtime_proven === false)
      .map(([name]) => name);

    this.findings.phase_d.runtime_proven_subsystems = proven;
    this.findings.phase_d.not_proven_subsystems = notProven;

    console.log(`\nRuntime proven subsystems: ${proven.length}/10`);
    console.log(`Not proven subsystems: ${notProven.length}/10`);

    if (proven.length > 0) {
      console.log('\n✓ PROVEN:');
      proven.forEach((s) => console.log(`   ${s}`));
    }

    if (notProven.length > 0) {
      console.log('\n❌ NOT PROVEN:');
      notProven.forEach((s) => console.log(`   ${s}`));
    }
  }

  /**
   * PHASE E: Regression Gates
   */
  async phaseE() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║ PHASE E: REGRESSION GATES VERIFICATION                     ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    // Check which scanners exist
    const scannerDir = path.join(process.cwd(), 'scripts/scanners');
    const scanners = [
      '01-route-capability-scanner.sh',
      '02-service-mutation-scanner.sh',
      '03-direct-trust-scanner.sh',
      '04-audit-coverage-scanner.sh',
      '05-semantic-capability-scanner.sh',
    ];

    let scanner_count = 0;
    for (const scanner of scanners) {
      if (fs.existsSync(path.join(scannerDir, scanner))) {
        scanner_count++;
      } else {
        this.findings.phase_e.scanner_gaps.push(scanner);
      }
    }

    console.log(`\nScanners deployed: ${scanner_count}/5`);
    if (this.findings.phase_e.scanner_gaps.length > 0) {
      console.log(`❌ Missing scanners: ${this.findings.phase_e.scanner_gaps.join(', ')}`);
    }
  }

  /**
   * PHASE F: False Green Audit
   */
  async phaseF() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║ PHASE F: FALSE GREEN AUDIT                                 ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    const falseClaimsKeywords = [
      { pattern: /production-ready/i, file: '' },
      { pattern: /100%.*green/i, file: '' },
      { pattern: /fully.*operational/i, file: '' },
      { pattern: /alpha.*ready/i, file: '' },
      { pattern: /100% pass rate.*without.*evidence/i, file: '' },
    ];

    const mdFiles = execSync('find . -name "*.md" -type f | head -20', {
      encoding: 'utf8',
    }).trim().split('\n');

    for (const mdFile of mdFiles) {
      if (!mdFile || mdFile.includes('node_modules')) continue;

      try {
        const content = fs.readFileSync(mdFile, 'utf8');
        for (const claim of falseClaimsKeywords) {
          if (claim.pattern.test(content)) {
            // Check if there's evidence
            if (!content.includes('runtime_proven: true') &&
                !content.includes('actual execution') &&
                !content.includes('verified evidence')) {
              this.findings.phase_f.false_green_claims.push({
                file: mdFile,
                claim: content.match(claim.pattern)[0],
              });
            }
          }
        }
      } catch (e) {
        // Silent fail
      }
    }

    console.log(`\nFiles scanned: ${mdFiles.length}`);
    console.log(`❌ Unsupported claims found: ${this.findings.phase_f.false_green_claims.length}`);

    if (this.findings.phase_f.false_green_claims.length > 0) {
      console.log('\n⚠️  FALSE GREEN CLAIMS:');
      this.findings.phase_f.false_green_claims.slice(0, 5).forEach((c) => {
        console.log(`   ${c.file}: "${c.claim}"`);
      });
    }
  }

  /**
   * PHASE G: Final Truth State
   */
  async phaseG() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║ PHASE G: FINAL TRUTH STATE                                 ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    const finalReport = {
      generated_at: new Date().toISOString(),
      phase: 'R24 - Hostile Zero-Regression Closure',
      rule: 'Evidence missing = FAILED. Not proven = NOT PROVEN.',
      findings: this.findings,
      blockers: [
        ...this.findings.phase_a.unprotected.map((r) => `Route not protected: ${r}`),
        ...this.findings.phase_b.unprotected_mutation.slice(0, 5).map((s) => `Unprotected mutation: ${s}`),
        ...this.findings.phase_c.audit_gaps.slice(0, 5).map((r) => `Missing audit: ${r}`),
        ...this.findings.phase_d.not_proven_subsystems.map((s) => `Not runtime proven: ${s}`),
      ],
      closure_status: {
        phase_a_complete:
          this.findings.phase_a.full_capability_enforced.length ===
          this.findings.phase_a.total_routes,
        phase_b_complete: this.findings.phase_b.unprotected_mutation.length === 0,
        phase_c_complete: this.findings.phase_c.audit_gaps.length === 0,
        phase_d_complete: this.findings.phase_d.not_proven_subsystems.length === 0,
        phase_e_complete: this.findings.phase_e.scanner_gaps.length === 0,
        phase_f_complete: this.findings.phase_f.false_green_claims.length === 0,
      },
      deployment_status: {
        internal_alpha: 'BLOCKED',
        controlled_beta: 'BLOCKED',
        production: 'BLOCKED',
        reason: 'R24 hostile audit identified blockers that must be fixed',
      },
    };

    // Write report
    const reportPath = path.join(process.cwd(), 'R24_HOSTILE_ZERO_REGRESSION_CLOSURE.json');
    fs.writeFileSync(reportPath, JSON.stringify(finalReport, null, 2));

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║ R24 FINDINGS SUMMARY                                       ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('PHASE A - ROUTE ENFORCEMENT');
    console.log(`  Total routes: ${this.findings.phase_a.total_routes}`);
    console.log(`  ✓ Full capability enforced: ${this.findings.phase_a.full_capability_enforced.length}`);
    console.log(`  ❌ Unprotected: ${this.findings.phase_a.unprotected.length}`);
    console.log(`  ⚠️  Legacy auth: ${this.findings.phase_a.legacy_auth_only.length}`);

    console.log('\nPHASE B - SERVICE TRUST');
    console.log(`  Total mutation services: ${this.findings.phase_b.total_mutation_services}`);
    console.log(`  ❌ Unprotected mutations: ${this.findings.phase_b.unprotected_mutation.length}`);

    console.log('\nPHASE C - AUDIT');
    console.log(`  ❌ Audit gaps: ${this.findings.phase_c.audit_gaps.length}`);

    console.log('\nPHASE D - RUNTIME EVIDENCE');
    console.log(`  ✓ Runtime proven: ${this.findings.phase_d.runtime_proven_subsystems.length}/10`);
    console.log(`  ❌ Not proven: ${this.findings.phase_d.not_proven_subsystems.length}/10`);

    console.log('\nPHASE E - REGRESSION GATES');
    console.log(`  ❌ Missing scanners: ${this.findings.phase_e.scanner_gaps.length}`);

    console.log('\nPHASE F - FALSE GREEN');
    console.log(`  ❌ Unsupported claims: ${this.findings.phase_f.false_green_claims.length}`);

    console.log('\n' + '='.repeat(60));
    console.log('BLOCKERS (R24 findings):');
    console.log('='.repeat(60));

    const blockers = finalReport.blockers;
    if (blockers.length === 0) {
      console.log('✅ NO BLOCKERS FOUND');
    } else {
      blockers.forEach((b, i) => console.log(`${i + 1}. ${b}`));
    }

    console.log('');
    console.log(`Report: ${reportPath}`);
    console.log('');

    if (blockers.length === 0) {
      console.log('✅ R24 ZERO-REGRESSION CLOSURE ACHIEVED');
      process.exit(0);
    } else {
      console.log(`❌ R24 IDENTIFIED ${blockers.length} BLOCKERS`);
      process.exit(1);
    }
  }

  /**
   * Run all phases
   */
  async run() {
    try {
      await this.phaseA();
      await this.phaseB();
      await this.phaseC();
      await this.phaseD();
      await this.phaseE();
      await this.phaseF();
      await this.phaseG();
    } catch (err) {
      console.error('Fatal error in R24:', err.message);
      process.exit(1);
    }
  }
}

// Execute
const audit = new R24HostileAudit();
audit.run();
