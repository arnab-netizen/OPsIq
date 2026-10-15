/**
 * "Improve this recommendation" — where does the owner go to supply a piece of evidence, and what does the owner
 * learn when they come back? Decided from PERSISTED evidence, never from client state, and never "always add":
 *
 *   ADD               the evidence is missing and there is no entry to complete: add it (dated to the read's period).
 *   EDIT_FINANCE      the read's own Finance entry is where this evidence lives: complete or correct it through the
 *                     existing first-run Correct flow (the canonical amendment path — nothing new invented).
 *   EDIT_CASHFLOW     a Cashflow entry already speaks for the read's period: open IT (current values visible),
 *                     because adding a second entry is refused or silently ignored.
 *   NOT_USED_BY_READ  saving here would not change THIS read (the read does not use that kind of evidence, or what the
 *                     owner saved covers a period the read does not use): saving is allowed, but it is said plainly.
 *
 * Which categories the first money read actually consumes mirrors what `rowsToSuppliedCategories` and the Finance
 * diagnosis read: the head Finance snapshot's own figures and the Cashflow bank balance (through the one selector).
 * Everything else is honestly "not used by this read". Pure: no I/O, no clock.
 */
import { INPUT_CATALOG, type OwnerInputCategory } from "@/domain/owner-mode/input-catalog";
import { inputTargetForCategory } from "@/domain/owner-mode/owner-data-hub";
import { BANK_BALANCE_FRESHNESS_DAYS } from "@/domain/owner-finance/liquidity";
import { periodLabel } from "@/domain/owner-first-run/first-money-read";
import { withFirstRunReturn, type FirstRunBeforeSummary } from "@/domain/owner-first-run/first-run-return";

export interface ImproveCurrentValue {
  /** The amendment / form field name. */
  field: string;
  label: string;
  /** The recorded value, or null when nothing is recorded (a known 0 is a value). */
  value: number | null;
}

interface FinanceFieldSpec {
  /** Name in the canonical amendment schema (`financialSnapshotAmendSchema`). */
  name: string;
  /** Column on the persisted Finance snapshot row. */
  rowKey: string;
  label: string;
}

const F = {
  revenue: { name: "revenue", rowKey: "revenue", label: "Revenue" },
  variableCosts: { name: "variableCosts", rowKey: "variableCosts", label: "Variable / direct costs" },
  costOfGoods: { name: "costOfGoodsOrServices", rowKey: "costOfGoods", label: "Cost of goods or services" },
  fixedCosts: { name: "fixedCosts", rowKey: "fixedCosts", label: "Fixed costs" },
  rent: { name: "rent", rowKey: "rent", label: "Rent" },
  utilities: { name: "utilities", rowKey: "utilities", label: "Utilities" },
  payroll: { name: "salaryPayroll", rowKey: "payroll", label: "Payroll / staff cost" },
  marketing: { name: "marketingSpend", rowKey: "marketingSpend", label: "Marketing spend" },
  cashOnHand: { name: "cashOnHand", rowKey: "cashOnHand", label: "Cash in hand" },
  debtPayments: { name: "loanEmiDebtPayments", rowKey: "debtPayments", label: "Loan / EMI payments" },
  totalDebt: { name: "totalDebtOutstanding", rowKey: "totalDebtOutstanding", label: "Total debt outstanding" },
} as const satisfies Record<string, FinanceFieldSpec>;

/** Categories whose evidence IS a figure on the read's own Finance snapshot (mirrors `rowsToSuppliedCategories`). */
const FINANCE_CATEGORY_FIELDS: Partial<Record<OwnerInputCategory, readonly FinanceFieldSpec[]>> = {
  revenue_sales: [F.revenue],
  expenses: [F.variableCosts, F.costOfGoods],
  fixed_costs: [F.fixedCosts, F.rent, F.utilities],
  payroll: [F.payroll],
  marketing: [F.marketing],
};

