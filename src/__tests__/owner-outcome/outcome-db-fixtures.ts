/** DB fixtures for Owner Outcome Persistence v1 tests (real Postgres). Not a test file. */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";

export const NOW = new Date("2026-07-20T12:00:00Z");
let seq = 0;
export const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

type Loose = Record<string, (a: unknown) => Promise<unknown>>;
const t = (name: string): Loose => (db as unknown as Record<string, Loose>)[name];

export interface Tenant {
  ws: string;
  actor: string;
  biz: string;
  bizB: string; // a second business inside the SAME workspace
}

export async function seedUser(): Promise<string> {
  const id = randomUUID();
  await db.user.create({ data: { id, email: `outcome-${id}@test.local`, name: "Outcome Test", isActive: true, updatedAt: new Date() } });
  return id;
}

export async function seedTenant(): Promise<Tenant> {
  const ws = randomUUID();
  const actor = await seedUser();
  await db.clientAccount.create({ data: { id: ws, name: `Outcome WS ${ws}`, status: "active", visibility: "internal", updatedAt: new Date() } });
  const mk = (name: string) =>
    db.ownerBusiness.create({ data: { id: randomUUID(), workspaceId: ws, name, businessType: "generic_local_service", currency: "INR", createdBy: actor } });
  const biz = (await mk("Outcome Biz A")).id;
  const bizB = (await mk("Outcome Biz B")).id;
  return { ws, actor, biz, bizB };
}

export async function seedFinanceCycle(
  tn: { ws: string; biz: string },
  o: { periodEnd: Date; generatedAt: Date; state?: string; findings?: Array<{ code: string; severity?: string }>; supersededById?: string | null; sequence?: number }
): Promise<{ cycleId: string; snapshotId: string; findingIds: Record<string, string> }> {
  const snapshotId = randomUUID();
  await t("ownerFinancialSnapshot").create({
    data: {
      id: snapshotId, workspaceId: tn.ws, businessId: tn.biz, periodStart: new Date(o.periodEnd.getTime() - 30 * 86_400_000 - ++seq), periodEnd: o.periodEnd,
      currency: "INR", dataConfidenceScore: 0.9, missingCriticalData: [], supersededById: o.supersededById ?? null,
    },
  });
  const cycleId = randomUUID();
  await t("ownerFinanceCycle").create({
    data: {
      id: cycleId, workspaceId: tn.ws, businessId: tn.biz, snapshotId, sequenceNumber: o.sequence ?? ++seq, status: "open",
      overallHealthScore: 60, survivalRiskScore: 40, growthOpportunityScore: 40, dataConfidenceScore: 90, survivalState: o.state ?? "WATCH", generatedAt: o.generatedAt,
    },
  });
  const findingIds: Record<string, string> = {};
  for (const f of o.findings ?? []) {
    const id = randomUUID();
    findingIds[f.code] = id;
    await t("ownerFinanceFinding").create({
      data: {
        id, workspaceId: tn.ws, businessId: tn.biz, cycleId, findingType: "margin", code: f.code, title: `Finding ${f.code}`, summary: "s",
        sourceMetric: "net_margin_pct", severity: f.severity ?? "medium", confidence: 0.8, impactScore: 50, urgencyScore: 50, evidence: [], missingData: [],
      },
    });
  }
  return { cycleId, snapshotId, findingIds };
}

export async function seedFinanceAction(
  tn: { ws: string; biz: string },
  o: { cycleId: string; findingCode?: string; status?: string; completedAt?: Date | null; metric?: string; timeframeDays?: number; title?: string }
): Promise<{ id: string; candidateId: string }> {
  const id = randomUUID();
  await t("ownerFinanceAction").create({
    data: {
      id, workspaceId: tn.ws, businessId: tn.biz, cycleId: o.cycleId, recommendationCode: "REC_RIGHT_SIZE_FIXED_COSTS", findingCode: o.findingCode ?? "FIN_FIXED_COST_PRESSURE",
      title: o.title ?? "Right-size fixed costs", description: "Reduce fixed costs", ownerRole: "owner", status: o.status ?? "proposed",
      priorityScore: 70, effortScore: 30, expectedImpactScore: 60, confidence: 0.8, verificationMetric: o.metric ?? "net_margin_pct",
      verificationMethod: "recompute", expectedTimeframeDays: o.timeframeDays ?? 14, completedAt: o.completedAt ?? null,
    },
  });
  return { id, candidateId: `domain_action:finance:${id}` };
}

export async function seedFinanceVerification(
  tn: { ws: string; biz: string },
  o: { actionId: string; before: number | null; after: number | null; direction?: string; target?: number | null; status?: string; verifiedAt?: Date | null; baselineSource?: string | null; createdAt?: Date }
): Promise<string> {
  const id = randomUUID();
  await t("ownerFinanceVerification").create({
    data: {
      id, workspaceId: tn.ws, businessId: tn.biz, actionId: o.actionId, verificationMetric: "net_margin_pct", beforeValue: o.before, afterValue: o.after,
      baselineSource: o.baselineSource === undefined ? "OWNER_REPORTED" : o.baselineSource, targetDirection: o.direction ?? "up", targetValue: o.target ?? null,
      status: o.status ?? "verified_improved", confidence: 0.8, evidence: ["fixture"], verifiedAt: o.verifiedAt === undefined ? o.createdAt ?? NOW : o.verifiedAt,
      ...(o.createdAt ? { createdAt: o.createdAt } : {}),
    },
  });
  return id;
}

