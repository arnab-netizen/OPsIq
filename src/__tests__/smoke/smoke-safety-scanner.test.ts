/**
 * Repository-wide smoke/runtime-proof script safety scanner.
 *
 * Discovers ALL scripts dynamically — not restricted to one filename prefix.
 * Fails the build when any script that can mutate production data is missing
 * the required production write guard, has hard-coded passwords, uses
 * timestamp identities without a guard, or is added under an unknown prefix
 * without a documented safety classification.
 *
 * Required invariants (enforced for every HTTP-mutation script):
 *  1. SMOKE_ALLOW_PRODUCTION_WRITES guard must be present
 *  2. Mutation class must be declared (MUTATION CLASSIFICATION comment)
 *  3. Mutation preview printed before first write (enforceProductionGuard call)
 *  4. No hard-coded password literal (use resolveSmokePassword / env var)
 *  5. No timestamp identity against production without explicit guard
 */

import { readFileSync, readdirSync } from "fs";
import { join, extname } from "path";
import { describe, it, expect, beforeAll } from "vitest";

const SCRIPTS_DIR = join(process.cwd(), "scripts");

// ============================================================
// KNOWN PREFIX REGISTRY — every script filename must match one entry.
// Prefixes are tested longest-first to handle overlapping patterns.
// Add new prefixes here (with classification) before adding scripts.
// ============================================================
const KNOWN_PREFIXES: Array<{
  prefix: string;
  classification: "HTTP_MUTATION" | "HTTP_READ_ONLY" | "DB_DIRECT" | "GOVERNANCE";
}> = [
  // HTTP mutation scripts (longest/most-specific first)
  { prefix: "smoke-owner-", classification: "HTTP_MUTATION" },
  { prefix: "smoke-production-", classification: "HTTP_MUTATION" },
  // Governance / local-only scripts
  { prefix: "a77-", classification: "GOVERNANCE" },
  { prefix: "auth-", classification: "GOVERNANCE" },
  { prefix: "behavioral-", classification: "GOVERNANCE" },
  // capture-evidence.mjs writes a Stage 7 evidence artifact from an observation the
  // calling CI job already produced: no HTTP call, no database access, no mutation of
  // any governed record. It refuses to run outside GitHub Actions.
  { prefix: "capture-", classification: "GOVERNANCE" },
  { prefix: "check-", classification: "GOVERNANCE" },
  { prefix: "ci-", classification: "GOVERNANCE" },
  { prefix: "deployment-", classification: "GOVERNANCE" },
  { prefix: "diagnose-", classification: "GOVERNANCE" },
  { prefix: "export-", classification: "GOVERNANCE" },
  { prefix: "gen-", classification: "GOVERNANCE" },
  { prefix: "generate-", classification: "GOVERNANCE" },
  { prefix: "governance-", classification: "GOVERNANCE" },
  { prefix: "lint-", classification: "GOVERNANCE" },
  { prefix: "owner-data-", classification: "GOVERNANCE" },
  { prefix: "owner-mode-", classification: "GOVERNANCE" },
  { prefix: "production-", classification: "GOVERNANCE" },
  { prefix: "reset-", classification: "GOVERNANCE" },
  { prefix: "scan-", classification: "GOVERNANCE" },
  { prefix: "security-", classification: "GOVERNANCE" },
  { prefix: "seed-", classification: "GOVERNANCE" },
  { prefix: "support-", classification: "GOVERNANCE" },
  { prefix: "synthetic-", classification: "GOVERNANCE" },
  { prefix: "validate-", classification: "GOVERNANCE" },
  // vercel-ignore-build.mjs is the Vercel Ignored Build Step script. It reads git history
  // to classify changed paths and exits with a code that controls Vercel's build decision.
  // No HTTP calls, no database access, no mutation of any governed record.
  { prefix: "vercel-", classification: "GOVERNANCE" },
  { prefix: "verify-", classification: "GOVERNANCE" },
];

