/**
 * Structured External Opportunity Intake + Operating Layer — real-business DB simulation (laundry).
 *
 * Proves the LIVE structured intake path against real Postgres: a real owner submits competitor / B2B /
 * government-tender / manual / grant / expired-tender / high-cash-tender / irrelevant signals via the
 * governed service; they persist + audit; getOwnerNowView then surfaces the hardened operating layer —
 * clustering (duplicates collapsed), tender bid/no-bid gates (missing eligibility/documents/cost, expired,
 * high-cash → owner review, never auto-submittable), weak win-readiness from missing proof pack, prep
 * checklists, next-action ownership, repeated-blocker capability recommendations, cockpit top-only, no
 * scale/fabrication — with workspace isolation and a clean workspace fabricating nothing. TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";
import { submitExternalOpportunitySignal, type IntakeDb, type IntakeDeps } from "@/services/owner-mode/external-opportunity-intake.service";
import type { ExternalOpportunitySignalSubmission } from "@/domain/owner-mode/external-opportunity-intake";

const owner = randomUUID();
const wsL = randomUUID();
const wsClean = randomUUID();
const bizL = randomUUID();
const NOW = Date.now();
const DAY = 86_400_000;
const NO_FRAUD = /\b(fraud|theft|thief|negligent|negligence|lazy|dishonest)\b/i;
const NO_HR = /\b(fire|fired|firing|terminate|termination|payroll|salary|docking|discipline|disciplinary|punish)\b/i;

const deps: IntakeDeps = { db: db as unknown as IntakeDb, uuid: () => randomUUID(), now: () => new Date() };
const submit = (workspaceId: string, submission: ExternalOpportunitySignalSubmission) =>
  submitExternalOpportunitySignal({ workspaceId, actorId: owner, actorRole: "owner", submission }, deps);

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Structured External Opportunity Intake (laundry)", () => {
  beforeAll(async () => {
    await db.user.create({ data: { id: owner, email: `eoi-intake-${owner}@laundry.test`, name: "Owner", isActive: true, updatedAt: new Date(NOW) } });
    for (const id of [wsL, wsClean]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `eoi-in-${id.slice(0, 8)}`, createdBy: owner } });
    }
    await db.clientAccount.create({ data: { id: wsL, workspaceId: wsL, name: "Sparkle Laundry Client", updatedAt: new Date(NOW) } });
    await db.ownerBusiness.create({ data: { id: bizL, workspaceId: wsL, name: "Sparkle Laundry", businessType: "laundry", updatedAt: new Date(NOW) } });

    // 1-2. Competitor review-gap cluster (two similar signals → duplicate collapses).
    const competitor: ExternalOpportunitySignalSubmission = {
      rawSignalType: "COMPETITOR_REVIEW_GAP", rawDescription: "Rival laundry gets 1-star reviews for late delivery",
      extractedBusinessNeed: "reliable same-day delivery", targetCustomerSegment: "busy professionals", locationContext: "local",
      sourceQuality: "PUBLIC_SOURCE_UNVERIFIED", evidenceRefs: ["review-url-1"], hasUnitEconomics: true, dedupeKey: "competitor-delivery-gap",
    };
    await submit(wsL, competitor);
    await submit(wsL, { ...competitor, rawDescription: "Another rival review complains about delivery", sourceRef: "review-url-2", idempotencyKey: "comp-2" });
    // 3. B2B institutional demand — missing unit economics + no proof pack.
    await submit(wsL, { rawSignalType: "B2B_DEMAND_SIGNAL", rawDescription: "A hotel asked about weekly towel laundering", extractedBusinessNeed: "weekly towel contract", targetCustomerSegment: "hotels", sourceQuality: "OWNER_OBSERVED", hasUnitEconomics: false, evidenceRefs: [] });
    // 4. Government tender — missing eligibility + documents + cost.
    await submit(wsL, { rawSignalType: "GOVERNMENT_TENDER", rawDescription: "Municipal hospital linen tender published", extractedBusinessNeed: "supply hospital linen", targetCustomerSegment: "city hospital", deadlineAt: new Date(NOW + 20 * DAY).toISOString(), sourceQuality: "PUBLIC_SOURCE_UNVERIFIED", hasUnitEconomics: false });
    // 5. Owner manual observation — weak evidence.
    await submit(wsL, { rawSignalType: "MANUAL_OWNER_OBSERVATION", rawDescription: "Maybe offer ironing-only service", sourceQuality: "LOW_CONFIDENCE", hasUnitEconomics: false, missingData: ["demand evidence", "pricing"] });
    // 6. Grant/scheme — missing eligibility.
    await submit(wsL, { rawSignalType: "GRANT_OR_SCHEME_SIGNAL", rawDescription: "MSME equipment subsidy scheme", extractedBusinessNeed: "subsidised dryer", sourceQuality: "PUBLIC_SOURCE_UNVERIFIED", hasUnitEconomics: false, missingData: ["scheme eligibility"] });
    // 7. Expired tender — deadline in the past.
    await submit(wsL, { rawSignalType: "PUBLIC_PROCUREMENT_NOTICE", rawDescription: "Old procurement notice", extractedBusinessNeed: "supply linen", eligibilityRequirements: "GST + turnover", requiredDocuments: ["GST cert"], deadlineAt: new Date(NOW - 2 * DAY).toISOString(), sourceQuality: "PUBLIC_SOURCE_UNVERIFIED" });
    // 8. Corporate vendor tender — everything known but HIGH cash exposure → owner review.
    await submit(wsL, { rawSignalType: "CORPORATE_VENDOR_OPPORTUNITY", rawDescription: "Corporate campus linen vendor slot", extractedBusinessNeed: "campus linen", eligibilityRequirements: "vendor onboarding form", requiredDocuments: ["GST", "PAN"], complianceRequirements: "standard vendor terms", tenderOrProcurementValue: 500000, hasUnitEconomics: true, cashExposureBand: "HIGH", deadlineAt: new Date(NOW + 25 * DAY).toISOString(), sourceQuality: "VERIFIED_SOURCE" });
  });

  afterAll(async () => {
    await db.externalOpportunitySignal.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.auditEvent.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.ownerBusiness.deleteMany({ where: { id: bizL } });
    await db.clientAccount.deleteMany({ where: { id: wsL } });
    await db.workspace.deleteMany({ where: { id: { in: [wsL, wsClean] } } });
    await db.user.deleteMany({ where: { id: owner } });
  });

  it("[db] persists submitted signals with audit; duplicate competitor signals collapse into one cluster", async () => {
    const rows = await db.externalOpportunitySignal.findMany({ where: { workspaceId: wsL } });
    expect(rows.length).toBe(8);
    const audits = await db.auditEvent.findMany({ where: { workspaceId: wsL, eventName: "owner.opportunity_signal_submitted" } });
    expect(audits.length).toBe(8);
    const out = await getOwnerNowView(wsL, bizL);
    const op = out.opportunityOperating;
    expect(op).not.toBeNull();
    const competitorCluster = op!.clusters.find((c) => c.duplicateCount >= 1);
    expect(competitorCluster).toBeDefined();
  });

  it("[db] tender gates: missing eligibility→collect, expired→do-not-bid, high-cash→owner review; never auto-submit", async () => {
    const out = await getOwnerNowView(wsL, bizL);
    const op = out.opportunityOperating!;
    const tenders = op.opportunities.filter((o) => o.isTender);
    expect(tenders.length).toBeGreaterThanOrEqual(3);
    expect(tenders.every((t) => t.tenderReadiness!.submissionAllowed === false)).toBe(true);
    const gov = tenders.find((t) => t.rawSignalType === "GOVERNMENT_TENDER");
    expect(gov!.tenderReadiness!.bidDecision).toBe("COLLECT_ELIGIBILITY_DATA");
    const expired = tenders.find((t) => t.rawSignalType === "PUBLIC_PROCUREMENT_NOTICE");
    expect(expired!.freshness).toBe("EXPIRED");
    expect(expired!.tenderReadiness!.bidDecision).toBe("DO_NOT_BID");
    const highCash = tenders.find((t) => t.rawSignalType === "CORPORATE_VENDOR_OPPORTUNITY");
    expect(highCash!.tenderReadiness!.bidDecision).toBe("OWNER_REVIEW_REQUIRED");
    expect(highCash!.nextActionOwner).toBe("OWNER");
  });

  it("[db] B2B with no proof pack has weak win-readiness + a prep checklist; repeated blockers → capability rec", async () => {
    const out = await getOwnerNowView(wsL, bizL);
    const op = out.opportunityOperating!;
    const b2b = op.opportunities.find((o) => o.rawSignalType === "B2B_DEMAND_SIGNAL")!;
    expect(b2b.winReadiness).toBe("WEAK");
    expect(b2b.proofPackRequirements.length).toBeGreaterThan(0);
    expect(b2b.prepChecklist).not.toBeNull();
    expect(["OWNER", "MANAGER", "STAFF", "OPSIQ_DRAFT", "EXTERNAL_ADVISOR", "NO_ACTION"]).toContain(b2b.nextActionOwner);
    // Missing unit economics recurs across B2B + tenders + grant → a capability recommendation is surfaced.
    expect(op.capabilityRecommendations.some((c) => /unit economics|checklist|proof-pack|eligibility/i.test(c))).toBe(true);
    // Cockpit surfaces one top opportunity; no scale/fabrication anywhere.
    expect(op.topOpportunity).not.toBeNull();
    const json = JSON.stringify(op).toLowerCase();
    expect(json).not.toMatch(NO_FRAUD);
    expect(json).not.toMatch(NO_HR);
    expect(json).not.toMatch(/\bscore"|hidden\s*score/);
    expect(json).not.toMatch(/win probability|guaranteed|profit guarantee|ready to scale/);
    expect(json).not.toMatch(/[$£€]\s?\d/);
  });

  it("[db] workspace isolation: a clean workspace fabricates no operating layer and leaks nothing", async () => {
    const out = await getOwnerNowView(wsClean);
    expect(out.opportunityOperating).toBeNull();
    const rows = await db.externalOpportunitySignal.findMany({ where: { workspaceId: wsClean } });
    expect(rows).toHaveLength(0);
  });

  it("[db] an identical resubmit is idempotent (no duplicate row)", async () => {
    const before = await db.externalOpportunitySignal.count({ where: { workspaceId: wsL } });
    const r = await submit(wsL, { rawSignalType: "B2B_DEMAND_SIGNAL", rawDescription: "A hotel asked about weekly towel laundering", extractedBusinessNeed: "weekly towel contract", targetCustomerSegment: "hotels", sourceQuality: "OWNER_OBSERVED", hasUnitEconomics: false, evidenceRefs: [] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.deduped).toBe(true);
    const after = await db.externalOpportunitySignal.count({ where: { workspaceId: wsL } });
    expect(after).toBe(before);
  });
});
