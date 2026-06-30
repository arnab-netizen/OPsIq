/**
 * Owner-pilot INPUT CATALOG — the single source of truth for the owner-facing data categories.
 *
 * Onboarding, the dynamic input-guidance layer, the readiness score, the manual-entry/import paths,
 * and the pilot rehearsal packs ALL read this catalog. There is exactly one definition of "what data
 * categories exist, why each is needed, which decision and which confidence domain it affects, the
 * expected confidence gain, the recommendation that becomes unsafe without it, owner effort, and the
 * privacy note". No second taxonomy is invented anywhere.
 *
 * Each category maps to a single canonical ingestion domain (`IngestionDomain`) so guidance and the
 * readiness score never recompute confidence upward — they only READ the proven
 * `ingestBusinessState`/`assessInputQuality` outputs and translate them into owner language.
 *
 * Pure module. No DB, no Date.now, no AI.
 */
import type { IngestionDomain } from "@/services/owner-mode/owner-domain-ingestion";
import { CRITICAL_INGESTION_DOMAINS } from "@/services/owner-mode/owner-domain-ingestion";

/** The 20 owner-facing data categories from the pilot-readiness contract (section 3). */
export type OwnerInputCategory =
  | "revenue_sales"
  | "expenses"
  | "fixed_costs"
  | "payroll"
  | "staff_attendance"
  | "staff_rota"
  | "complaints_reviews"
  | "customer_count"
  | "delivery_records"
  | "vendor_invoices"
  | "b2b_contracts"
  | "equipment_logs"
  | "sops_checklists"
  | "staff_training"
  | "marketing"
  | "cash_debt"
  | "proof_completion"
  | "tax_compliance"
  | "inventory_stock"
  | "branch_records";

export const OWNER_INPUT_CATEGORIES: readonly OwnerInputCategory[] = [
  "revenue_sales", "expenses", "fixed_costs", "payroll", "staff_attendance", "staff_rota",
  "complaints_reviews", "customer_count", "delivery_records", "vendor_invoices", "b2b_contracts",
  "equipment_logs", "sops_checklists", "staff_training", "marketing", "cash_debt", "proof_completion",
  "tax_compliance", "inventory_stock", "branch_records",
] as const;

export type EffortLevel = "low" | "medium" | "high";
export type GainLevel = "high" | "medium" | "low";

export interface OwnerInputCategoryMeta {
  category: OwnerInputCategory;
  /** Plain owner label. */
  label: string;
  /** 1 — what data is needed (the label) + 2 — why it is needed. */
  why: string;
  /** 3 — which business decision it affects. */
  decisionAffected: string;
  /** 4 — which domain confidence it affects (canonical ingestion domain — one source of truth). */
  confidenceDomain: IngestionDomain;
  /** 5 — expected confidence improvement when supplied. */
  expectedConfidenceGain: GainLevel;
  /** 6 — recommendation that may be wrong / unsafe if it is missing. */
  recommendationAtRiskIfMissing: string;
  /** 11 — owner effort required to supply it. */
  ownerEffort: EffortLevel;
  /** 12 — privacy note. */
  privacyNote: string;
}

/**
 * The catalog. `confidenceDomain` is the ONLY link to the confidence engine; nothing here invents a
 * confidence number — guidance reads the real `DomainState` for that domain.
 */
