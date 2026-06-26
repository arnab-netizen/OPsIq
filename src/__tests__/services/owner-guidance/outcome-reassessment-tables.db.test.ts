/**
 * Outcome/learning module — outcome & reassessment table existence proof (DB-backed).
 * `[db]`-gated. Proves the additive migration created the previously schema-only
 * tables so the Owner Now View's outcome-check-due signal is live on the deploy lane
 * (no more Prisma P2021 "table does not exist").
 */
import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";

describe("[db][module41] outcome & reassessment tables are migration-backed", () => {
  it("ownerActionOutcome is queryable (table exists, scoped count works)", async () => {
    const ws = randomUUID();
    expect(await db.ownerActionOutcome.count({ where: { workspaceId: ws } })).toBe(0);
  });

  it("ownerReassessmentEvent is queryable (table exists, scoped count works)", async () => {
    const ws = randomUUID();
    expect(await db.ownerReassessmentEvent.count({ where: { workspaceId: ws, status: "pending" } })).toBe(0);
  });
});
