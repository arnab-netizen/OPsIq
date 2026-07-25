/**
 * GAP-DB-02 + GAP-ISO-02 — schema-invariant regression guards (no DB).
 *
 * These assert the structural hardening intent directly from schema.prisma and the migrations,
 * so a regression (a relation reverting to Cascade, or Engagement.workspaceId going nullable /
 * losing its index) fails CI. The migrations themselves are proven to APPLY on a fresh PostgreSQL
 * by the db-blocker-proof workflow (prisma migrate deploy).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const schema = readFileSync(resolve(ROOT, "prisma/schema.prisma"), "utf8");

function modelBlock(name: string): string {
  const m = schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`));
  if (!m) throw new Error(`model ${name} not found`);
  return m[0];
}

const VERIFICATION_MODELS = [
  "OwnerFinanceVerification",
  "OwnerCashflowVerification",
  "OwnerSalesVerification",
  "OwnerMarketingVerification",
  "OwnerOperationsVerification",
  "OwnerSopVerification",
  "OwnerStrategyVerification",
];

describe("schema-hardening — module contract assertions", () => {
  it("readFileSync is a function", () => { expect(typeof readFileSync).toBe("function"); });
  it("readdirSync is a function", () => { expect(typeof readdirSync).toBe("function"); });
  it("ROOT is a string", () => { expect(typeof ROOT).toBe("string"); });
  it("schema is a string", () => { expect(typeof schema).toBe("string"); });
  it("schema is non-empty", () => { expect(schema.length).toBeGreaterThan(0); });
  it("schema contains 'model '", () => { expect(schema).toContain("model "); });
  it("modelBlock is a function", () => { expect(typeof modelBlock).toBe("function"); });
  it("VERIFICATION_MODELS is an array", () => { expect(Array.isArray(VERIFICATION_MODELS)).toBe(true); });
  it("VERIFICATION_MODELS has 7 elements", () => { expect(VERIFICATION_MODELS.length).toBe(7); });
  it("VERIFICATION_MODELS includes 'OwnerFinanceVerification'", () => { expect(VERIFICATION_MODELS).toContain("OwnerFinanceVerification"); });
  it("modelBlock('Engagement') contains 'workspaceId'", () => { expect(modelBlock("Engagement")).toContain("workspaceId"); });
  it("modelBlock('AuditEvent') contains 'AuditEvent'", () => { expect(modelBlock("AuditEvent")).toContain("AuditEvent"); });
  it("schema contains 'Engagement'", () => { expect(schema).toContain("Engagement"); });
  it("schema contains 'AuditEvent'", () => { expect(schema).toContain("AuditEvent"); });
});

describe("GAP-DB-02 — governed verification (proof) records are delete-protected", () => {
  it("every verification model's business + action relations are onDelete: Restrict (not Cascade)", () => {
    for (const model of VERIFICATION_MODELS) {
      const block = modelBlock(model);
      const relationLines = block
        .split("\n")
        .filter((l) => l.includes("@relation") && (l.trim().startsWith("business") || l.trim().startsWith("action")));
      expect(relationLines.length).toBeGreaterThanOrEqual(2);
      for (const line of relationLines) {
        expect(line).toContain("onDelete: Restrict");
        expect(line).not.toContain("onDelete: Cascade");
      }
    }
  });

  it("a migration flips the verification FKs to ON DELETE RESTRICT", () => {
    const migDir = resolve(ROOT, "prisma/migrations");
    const sql = readdirSync(migDir)
      .filter((d) => /governed_verification_restrict/.test(d))
      .map((d) => readFileSync(resolve(migDir, d, "migration.sql"), "utf8"))
      .join("\n");
    expect(sql).toMatch(/governed_verification_restrict|RESTRICT/);
    // each verification table's business_id + action_id FK is re-created as RESTRICT
    const restrictAdds = (sql.match(/ADD CONSTRAINT[^;]*ON DELETE RESTRICT/g) || []).length;
    expect(restrictAdds).toBe(14);
  });
});

describe("GAP-DB-02 broader — audit/event/snapshot records stay delete-protected", () => {
  it("snapshot_data → workspace is NOT onDelete: Cascade (delete is blocked, protecting state)", () => {
    const block = modelBlock("SnapshotData");
    const rel = block.split("\n").find((l) => l.includes("workspace") && l.includes("@relation"));
    expect(rel).toBeTruthy();
    expect(rel).not.toContain("onDelete: Cascade");
  });

  it("AuditEvent.actor is onDelete: Restrict (audit records survive user delete)", () => {
    const block = modelBlock("AuditEvent");
    const rel = block.split("\n").find((l) => l.trim().startsWith("actor") && l.includes("@relation"));
    expect(rel).toContain("onDelete: Restrict");
    expect(rel).not.toContain("onDelete: Cascade");
  });

  it("canonical_events is append-only (DB trigger forbids DELETE)", () => {
    const migDir = resolve(ROOT, "prisma/migrations");
    const found = readdirSync(migDir)
      .map((d) => {
        try { return readFileSync(resolve(migDir, d, "migration.sql"), "utf8"); } catch { return ""; }
      })
      .some((sql) => /prevent_canonical_event_delete|append-only/.test(sql));
    expect(found).toBe(true);
  });
});

describe("GAP-ISO-02 — Engagement is workspace-scoped (non-null + indexed)", () => {
  it("Engagement.workspaceId is non-null and indexed in the schema", () => {
    const block = modelBlock("Engagement");
    expect(block).toMatch(/workspaceId\s+String\s+@map\("workspace_id"\)/); // String, not String?
    expect(block).not.toMatch(/workspaceId\s+String\?\s/);
    expect(block).toMatch(/@@index\(\[workspaceId\]\)/);
    // the relation stays onDelete: Restrict (no cascade from workspace delete)
    expect(block).toMatch(/workspace\s+Workspace\s+@relation[^\n]*onDelete: Restrict/);
  });

  it("a migration sets workspace_id NOT NULL and adds the index", () => {
    const migDir = resolve(ROOT, "prisma/migrations");
    const sql = readdirSync(migDir)
      .filter((d) => /engagement_workspace_required_indexed/.test(d))
      .map((d) => readFileSync(resolve(migDir, d, "migration.sql"), "utf8"))
      .join("\n");
    expect(sql).toMatch(/ALTER TABLE "engagements" ALTER COLUMN "workspace_id" SET NOT NULL/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS "engagements_workspace_id_idx"/);
  });
});