export const INPUT_CATALOG: Record<OwnerInputCategory, OwnerInputCategoryMeta> = {
  revenue_sales: {
    category: "revenue_sales", label: "Revenue / sales records",
    why: "Your sales totals are needed to compute margin, cash runway, and survival risk.",
    decisionAffected: "pricing, cash survival, and whether you can afford to grow",
    confidenceDomain: "finance_cash", expectedConfidenceGain: "high",
    recommendationAtRiskIfMissing: "Any pricing, discount, or growth move could be wrong without real revenue.",
    ownerEffort: "low", privacyNote: "Stored against your business only; never shared across businesses or workspaces.",
  },
  expenses: {
    category: "expenses", label: "Expense records",
    why: "Your variable costs are needed to know if work is actually profitable.",
    decisionAffected: "margin, cost control, and which work to stop",
    confidenceDomain: "margin_pricing", expectedConfidenceGain: "high",
    recommendationAtRiskIfMissing: "A 'cut costs' or 'raise price' call can backfire without real expenses.",
    ownerEffort: "low", privacyNote: "Business-scoped; visible only inside your workspace.",
  },
  fixed_costs: {
    category: "fixed_costs", label: "Rent / utilities / fixed costs",
    why: "Fixed costs separate structural burn from variable cost so we can size your runway.",
    decisionAffected: "break-even, cash runway, and lease/scale decisions",
    confidenceDomain: "finance_cash", expectedConfidenceGain: "medium",
    recommendationAtRiskIfMissing: "Break-even and runway estimates can be optimistic without fixed costs.",
    ownerEffort: "low", privacyNote: "Business-scoped financial record.",
  },
  payroll: {
    category: "payroll", label: "Payroll / staff cost",
    why: "Payroll is needed to judge whether staffing is sustainable against revenue.",
    decisionAffected: "staffing, payroll affordability, and hiring/firing timing",
    confidenceDomain: "margin_pricing", expectedConfidenceGain: "medium",
    recommendationAtRiskIfMissing: "Hiring or rota changes can be unaffordable without payroll.",
    ownerEffort: "low", privacyNote: "Sensitive staff cost; internal-only, never client-visible.",
  },
  staff_attendance: {
    category: "staff_attendance", label: "Staff attendance / output",
    why: "Attendance and output show real capacity and where work actually gets done.",
    decisionAffected: "capacity, delegation, and accountability",
    confidenceDomain: "equipment_capacity", expectedConfidenceGain: "medium",
    recommendationAtRiskIfMissing: "Capacity and delegation advice can over-promise without attendance.",
    ownerEffort: "medium", privacyNote: "Internal-only operational record.",
  },
  staff_rota: {
    category: "staff_rota", label: "Staff rota / schedule",
    why: "The rota shows whether you have cover for the work you are taking on.",
    decisionAffected: "capacity feasibility and accepting new work",
    confidenceDomain: "operations", expectedConfidenceGain: "low",
    recommendationAtRiskIfMissing: "Accepting work can exceed real cover without a rota.",
    ownerEffort: "medium", privacyNote: "Internal-only scheduling record.",
  },
  complaints_reviews: {
    category: "complaints_reviews", label: "Customer complaints / reviews",
    why: "Complaints and reviews are needed to see reputation and quality risk early.",
    decisionAffected: "quality interventions and customer retention",
    confidenceDomain: "customer_reputation", expectedConfidenceGain: "medium",
    recommendationAtRiskIfMissing: "A 'push for more customers' call can amplify a quality problem.",
    ownerEffort: "low", privacyNote: "May contain customer identifiers; internal-only.",
  },
  customer_count: {
    category: "customer_count", label: "Customer / order count",
    why: "Order and customer counts let us compute revenue per order and per customer.",
    decisionAffected: "pricing, marketing efficiency, and concentration risk",
    confidenceDomain: "marketing_sales", expectedConfidenceGain: "medium",
    recommendationAtRiskIfMissing: "Marketing ROI and pricing-per-order advice is unreliable without counts.",
    ownerEffort: "low", privacyNote: "Aggregate counts; business-scoped.",
  },
  delivery_records: {
    category: "delivery_records", label: "Delivery records",
    why: "Delivery records show fulfilment reliability and where SLAs slip.",
    decisionAffected: "operations reliability and B2B SLA commitments",
    confidenceDomain: "delivery_logistics", expectedConfidenceGain: "low",
    recommendationAtRiskIfMissing: "SLA commitments can be over-promised without delivery history.",
    ownerEffort: "medium", privacyNote: "Operational record; business-scoped.",
  },
  vendor_invoices: {
    category: "vendor_invoices", label: "Vendor invoices",
    why: "Vendor invoices show input-cost trends and supplier payment risk.",
    decisionAffected: "cost control and supplier negotiation",
    confidenceDomain: "vendor_supplier", expectedConfidenceGain: "low",
    recommendationAtRiskIfMissing: "Cost-cut advice can miss the real driver without vendor invoices.",
    ownerEffort: "medium", privacyNote: "Commercially sensitive; internal-only.",
  },
  b2b_contracts: {
    category: "b2b_contracts", label: "B2B contracts / quotes",
    why: "Contracts and quotes are needed to weigh new work against real margin and cash terms.",
    decisionAffected: "which contracts to take and on what terms",
    confidenceDomain: "opportunity_contract", expectedConfidenceGain: "high",
    recommendationAtRiskIfMissing: "Accepting a contract can be below-margin or a cash trap without the terms.",
    ownerEffort: "medium", privacyNote: "Confidential contract terms; internal-only.",
  },
  equipment_logs: {
    category: "equipment_logs", label: "Machine / equipment logs",
    why: "Equipment logs show real throughput limits and maintenance risk.",
    decisionAffected: "capacity, maintenance timing, and capex",
    confidenceDomain: "equipment_capacity", expectedConfidenceGain: "high",
    recommendationAtRiskIfMissing: "A 'take more orders' call can hit a machine bottleneck without logs.",
    ownerEffort: "medium", privacyNote: "Operational record; business-scoped.",
  },
  sops_checklists: {
    category: "sops_checklists", label: "SOPs / checklists",
    why: "SOPs show whether work can run without you and be delegated safely.",
    decisionAffected: "delegation and owner workload reduction",
    confidenceDomain: "sop_checklist", expectedConfidenceGain: "medium",
    recommendationAtRiskIfMissing: "Delegation advice can fail without documented SOPs.",
    ownerEffort: "high", privacyNote: "Internal process knowledge; internal-only.",
  },
  staff_training: {
    category: "staff_training", label: "Staff training records",
    why: "Training records show whether staff can take on the work you delegate.",
    decisionAffected: "delegation readiness and quality risk",
    confidenceDomain: "staff_training", expectedConfidenceGain: "low",
    recommendationAtRiskIfMissing: "Delegation can lower quality if staff are not trained.",
    ownerEffort: "medium", privacyNote: "Internal-only staff record.",
  },
  marketing: {
    category: "marketing", label: "Marketing spend / results",
    why: "Marketing spend and results are needed to judge payback before spending more.",
    decisionAffected: "marketing budget and growth pacing",
    confidenceDomain: "marketing_sales", expectedConfidenceGain: "medium",
    recommendationAtRiskIfMissing: "A 'spend more on marketing' call can burn cash with no payback proof.",
    ownerEffort: "low", privacyNote: "Business-scoped marketing record.",
  },
  cash_debt: {
    category: "cash_debt", label: "Cash / debt / EMI obligations",
    why: "Cash on hand and debt payments are needed to compute runway and survival risk.",
    decisionAffected: "survival, debt coverage, and what you can afford this month",
    confidenceDomain: "working_capital", expectedConfidenceGain: "high",
    recommendationAtRiskIfMissing: "Any spend or growth advice is unsafe without cash and debt.",
    ownerEffort: "low", privacyNote: "Sensitive financial record; internal-only.",
  },
  proof_completion: {
    category: "proof_completion", label: "Proof / completion records",
    why: "Proof records are needed to confirm work was actually done before we act on it.",
    decisionAffected: "whether an action can be marked complete and learned from",
    confidenceDomain: "compliance_proof", expectedConfidenceGain: "high",
    recommendationAtRiskIfMissing: "Actions can be falsely marked done without proof, corrupting learning.",
    ownerEffort: "low", privacyNote: "May include photos; internal-only.",
  },
  tax_compliance: {
    category: "tax_compliance", label: "Tax / compliance / licensing",
    why: "Compliance and licensing records are needed to catch legal blocks before they bite.",
    decisionAffected: "whether you are legally clear to operate or scale",
    confidenceDomain: "compliance_proof", expectedConfidenceGain: "medium",
    recommendationAtRiskIfMissing: "Growth advice is unsafe if a licence or filing is expired.",
    ownerEffort: "medium", privacyNote: "Regulated record; internal-only.",
  },
  inventory_stock: {
    category: "inventory_stock", label: "Inventory / stock records",
    why: "Inventory shows working capital tied up and stock-out risk.",
    decisionAffected: "working capital and purchasing",
    confidenceDomain: "working_capital", expectedConfidenceGain: "low",
    recommendationAtRiskIfMissing: "Purchasing advice can over- or under-stock without inventory.",
    ownerEffort: "medium", privacyNote: "Business-scoped operational record.",
  },
  branch_records: {
    category: "branch_records", label: "Branch / location records",
    why: "Per-branch records are needed to see which location is winning or bleeding.",
    decisionAffected: "where to invest, fix, or close",
    confidenceDomain: "location_stage", expectedConfidenceGain: "high",
    recommendationAtRiskIfMissing: "Whole-business advice can hide a failing branch without per-branch data.",
    ownerEffort: "medium", privacyNote: "Each branch is isolated under your business; no cross-branch leakage.",
  },
};

/** Categories whose confidence domain is a CRITICAL ingestion domain — missing any forces low confidence. */
export function isCriticalCategory(category: OwnerInputCategory): boolean {
  return CRITICAL_INGESTION_DOMAINS.includes(INPUT_CATALOG[category].confidenceDomain);
}

/** Map an input category to its canonical confidence domain (the only confidence link). */
export function categoryConfidenceDomain(category: OwnerInputCategory): IngestionDomain {
  return INPUT_CATALOG[category].confidenceDomain;
}

/** All categories that map to a given confidence domain (a domain can be fed by several categories). */
export function categoriesForDomain(domain: IngestionDomain): OwnerInputCategory[] {
  return OWNER_INPUT_CATEGORIES.filter((c) => INPUT_CATALOG[c].confidenceDomain === domain);
}
