/**
 * Shared production write guard for smoke and runtime-proof scripts.
 *
 * All scripts capable of creating or modifying records against a deployed
 * application must call enforceProductionGuard() before the first write.
 *
 * Required invariants enforced:
 *  1. SMOKE_ALLOW_PRODUCTION_WRITES=true must be set explicitly for production targets
 *  2. Mutation class(es) must be declared by the caller
 *  3. Mutation preview is printed before the first write can occur
 *  4. No hard-coded password is accepted in production (resolveSmokePassword enforces this)
 *
 * Callers additionally must:
 *  5. Use resolveSmokePassword() instead of hard-coded password literals
 */

export const PRODUCTION_URL_PATTERNS = [
  /o-ps-iq\.vercel\.app/i,
  /opsiq\.app/i,
  /opsiq\.com/i,
];

export interface ProductionGuardOptions {
  /** Human-readable mutation class strings (e.g. "USER_WORKSPACE_CREATION") */
  mutationClasses: string[];
  /** Lines describing exactly what this run will create/modify */
  mutationPreview: string[];
}

export function isProductionTarget(baseUrl: string): boolean {
  return PRODUCTION_URL_PATTERNS.some((p) => p.test(baseUrl));
}

/**
 * Enforce production write guard. Must be called before the first network write.
 *
 * If the target URL matches a production pattern and SMOKE_ALLOW_PRODUCTION_WRITES
 * is not "true", prints the mutation preview and exits with code 1.
 * If authorization is present, prints the preview as a record and continues.
 * Non-production targets pass through without output.
 */
export function enforceProductionGuard(
  baseUrl: string,
  opts: ProductionGuardOptions,
): void {
  if (!isProductionTarget(baseUrl)) return;

  // Always print preview before any write decision — invariant 3.
  console.log("");
  console.log("⚠️  PRODUCTION MUTATION PREVIEW");
  console.log("   Mutation classes:");
  for (const cls of opts.mutationClasses) {
    console.log(`     • ${cls}`);
  }
  console.log("   What will be written:");
  for (const line of opts.mutationPreview) {
    console.log(`     ${line}`);
  }
  console.log("");

  if (process.env.SMOKE_ALLOW_PRODUCTION_WRITES !== "true") {
    console.error("❌ BLOCKED: BASE_URL matches a known production URL.");
    console.error("   This script creates permanent records with no automated cleanup.");
    console.error("   Explicit authorization required:");
    console.error("     SMOKE_ALLOW_PRODUCTION_WRITES=true SMOKE_WRITE_PASSWORD=<pwd> \\");
    console.error(`     BASE_URL=${baseUrl} npx tsx <script>`);
    process.exit(1);
  }

  console.log("✓ SMOKE_ALLOW_PRODUCTION_WRITES=true — production writes authorized by operator.");
  console.log("");
}

/**
 * Resolve the test account password for smoke scripts.
 *
 * When writing to production (SMOKE_ALLOW_PRODUCTION_WRITES=true), the password
 * MUST come from SMOKE_WRITE_PASSWORD environment variable — a hard-coded literal
 * is not accepted. In non-production environments a dev-only default is used so
 * scripts work without configuration.
 *
 * @param baseUrl  The script's resolved base URL
 * @param scriptName  Script filename for diagnostic messages
 */
export function resolveSmokePassword(baseUrl: string, scriptName: string): string {
  const envPwd = process.env.SMOKE_WRITE_PASSWORD;
  if (envPwd) return envPwd;

  if (
    isProductionTarget(baseUrl) &&
    process.env.SMOKE_ALLOW_PRODUCTION_WRITES === "true"
  ) {
    console.error(
      `❌ BLOCKED: SMOKE_WRITE_PASSWORD is required when writing to production.`,
    );
    console.error(
      `   Set SMOKE_WRITE_PASSWORD to a strong unique value for ${scriptName} test accounts.`,
    );
    process.exit(1);
  }

  // Non-production only: deterministic dev-only default (never reaches production path above).
  return "DevOnlySmokePassword@2026!";
}