export async function seedProcessTask(
  tn: { ws: string; biz: string | null },
  o: { taskKey?: string; status?: string; completedAt?: Date | null; targetMetricName?: string | null; targetValue?: number | null; outcomeId?: string | null } = {}
): Promise<{ id: string; taskKey: string }> {
  const id = randomUUID();
  const taskKey = o.taskKey ?? `pc:${tn.biz ?? "ws"}:${id}`;
  await t("processExecutionTask").create({
    data: {
      id, workspaceId: tn.ws, businessId: tn.biz, taskKey, sourceFamily: "PROCESS_CORRECTION", sourceFindingKey: `finding:${id}`, executionRoute: "owner",
      actionOwner: "owner", approvalLevel: "NONE", status: o.status ?? "PROPOSED", requiredEvidence: [], evidenceRefs: [], completionCriteria: "done",
      reassessmentTrigger: "recheck", riskIfIgnored: "risk", ownerVisibleSummary: "summary", severity: "medium", priorityRank: 1,
      targetMetricName: o.targetMetricName ?? null, targetValue: o.targetValue ?? null, completedAt: o.completedAt ?? null, outcomeId: o.outcomeId ?? null,
    },
  });
  return { id, taskKey };
}

export async function seedActionOutcome(
  tn: { ws: string; biz: string },
  o: { taskKey?: string; status?: string; metric?: string | null; before?: number | null; after?: number | null; verifiedBy?: string | null; classification?: string | null; periodEnd?: Date | null; external?: boolean; window?: number | null }
): Promise<string> {
  const row = (await t("ownerActionOutcome").create({
    data: {
      workspaceId: tn.ws, businessId: tn.biz, outcomeStatus: o.status ?? "worked", taskKey: o.taskKey ?? null, taskType: o.taskKey ? "process_execution" : null,
      actualMetricName: o.metric ?? null, beforeValue: o.before ?? null, afterValue: o.after ?? null, measurementPeriodEnd: o.periodEnd ?? null,
      evidenceQuality: "moderate", externalEventFlag: o.external ?? false, verifiedByActorId: o.verifiedBy ?? null,
      verificationClassification: o.classification ?? null, verifiedAt: o.classification ? NOW : null, observationWindowDays: o.window ?? null,
    },
  })) as { id: string };
  return row.id;
}

export async function seedComplianceItem(tn: { ws: string; biz: string | null }, createdBy: string): Promise<{ id: string; candidateId: string }> {
  const id = randomUUID();
  await t("ownerComplianceItem").create({
    data: { id, workspaceId: tn.ws, businessId: tn.biz, kind: "licence", name: "Trade licence", status: "active", createdByUserId: createdBy, expiresAt: daysAgo(-30) },
  });
  return { id, candidateId: `compliance_item:${id}` };
}

type RecoveryTenant = { ws: string; biz: string };
/** Recovery has its own (older) column shapes: metricToMove / baselineValue / direction on the action; metric / baselineValue on the verification. */
export async function seedRecoveryAction(
  tn: RecoveryTenant,
  o: { status?: string; completedAt?: Date | null; direction?: string; windowDays?: number; verification?: { baseline: number; after: number | null; target: number; direction: string; verifiedAt: Date; status?: string } }
): Promise<{ id: string; candidateId: string; verificationId: string | null }> {
  const snapId = randomUUID();
  await t("ownerMetricSnapshot").create({ data: { id: snapId, businessId: tn.biz, workspaceId: tn.ws, periodStart: new Date(NOW.getTime() - 30 * 86_400_000 - ++seq), periodEnd: NOW, currency: "INR" } });
  const cycleId = randomUUID();
  await t("recoveryCycle").create({ data: { id: cycleId, businessId: tn.biz, workspaceId: tn.ws, snapshotId: snapId, cycleNumber: ++seq, healthStatus: "watch", healthScore: 50 } });
  const id = randomUUID();
  await t("recoveryAction").create({
    data: {
      id, cycleId, businessId: tn.biz, workspaceId: tn.ws, title: "Collect overdue receivables", description: "d", assignedToRole: "owner", priority: "high", status: o.status ?? "completed",
      expectedOutcome: "less overdue", metricToMove: "overdue_receivables", baselineValue: 100, targetValue: 50, verificationWindowDays: o.windowDays ?? 1, effort: "low", confidence: 0.8,
      completionCriteria: "paid", direction: o.direction ?? "down", completedAt: o.completedAt === undefined ? daysAgo(30) : o.completedAt,
    },
  });
  let verificationId: string | null = null;
  if (o.verification) {
    verificationId = randomUUID();
    await t("recoveryVerification").create({
      data: {
        id: verificationId, actionId: id, cycleId, workspaceId: tn.ws, metric: "overdue_receivables", baselineValue: o.verification.baseline, targetValue: o.verification.target,
        afterValue: o.verification.after, direction: o.verification.direction, verificationWindowDays: 1, status: o.verification.status ?? "verified_improved", verifiedAt: o.verification.verifiedAt,
      },
    });
  }
  return { id, candidateId: `domain_action:recovery:${id}`, verificationId };
}
