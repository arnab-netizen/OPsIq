import { describe, it, expect } from "vitest";
import { ingestBusinessState, type OwnerDomainProviders } from "@/services/owner-mode/owner-domain-ingestion";
import { runOwnerAdvice, commandCenterSummary } from "@/services/owner-mode/owner-advice-runtime.service";
import { caseToContext, runProductionValidation } from "@/behavioral-validation/whole-business/production-runner";
import { InMemoryLearningStore } from "@/behavioral-validation/learning-store";
import { learnFromFailure } from "@/behavioral-validation/learning-engine";
import { scoreAdvice } from "@/behavioral-validation/scorer";
import { emptyAdvise } from "@/behavioral-validation/advisor";
import { SEED_CASES } from "@/behavioral-validation/seed-cases";

const cash = SEED_CASES.find((c) => c.id === "A1")!;
const AT = "2026-06-29T00:00:00Z";

const dbFinance: OwnerDomainProviders = { finance_cash: () => ({ sourceType: "REAL_DB", confidence: "high", summary: "finance from DB", realData: true }) };

describe("production runtime — per-domain ingestion seam", () => {
  it("reads DB/service-backed finance state when a provider is wired", async () => {
    const store = new InMemoryLearningStore();
    const r = await runOwnerAdvice({ workspaceId: "ws-1", context: caseToContext(cash) }, { store, providers: dbFinance });
    expect(r.ingestion.byDomain.finance_cash.sourceType).toBe("REAL_DB");
  });

  it("reads capacity state from the business context", () => {
    const ctx = caseToContext(SEED_CASES.find((c) => c.flags.capacityRisk)!);
    const report = ingestBusinessState(ctx);
    expect(["REAL_DB", "REAL_DB_SERVICE", "REAL_RUNTIME_SERVICE", "CONTEXT_PROVIDED"]).toContain(report.byDomain.equipment_capacity.sourceType);
  });

  it("reads proof/compliance state from context flags", () => {
    const ctx = caseToContext(SEED_CASES.find((c) => c.flags.complianceRisk)!);
    expect(ingestBusinessState(ctx).byDomain.compliance_proof.sourceType).not.toBe("DATA_SOURCE_MISSING");
  });

  it("reads learning artifacts as a connected source when present", async () => {
    const store = new InMemoryLearningStore();
    await learnFromFailure(cash, scoreAdvice(cash, emptyAdvise()), store, { workspaceId: "ws-1", actor: "t", at: AT });
    const r = await runOwnerAdvice({ workspaceId: "ws-1", context: caseToContext(cash) }, { store });
    expect(r.learningApplied).toBe(true);
    expect(r.ingestion.byDomain.learning_playbooks.sourceType).toBe("REAL_DB_SERVICE");
  });

  it("includes vendor/delivery state when the context signals them", () => {
    const vendorCtx = { ...caseToContext(cash), businessType: "grocery with supplier", messyFacts: ["supplier raised prices; bulk scheme offered"] };
    const r = ingestBusinessState(vendorCtx);
    expect(r.byDomain.vendor_supplier.sourceType).toBe("CONTEXT_PROVIDED");
  });

  it("marks a missing source explicitly and lowers confidence (no fabrication)", () => {
    const report = ingestBusinessState(caseToContext(cash));
    expect(report.byDomain.sop_checklist.sourceType).toBe("DATA_SOURCE_MISSING");
    expect(report.dataSourceMissing.length).toBeGreaterThan(0);
    // a missing CRITICAL source forces low confidence + blocks readiness
    const missingCritical: OwnerDomainProviders = { finance_cash: () => ({ sourceType: "DATA_SOURCE_MISSING", confidence: "none", summary: "no finance source" }) };
    const bad = ingestBusinessState(caseToContext(cash), { providers: missingCritical });
    expect(bad.criticalDomainsAllReal).toBe(false);
    expect(bad.overallConfidence).toBe("low");
  });

  it("a missing critical source lowers the runtime's stated data confidence", async () => {
    const store = new InMemoryLearningStore();
    const missingCritical: OwnerDomainProviders = { working_capital: () => ({ sourceType: "DATA_SOURCE_MISSING", confidence: "none", summary: "no WC source" }) };
    const r = await runOwnerAdvice({ workspaceId: "ws-1", context: caseToContext(cash) }, { store, providers: missingCritical });
    expect(r.ingestion.criticalDomainsAllReal).toBe(false);
    expect(r.plan.domainHealthTable.length).toBeGreaterThan(0); // still produces a plan, but flagged
  });

  it("enforces workspace scope (no cross-workspace leakage through the runtime)", async () => {
    const store = new InMemoryLearningStore();
    await learnFromFailure(cash, scoreAdvice(cash, emptyAdvise()), store, { workspaceId: "ws-1", actor: "t", at: AT });
    const theirs = await runOwnerAdvice({ workspaceId: "ws-2", context: caseToContext(cash) }, { store });
    expect(theirs.learningApplied).toBe(false);
  });

  it("the command center summary reflects the production runtime output", async () => {
    const store = new InMemoryLearningStore();
    const r = await runOwnerAdvice({ workspaceId: "ws-1", context: caseToContext(cash) }, { store });
    const summary = commandCenterSummary(r);
    expect(summary.topPriority).toBe(r.plan.highestPriorityConstraint);
    expect(summary.collectiveScore).toBe(r.collective.total);
  });

  it("production validation runs through the runtime context, not harness fixtures only", async () => {
    const r = await runProductionValidation("production-smoke");
    expect(r.productionRuntimeScore).toBeGreaterThan(0);
  }, 60000);

  it("production validation mode records provider status — harness (no DB providers) is NOT real-backed", async () => {
    const r = await runProductionValidation("production-smoke");
    // honest: without wired DB providers the corpus is context-only, so the readiness gate is false
    expect(r.criticalDomainsRealProviderBacked).toBe(false);
  }, 60000);
});
