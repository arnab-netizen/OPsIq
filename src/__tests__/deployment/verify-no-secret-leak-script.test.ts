/**
 * Executes scripts/verify-no-secret-leak.sh against synthetic fixtures --
 * real process spawns, not string-matching -- to prove the leak scanner
 * still catches an injected secret after being extracted from the
 * production-owner-acceptance.yml inline step (run #32509563234 hardening).
 */
import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const SCRIPT_PATH = join(process.cwd(), "scripts/verify-no-secret-leak.sh");
const SECRET = "S3cretNeedle-9f3a7c21";

function runScanner(
  evidenceDir: string,
  tokenFile: string,
  env: Record<string, string | undefined> = {}
): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync("bash", [SCRIPT_PATH, evidenceDir, tokenFile], {
      env: { ...process.env, ...env },
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (err) {
    const e = err as { status: number; stdout: string; stderr: string };
    return { status: e.status, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

describe("scripts/verify-no-secret-leak.sh — real execution against synthetic fixtures", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "leak-scan-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("catches a synthetic secret inside a plain artifact file (via LEAK_CHECK_PASSWORD)", () => {
    const evidenceDir = join(dir, "evidence");
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(join(evidenceDir, "error-context.html"), `<html>password=${SECRET}</html>`);
    const tokenFile = join(dir, "no-tokens");

    const result = runScanner(evidenceDir, tokenFile, { LEAK_CHECK_PASSWORD: SECRET });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Sensitive value found inside artifact");
  });

  it("catches a synthetic secret inside a .zip trace archive's contents", () => {
    const evidenceDir = join(dir, "evidence");
    mkdirSync(evidenceDir, { recursive: true });
    const payloadFile = join(dir, "trace-payload.txt");
    writeFileSync(payloadFile, `POST /api/auth/login body: password=${SECRET}\n`);
    execFileSync("zip", ["-j", join(evidenceDir, "trace.zip"), payloadFile]);

    const result = runScanner(evidenceDir, join(dir, "no-tokens"), { LEAK_CHECK_PASSWORD: SECRET });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Sensitive value found inside trace archive");
  });

  it("catches a leaked session-token value read from the token log file, independent of the password needle", () => {
    const evidenceDir = join(dir, "evidence");
    mkdirSync(evidenceDir, { recursive: true });
    const tokenValue = "sess_tok_abc123XYZ";
    writeFileSync(join(dir, "tokens"), `${tokenValue}\n`);
    writeFileSync(join(evidenceDir, "network.json"), JSON.stringify({ cookie: tokenValue }));

    const result = runScanner(evidenceDir, join(dir, "tokens"), {
      LEAK_CHECK_PASSWORD: "unrelated-password-not-present",
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Sensitive value found inside artifact");
  });

  it("does NOT false-positive on clean evidence (exit 0)", () => {
    const evidenceDir = join(dir, "evidence");
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(join(evidenceDir, "results.json"), JSON.stringify({ status: "passed" }));
    writeFileSync(join(evidenceDir, "report.html"), "<html>all green</html>");

    const result = runScanner(evidenceDir, join(dir, "no-tokens"), { LEAK_CHECK_PASSWORD: SECRET });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("No credential/session-token leakage detected");
  });

  it("exits 0 (not a crash) when the evidence directory does not exist at all", () => {
    const result = runScanner(join(dir, "does-not-exist"), join(dir, "no-tokens"), {
      LEAK_CHECK_PASSWORD: SECRET,
    });

    expect(result.status).toBe(0);
  });

  it("warns (but does not fail) when no needles are configured at all -- a vacuous scan is flagged, not silently reported as a clean pass", () => {
    const evidenceDir = join(dir, "evidence");
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(join(evidenceDir, "report.html"), "<html>clean</html>");

    const result = runScanner(evidenceDir, join(dir, "no-tokens"), { LEAK_CHECK_PASSWORD: "" });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("::warning::");
    expect(result.stdout).toContain("vacuous");
  });
});
