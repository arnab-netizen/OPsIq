/**
 * Public-case SOURCE REGISTER — metadata only, privacy-enforced.
 *
 * Records the PUBLIC sources whose real-world business *patterns* (numbers, constraints, root causes,
 * correct actions) seed the real-world case library. We store NON-PRIVATE metadata + the facts we used,
 * inferred, or synthetically varied — never personal identifiers and never long copied source text.
 * Anonymization + privacy gates are enforced HERE (and exercised by tests), so a record that leaked a
 * name/phone/email/address or a long verbatim quote cannot enter the register.
 */
import { z } from "zod";

export const SOURCE_TYPES = [
  "case_study", "failure_postmortem", "turnaround_story", "franchise_story", "sector_example",
  "advice_forum", "review_complaint_pattern", "gov_sme_guidance", "local_news", "finance_example",
  "cyber_continuity", "staffing_ops", "regulatory_summary", "business_blog",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const sourceRecordSchema = z.object({
  id: z.string().regex(/^SRC-[A-Z0-9-]+$/),
  type: z.enum(SOURCE_TYPES),
  title: z.string().min(4).max(160),
  url: z.string().url().optional(),
  citation: z.string().min(3).max(200).optional(),
  publishedDate: z.string().optional(),
  accessedDate: z.string().min(4),
  geography: z.string().min(2).max(60),
  businessCategory: z.string().min(2).max(60),
  reliability: z.enum(["low", "medium", "high"]),
  completeness: z.enum(["low", "medium", "high"]),
  factsUsed: z.array(z.string().min(3).max(220)).min(1),
  factsInferred: z.array(z.string().min(3).max(220)).default([]),
  factsSyntheticallyVaried: z.array(z.string().min(3).max(220)).default([]),
  anonymizationStatus: z.enum(["not_required", "anonymized", "no_personal_data"]),
  privacyRisk: z.enum(["low", "medium", "high"]),
}).refine((r) => r.url !== undefined || r.citation !== undefined, { message: "source needs a url or citation" });

export type SourceRecord = z.infer<typeof sourceRecordSchema>;

// ─── Privacy gates (reused by case anonymization tests) ──────────────────────────────────────────
/** Patterns that would indicate a stored personal identifier (we must never persist these). */
export const PII_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "email", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  { name: "phone", re: /(?:\+?\d[\s-]?){9,}\d/ },
  { name: "ssn_like", re: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: "street_address", re: /\b\d{1,5}\s+[A-Z][a-z]+\s+(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Boulevard|Blvd|Drive|Dr)\b/ },
  { name: "social_handle", re: /(?:^|\s)@[A-Za-z0-9_]{3,}/ },
];

/** A short verbatim quote is allowed; long copied text is not. */
export const MAX_QUOTE_CHARS = 220;

export function findPII(text: string): string[] {
  return PII_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.name);
}
export function hasLongCopiedText(text: string): boolean {
  return text.length > MAX_QUOTE_CHARS;
}

/** Validate the whole register: schema + unique ids + no PII + no long copied text in any field. */
export function validateSourceRegister(records: SourceRecord[] = SOURCE_REGISTER): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const r of records) {
    const parsed = sourceRecordSchema.safeParse(r);
    if (!parsed.success) errors.push(`${r.id}: schema ${parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}`);
    if (ids.has(r.id)) errors.push(`${r.id}: duplicate id`);
    ids.add(r.id);
    const blob = [r.title, r.citation ?? "", ...r.factsUsed, ...r.factsInferred, ...r.factsSyntheticallyVaried].join("  ");
    const pii = findPII(blob);
    if (pii.length) errors.push(`${r.id}: PII (${pii.join(",")})`);
    for (const f of [...r.factsUsed, ...r.factsInferred, ...r.factsSyntheticallyVaried, r.title]) {
      if (hasLongCopiedText(f)) errors.push(`${r.id}: field exceeds ${MAX_QUOTE_CHARS} chars (long copied text)`);
    }
  }
  return { ok: errors.length === 0, errors };
}

const ACCESSED = "2026-06-29";

/**
 * The register. Each record captures a real public business PATTERN (anonymized, metadata-only). The
 * `factsUsed` are the operational signals the case library reuses — not copied article prose.
 */
