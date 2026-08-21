/**
 * Governance validator for the actionlint regression gate in ci.yml.
 *
 * Incident: PR #332 merged .github/workflows/production-owner-acceptance.yml
 * with a YAML syntax error (a single-line `run:` value containing an
 * unquoted colon) that no existing check caught. GitHub Actions' own
 * behavior on such a file is silent and easy to miss: the workflow still
 * registers (state: active), but falls back to the raw file path as its
 * display name because the declared `name:` key can never be extracted, it
 * never appears under its intended name in the Actions sidebar, and its
 * direct /actions/workflows/<file>.yml URL 404s. This repo's existing
 * governance tests (readFileSync + indexOf/toContain string assertions)
 * structurally cannot catch this class of defect -- they never parse the
 * YAML. This test proves the actionlint gate that closes that gap exists,
 * is scoped to changed workflow files (not a full-repo scan, which surfaces
 * pre-existing unrelated findings in older workflows), and is wired into
 * branch-protection as a required check.
 */
import { readFileSync } from "fs";
import { join } from "path";

const CI_PATH = join(process.cwd(), ".github/workflows/ci.yml");
const src = readFileSync(CI_PATH, "utf-8");

describe("ci.yml — actionlint regression gate", () => {
  it("1. Declares an actionlint job", () => {
    expect(src).toMatch(/\n {2}actionlint:\s*\n/);
  });

  it("2. Validates workflow YAML with actionlint (the real GitHub Actions schema validator, not a string-content check)", () => {
    const idx = src.indexOf("\n  actionlint:\n");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 900);
    expect(block).toContain("actionlint");
    expect(block).toMatch(/download-actionlint\.bash|actionlint@/);
  });

  it("3. Is scoped to changed workflow files only, not a full-repo scan (avoids failing PRs on pre-existing, unrelated workflow issues)", () => {
    const idx = src.indexOf("\n  actionlint:\n");
    const block = src.slice(idx, idx + 900);
    expect(block).toContain("git diff --name-only origin/main...HEAD");
    expect(block).toContain(".github/workflows/*.yml");
  });

  it("4. Is a required check: branch-protection depends on it", () => {
    const brIdx = src.indexOf("branch-protection:");
    expect(brIdx).toBeGreaterThan(-1);
    const block = src.slice(brIdx, brIdx + 300);
    expect(block).toMatch(/needs:\s*\[[^\]]*\bactionlint\b[^\]]*\]/);
  });

  it("5. The actionlint job itself appears before branch-protection in the file (sanity: not accidentally duplicated or misplaced)", () => {
    const actionlintIdx = src.indexOf("\n  actionlint:\n");
    const brIdx = src.indexOf("branch-protection:");
    expect(actionlintIdx).toBeGreaterThan(-1);
    expect(brIdx).toBeGreaterThan(actionlintIdx);
  });
});
