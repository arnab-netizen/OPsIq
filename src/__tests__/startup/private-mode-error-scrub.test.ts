/**
 * Phase 7: Verify that the private workspace startup error does not expose the
 * full workspace ID value in the error message (potential info disclosure).
 */
import { readFileSync } from "fs";
import { join } from "path";

const ORCHESTRATOR_PATH = join(process.cwd(), "src/infra/startup-orchestrator.ts");
const src = readFileSync(ORCHESTRATOR_PATH, "utf-8");

describe("startup-orchestrator.ts — private workspace error scrubbing", () => {
  it("does not include the raw privateWorkspaceId value in the thrown error message", () => {
    // The error message must NOT interpolate ${privateWorkspaceId} directly.
    expect(src).not.toMatch(
      /throw new Error\([^)]*`[^`]*\$\{privateWorkspaceId\}[^`]*`/
    );
  });

  it("the error message about missing workspace does not embed the ID", () => {
    const errorIdx = src.indexOf("OPSIQ_PRIVATE_WORKSPACE_ID is configured but no matching workspace");
    expect(errorIdx).toBeGreaterThan(-1);
    // The error string immediately following the message should not contain the id.
    const errorSnippet = src.slice(errorIdx, errorIdx + 300);
    expect(errorSnippet).not.toContain("${privateWorkspaceId}");
  });

  it("success log uses a masked form of the workspace ID, not the raw value", () => {
    // Masked log line should exist.
    expect(src).toContain("maskedId");
    // Must not log the raw value directly.
    const logIdx = src.indexOf("Private workspace verified");
    expect(logIdx).toBeGreaterThan(-1);
    const logSnippet = src.slice(Math.max(0, logIdx - 200), logIdx + 200);
    expect(logSnippet).not.toContain("workspaceId: privateWorkspaceId");
  });

  it("masks the ID to first 4 + last 4 characters", () => {
    expect(src).toContain("privateWorkspaceId.slice(0, 4)");
    expect(src).toContain("privateWorkspaceId.slice(-4)");
  });
});

describe("startup-orchestrator.ts — required startup checks", () => {
  it("checks database connectivity", () => {
    expect(src).toContain("checkDatabase");
    expect(src).toContain("Database is not reachable");
  });

  it("checks database schema / migration state", () => {
    expect(src).toContain("checkDatabaseSchema");
    expect(src).toContain("Database schema is invalid or migrations not applied");
  });

  it("checks configuration (DATABASE_URL required)", () => {
    expect(src).toContain("checkConfiguration");
    expect(src).toContain("DATABASE_URL");
  });

  it("private workspace check only runs when OPSIQ_PRIVATE_WORKSPACE_ID is set", () => {
    // Must be conditional — no unconditional call.
    expect(src).toContain("if (privateWorkspaceId)");
  });

  it("private workspace check uses workspace.findUnique with id filter", () => {
    expect(src).toContain("workspace.findUnique");
    expect(src).toContain("where: { id: workspaceId }");
  });
});
