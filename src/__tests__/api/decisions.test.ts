/**
 * API Route Tests: Decisions (Phase 6C Wave 1 — placebo conversion)
 *
 * This file previously contained ~78 vacuous placebo tests (`expect(true).toBe(true)` and empty
 * `TODO_A2_FAKE_TEST_QUARANTINED` bodies) that asserted nothing and imported no real handler — so the
 * decisions create path could (and did) raw-500 while these tests stayed green.
 *
 * Phase 6C Wave 1 converts the safely-provable subset into REAL assertions against the real
 * `createDecision` service and the exact query the `GET /api/decisions/list` route runs, backed by a
 * real Postgres database (no Prisma mocks counted as DB proof). Converting the create path uncovered a
 * real owner-facing defect (createDecision wrote a phantom `createdBy` column and omitted the required
 * `id`/`updatedAt`, and wrote phantom `decisionType`/`problemType`) — fixed in
 * `src/services/decisions/decision-creation-service.ts` and proven below.
 *
 * Tests that reference routes which do not exist (`/approve`, `/block` — the real transitions are
 * accept/reject/close/etc.) and route-wrapper HTTP auth (401/403 via withCanonicalEnforcement/withAuth,
 * which the repo's own "real route test" skips for lack of an HTTP harness) are documented as DEFERRED
 * in docs/audits/2026-07-10-phase-6c-placebo-test-conversion-wave-1/PLACEBO_TEST_INVENTORY.md rather than
 * faked here.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createDecision } from "@/services/decisions/decision-creation-service";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

// The exact query GET /api/decisions/list runs (src/app/api/decisions/list/route.ts). Replicated so the
// workspace-isolation + valid-select (no raw 500) + DTO invariants are proven against a real DB.
async function listDecisionsQuery(workspaceId: string, status?: string) {
  const where: { workspaceId: string; status?: string } = { workspaceId };
  if (status && ["pending", "blocked", "approved", "done", "failed"].includes(status)) {
    where.status = status;
  }
  const rows = await db.operatorItem.findMany({
    where,
    select: {
      id: true,
      problem: true,
      action: true,
      impactExpected: true,
      confidence: true,
      status: true,
      blockStage: true,
      blockReason: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((d) => ({
    id: d.id,
    title: d.problem,
    status: d.status,
    impact: d.impactExpected,
    confidence: d.confidence,
    blockStage: d.blockStage,
    blockReason: d.blockReason,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }));
}

describe("Decisions API — create service input validation (fail-closed, no DB required)", () => {
  const base = {
    verifiedActorId: randomUUID(),
    verifiedWorkspaceId: randomUUID(),
    type: "operational",
    impact: 50000,
    confidence: 0.8,
  };

  it("rejects an empty problem statement (title required)", async () => {
    await expect(createDecision({ ...base, title: "   " })).rejects.toThrow(/title is required/i);
  });

  it("rejects an empty proposed action (type required)", async () => {
    await expect(createDecision({ ...base, title: "T", type: "  " })).rejects.toThrow(/type is required/i);
  });

  it("rejects a non-positive impact", async () => {
    await expect(createDecision({ ...base, title: "T", impact: 0 })).rejects.toThrow(/impact must be a positive number/i);
  });

  it("rejects a confidence outside [0,1]", async () => {
    await expect(createDecision({ ...base, title: "T", confidence: 1.5 })).rejects.toThrow(/confidence must be between 0 and 1/i);
  });

  it("rejects a missing workspace id (fail-closed workspace enforcement)", async () => {
    await expect(
      createDecision({ ...base, title: "T", verifiedWorkspaceId: "" })
    ).rejects.toThrow();
  });

  it("rejects negative impact", async () => {
    await expect(createDecision({ ...base, title: "T", impact: -1 })).rejects.toThrow(/impact must be a positive number/i);
  });

  it("rejects confidence < 0", async () => {
    await expect(createDecision({ ...base, title: "T", confidence: -0.1 })).rejects.toThrow(/confidence must be between 0 and 1/i);
  });

  it("rejects missing verifiedActorId", async () => {
    await expect(
      createDecision({ ...base, title: "T", verifiedActorId: "" })
    ).rejects.toThrow();
  });

  it("rejects type with only whitespace", async () => {
    await expect(createDecision({ ...base, title: "T", type: "   " })).rejects.toThrow(/type is required/i);
  });

  it("rejects title that is only whitespace", async () => {
    await expect(createDecision({ ...base, title: "\t\n " })).rejects.toThrow(/title is required/i);
  });

  it("rejects impact that is NaN", async () => {
    await expect(createDecision({ ...base, title: "T", impact: NaN })).rejects.toThrow(/impact must be a positive number/i);
  });

  it("rejects confidence that is NaN", async () => {
    await expect(createDecision({ ...base, title: "T", confidence: NaN })).rejects.toThrow(/confidence must be between 0 and 1/i);
  });

  it("rejects impact = Infinity", async () => {
    await expect(createDecision({ ...base, title: "T", impact: Infinity })).rejects.toThrow();
  });

  it("rejects confidence = Infinity", async () => {
    await expect(createDecision({ ...base, title: "T", confidence: Infinity })).rejects.toThrow();
  });

  it("rejects confidence = -Infinity", async () => {
    await expect(createDecision({ ...base, title: "T", confidence: -Infinity })).rejects.toThrow();
  });

  it("rejects impact = -Infinity", async () => {
    await expect(createDecision({ ...base, title: "T", impact: -Infinity })).rejects.toThrow();
  });

  it("rejects confidence exactly at 1.01 (boundary over)", async () => {
    await expect(createDecision({ ...base, title: "T", confidence: 1.01 })).rejects.toThrow(/confidence must be between 0 and 1/i);
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db] Decisions API — real create + list workspace isolation (Phase 6C Wave 1)",
  () => {
    const stamp = randomUUID().substring(0, 8);
    const workspaceId = randomUUID();
    const otherWorkspaceId = randomUUID();
    const userId = randomUUID();

    beforeAll(async () => {
      // Real actor row so createDecision's createdByUserId FK (operator_items_created_by_user_id) is satisfied.
      await db.user.create({
        data: { id: userId, email: `p6c-dec-${stamp}@test.local`, isActive: true, updatedAt: new Date() },
      });
    });

    afterAll(async () => {
      try {
        await db.operatorItem.deleteMany({ where: { workspaceId: { in: [workspaceId, otherWorkspaceId] } } });
        await db.user.deleteMany({ where: { id: userId } });
      } catch {
        // best-effort cleanup (ephemeral CI database)
      }
    });

    it("[db] createDecision persists a real pending, workspace-scoped decision (regression: create no longer raw-500s)", async () => {
      // Before the Phase 6C fix this call raw-500'd: it wrote a phantom `createdBy` column and omitted the
      // required `id`/`updatedAt` (plus phantom decisionType/problemType) → PrismaClientValidationError.
      const result = await createDecision({
        title: "Cut cloud spend",
        type: "operational",
        impact: 50000,
        confidence: 0.8,
        verifiedActorId: userId,
        verifiedWorkspaceId: workspaceId,
      });
      expect(result.id).toBeTruthy();
      expect(result.title).toBe("Cut cloud spend");
      expect(result.decisionType).toBe("operational");

      const row = await db.operatorItem.findUnique({
        where: { id: result.id },
        select: { status: true, workspaceId: true, createdByUserId: true, ownerUserId: true, impactExpected: true, problem: true },
      });
      expect(row).not.toBeNull();
      expect(row!.status).toBe("pending"); // state machine: initial status enforced by service
      expect(row!.workspaceId).toBe(workspaceId); // scoped to the verified workspace, not user input
      expect(row!.createdByUserId).toBe(userId); // creator recorded from verified actor
      expect(row!.ownerUserId).toBe(userId);
      expect(row!.impactExpected).toBe(50000);
      expect(row!.problem).toBe("Cut cloud spend");
    });

    it("[db] list query returns only the requesting workspace's decisions (tenant isolation, no leak)", async () => {
      const mine = await createDecision({
        title: "My workspace decision",
        type: "operational",
        impact: 12000,
        confidence: 0.6,
        verifiedActorId: userId,
        verifiedWorkspaceId: workspaceId,
      });
      const foreign = await createDecision({
        title: "Other workspace decision",
        type: "operational",
        impact: 34000,
        confidence: 0.7,
        verifiedActorId: userId,
        verifiedWorkspaceId: otherWorkspaceId,
      });

      const listed = await listDecisionsQuery(workspaceId);
      const ids = listed.map((d) => d.id);
      expect(ids).toContain(mine.id);
      expect(ids).not.toContain(foreign.id); // cross-workspace decision must never leak
      expect(listed.every((d) => typeof d.title === "string")).toBe(true); // real DTO shape (title ← problem)
      // A phantom/invalid select would raw-500 here; reaching this assertion proves it does not.
      const foreignList = await listDecisionsQuery(otherWorkspaceId);
      expect(foreignList.map((d) => d.id)).toContain(foreign.id);
      expect(foreignList.map((d) => d.id)).not.toContain(mine.id);
    });

    it("[db] list status filter narrows to matching decisions without leaking other statuses", async () => {
      const all = await listDecisionsQuery(workspaceId);
      const pendingOnly = await listDecisionsQuery(workspaceId, "pending");
      expect(pendingOnly.length).toBeGreaterThan(0);
      expect(pendingOnly.every((d) => d.status === "pending")).toBe(true);
      expect(pendingOnly.length).toBeLessThanOrEqual(all.length);
    });
  }
);
