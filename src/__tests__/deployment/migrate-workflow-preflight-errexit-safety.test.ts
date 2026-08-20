/**
 * Governance validator for migrate-production.yml's pre/post-deploy
 * migration-status preflight — the errexit incident fix.
 *
 * Incident: GitHub Actions `run:` steps execute under bash's default
 * `set -e`. `npx prisma migrate status` exits non-zero whenever migrations
 * are pending -- the EXPECTED state for PINNED_PREDEPLOY, since a
 * migration was just materialized specifically to become pending.
 * Capturing it via `STATUS_OUTPUT=$(npx prisma migrate status 2>&1)`
 * therefore aborted THAT LINE ITSELF under set -e, before any of the
 * intended pending-migration parsing/validation logic -- or the trailing
 * `exit 0` -- ever ran. The job's own "Migration summary" step (which
 * runs unconditionally via `if: always()`) then unconditionally printed
 * "Production now has <migration> applied" for PINNED_PREDEPLOY mode,
 * even though `prisma migrate deploy` was never reached.
 *
 * All checks here are static-source against the YAML file, except the
 * "genuinely survives set -e" test, which actually executes the exact
 * idiom under bash to prove it -- not just pattern-match it.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";

const WORKFLOW_PATH = join(process.cwd(), ".github/workflows/migrate-production.yml");
const src = readFileSync(WORKFLOW_PATH, "utf-8");

describe("migrate-production.yml — preflight errexit safety", () => {
  it("1. Pre-deploy status capture is guarded by set +e / set -e around the command substitution", () => {
    const stepIdx = src.indexOf("name: Check pending migrations (pre-deploy)");
    expect(stepIdx).toBeGreaterThan(-1);
    const captureIdx = src.indexOf("STATUS_OUTPUT=$(npx prisma migrate status", stepIdx);
    const setMinusEIdx = src.lastIndexOf("set +e", captureIdx);
    const setPlusEIdx = src.indexOf("set -e", captureIdx);
    expect(setMinusEIdx).toBeGreaterThan(stepIdx);
    expect(setMinusEIdx).toBeLessThan(captureIdx);
    expect(setPlusEIdx).toBeGreaterThan(captureIdx);
  });

  it("2. Post-deploy status capture is guarded by set +e / set -e around the command substitution", () => {
    const stepIdx = src.indexOf("name: Verify migration status (post-deploy)");
    expect(stepIdx).toBeGreaterThan(-1);
    const captureIdx = src.indexOf("STATUS_OUTPUT=$(npx prisma migrate status", stepIdx);
    const setMinusEIdx = src.lastIndexOf("set +e", captureIdx);
    const setPlusEIdx = src.indexOf("set -e", captureIdx);
    expect(setMinusEIdx).toBeGreaterThan(stepIdx);
    expect(setMinusEIdx).toBeLessThan(captureIdx);
    expect(setPlusEIdx).toBeGreaterThan(captureIdx);
  });

  it("3. No unguarded prisma migrate status command-substitution capture exists anywhere in the file", () => {
    const occurrences = [...src.matchAll(/STATUS_OUTPUT=\$\(npx prisma migrate status/g)];
    expect(occurrences.length).toBe(2);
    for (const m of occurrences) {
      const idx = m.index ?? -1;
      const precedingSetMinusE = src.lastIndexOf("set +e", idx);
      // The nearest preceding "set +e" must be closer than the nearest
      // preceding "set -e" (i.e. we are still inside the guarded region).
      const precedingSetPlusE = src.lastIndexOf("set -e", idx);
      expect(precedingSetMinusE).toBeGreaterThan(-1);
      expect(precedingSetMinusE).toBeGreaterThan(precedingSetPlusE);
    }
  });

  it("4. The pre-deploy gate delegates PINNED_PREDEPLOY classification to the version-controlled classifier script (no inline ad-hoc parsing as the sole gate)", () => {
    expect(src).toContain("node scripts/classify-migrate-status.mjs");
    const stepIdx = src.indexOf("name: Check pending migrations (pre-deploy)");
    const classifyIdx = src.indexOf("classify-migrate-status.mjs", stepIdx);
    const deployIdx = src.indexOf("name: Deploy migrations");
    expect(classifyIdx).toBeGreaterThan(stepIdx);
    expect(classifyIdx).toBeLessThan(deployIdx);
  });

  it("5. Explicit state markers are written at each real transition point", () => {
    expect(src).toContain('echo "PREFLIGHT_PASSED=true" >> "$GITHUB_ENV"');
    expect(src).toContain('echo "DEPLOY_STARTED=true" >> "$GITHUB_ENV"');
    expect(src).toContain('echo "DEPLOY_SUCCEEDED=true" >> "$GITHUB_ENV"');
    expect(src).toContain('echo "POST_VERIFY_SUCCEEDED=true" >> "$GITHUB_ENV"');
  });

  it("6. DEPLOY_STARTED is written before prisma migrate deploy runs; DEPLOY_SUCCEEDED only after it succeeds", () => {
    const deployStepIdx = src.indexOf("name: Deploy migrations");
    const startedIdx = src.indexOf("DEPLOY_STARTED=true", deployStepIdx);
    const deployCmdIdx = src.indexOf("npx prisma migrate deploy", deployStepIdx);
    const succeededIdx = src.indexOf("DEPLOY_SUCCEEDED=true", deployStepIdx);
    expect(startedIdx).toBeGreaterThan(deployStepIdx);
    expect(startedIdx).toBeLessThan(deployCmdIdx);
    expect(succeededIdx).toBeGreaterThan(deployCmdIdx);
  });

  it("7. POST_VERIFY_SUCCEEDED is only written after the pending/failed check, not before it", () => {
    const stepIdx = src.indexOf("name: Verify migration status (post-deploy)");
    const grepCheckIdx = src.indexOf("grep -qiE 'pending|failed|not applied'", stepIdx);
    const markerIdx = src.indexOf("POST_VERIFY_SUCCEEDED=true", stepIdx);
    expect(grepCheckIdx).toBeGreaterThan(stepIdx);
    expect(markerIdx).toBeGreaterThan(grepCheckIdx);
  });

  it("8. Migration summary derives success language from DEPLOY_SUCCEEDED and POST_VERIFY_SUCCEEDED, never from mode alone", () => {
    const summaryIdx = src.indexOf("name: Migration summary");
    const resultBlock = src.slice(summaryIdx);
    expect(resultBlock).toMatch(/DEPLOY_SUCCEEDED:-false.*==.*"true".*&&.*POST_VERIFY_SUCCEEDED:-false.*==.*"true"/s);
    expect(resultBlock).toContain("MIGRATION_NOT_EXECUTED");
    expect(resultBlock).toContain("MIGRATION_RESULT_UNCERTAIN_OR_FAILED");
  });

  it("9. The 'Production now has <migration> applied' claim only appears inside the DEPLOY_SUCCEEDED && POST_VERIFY_SUCCEEDED branch", () => {
    const occurrences = [...src.matchAll(/Production now has/g)];
    expect(occurrences.length).toBeGreaterThan(0);
    for (const m of occurrences) {
      const idx = m.index ?? -1;
      const guardIdx = src.lastIndexOf('DEPLOY_SUCCEEDED:-false}" == "true"', idx);
      expect(guardIdx).toBeGreaterThan(-1);
      expect(guardIdx).toBeLessThan(idx);
      expect(idx - guardIdx).toBeLessThan(700); // guard is the immediately-enclosing conditional, not a stale earlier one
    }
  });

  it("10. Migration summary reports the 4 state markers as visible fields", () => {
    const summaryIdx = src.indexOf("name: Migration summary");
    const block = src.slice(summaryIdx, summaryIdx + 1200);
    expect(block).toContain("Preflight passed");
    expect(block).toContain("Deploy started");
    expect(block).toContain("Deploy succeeded");
    expect(block).toContain("Post-verify succeeded");
  });

  it("11. genuinely survives bash's default set -e: the exact capture idiom used in the workflow does not abort on a non-zero-exiting command", () => {
    // This does not merely pattern-match the YAML -- it actually executes
    // the idiom under bash, with a command guaranteed to fail, and proves
    // execution continues past the capture and reaches a downstream
    // marker. Mirrors GitHub Actions' default `bash --noprofile --norc -e
    // {0}` step shell.
    const script = `
      set -e
      echo "before"
      set +e
      STATUS_OUTPUT=$(false; echo "captured despite failure")
      STATUS_EXIT=$?
      set -e
      echo "after: exit=$STATUS_EXIT output=[$STATUS_OUTPUT]"
    `;
    const result = execFileSync("bash", ["-e", "-c", script], { encoding: "utf-8" });
    expect(result).toContain("before");
    expect(result).toContain("after: exit=1 output=[captured despite failure]");
  });

  it("12. proves the UNGUARDED (pre-fix) idiom actually does abort under set -e — this is what made the incident real, not theoretical", () => {
    const buggyScript = `
      set -e
      echo "before"
      STATUS_OUTPUT=$(false; echo "should never be reached")
      echo "AFTER (should not print)"
    `;
    let threw = false;
    let stdout = "";
    try {
      stdout = execFileSync("bash", ["-e", "-c", buggyScript], { encoding: "utf-8" });
    } catch (err) {
      threw = true;
      stdout = (err as { stdout?: string }).stdout ?? "";
    }
    expect(threw).toBe(true);
    expect(stdout).toContain("before");
    expect(stdout).not.toContain("AFTER");
  });
});

describe("scripts/classify-migrate-status.mjs — governance", () => {
  const SCRIPT_PATH = join(process.cwd(), "scripts/classify-migrate-status.mjs");
  const scriptSrc = readFileSync(SCRIPT_PATH, "utf-8");

  it("13. Checks connection-error and failed-migration markers before the positive pending signature (fail closed on ambiguity)", () => {
    const connErrIdx = scriptSrc.indexOf("CONNECTION_ERROR_MARKERS");
    const failedIdx = scriptSrc.indexOf("FAILED_MIGRATION_MARKERS");
    const pendingIdx = scriptSrc.indexOf("PENDING_MARKER");
    expect(connErrIdx).toBeGreaterThan(-1);
    expect(failedIdx).toBeGreaterThan(connErrIdx);
    // The pending-marker CONSTANT declaration comes after both marker
    // lists, and the classifier function checks them in that same order.
    expect(pendingIdx).toBeGreaterThan(failedIdx);
  });

  it("14. Exit code 0 with unrecognized output is rejected, not assumed clean (fail closed)", () => {
    expect(scriptSrc).toContain("MALFORMED_OUTPUT");
    expect(scriptSrc).toMatch(/exitCode === 0[\s\S]{0,300}MALFORMED_OUTPUT/);
  });

  it("15. Multiple pending migrations and wrong-migration are distinctly classified, not conflated", () => {
    expect(scriptSrc).toContain("MULTIPLE_PENDING");
    expect(scriptSrc).toContain("WRONG_MIGRATION");
  });

  it("16. main() exits non-zero (fails the step) on any non-accepted classification", () => {
    expect(scriptSrc).toMatch(/if \(!result\.ok\)[\s\S]{0,100}process\.exit\(1\)/);
  });
});