// Scripts exempt from the mutation guard (explicitly classified as safe)
const EXEMPT_SCRIPTS: Record<string, { reason: string }> = {
  "smoke-owner-recovery-runtime.ts": {
    reason: "DB_DIRECT — guards against non-localhost DATABASE_URL, not an HTTP mutation script",
  },
  "smoke-production-login.ts": {
    reason: "SESSION_MUTATION only — no user/workspace/business creation; guarded by DEMO_PASSWORD env requirement",
  },
  "smoke-production-dashboard.ts": {
    reason: "READ_ONLY after login — does not create users or business records",
  },
  "smoke-production-signup-dashboard.ts": {
    reason: "LEGACY_INLINE_GUARD — uses PRODUCTION_URL_PATTERNS + SMOKE_ALLOW_PRODUCTION_WRITES inline pattern; covered by dedicated BLOCKER 4 tests",
  },
  "smoke-production-diagnosis-dashboard.ts": {
    reason: "LEGACY_INLINE_GUARD — uses PRODUCTION_URL_PATTERNS + SMOKE_ALLOW_PRODUCTION_WRITES inline pattern; covered by dedicated BLOCKER 4 tests",
  },
  "smoke-tests.ts": {
    reason: "HTTP_READ_ONLY — GET-only endpoints, no production URL default (defaults to yourdomain.com placeholder), no user/workspace creation",
  },
};

function readScript(name: string): string {
  return readFileSync(join(SCRIPTS_DIR, name), "utf-8");
}

function getScriptFiles(): string[] {
  return readdirSync(SCRIPTS_DIR).filter(
    (f) => (extname(f) === ".ts" || extname(f) === ".mjs") && !f.startsWith("_"),
  );
}

function resolvePrefix(name: string): { prefix: string; classification: string } | null {
  for (const entry of KNOWN_PREFIXES) {
    if (name.startsWith(entry.prefix)) return entry;
  }
  return null;
}

function isMutationScript(name: string): boolean {
  if (EXEMPT_SCRIPTS[name]) return false;
  const entry = resolvePrefix(name);
  if (!entry) return false;
  return entry.classification === "HTTP_MUTATION";
}

// ============================================================
// BLOCKER 1: No unknown prefixes
// ============================================================
describe("Script prefix registry — no unclassified scripts", () => {
  it("every script in scripts/ matches a known prefix or is explicitly exempt", () => {
    const unknowns: string[] = [];
    for (const f of getScriptFiles()) {
      const entry = resolvePrefix(f);
      if (!entry && !EXEMPT_SCRIPTS[f]) {
        unknowns.push(f);
      }
    }
    if (unknowns.length > 0) {
      throw new Error(
        `The following scripts have unknown prefixes and no safety classification:\n` +
          unknowns.map((f) => `  - scripts/${f}`).join("\n") +
          `\n\nAdd the prefix to KNOWN_PREFIXES in smoke-safety-scanner.test.ts with a classification,\n` +
          `or add the filename to EXEMPT_SCRIPTS with a documented reason.`,
      );
    }
  });
});

