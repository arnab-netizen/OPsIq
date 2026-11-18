/**
 * Regression for the search_console_metrics incident: a migration added a table, nothing reconciled the opsiq_app grants,
 * and the release gate refused six consecutive production builds. The migrate workflow must run
 * migration -> blocking runtime-role reconcile -> least-privilege verification -> redeploy hook, in that order.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const text = readFileSync(resolve(__dirname, "../../../.github/workflows/migrate-production.yml"), "utf8");
const idx = (needle: string) => { const i = text.indexOf(needle); expect(i, `missing: ${needle}`).toBeGreaterThan(-1); return i; };
const stepBlock = (name: string) => { const s = idx(`- name: ${name}`); const n = text.indexOf("\n      - name:", s + 1); return text.slice(s, n === -1 ? undefined : n); };

describe("migrate-production runtime-role sequencing", () => {
  const reconcile = stepBlock("Reconcile runtime role grants (blocking, reconcile-only)");
  const redeploy = stepBlock("Trigger production redeploy of main (release gate re-check)");

  it("runs the reconcile after the post-migration verification and before the redeploy hook", () => {
    expect(idx("- name: Verify migration status (post-deploy)")).toBeLessThan(idx("- name: Reconcile runtime role grants (blocking, reconcile-only)"));
    expect(idx("- name: Reconcile runtime role grants (blocking, reconcile-only)")).toBeLessThan(idx("- name: Trigger production redeploy of main"));
  });
  it("is blocking: not continue-on-error, and fails closed on PASS/SKIPPED mismatch, unparseable verify or a remaining gap", () => {
    expect(reconcile).not.toMatch(/continue-on-error/);
    expect(reconcile).toContain("scripts/release/runtime-role-reconcile-gate.mjs");
    expect(reconcile).toContain("RUNTIME_ROLE_GATE=PASS");
    expect(reconcile).not.toMatch(/SKIPPED_ROLE_ABSENT|\|\| true|set \+e/);
    expect(reconcile).toContain("EXPECTED_RELEASE_SHA: ${{ github.sha }}");
  });
  it("is reconcile-only and scoped: MAIN mode, exact host, --only-if-present, no new secret, no password handling", () => {
    expect(reconcile).toContain("inputs.mode == 'MAIN'");
    expect(reconcile).toContain("EXPECTED_DATABASE_HOST: ${{ inputs.expected_database_host }}");
    expect(reconcile).toContain("secrets.OPERATOR_DATABASE_URL");
    expect(reconcile).not.toMatch(/PASSWORD\s+['"]|ALTER ROLE|CREATE ROLE|superuser/i);
  });
  it("the redeploy hook only runs once the reconcile has verified the runtime role", () => {
    expect(redeploy).toContain("env.RUNTIME_ROLE_RECONCILED == 'true'");
  });
});
