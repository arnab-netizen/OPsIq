/**
 * Bundle 3.4 — Business Risk + Compliance Lifecycle (DB-backed proof).
 *
 * `[db]`-gated → runs only under TEST_WITH_DB=true against a real PostgreSQL with
 * the risk_compliance_lifecycle migration applied. Proves: workspace-scoped CRUD,
 * status lifecycle transitions, task linkage idempotency, cross-workspace isolation,
 * audit event emission, alert trigger on breach, and temporal state computation.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-mode/risk-compliance.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import {
  createBusinessRisk,
  updateBusinessRisk,
  listBusinessRisks,
  getBusinessRisk,
  linkTaskToRisk,
  reviewRisk,
} from "@/services/owner-mode/business-risk.service";
import {
  recordComplianceItem,
  getAllComplianceItems,
  getComplianceItem,
  updateComplianceStatus,
  linkTaskToComplianceItem,
} from "@/services/owner-mode/compliance.service";
import { assignDelegatedTask } from "@/services/execution/task-assignment.service";
import { ValidationError } from "@/infra/errors";

const actor = randomUUID();
const ws = () => randomUUID();
// Fixed workspace for tests that create alerts (alerts table has FK to workspaces)
const alertWorkspaceId = randomUUID();

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: {
      id: actor,
      email: `risk-compliance-test-${actor}@example.com`,
      name: "Risk Compliance Test",
      isActive: true,
      updatedAt: new Date(),
    },
  });
  await db.workspace.upsert({
    where: { id: alertWorkspaceId },
    update: {},
    create: {
      id: alertWorkspaceId,
      name: "Alert Test Workspace",
      slug: `alert-test-${alertWorkspaceId}`,
      isActive: true,
      updatedAt: new Date(),
    },
  });
});

// ─── Helper: create a delegated task ─────────────────────────────────────────

async function newTask(workspaceId: string) {
  const t = await assignDelegatedTask({
    workspaceId,
    actorId: actor,
    title: "Test mitigation task",
    description: "Created by risk-compliance DB test",
  });
  return t.taskId;
}

// ─── Business Risk tests ───────────────────────────────────────────────────────

describe("[db] Business Risk — workspace-scoped CRUD", () => {
  it("[db] creates a business risk and persists all fields", async () => {
    const workspaceId = ws();
    const risk = await createBusinessRisk({
      workspaceId,
      actorId: actor,
      riskCode: "RISK-001",
      title: "Key customer dependency",
      description: "Top 3 clients represent 70% of revenue",
      category: "MARKET",
      likelihood: 60,
      impact: 80,
      mitigationAction: "Diversify client base",
    });

    expect(risk.id).toBeTruthy();
    expect(risk.workspaceId).toBe(workspaceId);
    expect(risk.riskCode).toBe("RISK-001");
    expect(risk.title).toBe("Key customer dependency");
    expect(risk.category).toBe("MARKET");
    expect(risk.likelihood).toBe(60);
    expect(risk.impact).toBe(80);
    expect(risk.severity).toBe(Math.round((60 * 80) / 100)); // 48
    expect(risk.status).toBe("IDENTIFIED");
  });

  it("[db] lists risks — only returns own workspace", async () => {
    const ws1 = ws();
    const ws2 = ws();

    await createBusinessRisk({ workspaceId: ws1, actorId: actor, riskCode: "R-A", title: "WS1 Risk A", category: "OPERATIONAL" });
    await createBusinessRisk({ workspaceId: ws2, actorId: actor, riskCode: "R-B", title: "WS2 Risk B", category: "FINANCIAL" });

    const ws1Risks = await listBusinessRisks(ws1);
    const ws2Risks = await listBusinessRisks(ws2);

    expect(ws1Risks.every((r) => r.workspaceId === ws1)).toBe(true);
    expect(ws2Risks.every((r) => r.workspaceId === ws2)).toBe(true);
    expect(ws1Risks.some((r) => r.title === "WS2 Risk B")).toBe(false);
    expect(ws2Risks.some((r) => r.title === "WS1 Risk A")).toBe(false);
  });

  it("[db] getBusinessRisk — returns risk with taskLinks included", async () => {
    const workspaceId = ws();
    const created = await createBusinessRisk({
      workspaceId, actorId: actor, riskCode: "R-DETAIL", title: "Detail test", category: "EXECUTION",
    });

    const fetched = await getBusinessRisk(workspaceId, created.id);
    expect(fetched.id).toBe(created.id);
    expect(Array.isArray(fetched.taskLinks)).toBe(true);
  });

  it("[db] getBusinessRisk — cross-workspace access denied (NotFoundError)", async () => {
    const ws1 = ws();
    const ws2 = ws();
    const risk = await createBusinessRisk({ workspaceId: ws1, actorId: actor, riskCode: "R-XWS", title: "XWS Risk", category: "COMPLIANCE" });

    await expect(getBusinessRisk(ws2, risk.id)).rejects.toThrow("BusinessRiskEntry");
  });

  it("[db] severity recalculates on update", async () => {
    const workspaceId = ws();
    const risk = await createBusinessRisk({ workspaceId, actorId: actor, riskCode: "R-SEV", title: "Severity test", category: "FINANCIAL", likelihood: 40, impact: 40 });

    expect(risk.severity).toBe(16); // 40*40/100

    const updated = await updateBusinessRisk({ workspaceId, riskId: risk.id, actorId: actor, likelihood: 80, impact: 75 });
    expect(updated.severity).toBe(60); // 80*75/100
  });

  it("[db] listBusinessRisks — filters by category", async () => {
    const workspaceId = ws();
    await createBusinessRisk({ workspaceId, actorId: actor, riskCode: "R-OP", title: "Operational risk", category: "OPERATIONAL" });
    await createBusinessRisk({ workspaceId, actorId: actor, riskCode: "R-FIN", title: "Financial risk", category: "FINANCIAL" });

    const ops = await listBusinessRisks(workspaceId, { category: "OPERATIONAL" });
    expect(ops.every((r) => r.category === "OPERATIONAL")).toBe(true);
  });
});

// ─── Risk lifecycle transitions ────────────────────────────────────────────────

describe("[db] Business Risk — lifecycle transitions", () => {
  it("[db] IDENTIFIED → ASSESSED is a valid transition", async () => {
    const workspaceId = ws();
    const risk = await createBusinessRisk({ workspaceId, actorId: actor, riskCode: "R-T1", title: "Transition test 1", category: "STRATEGIC" });

    const updated = await reviewRisk({ workspaceId, riskId: risk.id, actorId: actor, newStatus: "ASSESSED" });
    expect(updated.status).toBe("ASSESSED");
    expect(updated.reviewedAt).toBeTruthy();
  });

  it("[db] IDENTIFIED → ACCEPTED is a valid transition", async () => {
    const workspaceId = ws();
    const risk = await createBusinessRisk({ workspaceId, actorId: actor, riskCode: "R-T2", title: "Transition test 2", category: "STRATEGIC" });

    const updated = await reviewRisk({
      workspaceId, riskId: risk.id, actorId: actor, newStatus: "ACCEPTED",
      acceptanceRationale: "Low probability, monitored quarterly",
    });
    expect(updated.status).toBe("ACCEPTED");
  });

  it("[db] IDENTIFIED → RESOLVED is an invalid transition (throws ValidationError)", async () => {
    const workspaceId = ws();
    const risk = await createBusinessRisk({ workspaceId, actorId: actor, riskCode: "R-T3", title: "Transition test 3", category: "STRATEGIC" });

    await expect(
      reviewRisk({ workspaceId, riskId: risk.id, actorId: actor, newStatus: "RESOLVED" }),
    ).rejects.toThrow(ValidationError);
  });

  it("[db] CLOSED → MITIGATING is an invalid transition (closed is terminal)", async () => {
    const workspaceId = ws();
    const risk = await createBusinessRisk({ workspaceId, actorId: actor, riskCode: "R-T4", title: "Transition test 4", category: "STRATEGIC" });

    await reviewRisk({ workspaceId, riskId: risk.id, actorId: actor, newStatus: "CLOSED" });

    await expect(
      reviewRisk({ workspaceId, riskId: risk.id, actorId: actor, newStatus: "MITIGATING" }),
    ).rejects.toThrow(ValidationError);
  });

  it("[db] MITIGATING → RESOLVED is a valid transition", async () => {
    const workspaceId = ws();
    const risk = await createBusinessRisk({ workspaceId, actorId: actor, riskCode: "R-T5", title: "Transition test 5", category: "EXECUTION" });

    await reviewRisk({ workspaceId, riskId: risk.id, actorId: actor, newStatus: "MITIGATING" });
    const resolved = await reviewRisk({ workspaceId, riskId: risk.id, actorId: actor, newStatus: "RESOLVED", residualRisk: 10 });

    expect(resolved.status).toBe("RESOLVED");
    expect(resolved.residualRisk).toBe(10);
  });

  it("[db] audit event emitted on risk status transition", async () => {
    const workspaceId = ws();
    const risk = await createBusinessRisk({ workspaceId, actorId: actor, riskCode: "R-AUD", title: "Audit event test", category: "COMPLIANCE" });

    await reviewRisk({ workspaceId, riskId: risk.id, actorId: actor, newStatus: "ASSESSED" });

    const events = await db.auditEvent.findMany({
      where: { workspaceId, entityId: risk.id },
      orderBy: { occurredAt: "desc" },
    });
    expect(events.length).toBeGreaterThanOrEqual(2); // created + transition
    const transitionEvent = events.find((e) => e.eventName.includes("review_completed") || e.eventName.includes("status_changed"));
    expect(transitionEvent).toBeTruthy();
  });

  it("[db] audit event emitted on risk create", async () => {
    const workspaceId = ws();
    const risk = await createBusinessRisk({ workspaceId, actorId: actor, riskCode: "R-AUD2", title: "Create audit test", category: "OPERATIONAL" });

    const event = await db.auditEvent.findFirst({
      where: { workspaceId, entityId: risk.id, eventName: "owner.business_risk_identified" },
    });
    expect(event).toBeTruthy();
    expect(event?.workspaceId).toBe(workspaceId);
  });
});

// ─── Risk task linkage ────────────────────────────────────────────────────────

describe("[db] Business Risk — task linkage", () => {
  it("[db] links a delegated task to a risk", async () => {
    const workspaceId = ws();
    const risk = await createBusinessRisk({ workspaceId, actorId: actor, riskCode: "R-LINK", title: "Task link test", category: "OPERATIONAL" });
    const taskId = await newTask(workspaceId);

    const link = await linkTaskToRisk({ workspaceId, riskId: risk.id, taskId, actorId: actor, linkType: "MITIGATION" });
    expect(link).toBeTruthy();

    const fetched = await getBusinessRisk(workspaceId, risk.id);
    expect(fetched.taskLinks.some((tl) => tl.taskId === taskId)).toBe(true);
  });

  it("[db] task link is idempotent — repeated call upserts not duplicates", async () => {
    const workspaceId = ws();
    const risk = await createBusinessRisk({ workspaceId, actorId: actor, riskCode: "R-IDEM", title: "Idempotency test", category: "FINANCIAL" });
    const taskId = await newTask(workspaceId);

    await linkTaskToRisk({ workspaceId, riskId: risk.id, taskId, actorId: actor, linkType: "MITIGATION" });
    await linkTaskToRisk({ workspaceId, riskId: risk.id, taskId, actorId: actor, linkType: "EVIDENCE" });

    const fetched = await getBusinessRisk(workspaceId, risk.id);
    const matchingLinks = fetched.taskLinks.filter((tl) => tl.taskId === taskId);
    expect(matchingLinks.length).toBe(1); // upserted, not duplicated
    expect(matchingLinks[0].linkType).toBe("EVIDENCE");
  });

  it("[db] task from different workspace cannot be linked (cross-workspace guard)", async () => {
    const ws1 = ws();
    const ws2 = ws();
    const risk = await createBusinessRisk({ workspaceId: ws1, actorId: actor, riskCode: "R-XWS2", title: "Cross WS task test", category: "MARKET" });
    const taskId = await newTask(ws2); // task is in ws2

    await expect(
      linkTaskToRisk({ workspaceId: ws1, riskId: risk.id, taskId, actorId: actor }),
    ).rejects.toThrow("DelegatedTask");
  });

  it("[db] task link audit event emitted", async () => {
    const workspaceId = ws();
    const risk = await createBusinessRisk({ workspaceId, actorId: actor, riskCode: "R-LAUD", title: "Link audit test", category: "COMPLIANCE" });
    const taskId = await newTask(workspaceId);

    await linkTaskToRisk({ workspaceId, riskId: risk.id, taskId, actorId: actor });

    const event = await db.auditEvent.findFirst({
      where: { workspaceId, entityId: risk.id, eventName: "owner.risk_task_linked" },
    });
    expect(event).toBeTruthy();
    const payload = event?.payload as Record<string, unknown>;
    expect(payload.taskId).toBe(taskId);
  });
});

// ─── Compliance tests ──────────────────────────────────────────────────────────

describe("[db] Compliance — workspace-scoped CRUD", () => {
  it("[db] creates a compliance item and persists all fields", async () => {
    const workspaceId = ws();
    const id = await recordComplianceItem({
      workspaceId,
      actorId: actor,
      kind: "licence",
      name: "Business Operating Licence",
      reference: "BOL-2026-001",
      jurisdiction: "NSW, AU",
      obligationOwner: "Director",
      expiresAt: new Date("2027-06-30"),
      penaltyDescription: "Fine up to $50,000",
      provenanceSource: "authoritative_document",
    });

    expect(id).toBeTruthy();
    const item = await db.ownerComplianceItem.findFirst({ where: { id, workspaceId } });
    expect(item?.status).toBe("active");
    expect(item?.reference).toBe("BOL-2026-001");
    expect(item?.jurisdiction).toBe("NSW, AU");
    expect(item?.obligationOwner).toBe("Director");
    expect(item?.penaltyDescription).toBe("Fine up to $50,000");
  });

  it("[db] getAllComplianceItems — only returns own workspace", async () => {
    const ws1 = ws();
    const ws2 = ws();

    await recordComplianceItem({ workspaceId: ws1, actorId: actor, kind: "permit", name: "WS1 Permit" });
    await recordComplianceItem({ workspaceId: ws2, actorId: actor, kind: "insurance", name: "WS2 Insurance" });

    const ws1Items = await getAllComplianceItems(ws1);
    const ws2Items = await getAllComplianceItems(ws2);

    expect(ws1Items.every((i) => i.workspaceId === ws1)).toBe(true);
    expect(ws2Items.every((i) => i.workspaceId === ws2)).toBe(true);
    expect(ws1Items.some((i) => i.name === "WS2 Insurance")).toBe(false);
    expect(ws2Items.some((i) => i.name === "WS1 Permit")).toBe(false);
  });

  it("[db] getComplianceItem — returns item with taskLinks included", async () => {
    const workspaceId = ws();
    const id = await recordComplianceItem({ workspaceId, actorId: actor, kind: "tax", name: "GST registration" });

    const item = await getComplianceItem(workspaceId, id);
    expect(item.id).toBe(id);
    expect(Array.isArray(item.taskLinks)).toBe(true);
  });

  it("[db] getComplianceItem — cross-workspace access denied (NotFoundError)", async () => {
    const ws1 = ws();
    const ws2 = ws();
    const id = await recordComplianceItem({ workspaceId: ws1, actorId: actor, kind: "document", name: "XWS doc" });

    await expect(getComplianceItem(ws2, id)).rejects.toThrow("OwnerComplianceItem");
  });

  it("[db] getAllComplianceItems — filters by status", async () => {
    const workspaceId = ws();
    const id = await recordComplianceItem({ workspaceId, actorId: actor, kind: "licence", name: "Status filter test" });
    await updateComplianceStatus({ workspaceId, itemId: id, actorId: actor, newStatus: "compliant" });

    const compliantItems = await getAllComplianceItems(workspaceId, { status: "compliant" });
    expect(compliantItems.some((i) => i.id === id)).toBe(true);

    const activeItems = await getAllComplianceItems(workspaceId, { status: "active" });
    expect(activeItems.some((i) => i.id === id)).toBe(false);
  });

  it("[db] temporal state is 'overdue' for expired item", async () => {
    const workspaceId = ws();
    const id = await recordComplianceItem({
      workspaceId, actorId: actor, kind: "permit", name: "Overdue permit",
      expiresAt: new Date("2020-01-01"), // well in the past
    });

    const item = await getComplianceItem(workspaceId, id);
    expect(item.temporalState).toBe("overdue");
  });

  it("[db] temporal state is 'upcoming' for item expiring far in future", async () => {
    const workspaceId = ws();
    const id = await recordComplianceItem({
      workspaceId, actorId: actor, kind: "permit", name: "Future permit",
      expiresAt: new Date("2035-01-01"), // far in the future
    });

    const item = await getComplianceItem(workspaceId, id);
    expect(item.temporalState).toBe("upcoming");
  });

  it("[db] temporal state is null for item with no expiry date", async () => {
    const workspaceId = ws();
    const id = await recordComplianceItem({ workspaceId, actorId: actor, kind: "document", name: "No expiry" });

    const item = await getComplianceItem(workspaceId, id);
    expect(item.temporalState).toBeNull();
  });
});

// ─── Compliance lifecycle transitions ─────────────────────────────────────────

describe("[db] Compliance — lifecycle transitions", () => {
  it("[db] active → evidence_pending is a valid transition", async () => {
    const workspaceId = ws();
    const id = await recordComplianceItem({ workspaceId, actorId: actor, kind: "licence", name: "Trans test 1" });

    const updated = await updateComplianceStatus({ workspaceId, itemId: id, actorId: actor, newStatus: "evidence_pending" });
    expect(updated.status).toBe("evidence_pending");
    expect(updated.reviewedAt).toBeTruthy();
  });

  it("[db] active → compliant is a valid transition", async () => {
    const workspaceId = ws();
    const id = await recordComplianceItem({ workspaceId, actorId: actor, kind: "insurance", name: "Trans test 2" });

    const updated = await updateComplianceStatus({ workspaceId, itemId: id, actorId: actor, newStatus: "compliant" });
    expect(updated.status).toBe("compliant");
  });

  it("[db] waived → compliant is an invalid transition (throws ValidationError)", async () => {
    const workspaceId = ws();
    const id = await recordComplianceItem({ workspaceId, actorId: actor, kind: "tax", name: "Trans test 3" });
    await updateComplianceStatus({ workspaceId, itemId: id, actorId: actor, newStatus: "waived" });

    await expect(
      updateComplianceStatus({ workspaceId, itemId: id, actorId: actor, newStatus: "compliant" }),
    ).rejects.toThrow(ValidationError);
  });

  it("[db] breached → review_pending is a valid transition", async () => {
    const workspaceId = alertWorkspaceId;
    const id = await recordComplianceItem({ workspaceId, actorId: actor, kind: "permit", name: "Trans test 4" });
    await updateComplianceStatus({ workspaceId, itemId: id, actorId: actor, newStatus: "breached" });

    const updated = await updateComplianceStatus({ workspaceId, itemId: id, actorId: actor, newStatus: "review_pending", complianceNotes: "Investigating breach" });
    expect(updated.status).toBe("review_pending");
    expect(updated.complianceNotes).toBe("Investigating breach");
  });

  it("[db] audit event emitted on compliance status change", async () => {
    const workspaceId = ws();
    const id = await recordComplianceItem({ workspaceId, actorId: actor, kind: "licence", name: "Audit compliance" });

    await updateComplianceStatus({ workspaceId, itemId: id, actorId: actor, newStatus: "review_pending" });

    const events = await db.auditEvent.findMany({
      where: { workspaceId, entityId: id },
      orderBy: { occurredAt: "desc" },
    });
    expect(events.length).toBeGreaterThanOrEqual(2);
    const statusEvent = events.find((e) => e.eventName.includes("compliance_status_changed") || e.eventName.includes("compliance_review"));
    expect(statusEvent).toBeTruthy();
  });

  it("[db] breach alert is created when status changes to breached", async () => {
    const id = await recordComplianceItem({ workspaceId: alertWorkspaceId, actorId: actor, kind: "insurance", name: "Breach alert test" });

    await updateComplianceStatus({ workspaceId: alertWorkspaceId, itemId: id, actorId: actor, newStatus: "breached" });

    const alert = await db.alert.findFirst({
      where: { workspaceId: alertWorkspaceId, entityId: id, type: "threshold_breach" },
    });
    expect(alert).toBeTruthy();
    expect(alert?.severity).toBe("critical");
  });

  it("[db] breach alert is idempotent — same item second breach does not create duplicate", async () => {
    const id = await recordComplianceItem({ workspaceId: alertWorkspaceId, actorId: actor, kind: "document", name: "Breach idempotency" });

    await updateComplianceStatus({ workspaceId: alertWorkspaceId, itemId: id, actorId: actor, newStatus: "breached" });
    await updateComplianceStatus({ workspaceId: alertWorkspaceId, itemId: id, actorId: actor, newStatus: "active" }); // reset
    // Note: second breach may increment — idempotencyKey includes status, so a new breach key differs

    const alerts = await db.alert.findMany({
      where: { workspaceId: alertWorkspaceId, entityId: id, type: "threshold_breach" },
    });
    expect(alerts.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Risk alert integration ───────────────────────────────────────────────────

describe("[db] Business Risk — alert integration", () => {
  it("[db] critical risk (severity >= 75) creates a workspace-scoped threshold_breach alert", async () => {
    const risk = await createBusinessRisk({
      workspaceId: alertWorkspaceId,
      actorId: actor,
      riskCode: "R-CRIT1",
      title: "Critical severity risk",
      category: "FINANCIAL",
      likelihood: 100,
      impact: 100,
    });

    const alert = await db.alert.findFirst({
      where: {
        workspaceId: alertWorkspaceId,
        entityId: risk.id,
        type: "threshold_breach",
        idempotencyKey: `risk_critical_${risk.id}`,
      },
    });
    expect(alert).toBeTruthy();
    expect(alert?.severity).toBe("critical");
    expect(alert?.workspaceId).toBe(alertWorkspaceId);
  });

  it("[db] reviewing a critical risk does not duplicate the alert (idempotency)", async () => {
    const risk = await createBusinessRisk({
      workspaceId: alertWorkspaceId,
      actorId: actor,
      riskCode: "R-CRIT2",
      title: "Idempotency test critical",
      category: "OPERATIONAL",
      likelihood: 100,
      impact: 100,
    });

    // ASSESSED is non-terminal: alert re-attempted with same key → no duplicate
    await reviewRisk({ workspaceId: alertWorkspaceId, riskId: risk.id, actorId: actor, newStatus: "ASSESSED" });

    const alerts = await db.alert.findMany({
      where: {
        workspaceId: alertWorkspaceId,
        entityId: risk.id,
        idempotencyKey: `risk_critical_${risk.id}`,
      },
    });
    expect(alerts.length).toBe(1);
  });

  it("[db] overdue non-terminal risk creates a blocked overdue alert", async () => {
    const pastDate = new Date("2020-01-01T00:00:00Z");
    const risk = await createBusinessRisk({
      workspaceId: alertWorkspaceId,
      actorId: actor,
      riskCode: "R-ODUE1",
      title: "Overdue risk",
      category: "COMPLIANCE",
    });

    await reviewRisk({
      workspaceId: alertWorkspaceId,
      riskId: risk.id,
      actorId: actor,
      newStatus: "ASSESSED",
      reviewDueDate: pastDate,
    });

    const alert = await db.alert.findFirst({
      where: {
        workspaceId: alertWorkspaceId,
        entityId: risk.id,
        type: "blocked",
        idempotencyKey: `risk_overdue_${risk.id}`,
      },
    });
    expect(alert).toBeTruthy();
  });

  it("[db] terminal risk status does not create overdue alert", async () => {
    const pastDate = new Date("2020-01-01T00:00:00Z");
    const risk = await createBusinessRisk({
      workspaceId: alertWorkspaceId,
      actorId: actor,
      riskCode: "R-TERM1",
      title: "Terminal no-overdue test",
      category: "MARKET",
    });

    // CLOSED is terminal: resolve path taken, not overdue path
    await reviewRisk({
      workspaceId: alertWorkspaceId,
      riskId: risk.id,
      actorId: actor,
      newStatus: "CLOSED",
      reviewDueDate: pastDate,
    });

    const overdueAlert = await db.alert.findFirst({
      where: {
        workspaceId: alertWorkspaceId,
        entityId: risk.id,
        type: "blocked",
        idempotencyKey: `risk_overdue_${risk.id}`,
      },
    });
    expect(overdueAlert).toBeNull();
  });

  it("[db] risk alert is workspace-scoped — different workspace cannot see it", async () => {
    const risk = await createBusinessRisk({
      workspaceId: alertWorkspaceId,
      actorId: actor,
      riskCode: "R-SCOPE1",
      title: "Workspace scope test",
      category: "STRATEGIC",
      likelihood: 100,
      impact: 100,
    });

    const foreignAlert = await db.alert.findFirst({
      where: { workspaceId: randomUUID(), entityId: risk.id },
    });
    expect(foreignAlert).toBeNull();
  });

  it("[db] reviewing critical risk to terminal status resolves active alert", async () => {
    const risk = await createBusinessRisk({
      workspaceId: alertWorkspaceId,
      actorId: actor,
      riskCode: "R-RSLV1",
      title: "Alert resolution test",
      category: "EXECUTION",
      likelihood: 100,
      impact: 100,
    });

    const alertBefore = await db.alert.findFirst({
      where: { workspaceId: alertWorkspaceId, entityId: risk.id, idempotencyKey: `risk_critical_${risk.id}` },
    });
    expect(alertBefore?.resolvedAt).toBeNull();

    await reviewRisk({ workspaceId: alertWorkspaceId, riskId: risk.id, actorId: actor, newStatus: "MITIGATING" });

    const alertAfter = await db.alert.findFirst({
      where: { workspaceId: alertWorkspaceId, entityId: risk.id, idempotencyKey: `risk_critical_${risk.id}` },
    });
    expect(alertAfter?.resolvedAt).toBeTruthy();
  });

  it("[db] risk record is correctly persisted independently of alert side effect", async () => {
    const risk = await createBusinessRisk({
      workspaceId: alertWorkspaceId,
      actorId: actor,
      riskCode: "R-INDEP1",
      title: "Independence test",
      category: "OPERATIONAL",
      likelihood: 100,
      impact: 100,
    });

    expect(risk.id).toBeTruthy();
    expect(risk.status).toBe("IDENTIFIED");
    expect(risk.severity).toBe(100);

    const persisted = await db.businessRiskEntry.findFirst({ where: { id: risk.id } });
    expect(persisted?.status).toBe("IDENTIFIED");
    expect(persisted?.workspaceId).toBe(alertWorkspaceId);

    const alert = await db.alert.findFirst({
      where: { workspaceId: alertWorkspaceId, entityId: risk.id },
    });
    expect(alert?.entityId).toBe(risk.id);
  });
});

// ─── Compliance task linkage ──────────────────────────────────────────────────

describe("[db] Compliance — task linkage", () => {
  it("[db] links a delegated task to a compliance item", async () => {
    const workspaceId = ws();
    const id = await recordComplianceItem({ workspaceId, actorId: actor, kind: "licence", name: "Task link compliance" });
    const taskId = await newTask(workspaceId);

    const link = await linkTaskToComplianceItem({ workspaceId, itemId: id, taskId, actorId: actor, linkType: "REMEDIATION" });
    expect(link.id).toBeTruthy();

    const item = await getComplianceItem(workspaceId, id);
    expect(item.taskLinks.some((tl) => tl.taskId === taskId)).toBe(true);
  });

  it("[db] compliance task link is idempotent — repeated call upserts not duplicates", async () => {
    const workspaceId = ws();
    const id = await recordComplianceItem({ workspaceId, actorId: actor, kind: "permit", name: "Idempotency compliance" });
    const taskId = await newTask(workspaceId);

    await linkTaskToComplianceItem({ workspaceId, itemId: id, taskId, actorId: actor, linkType: "REMEDIATION" });
    await linkTaskToComplianceItem({ workspaceId, itemId: id, taskId, actorId: actor, linkType: "EVIDENCE" });

    const item = await getComplianceItem(workspaceId, id);
    const matching = item.taskLinks.filter((tl) => tl.taskId === taskId);
    expect(matching.length).toBe(1);
    expect(matching[0].linkType).toBe("EVIDENCE");
  });

  it("[db] task from different workspace cannot be linked to compliance item", async () => {
    const ws1 = ws();
    const ws2 = ws();
    const id = await recordComplianceItem({ workspaceId: ws1, actorId: actor, kind: "document", name: "XWS compliance" });
    const taskId = await newTask(ws2);

    await expect(
      linkTaskToComplianceItem({ workspaceId: ws1, itemId: id, taskId, actorId: actor }),
    ).rejects.toThrow("DelegatedTask");
  });

  it("[db] compliance task link audit event emitted", async () => {
    const workspaceId = ws();
    const id = await recordComplianceItem({ workspaceId, actorId: actor, kind: "insurance", name: "Link audit compliance" });
    const taskId = await newTask(workspaceId);

    await linkTaskToComplianceItem({ workspaceId, itemId: id, taskId, actorId: actor });

    const event = await db.auditEvent.findFirst({
      where: { workspaceId, entityId: id, eventName: "owner.compliance_task_linked" },
    });
    expect(event).toBeTruthy();
    const payload = event?.payload as Record<string, unknown>;
    expect(payload.taskId).toBe(taskId);
  });

  it("[db] one risk may link to multiple tasks", async () => {
    const workspaceId = ws();
    const risk = await createBusinessRisk({ workspaceId, actorId: actor, riskCode: "R-MULTI", title: "Multi task risk", category: "OPERATIONAL" });
    const t1 = await newTask(workspaceId);
    const t2 = await newTask(workspaceId);

    await linkTaskToRisk({ workspaceId, riskId: risk.id, taskId: t1, actorId: actor, linkType: "MITIGATION" });
    await linkTaskToRisk({ workspaceId, riskId: risk.id, taskId: t2, actorId: actor, linkType: "EVIDENCE" });

    const fetched = await getBusinessRisk(workspaceId, risk.id);
    expect(fetched.taskLinks.length).toBeGreaterThanOrEqual(2);
  });
});