// ============================================================
// BLOCKER 2: HTTP mutation scripts must have the production guard
// ============================================================
describe("HTTP mutation scripts — production write guard", () => {
  const mutationScripts = getScriptFiles().filter(isMutationScript);

  it("at least one mutation script is discovered (scanner is not vacuously passing)", () => {
    expect(mutationScripts.length).toBeGreaterThan(5);
  });

  for (const script of mutationScripts) {
    describe(`scripts/${script}`, () => {
      let src: string;
      beforeAll(() => {
        src = readScript(script);
      });

      it("imports from smoke-production-guard (shared guard helper)", () => {
        expect(src).toContain("smoke-production-guard");
      });

      it("calls enforceProductionGuard() before first write", () => {
        expect(src).toContain("enforceProductionGuard(");
      });

      it("uses resolveSmokePassword() instead of hard-coded literal", () => {
        expect(src).toContain("resolveSmokePassword(");
      });

      it("declares MUTATION CLASSIFICATION in header", () => {
        expect(src).toMatch(/MUTATION CLASSIFICATION/i);
      });

      it("checks SMOKE_ALLOW_PRODUCTION_WRITES (via guard import or direct)", () => {
        // Either the guard module exports it, or the script imports it.
        // The guard call implies this check — verifying the import is sufficient.
        expect(src).toMatch(/smoke-production-guard|SMOKE_ALLOW_PRODUCTION_WRITES/);
      });

      it("does NOT contain a hard-coded password literal (no 'Proof123!' patterns)", () => {
        // Any of these patterns = hard-coded credential
        expect(src).not.toMatch(/const testPassword\s*=\s*["'][^"']{8,}["']/);
        expect(src).not.toMatch(/Proof123!/);
        expect(src).not.toMatch(/RuntimeProof\d*/);
      });

      it("does NOT default DEFAULT production password to an embedded literal", () => {
        // The pattern `|| "SomeLiteral123"` for a password is forbidden.
        expect(src).not.toMatch(/SMOKE_WRITE_PASSWORD[^"']*\|\|\s*["'][A-Za-z0-9!@#$%]{8,}["']/);
      });

      it("does NOT contain demo-password-123 or similar trivial defaults", () => {
        expect(src).not.toContain("demo-password-123");
        expect(src).not.toContain("password123");
        expect(src).not.toContain("Password123");
      });

      it("does NOT have production URL as hardcoded default without a guard", () => {
        // The guard must be present (already checked above).
        // Additionally verify the production URL pattern exists (confirming guard is needed).
        const hasProductionDefault =
          src.includes("o-ps-iq.vercel.app") || src.includes("opsiq.app");
        if (hasProductionDefault) {
          // Guard must be present too (already verified above — this confirms both hold).
          expect(src).toContain("enforceProductionGuard(");
        }
      });

      it("prints mutation preview before first write (mutationPreview array in guard call)", () => {
        expect(src).toContain("mutationPreview:");
      });

      it("does NOT claim cleanup without an executable cleanup contract", () => {
        // If "CLEANUP" appears claiming records are cleaned, it must reference
        // the smoke-cleanup endpoint or explicit manual steps — not just say "cleaned".
        const src_lower = src.toLowerCase();
        if (src_lower.includes("cleanup") && src_lower.includes("automatic")) {
          // "no automated cleanup" or "no automatic cleanup" is acceptable.
          // "automatic cleanup" without "no" is a false claim.
          expect(src_lower).toMatch(/no automated cleanup|no automatic cleanup|not cleaned|not clean up/);
        }
      });
    });
  }
});

// ============================================================
// BLOCKER 3: smoke-production-login.ts — SESSION_MUTATION disclosure
// ============================================================
describe("smoke-production-login.ts — session mutation disclosure", () => {
  let src: string;
  beforeAll(() => {
    src = readScript("smoke-production-login.ts");
  });

  it("has SESSION_MUTATION disclosure in the header", () => {
    expect(src).toMatch(/SESSION_MUTATION/i);
  });

  it("does not hardcode the demo password", () => {
    expect(src).not.toMatch(/const DEMO_PASSWORD\s*=\s*["'][^"']+["']/);
    expect(src).toContain("process.env.DEMO_PASSWORD");
  });

  it("exits with error if DEMO_PASSWORD env var is not set", () => {
    expect(src).toContain("if (!DEMO_PASSWORD)");
    expect(src).toContain("process.exit(1)");
  });
});