/**
 * Whether the first money read consumes evidence of this category AT ALL (a Finance figure on the read's snapshot, or the
 * cash/debt position). The ONE source of truth: `decideImproveTarget` answers NOT_USED_BY_READ / CATEGORY_NOT_READ exactly
 * when this is false, and the next-question selector never offers a category for which it is false.
 */
export function categoryConsumedByRead(category: string): boolean {
  return category === "cash_debt" || FINANCE_CATEGORY_FIELDS[category as OwnerInputCategory] !== undefined;
}

/** The Finance amendment fields an EDIT_FINANCE answer can ask the Correct form to show for a category. */
export function financeFieldsForCategory(category: string): readonly { name: string; label: string }[] {
  const direct = FINANCE_CATEGORY_FIELDS[category as OwnerInputCategory];
  if (direct) return direct.map(({ name, label }) => ({ name, label }));
  if (category === "cash_debt") return [F.cashOnHand, F.debtPayments, F.totalDebt].map(({ name, label }) => ({ name, label }));
  return [];
}

export type ImproveNotUsedReason = "CATEGORY_NOT_READ" | "PERIOD_MISMATCH";

interface TargetBase {
  category: string;
  /** What the control says: "Add this" (nothing recorded yet) or "Edit this" (a value is recorded). */
  actionLabel: string;
  why: string;
  /** The period the read covers, in owner words. */
  readPeriodLabel: string;
}

export interface ImproveAddTarget extends TargetBase {
  kind: "ADD";
  href: string;
}

export interface ImproveEditFinanceTarget extends TargetBase {
  kind: "EDIT_FINANCE";
  snapshotId: string;
  /** The existing first-run Correct flow, opened on this category. */
  href: string;
  currency: string;
  /** Every field this question covers, with its CURRENT value (shown before editing). */
  currentValues: ImproveCurrentValue[];
  hasValue: boolean;
}

export interface ImproveEditCashflowTarget extends TargetBase {
  kind: "EDIT_CASHFLOW";
  snapshotId: string;
  /** Optimistic-freshness token for the edit (the entry's `updatedAt` as the server holds it now). */
  updatedAt: string;
  href: string;
  currency: string;
  currentValues: ImproveCurrentValue[];
  /** True when a bank balance is already recorded (an edit); false when the entry exists but the figure is blank. */
  hasValue: boolean;
  entryPeriodLabel: string;
}

export interface ImproveNotUsedTarget extends TargetBase {
  kind: "NOT_USED_BY_READ";
  reason: ImproveNotUsedReason;
  /** Said before the owner saves (future tense). */
  explanation: string;
  /** Said after coming back: what is true now, never claiming more than is known. */
  afterExplanation: string;
  /** Where the owner can still add it (saving is allowed). */
  addHref: string;
  /** The way to evidence this read DOES use, when there is one (PERIOD_MISMATCH). */
  next: ImproveAddTarget | ImproveEditFinanceTarget | ImproveEditCashflowTarget | null;
}

export type ImproveTarget = ImproveAddTarget | ImproveEditFinanceTarget | ImproveEditCashflowTarget | ImproveNotUsedTarget;

export interface ImproveCashflowRow {
  id: string;
  updatedAt: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  bankBalance: number | null;
  cashInHand: number | null;
}

export interface ImproveFacts {
  category: string;
  read: { snapshotId: string; periodStart: string; periodEnd: string; currency: string };
  /** The head Finance snapshot's columns by ROW key (null/undefined = not recorded). */
  finance: Readonly<Record<string, number | null | undefined>>;
  cashflow: {
    /** The row the one selector picks for the read's period end (null when none qualifies). */
    effective: ImproveCashflowRow | null;
    /** The bank balance the read can USE (fresh, finite, not future), or null. */
    usableBankBalance: number | null;
    /** Periods of entries saved since the owner asked that the read does not use (a later or too-old period). */
    ignoredRecent: ReadonlyArray<{ periodStart: string; periodEnd: string }>;
  };
}

const day = (iso: string): string => iso.slice(0, 10);
const known = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

