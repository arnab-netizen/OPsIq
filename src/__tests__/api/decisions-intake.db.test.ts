/**
 * Phase 6C-F1 — POST /api/decisions/intake raw-500 regression proof.
 *
 * The intake route's `db.operatorItem.create(...)` wrote a phantom `createdBy` column (real:
 * `createdByUserId`), omitted the required `id`/`updatedAt` (OperatorItem has no defaults for them), and
 * wrote phantom `decisionType`/`problemType` columns → PrismaClientValidationError → raw 500 on every
 * `POST /api/decisions/intake`. This was hidden because the decisions placebo tests asserted nothing.
 *
 * The create payload is now built by `buildIntakeOperatorItemData` (extracted from the route so the exact
 * payload is testable). This test runs that payload through a REAL database (no Prisma mocks) and proves
 * the create path no longer raw-500s and persists a schema-valid, pending, workspace-scoped decision.
 *
 * Full HTTP invocation of the route (withEnforcementFull + withAuth + enforceWorkspaceScoping) is deferred:
 * the repo lacks a NextRequest/session harness (its own `operator-route.real.test.ts` skips it). The DB
 * create — the defect locus — is proven directly and honestly.
 *
 * DB-backed; gated by SHOULD_RUN_DB_TESTS / TEST_WITH_DB=true.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { buildIntakeOperatorItemData, type IntakeDecisionInput } from "@/app/api/decisions/intake/intake-data";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db] Phase 6C-F1 — decisions intake create is schema-valid (no raw 500)",
  () => {
    const stamp = randomUUID().substring(0, 8);
    const workspaceId = randomUUID();
    const userId = randomUUID();

    beforeAll(async () => {
      // Real actor row so createdByUserId FK (operator_items_created_by_user_id) is satisfied.
      await db.user.create({
        data: { id: userId, email: `p6cf1-${stamp}@test.local`, isActive: true, updatedAt: new Date() },
      });
    });

    afterAll(async () => {
      try {
        await db.operatorItem.deleteMany({ where: { workspaceId } });
        await db.user.deleteMany({ where: { id: userId } });
      } catch {
        // best-effort cleanup (ephemeral CI database)
      }
    });

    it("[db] persists a pending, workspace-scoped decision with the exact intake payload (regression: was raw-500)", async () => {
      const input: IntakeDecisionInput = {
        title: "Reduce churn on enterprise tier",
        description: "Investigate and act on rising enterprise churn",
        confidence: 0.7,
        risk: "high",
      };

      // Before the fix, this create raw-500'd (phantom createdBy/decisionType/problemType + missing id/updatedAt).
      const created = await db.operatorItem.create({
        data: buildIntakeOperatorItemData(input, workspaceId, userId),
      });

      expect(created.id).toBeTruthy();
      expect(created.status).toBe("pending"); // auto-created pending decision
      expect(created.workspaceId).toBe(workspaceId); // scoped to the enforced workspace
      expect(created.createdByUserId).toBe(userId); // creator recorded on the real column
      expect(created.ownerUserId).toBe(userId);
      expect(created.problem).toBe(input.title); // problem ← title
      expect(created.action).toBe(input.description); // action ← description
      expect(created.updatedAt).toBeInstanceOf(Date); // required field present

      // Re-read to prove the row is really persisted and schema-valid.
      const row = await db.operatorItem.findUnique({
        where: { id: created.id },
        select: { id: true, status: true, workspaceId: true, createdByUserId: true },
      });
      expect(row).not.toBeNull();
      expect(row!.status).toBe("pending");
    });

    it("[db] the builder writes no phantom columns (createdBy/decisionType/problemType absent)", () => {
      const data = buildIntakeOperatorItemData(
        { title: "T", description: "d", confidence: 0.5, risk: "low" },
        workspaceId,
        userId
      ) as Record<string, unknown>;
      expect("createdBy" in data).toBe(false);
      expect("decisionType" in data).toBe(false);
      expect("problemType" in data).toBe(false);
      // required fields the old code omitted are present:
      expect(typeof data.id).toBe("string");
      expect(data.updatedAt).toBeInstanceOf(Date);
      expect(data.createdByUserId).toBe(userId);
    });
  }
);
