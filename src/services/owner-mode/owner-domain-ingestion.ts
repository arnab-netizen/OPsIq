/**
 * Slice 3 — per-domain ingestion seam for the production owner-advice runtime.
 *
 * Honesty boundary: this is the SEAM through which real DB/service-backed domain state is fed into the
 * runtime. Where a domain's state is genuinely derivable from the supplied business context (real
 * numbers/flags for one workspace), it is marked `context_provided`. Where a real source exists it is
 * injected as a provider (`db`/`service`). Where there is NO real source yet, the domain is marked
 * `DATA_SOURCE_MISSING` — we never fabricate it, and a missing critical source lowers confidence and
 * blocks readiness. Production wires the existing owner-mode services as providers; tests inject fakes
 * to exercise the seam without a live DB.
 */
import type { OwnerBusinessContext } from "./owner-advice-runtime.service";
import type { LearningStore } from "@/behavioral-validation/learning-store";

export const INGESTION_DOMAINS = [
  "finance_cash", "margin_pricing", "working_capital", "operations", "sop_checklist", "staff_training",
  "equipment_capacity", "customer_reputation", "marketing_sales", "opportunity_contract", "vendor_supplier",
  "delivery_logistics", "compliance_proof", "owner_workload_memory", "learning_playbooks", "location_stage",
] as const;
export type IngestionDomain = (typeof INGESTION_DOMAINS)[number];

/** Domains whose absence must block readiness (a critical domain on fake/missing data is unsafe). */
export const CRITICAL_INGESTION_DOMAINS: IngestionDomain[] = [
  "finance_cash", "margin_pricing", "working_capital", "equipment_capacity", "compliance_proof",
  "owner_workload_memory", "opportunity_contract", "learning_playbooks", "location_stage",
];

export type DomainSourceType = "db" | "service" | "context_provided" | "DATA_SOURCE_MISSING";
export type Confidence = "high" | "medium" | "low" | "none";

export interface DomainState {
  sourceType: DomainSourceType;
  confidence: Confidence;
  summary: string;
}

export type DomainProvider = (ctx: OwnerBusinessContext) => DomainState | null;
export type OwnerDomainProviders = Partial<Record<IngestionDomain, DomainProvider>>;

export interface DomainIngestionReport {
  byDomain: Record<IngestionDomain, DomainState>;
  dataSourceMissing: IngestionDomain[];
  criticalDomainsAllReal: boolean; // every critical ingestion domain has db/service/context_provided data
  overallConfidence: Confidence;
}

const num = (ctx: OwnerBusinessContext, k: string): boolean => typeof ctx.numbers[k] === "number";

/** Which domains the supplied real business context can populate on its own (no extra source needed). */
function contextDerived(ctx: OwnerBusinessContext): Partial<Record<IngestionDomain, DomainState>> {
  const cp = (summary: string, confidence: Confidence = "medium"): DomainState => ({ sourceType: "context_provided", confidence, summary });
  const out: Partial<Record<IngestionDomain, DomainState>> = {};
  if (ctx.riskFlags.cashRisk || num(ctx, "cash") || ctx.decisionCategory === "cash_margin_working_capital") out.finance_cash = cp("cash/finance state from business context");
  if (ctx.decisionCategory === "marketing_opportunity_contract" || num(ctx, "consideredRate") || num(ctx, "fullyLoadedCost")) { out.margin_pricing = cp("pricing/margin from context"); out.opportunity_contract = cp("opportunity terms from context"); }
  if (ctx.riskFlags.cashRisk || num(ctx, "paymentTermsDays") || num(ctx, "receivables")) out.working_capital = cp("working-capital signals from context");
  out.operations = cp("operations signals from context");
  if (ctx.riskFlags.capacityRisk || num(ctx, "reliableKgPerDay")) out.equipment_capacity = cp("capacity from context");
  if (ctx.riskFlags.capacityRisk || /complaint|rework|quality/i.test(ctx.messyFacts.join(" "))) out.customer_reputation = cp("quality/reputation from context");
  if (ctx.decisionCategory === "marketing_opportunity_contract") out.marketing_sales = cp("marketing/sales from context");
  if (/vendor|supplier|invoice|bulk/i.test(`${ctx.businessType} ${ctx.messyFacts.join(" ")}`)) out.vendor_supplier = cp("vendor signals from context");
  if (/deliver|rider|fleet|route|rto|cod/i.test(`${ctx.businessType} ${ctx.messyFacts.join(" ")}`)) out.delivery_logistics = cp("delivery signals from context");
  if (ctx.riskFlags.complianceRisk || ctx.riskFlags.hostile) out.compliance_proof = cp("compliance/proof flags from context");
  out.owner_workload_memory = cp("owner-workload/approval signals from context");
  out.location_stage = cp("location + inferred business stage from context", "high");
  return out;
}

export function ingestBusinessState(
  ctx: OwnerBusinessContext,
  opts: { providers?: OwnerDomainProviders; learningStore?: LearningStore; hasLearningArtifacts?: boolean } = {},
): DomainIngestionReport {
  const providers = opts.providers ?? {};
  const derived = contextDerived(ctx);
  const byDomain = {} as Record<IngestionDomain, DomainState>;

  for (const d of INGESTION_DOMAINS) {
    const provided = providers[d]?.(ctx) ?? null;
    if (provided) {
      byDomain[d] = provided;
    } else if (d === "learning_playbooks") {
      byDomain[d] = opts.hasLearningArtifacts
        ? { sourceType: "service", confidence: "high", summary: "learning artifacts/playbooks from the persistent store" }
        : { sourceType: opts.learningStore ? "service" : "DATA_SOURCE_MISSING", confidence: opts.learningStore ? "medium" : "none", summary: opts.learningStore ? "learning store connected (no in-scope artifact yet)" : "no learning source" };
    } else if (derived[d]) {
      byDomain[d] = derived[d]!;
    } else {
      byDomain[d] = { sourceType: "DATA_SOURCE_MISSING", confidence: "none", summary: "no real DB/service source wired for this domain yet" };
    }
  }

  const dataSourceMissing = INGESTION_DOMAINS.filter((d) => byDomain[d].sourceType === "DATA_SOURCE_MISSING");
  const criticalDomainsAllReal = CRITICAL_INGESTION_DOMAINS.every((d) => byDomain[d].sourceType !== "DATA_SOURCE_MISSING");
  const overallConfidence: Confidence = !criticalDomainsAllReal ? "low" : dataSourceMissing.length > 4 ? "medium" : "high";

  return { byDomain, dataSourceMissing, criticalDomainsAllReal, overallConfidence };
}