export function cashflowAddHref(read: { periodStart: string; periodEnd: string }): string {
  return `/owner/cashflow?periodStart=${day(read.periodStart)}&periodEnd=${day(read.periodEnd)}&returnTo=first-run`;
}
export function cashflowEditHref(snapshotId: string): string {
  return `/owner/cashflow?edit=${encodeURIComponent(snapshotId)}&returnTo=first-run`;
}
export function correctFlowHref(category: string): string {
  return `/owner/first-run?correct=${encodeURIComponent(category)}`;
}

function whyOf(category: string): string {
  return (INPUT_CATALOG as Record<string, { why: string }>)[category]?.why ?? "It helps OpsIQ make this recommendation more reliable.";
}

function financeTarget(facts: ImproveFacts, specs: readonly FinanceFieldSpec[], base: TargetBase): ImproveEditFinanceTarget {
  const currentValues = specs.map((s) => ({ field: s.name, label: s.label, value: known(facts.finance[s.rowKey]) ? (facts.finance[s.rowKey] as number) : null }));
  const hasValue = currentValues.some((v) => v.value !== null);
  return {
    ...base,
    kind: "EDIT_FINANCE",
    actionLabel: hasValue ? "Edit this" : "Add this",
    snapshotId: facts.read.snapshotId,
    href: correctFlowHref(facts.category),
    currency: facts.read.currency,
    currentValues,
    hasValue,
  };
}

function bankTarget(facts: ImproveFacts, base: TargetBase): ImproveAddTarget | ImproveEditCashflowTarget {
  const eff = facts.cashflow.effective;
  // An entry that can speak for this read: its balance is usable, or it is blank but fresh enough to count once filled.
  // (An entry too old for the freshness window cannot count whatever it says, so a NEW entry for the read's period is needed.)
  const fresh = eff !== null && facts.cashflow.usableBankBalance !== null
    ? true
    : eff !== null && !known(eff.bankBalance) && isWithinWindow(eff, facts.read);
  if (eff && fresh) {
    const hasValue = known(eff.bankBalance);
    return {
      ...base,
      kind: "EDIT_CASHFLOW",
      actionLabel: hasValue ? "Edit this" : "Add this",
      snapshotId: eff.id,
      updatedAt: eff.updatedAt,
      href: cashflowEditHref(eff.id),
      currency: eff.currency,
      currentValues: [
        { field: "bankBalance", label: "Bank balance", value: known(eff.bankBalance) ? eff.bankBalance : null },
        { field: "cashInHand", label: "Cash in hand", value: known(eff.cashInHand) ? eff.cashInHand : null },
      ],
      hasValue,
      entryPeriodLabel: periodLabel({ start: eff.periodStart, end: eff.periodEnd }),
    };
  }
  return { ...base, kind: "ADD", actionLabel: "Add this", href: cashflowAddHref(facts.read) };
}

const MS_PER_DAY = 86_400_000;
/** The liquidity contract's freshness window (single constant), applied to a blank entry (it has no balance to test). */
function isWithinWindow(entry: { periodEnd: string }, read: { periodEnd: string }): boolean {
  const age = (new Date(read.periodEnd).getTime() - new Date(entry.periodEnd).getTime()) / MS_PER_DAY;
  return Number.isFinite(age) && age >= 0 && age <= BANK_BALANCE_FRESHNESS_DAYS;
}

function baseOf(facts: ImproveFacts): TargetBase {
  return {
    category: facts.category,
    actionLabel: "Add this",
    why: whyOf(facts.category),
    readPeriodLabel: periodLabel({ start: facts.read.periodStart, end: facts.read.periodEnd }),
  };
}

/**
 * The bank-balance branch on its own (the "what would sharpen this" link on the read uses it too): open the Cashflow entry
 * that speaks for the read's period, or add one dated to it; an entry saved for a period the read does not use is said so.
 */