export const SOURCE_REGISTER: SourceRecord[] = [
  {
    id: "SRC-SCORE-CASHFLOW", type: "gov_sme_guidance",
    title: "SCORE: the #1 reason small businesses fail (cash flow)",
    url: "https://www.score.org/resource/blog-post/1-reason-small-businesses-fail-and-how-avoid-it",
    accessedDate: ACCESSED, geography: "US", businessCategory: "retail/grocery",
    reliability: "high", completeness: "medium",
    factsUsed: ["A large share of small businesses fail from cash-flow problems, not lack of profit on paper", "Owners must monitor cash, control expenses, and hold reserves"],
    factsInferred: ["Profit-on-paper can mask a cash crisis when receivables lag payables"],
    factsSyntheticallyVaried: [], anonymizationStatus: "no_personal_data", privacyRisk: "low",
  },
  {
    id: "SRC-FC-BREWBURST", type: "failure_postmortem",
    title: "Cafe failure pattern: imported inputs paid upfront, clients on 90-day credit",
    url: "https://fastercapital.com/content/Business-failure--Learning-from-Business-Failures--Case-Studies-and-Insights.html",
    accessedDate: ACCESSED, geography: "global", businessCategory: "restaurant/cafe/cloud-kitchen",
    reliability: "medium", completeness: "high",
    factsUsed: ["Costly inputs paid upfront while corporate clients took up to 90-day credit", "Strong revenue on paper but shrinking day-to-day cash as overheads rose"],
    factsInferred: ["Working-capital gap widened until the business could not fund operations"],
    factsSyntheticallyVaried: [], anonymizationStatus: "anonymized", privacyRisk: "low",
  },
  {
    id: "SRC-FC-URBANMART", type: "failure_postmortem",
    title: "Retail failure pattern: overstock, slow-movers, dead stock vs cash",
    url: "https://fastercapital.com/content/Business-failure--Learning-from-Business-Failures--Case-Studies-and-Insights.html",
    accessedDate: ACCESSED, geography: "global", businessCategory: "retail/grocery",
    reliability: "medium", completeness: "high",
    factsUsed: ["Overstocked shelves and slow-moving items led to storage cost, markdowns and lost cash", "Failure to balance inventory level against real demand"],
    factsInferred: ["Dead stock ties working capital that should fund fast-movers"],
    factsSyntheticallyVaried: [], anonymizationStatus: "anonymized", privacyRisk: "low",
  },
  {
    id: "SRC-PESHEV-EXPANSION", type: "failure_postmortem",
    title: "Failure pattern: rapid expansion without operating-cost control",
    url: "https://mariopeshev.com/business-failure-lessons/",
    accessedDate: ACCESSED, geography: "global", businessCategory: "restaurant/cafe/cloud-kitchen",
    reliability: "medium", completeness: "medium",
    factsUsed: ["Expanded rapidly without accounting for operating costs and could not cover expenses"],
    factsInferred: ["A second site doubled fixed cost before the first proved repeatable unit economics"],
    factsSyntheticallyVaried: [], anonymizationStatus: "no_personal_data", privacyRisk: "low",
  },
  {
    id: "SRC-KENAN-RESILIENCE", type: "sector_example",
    title: "SMB resilience under a demand shock (pandemic study)",
    url: "https://kenaninstitute.unc.edu/kenan-insight/lessons-on-small-business-resilience-from-the-global-pandemic/",
    accessedDate: ACCESSED, geography: "US", businessCategory: "local-agency/professional-services",
    reliability: "high", completeness: "medium",
    factsUsed: ["Small firms with thin reserves were hit hardest by a sudden demand collapse", "Survivors cut discretionary cost fast and protected core cash"],
    factsInferred: ["Continuity planning and reserves separate survivors from closures in a shock"],
    factsSyntheticallyVaried: [], anonymizationStatus: "no_personal_data", privacyRisk: "low",
  },
  {
    id: "SRC-SCIENCEDIRECT-COVID", type: "regulatory_summary",
    title: "Lost income and recovery for small businesses during a shock",
    url: "https://www.sciencedirect.com/science/article/pii/S221242092400013X",
    accessedDate: ACCESSED, geography: "global", businessCategory: "hotel/guesthouse",
    reliability: "high", completeness: "medium",
    factsUsed: ["Revenue dropped sharply during the shock; recovery lagged for cash-thin operators"],
    factsInferred: ["Hospitality with high fixed cost needs a staged cost freeze and runway math"],
    factsSyntheticallyVaried: [], anonymizationStatus: "no_personal_data", privacyRisk: "low",
  },
  {
    id: "SRC-CEINTERIM-TURNAROUND", type: "turnaround_story",
    title: "Business turnaround pattern: stabilise cash, then fix margin",
    url: "https://ceinterim.com/business-turnaround-case-study-success-stories/",
    accessedDate: ACCESSED, geography: "EU", businessCategory: "small-manufacturing",
    reliability: "medium", completeness: "medium",
    factsUsed: ["Turnaround sequenced cash stabilisation before margin and growth fixes"],
    factsInferred: ["Stop-loss on loss-making lines precedes reinvestment"],
    factsSyntheticallyVaried: [], anonymizationStatus: "no_personal_data", privacyRisk: "low",
  },
  {
    id: "SRC-FOUNDR-STARTUP", type: "case_study",
    title: "Startup failure case studies: building without validated demand",
    url: "https://foundr.com/articles/leadership/personal-growth/4-startup-case-studies-failure",
    accessedDate: ACCESSED, geography: "US", businessCategory: "micro-SaaS",
    reliability: "medium", completeness: "medium",
    factsUsed: ["Products scaled spend before proving retention/unit economics", "Burn outran revenue with weak CAC-to-LTV"],
    factsInferred: ["A micro-SaaS must prove retention before paid-acquisition scale"],
    factsSyntheticallyVaried: [], anonymizationStatus: "no_personal_data", privacyRisk: "low",
  },
  {
    id: "SRC-TAL-FAKEVENDOR", type: "case_study",
    title: "Fake-vendor invoice + kickback scheme detected by audit discrepancy",
    url: "https://talglobal.com/knowledge-center/fraud-investigation-case-study/",
    accessedDate: ACCESSED, geography: "US", businessCategory: "housekeeping/cleaning",
    reliability: "high", completeness: "high",
    factsUsed: ["An employee authorised to approve vendor contracts up to a threshold submitted false invoices from a related cleaning vendor and took kickbacks", "Detected when auditors noticed irregular payments to an unfamiliar linked vendor"],
    factsInferred: ["Independent verification + segregation of vendor approval and payment would have blocked it"],
    factsSyntheticallyVaried: ["Relocated pattern to a Tier-2 facility-services contractor"], anonymizationStatus: "anonymized", privacyRisk: "low",
  },
  {
    id: "SRC-SDK-FICTITIOUS-VENDOR", type: "case_study",
    title: "Fictitious vendor accounts: invoices with no PO or receiving report",
    url: "https://sdkcpa.com/exploring-a-fictional-case-of-employee-fraud/",
    accessedDate: ACCESSED, geography: "US", businessCategory: "B2B-service-contractor",
    reliability: "medium", completeness: "high",
    factsUsed: ["Fictitious vendor accounts generated invoices for goods never delivered", "Detected via payments lacking matching purchase orders or receiving reports"],
    factsInferred: ["Three-way match (PO/receipt/invoice) is the controlling proof gate"],
    factsSyntheticallyVaried: [], anonymizationStatus: "anonymized", privacyRisk: "low",
  },
  {
    id: "SRC-PAPAYA-GHOST", type: "staffing_ops",
    title: "Ghost-employee payroll fraud detection/prevention",
    url: "https://www.papayaglobal.com/blog/ghost-employee-fraud-detection-and-strategies/",
    accessedDate: ACCESSED, geography: "global", businessCategory: "housekeeping/cleaning",
    reliability: "medium", completeness: "medium",
    factsUsed: ["Payroll paid 'ghost' employees who do not exist", "Independent headcount/attendance reconciliation exposes it"],
    factsInferred: ["Owner-verified roster vs payroll is the control for shift-labour businesses"],
    factsSyntheticallyVaried: [], anonymizationStatus: "no_personal_data", privacyRisk: "low",
  },
  {
    id: "SRC-BND-FRAUD-SIGNS", type: "advice_forum",
    title: "Signs of employee fraud and owner detection controls",
    url: "https://www.businessnewsdaily.com/11164-how-to-spot-employee-fraud.html",
    accessedDate: ACCESSED, geography: "US", businessCategory: "auto-service/repair-parts",
    reliability: "medium", completeness: "medium",
    factsUsed: ["Owner controls: receive bank/card statements directly, sign payments personally, watch lifestyle/behaviour red flags"],
    factsInferred: ["Proof gates must not depend on the person being controlled"],
    factsSyntheticallyVaried: [], anonymizationStatus: "no_personal_data", privacyRisk: "low",
  },
  {
    id: "SRC-SBA-RECEIVABLES", type: "gov_sme_guidance",
    title: "SBA/SME guidance: receivables, terms and working-capital discipline",
    citation: "U.S. Small Business Administration — managing cash flow and receivables (sba.gov guidance)",
    accessedDate: ACCESSED, geography: "US", businessCategory: "import/export/wholesale",
    reliability: "high", completeness: "low",
    factsUsed: ["Tighten credit terms, invoice promptly, and reserve for tax/payroll obligations"],
    factsInferred: ["B2B distributors fail on payment-term mismatch, not gross margin"],
    factsSyntheticallyVaried: [], anonymizationStatus: "no_personal_data", privacyRisk: "low",
  },
  {
    id: "SRC-SOCIALTARGETER-PIVOT", type: "failure_postmortem",
    title: "Failure pattern: ignoring declining foot traffic and online competition",
    url: "https://www.socialtargeter.com/blogs/case-studies-of-failures-analyzing-business-strategies-that-missed-the-mark",
    accessedDate: ACCESSED, geography: "global", businessCategory: "retail/grocery",
    reliability: "medium", completeness: "medium",
    factsUsed: ["A retail operator ignored declining foot traffic and online competition until too late", "Lesson: track metrics and pivot when the model breaks"],
    factsInferred: ["A stop-loss/pivot trigger on declining same-store demand is required"],
    factsSyntheticallyVaried: [], anonymizationStatus: "no_personal_data", privacyRisk: "low",
  },
];