// ============================================================
// BLOCKER 4: smoke-production-signup-dashboard.ts and diagnosis-dashboard.ts
// ============================================================
describe("Legacy smoke-production write scripts — guard is present", () => {
  const WRITE_SCRIPTS = [
    "smoke-production-signup-dashboard.ts",
    "smoke-production-diagnosis-dashboard.ts",
  ];

  for (const script of WRITE_SCRIPTS) {
    describe(`scripts/${script}`, () => {
      let src: string;
      beforeAll(() => {
        src = readScript(script);
      });

      it("has MUTATION CLASSIFICATION comment", () => {
        expect(src).toMatch(/MUTATION CLASSIFICATION/i);
      });

      it("guards production URL writes with SMOKE_ALLOW_PRODUCTION_WRITES", () => {
        expect(src).toContain("PRODUCTION_URL_PATTERNS");
        expect(src).toContain("SMOKE_ALLOW_PRODUCTION_WRITES");
      });

      it("aborts when production URL is detected without explicit opt-in", () => {
        expect(src).toContain("process.exit(1)");
        expect(src).toContain("SMOKE_ALLOW_PRODUCTION_WRITES");
      });

      it("does not contain demo-password-123", () => {
        expect(src).not.toContain("demo-password-123");
      });
    });
  }
});

// ============================================================
// BLOCKER 5: smoke-owner-recovery-runtime.ts — DB-direct guard
// ============================================================
describe("smoke-owner-recovery-runtime.ts — DB-direct localhost guard", () => {
  let src: string;
  beforeAll(() => {
    src = readScript("smoke-owner-recovery-runtime.ts");
  });

  it("checks DATABASE_URL and refuses non-localhost", () => {
    expect(src).toContain("DATABASE_URL");
    expect(src).toMatch(/localhost|127\.0\.0\.1/);
  });

  it("calls process.exit when DATABASE_URL is not a local DB", () => {
    expect(src).toContain("process.exit");
  });

  it("does NOT use BASE_URL / o-ps-iq.vercel.app (not an HTTP mutation script)", () => {
    expect(src).not.toContain("o-ps-iq.vercel.app");
    // DATABASE_URL is allowed (DB-direct script); reject standalone BASE_URL only.
    // Single-char lookbehind: in DATABASE_URL the char before BASE_URL is 'A'
    // (uppercase), so this regex does NOT match DATABASE_URL but DOES match
    // standalone BASE_URL references (preceded by '.', space, or start-of-word).
    expect(src).not.toMatch(/(?<![A-Z_])BASE_URL/);
  });
});

// ============================================================
// BLOCKER 6: All scripts — no global default credentials
// ============================================================
describe("All scripts — no global default credentials embedded", () => {
  const allScripts = getScriptFiles();

  for (const script of allScripts) {
    it(`scripts/${script} does not contain 'demo-password-123'`, () => {
      const src = readScript(script);
      expect(src).not.toContain("demo-password-123");
    });
  }
});

// ============================================================
// SAFETY CLASSIFICATION TABLE (informational — used in CI summary)
// ============================================================
describe("Safety classification — complete table discoverable", () => {
  it("returns a classification for every discovered script", () => {
    const results: Array<{
      script: string;
      classification: string;
      status: "SAFE" | "EXEMPT" | "UNKNOWN";
    }> = [];

    for (const f of getScriptFiles()) {
      const entry = resolvePrefix(f);
      if (EXEMPT_SCRIPTS[f]) {
        results.push({ script: f, classification: EXEMPT_SCRIPTS[f].reason, status: "EXEMPT" });
      } else if (entry) {
        results.push({
          script: f,
          classification: entry.classification,
          status: "SAFE",
        });
      } else {
        results.push({ script: f, classification: "UNCLASSIFIED", status: "UNKNOWN" });
      }
    }

    const unknowns = results.filter((r) => r.status === "UNKNOWN");
    expect(unknowns).toHaveLength(0);

    // Print table for CI summary (informational)
    console.log("\n=== Script Safety Classification Table ===");
    for (const r of results) {
      console.log(`  ${r.status.padEnd(7)} ${r.script.padEnd(50)} ${r.classification}`);
    }
    console.log("==========================================\n");
  });
});
