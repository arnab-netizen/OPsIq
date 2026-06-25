import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { generateEmployeeGuidance } from "@/services/execution/employee-guidance.service";
import {
  sealBoundary,
  ApprovedExecutionBoundary,
  BoundaryInstruction,
} from "@/domain/execution/boundary";

function boundary(ws: string): ApprovedExecutionBoundary {
  const now = new Date("2026-06-25T12:00:00.000Z");
  return sealBoundary({
    boundaryId: uuid(),
    boundaryVersion: 1,
    supersedesBoundaryVersion: null,
    workspaceId: ws,
    recommendationId: null,
    approvedActionId: null,
    ownerApprovedBy: "owner",
    approvedAt: now,
    validFrom: new Date("2026-06-20T00:00:00.000Z"),
    validUntil: new Date("2026-07-20T00:00:00.000Z"),
    maxUses: null,
    allowedRoles: ["counter_staff"],
    forbiddenRoles: [],
    allowedActions: ["call_customer"],
    forbiddenActions: ["issue_refund"],
    allowedCustomerSegments: ["retail"],
    forbiddenCustomerSegments: [],
    allowedCommunicationChannels: ["whatsapp"],
    forbiddenCommunicationChannels: [],
    maxDiscount: 10,
    maxRefund: null,
    maxSpend: null,
    maxOvertime: null,
    priceQuoteAllowed: false,
    refundPromiseAllowed: false,
    sameDayPromiseAllowed: false,
    deliveryPromiseLimit: null,
    geographicBoundary: null,
    serviceTypeBoundary: null,
    capacityBoundary: null,
    dataAccessBoundary: ["own_assigned_tasks"],
    proofRequired: true,
    escalationTriggers: [],
    legalComplianceFlags: [],
    brandRiskFlags: [],
    ownerOverrideRequiredFor: [],
    isActive: true,
  });
}

function instr(b: ApprovedExecutionBoundary, action: string): BoundaryInstruction {
  return {
    action,
    role: "counter_staff",
    boundaryId: b.boundaryId,
    boundaryVersion: b.boundaryVersion,
    boundaryContentHash: b.contentHash,
    summary: "guidance",
  };
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db] employee guidance ledger persistence",
  () => {
    let ws: string;
    beforeEach(async () => {
      ws = uuid();
      await db.workspace.create({ data: { id: ws, name: "WS", slug: `ws-${ws}`, updatedAt: new Date() } });
    });
    afterEach(async () => {
      await db.auditEvent.deleteMany({ where: { workspaceId: ws } });
      await db.workspace.deleteMany({ where: { id: ws } });
    });

    it("an allowed instruction writes a durable GENERATED ledger record", async () => {
      const b = boundary(ws);
      const r = await generateEmployeeGuidance({
        workspaceId: ws,
        taskId: null,
        boundary: b,
        instruction: instr(b, "call_customer"),
      });
      expect(r.allowed).toBe(true);
      const rows = await db.auditEvent.findMany({
        where: { workspaceId: ws, eventName: "employee_guidance.generated" },
      });
      expect(rows.length).toBe(1);
      expect((rows[0].payload as Record<string, unknown>).validationStatus).toBe(
        "BOUNDARY_VALIDATION_PASSED"
      );
    });

    it("a blocked instruction writes a durable BLOCKED ledger record and no guidance", async () => {
      const b = boundary(ws);
      const r = await generateEmployeeGuidance({
        workspaceId: ws,
        taskId: null,
        boundary: b,
        instruction: instr(b, "issue_refund"),
      });
      expect(r.allowed).toBe(false);
      expect(r.guidance).toBeUndefined();
      const rows = await db.auditEvent.findMany({
        where: { workspaceId: ws, eventName: "employee_guidance.blocked" },
      });
      expect(rows.length).toBe(1);
    });
  }
);