export function decideBankImproveTarget(facts: ImproveFacts): ImproveTarget {
  const base = baseOf(facts);
  const bank = bankTarget(facts, base);
  return facts.cashflow.usableBankBalance === null ? withIgnoredEntries(facts, base, bank) : bank;
}

/** Decide where "Improve" sends the owner for this category, from persisted facts only. */
export function decideImproveTarget(facts: ImproveFacts): ImproveTarget {
  const base = baseOf(facts);

  if (!categoryConsumedByRead(facts.category)) {
    return {
      ...base,
      kind: "NOT_USED_BY_READ",
      reason: "CATEGORY_NOT_READ",
      actionLabel: "Add it anyway",
      explanation:
        "You can add this and it will be saved, but your first money read doesn't use it yet, so it won't change this recommendation.",
      afterExplanation: "This kind of information isn't used by your first money read, so adding it doesn't change this recommendation.",
      addHref: categoryAddHref(facts.category),
      next: null,
    };
  }

  const specs = FINANCE_CATEGORY_FIELDS[facts.category as OwnerInputCategory];
  if (specs) return financeTarget(facts, specs, base);

  // cash_debt (the only other consumed category): cash first (a critical fact of the read), then the bank balance the read
  // can use, then the debt figures.
  if (!known(facts.finance[F.cashOnHand.rowKey])) return financeTarget(facts, [F.cashOnHand], base);
  if (facts.cashflow.usableBankBalance === null) return decideBankImproveTarget(facts);
  const debtMissing = [F.debtPayments, F.totalDebt].some((s) => !known(facts.finance[s.rowKey]));
  if (debtMissing) return financeTarget(facts, [F.debtPayments, F.totalDebt], base);
  return bankTarget(facts, base);
}

/** A saved entry the read does not use turns an unresolved bank question into an honest "saved, but not used". */
function withIgnoredEntries(facts: ImproveFacts, base: TargetBase, next: ImproveAddTarget | ImproveEditCashflowTarget): ImproveTarget {
  const ignored = [...facts.cashflow.ignoredRecent].sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : a.periodEnd > b.periodEnd ? -1 : 0))[0];
  if (!ignored) return next;
  const readLabel = base.readPeriodLabel;
  const savedLabel = periodLabel({ start: ignored.periodStart, end: ignored.periodEnd });
  return {
    ...base,
    kind: "NOT_USED_BY_READ",
    reason: "PERIOD_MISMATCH",
    actionLabel: next.actionLabel,
    explanation: `Saved, but this read doesn't use it, because it covers ${savedLabel} and your read covers ${readLabel}.`,
    afterExplanation: `Saved, but this read doesn't use it, because it covers ${savedLabel} and your read covers ${readLabel}.`,
    addHref: next.kind === "ADD" ? next.href : cashflowAddHref(facts.read),
    next,
  };
}

/** Where a category that the money read does not consume is supplied today (the existing governed input paths). */
function categoryAddHref(category: string): string {
  return withFirstRunReturn(inputTargetForCategory(category as OwnerInputCategory).href);
}

// ── Amendment no-op detection (the Correct flow must not mint a new version that changes nothing) ──────────────

const AMEND_TO_ROW: Readonly<Record<string, string>> = Object.fromEntries([
  ...Object.values(F).map((s): [string, string] => [s.name, s.rowKey]),
  ["b2cRevenue", "b2cRevenue"],
  ["b2bRevenue", "b2bRevenue"],
]);

/**
 * True when every figure in the amendment equals what the row already records (and the stated reliability is the one
 * already on record): such an "amendment" would only mint an identical version and a misleading "corrected" signal.
 * A field this module does not know the column of counts as a change (conservative).
 */
