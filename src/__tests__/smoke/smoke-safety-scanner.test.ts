/**
 * Phase 4: Smoke workflow safety scanner.
 *
 * Prevents production smoke scripts from creating timestamped permanent records
 * without explicit authorization or a cleanup contract.
 */
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const SCRIPTS_DIR = join(process.cwd(), "scripts");

function readScript(name: string): string {
  return readFileSync(join(SCRIPTS_DIR, name), "utf-8");
}

describe("Smoke script safety — production write guard", () => {
  const WRITE_MUTATION_SCRIPTS = [
    "smoke-production-signup-dashboard.ts",
    "smoke-production-diagnosis-dashboard.ts",
  ];

  for (const script of WRITE_MUTATION_SCRIPTS) {
    describe(script, () => {
      let src: string;
      beforeAll(() => {
        src = readScript(script);
      });

      it("has MUTATION CLASSIFICATION comment documenting write operations", () => {
        expect(src).toMatch(/MUTATION CLASSIFICATION/i);
        expect(src).toMatch(/USER_WORKSPACE_CREATION/i);
      });

      it("has a CLEANUP note explaining records persist", () => {
        expect(src).toMatch(/CLEANUP/i);
      });

      it("checks for production URL pattern and guards against unintended production writes", () => {
        expect(src).toContain("PRODUCTION_URL_PATTERNS");
        expect(src).toContain("SMOKE_ALLOW_PRODUCTION_WRITES");
      });

      it("aborts when pointing at production URL without explicit opt-in", () => {
        // Guard must call process.exit(1) if production URL matched without opt-in.
        expect(src).toContain("process.exit(1)");
        // The guard checks for the explicit opt-in env var.
        expect(src).toContain("SMOKE_ALLOW_PRODUCTION_WRITES");
      });

      it("does NOT use hardcoded timestamps in email without a guard", () => {
        // Timestamped email is acceptable only if a production write guard exists.
        // Since we've added the guard, this test confirms both exist together.
        if (src.includes("Date.now()") || src.includes("timestamp")) {
          expect(src).toContain("SMOKE_ALLOW_PRODUCTION_WRITES");
        }
      });
    });
  }
});

describe("smoke-production-login.ts — session mutation disclosure", () => {
  let src: string;
  beforeAll(() => {
    src = readScript("smoke-production-login.ts");
  });

  it("has SESSION_MUTATION disclosure in the header", () => {
    expect(src).toMatch(/SESSION_MUTATION/i);
  });

  it("documents that the created session persists and is not cleaned up automatically", () => {
    expect(src.toLowerCase()).toContain("persist");
  });

  it("does not hardcode the demo password in the script body", () => {
    // Password must come from an environment variable, not a literal.
    expect(src).not.toMatch(/const DEMO_PASSWORD\s*=\s*["'][^"']+["']/);
    // Must read from process.env.
    expect(src).toContain("process.env.DEMO_PASSWORD");
  });

  it("exits with error if DEMO_PASSWORD env var is not set", () => {
    expect(src).toContain("if (!DEMO_PASSWORD)");
    expect(src).toContain("process.exit(1)");
  });
});

describe("All production smoke scripts — no default credentials embedded", () => {
  const allSmokeScripts = readdirSync(SCRIPTS_DIR)
    .filter((f) => f.startsWith("smoke-production") && f.endsWith(".ts"));

  for (const script of allSmokeScripts) {
    it(`${script} does not contain 'demo-password-123'`, () => {
      const src = readScript(script);
      expect(src).not.toContain("demo-password-123");
    });
  }
});
