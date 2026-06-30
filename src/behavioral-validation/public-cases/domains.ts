/**
 * Canonical 60-domain taxonomy for the real-world case library + materiality/coverage helpers.
 *
 * `REQUIRED_DOMAINS` is the fixed list of 60 domains OpsIQ must be expert in. `canon()` normalizes the
 * earlier (combined) tags to these canonical names so coverage is measured against one fixed vocabulary.
 * A domain "counts" for a case only when the play that produced it declares the domain as material
 * (the play's `domains` set), and every tag must be a known canonical domain (no loose/unknown tags).
 */
export const REQUIRED_DOMAINS = [
  "Strategy and business model", "Finance", "Cash flow", "Budgeting", "Capital allocation",
  "Pricing", "Margin", "Working capital", "Sales", "Marketing",
  "Customer acquisition", "Customer retention", "Customer complaints/reputation", "Operations", "SOPs",
  "Checklists", "Process control", "Process improvement", "Staff management", "Staff training",
  "Staff workload/fairness", "Hiring/firing/resource decisions", "Equipment/capacity", "Maintenance/downtime", "Inventory/stock",
  "Vendor/supplier management", "Delivery/logistics", "Opportunity evaluation", "Contract/quote evaluation", "Compliance/professional-review boundaries",
  "Tax/legal/insurance escalation boundaries", "Proof/anti-gaming", "Fraud/collusion prevention", "Owner workload reduction", "Approval memory/standing instructions",
  "Self-evaluation and learning", "Location/local-market awareness", "Remote-owner management", "Multi-location/portfolio control", "Scaling/expansion",
  "Shutdown/pivot/stop-loss", "Business continuity/risk management", "Quality control", "Customer service", "Brand/franchise constraints",
  "Digital/e-commerce unit economics", "B2B receivables/payment terms", "Staff incentives/KPI gaming", "Owner emotional/override discipline", "Profitability/efficiency optimization",
  "Cybersecurity/data loss/payment fraud", "Insurance/claim readiness", "Emergency/disaster continuity", "Reputation/social-media crisis", "Loan/debt/EMI affordability",
  "Asset purchase/payback decision", "Local competition/price-war response", "Seasonality/festival/weather demand planning", "Succession/key-person dependency", "Exit/sale readiness",
] as const;
export type RequiredDomain = (typeof REQUIRED_DOMAINS)[number];
export const REQUIRED_DOMAIN_SET = new Set<string>(REQUIRED_DOMAINS);

/** The critical domains held to the higher coverage + ≥90 score bar. */
export const CRITICAL_DOMAINS: RequiredDomain[] = [
  "Cash flow", "Pricing", "Margin", "Working capital", "Budgeting", "Capital allocation",
  "Equipment/capacity", "Staff management", "Process control", "Proof/anti-gaming",
  "Compliance/professional-review boundaries", "Opportunity evaluation", "Contract/quote evaluation",
  "Owner workload reduction", "Self-evaluation and learning", "Location/local-market awareness",
  "Customer complaints/reputation", "Scaling/expansion", "Shutdown/pivot/stop-loss",
  "Profitability/efficiency optimization", "Fraud/collusion prevention", "B2B receivables/payment terms",
  "Cybersecurity/data loss/payment fraud", "Business continuity/risk management",
  "Staff incentives/KPI gaming", "Owner emotional/override discipline",
];
export const CRITICAL_DOMAIN_SET = new Set<string>(CRITICAL_DOMAINS);

/** Normalize earlier combined tags → canonical names. Already-canonical names pass through. */
const CANON: Record<string, RequiredDomain[]> = {
  "strategy": ["Strategy and business model"],
  "cash flow": ["Cash flow"],
  "working capital": ["Working capital"],
  "budgeting": ["Budgeting"],
  "capital allocation": ["Capital allocation"],
  "profitability/efficiency": ["Profitability/efficiency optimization"],
  "B2B receivables/payment terms": ["B2B receivables/payment terms"],
  "inventory/stock": ["Inventory/stock"],
  "pricing/margin": ["Pricing", "Margin"],
  "opportunity/contract evaluation": ["Opportunity evaluation", "Contract/quote evaluation"],
  "capacity/equipment": ["Equipment/capacity"],
  "operations": ["Operations"],
  "staff/process control": ["Staff management", "Process control"],
  "customer quality/reputation": ["Customer complaints/reputation"],
  "marketing": ["Marketing"],
  "customer acquisition": ["Customer acquisition"],
  "customer retention": ["Customer retention"],
  "digital/e-commerce unit economics": ["Digital/e-commerce unit economics"],
  "owner workload reduction": ["Owner workload reduction"],
  "approval memory/standing instructions": ["Approval memory/standing instructions"],
  "self-evaluation/learning": ["Self-evaluation and learning"],
  "vendor/supplier management": ["Vendor/supplier management"],
  "fraud/collusion prevention": ["Fraud/collusion prevention"],
  "proof/anti-gaming": ["Proof/anti-gaming"],
  "compliance/professional-review": ["Compliance/professional-review boundaries"],
  "tax/legal/insurance escalation": ["Tax/legal/insurance escalation boundaries"],
  "scaling/expansion": ["Scaling/expansion"],
  "stop-loss/pivot/shutdown": ["Shutdown/pivot/stop-loss"],
  "business continuity/risk management": ["Business continuity/risk management"],
  "staff incentives/KPI gaming": ["Staff incentives/KPI gaming"],
};

/** Map a raw domain tag to one or more canonical domains (canonical names map to themselves). */
export function canon(tag: string): RequiredDomain[] {
  if (REQUIRED_DOMAIN_SET.has(tag)) return [tag as RequiredDomain];
  return CANON[tag] ?? [];
}

/** Normalize + dedupe a play's declared domains to canonical names. */
export function canonDomains(tags: string[]): RequiredDomain[] {
  const out = new Set<RequiredDomain>();
  for (const t of tags) for (const c of canon(t)) out.add(c);
  return [...out];
}