export function amendmentChangesNothing(
  row: Readonly<Record<string, unknown>>,
  amend: Readonly<Record<string, unknown>>
): boolean {
  let any = false;
  for (const [key, value] of Object.entries(amend)) {
    if (value === undefined || key === "amendmentReason") continue;
    any = true;
    if (key === "evidenceQuality") {
      if ((row.evidenceQuality ?? null) !== value) return false;
      continue;
    }
    const rowKey = AMEND_TO_ROW[key];
    if (!rowKey) return false;
    // null = "return to UNKNOWN": a no-op only if the row already records nothing for it (0 is a value, not nothing).
    if (value === null) {
      if (row[rowKey] !== null && row[rowKey] !== undefined) return false;
      continue;
    }
    if (typeof value !== "number" || row[rowKey] !== value) return false;
  }
  return any;
}

// ── The truthful summary after coming back ───────────────────────────────────────────────────────────────────────

export interface ImproveReadTokens {
  noticed: string;
  recommendedAction: string | null;
  confidenceTier: string;
  evidenceQuality: string | null;
  missingEvidence: readonly string[];
  /** The "what would sharpen this" request (title), or null. */
  sharpenBy: string | null;
  cautions: readonly string[];
}

export type ImproveOutcomeKind = "CHANGED" | "UNCHANGED" | "NOT_USED" | "UNCOMPARABLE";

export interface ImproveOutcome {
  kind: ImproveOutcomeKind;
  headline: string;
  lines: string[];
}

const TIER_WORDS: Record<string, string> = { HIGH: "high", MEDIUM: "moderate", LOW: "low", BLOCKED: "not enough to rely on" };
const tier = (t: string): string => TIER_WORDS[t] ?? t;
const QUALITY_WORDS: Record<string, string> = { ACTUAL: "from your records", GOOD_ESTIMATE: "a good estimate", ROUGH_ESTIMATE: "a rough guess" };
const quality = (q: string | null): string => (q ? (QUALITY_WORDS[q] ?? q) : "not stated");

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);
}

export function readTokensEqual(before: ImproveReadTokens, after: ImproveReadTokens): boolean {
  return (
    before.noticed === after.noticed &&
    before.recommendedAction === after.recommendedAction &&
    before.confidenceTier === after.confidenceTier &&
    before.evidenceQuality === after.evidenceQuality &&
    before.sharpenBy === after.sharpenBy &&
    sameSet(before.missingEvidence, after.missingEvidence) &&
    sameSet(before.cautions, after.cautions)
  );
}

/**
 * The before-tokens the owner saw, from the per-viewer record of them. A token the record did not capture (an older
 * record) is not compared: it is taken from the new read, so it can neither fake a change nor hide one.
 */
export function beforeTokens(before: FirstRunBeforeSummary | null, after: ImproveReadTokens): ImproveReadTokens | null {
  if (!before) return null;
  return {
    noticed: before.noticed ?? after.noticed,
    recommendedAction: before.recommendedAction,
    confidenceTier: before.confidenceTier,
    evidenceQuality: before.evidenceQuality,
    missingEvidence: before.missingEvidence,
    sharpenBy: before.sharpenBy === undefined ? after.sharpenBy : before.sharpenBy,
    cautions: before.cautions ?? after.cautions,
  };
}

/**
 * "Still missing" is said only about what the SERVER says is the next unresolved item for the question. The cash/debt
 * question is a sequence (cash in hand, then the bank balance, then the debt figures): once one step is filled the target moves
 * on, so claiming "the information you went to add is still missing" would be false. There the next unresolved step is named
 * instead of asserting that the step the owner went for is the one still open.
 */
function stillMissingLines(target: ImproveTarget | null): string[] {
  if (!target || target.kind === "NOT_USED_BY_READ" || !("hasValue" in target ? !target.hasValue : target.kind === "ADD")) return [];
  if (target.category === "cash_debt") {
    const labels = target.kind === "EDIT_FINANCE"
      ? target.currentValues.filter((v) => v.value === null).map((v) => v.label.toLowerCase())
      : ["bank balance"];
    return labels.length > 0 ? [`OpsIQ still needs: ${labels.join(", ")}. Until then this part of your read can't change.`] : [];
  }
  return ["The information you went to add is still missing, so nothing could change."];
}

/**
 * What to tell the owner after the read was re-run. Built ONLY from the before/after read tokens and the server's
 * current answer about the evidence: an identical read is never described as improved, evidence that the read does not
 * use is said to be saved but unused, and a missing "before" is admitted rather than papered over.
 */
export function buildImproveOutcome(args: {
  questionLabel: string | null;
  /** What the owner saw before leaving (null when the per-viewer record did not survive). */
  before: FirstRunBeforeSummary | null;
  after: ImproveReadTokens;
  target: ImproveTarget | null;
  humanize: (key: string) => string;
}): ImproveOutcome {
  const { after, target, humanize } = args;
  const before = beforeTokens(args.before, after);
  const went = args.questionLabel ? [`You went to add: ${args.questionLabel.toLowerCase()}`] : [];
  const notUsed = target?.kind === "NOT_USED_BY_READ" ? target.afterExplanation : null;
  const notUsedHeadline =
    target?.kind === "NOT_USED_BY_READ" && target.reason === "CATEGORY_NOT_READ"
      ? "Your read doesn't use that kind of information"
      : "Saved, but this read doesn't use it";

  if (!before) {
    return {
      kind: notUsed ? "NOT_USED" : "UNCOMPARABLE",
      headline: notUsed ? notUsedHeadline : "Your read was re-run",
      lines: [
        ...went,
        ...(notUsed ? [notUsed] : []),
        "OpsIQ can't compare it with the read you saw before, so it can't say whether anything changed. The read below is current.",
      ],
    };
  }

  if (readTokensEqual(before, after)) {
    if (notUsed) {
      return { kind: "NOT_USED", headline: notUsedHeadline, lines: [...went, notUsed, "Your read is unchanged."] };
    }
    const still = stillMissingLines(target);
    return { kind: "UNCHANGED", headline: "Nothing changed in your read", lines: [...went, "The recommendation, how sure OpsIQ is and what is missing are all the same.", ...still] };
  }

  const lines = [...went];
  if (before.confidenceTier !== after.confidenceTier) lines.push(`How sure OpsIQ is: ${tier(before.confidenceTier)} → ${tier(after.confidenceTier)}`);
  if (before.evidenceQuality !== after.evidenceQuality) lines.push(`How reliable your numbers are: ${quality(before.evidenceQuality)} → ${quality(after.evidenceQuality)}`);
  const filled = before.missingEvidence.filter((m) => !after.missingEvidence.includes(m));
  const newlyMissing = after.missingEvidence.filter((m) => !before.missingEvidence.includes(m));
  if (filled.length > 0) lines.push(`No longer missing: ${filled.map((m) => humanize(m).toLowerCase()).join(", ")}`);
  if (newlyMissing.length > 0) lines.push(`Now missing: ${newlyMissing.map((m) => humanize(m).toLowerCase()).join(", ")}`);
  if (before.sharpenBy && !after.sharpenBy) lines.push(`OpsIQ no longer needs: ${before.sharpenBy.toLowerCase()}`);
  else if (before.sharpenBy !== after.sharpenBy && after.sharpenBy) lines.push(`OpsIQ now asks for: ${after.sharpenBy.toLowerCase()}`);
  const goneCautions = before.cautions.filter((c) => !after.cautions.includes(c));
  if (goneCautions.length > 0) lines.push(`No longer a caution: ${goneCautions.join(" ")}`);
  const newCautions = after.cautions.filter((c) => !before.cautions.includes(c));
  if (newCautions.length > 0) lines.push(`New caution: ${newCautions.join(" ")}`);
  if (before.noticed !== after.noticed) lines.push(`What OpsIQ noticed: ${before.noticed} → ${after.noticed}`);
  lines.push(
    before.recommendedAction === after.recommendedAction
      ? `Recommendation: ${after.recommendedAction ?? "none"} (unchanged)`
      : `Recommendation: ${before.recommendedAction ?? "none"} → ${after.recommendedAction ?? "none"}`
  );
  if (notUsed) lines.push(notUsed);
  return { kind: "CHANGED", headline: "What changed after you added that", lines };
}
