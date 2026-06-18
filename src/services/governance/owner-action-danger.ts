/**
 * Owner-proposed-action danger detector (deterministic, pure).
 *
 * A confident, correct diagnosis with a SAFE recommended first action can still sit
 * in front of a DANGEROUS action the OWNER has proposed. The safety gate scores the
 * engine's recommendation and the diagnosis — it does not, on its own, see the
 * owner's intended move. This detector reads runtime evidence only (dimension /
 * finding / supportingData / isCritical) and raises ONE narrow danger signal:
 *
 *   NEGATIVE_MARGIN_DISCOUNT — the owner proposes a DEEP / BROAD / across-the-board
 *   discount (or markdown / price cut / discount campaign) WHILE contribution is
 *   already negative (or the proposed cut would turn it negative). Proceeding
 *   deepens every-unit losses and resets price expectations — value-destroying and
 *   effectively irreversible.
 *
 * BOTH conditions must hold on the CRITICAL evidence. The signal is abstain-only:
 * the gate may add an abstention from it, never a proceed. It never touches the
 * diagnosis, the first-action text, or the scorer. No case ids, no hidden keys, no
 * benchmark labels, no answer-key text.
 *
 * Deliberately NARROW (audit-scoped): it does NOT fire on generic discounting alone,
 * generic negative margin alone, a small/reversible price test, capex/expansion, or
 * debt. Broad irreversible-capex detection is intentionally excluded here — it would
 * over-abstain valid verify-first capex cases.
 */

export interface OwnerActionEvidence {
  dimension: string;
  finding: string;
  isCritical?: boolean;
  supportingData?: Record<string, string | number | boolean>;
}

export type OwnerActionDangerType = "NEGATIVE_MARGIN_DISCOUNT";

export interface OwnerActionDangerSignal {
  danger: boolean;
  type: OwnerActionDangerType | null;
  reasons: string[];
}

function text(e: OwnerActionEvidence): string {
  return `${e.finding} ${JSON.stringify(e.supportingData ?? {})}`.toLowerCase();
}
function num(e: OwnerActionEvidence, key: string): number | undefined {
  const v = (e.supportingData ?? {})[key];
  return typeof v === "number" ? v : undefined;
}

/**
 * A DEEP / BROAD / across-the-board price reduction the owner intends to apply — a
 * structural pricing move, not a measurement of existing discount leakage and not a
 * small reversible experiment.
 */
const DEEP_DISCOUNT =
  /(deep|across[- ]the[- ]board|broad|blanket|aggressive|steep|heavy|large)[\w ,'-]{0,40}?(discount|price cut|price reduction|markdown|promotion|price drop)|discount campaign|slash(?:ing)? (?:the )?prices?|cut (?:the )?prices? across|across[- ]the[- ]board (?:price )?cut/;

/**
 * Qualifiers that mark a discount as a SMALL, reversible, or test/pilot move — these
 * must NOT count as the dangerous structural discount.
 */
const REVERSIBLE_TEST =
  /\b(test|pilot|experiment|trial|a\/b|small|limited|reversible|controlled|one[- ]store|single[- ]store|short[- ]window)\b/;

/** Negative contribution / gross margin / selling below cost (or the cut would turn it negative). */
const NEGATIVE_MARGIN =
  /negative (?:unit )?(?:contribution|gross )?margin|contribution (?:would )?(?:turn|go|fall|drop)?\s*(?:negative|below zero)|selling below cost|below cost|unit economics .*negativ|margin .*(?:turn|go)s? negative|loss per unit/;

function isDeepDiscountProposal(e: OwnerActionEvidence): boolean {
  const t = text(e);
  if (!DEEP_DISCOUNT.test(t)) return false;
  if (REVERSIBLE_TEST.test(t)) return false; // small/reversible/test moves are not the danger
  return true;
}

function isNegativeContribution(e: OwnerActionEvidence): boolean {
  const c = num(e, "contribution") ?? num(e, "contributionMargin") ?? num(e, "contributionPerUnit");
  if (c !== undefined && c < 0) return true;
  const gm = num(e, "grossMarginPct") ?? num(e, "marginPct");
  if (gm !== undefined && gm < 0) return true;
  return NEGATIVE_MARGIN.test(text(e));
}

/**
 * Detect a dangerous owner-proposed action from runtime evidence. Pure & deterministic.
 * BOTH a deep/broad discount proposal AND a negative-contribution signal must be
 * present on the critical evidence (they may sit on different critical items).
 */
export function detectOwnerActionDanger(
  evidence: OwnerActionEvidence[]
): OwnerActionDangerSignal {
  const critical = (evidence ?? []).filter((e) => e.isCritical);
  const hasDeepDiscount = critical.some(isDeepDiscountProposal);
  const hasNegativeMargin = critical.some(isNegativeContribution);

  if (hasDeepDiscount && hasNegativeMargin) {
    return {
      danger: true,
      type: "NEGATIVE_MARGIN_DISCOUNT",
      reasons: [
        "owner proposes a deep/broad across-the-board discount while contribution is negative (or the cut would turn it negative) — value-destroying and effectively irreversible",
      ],
    };
  }
  return { danger: false, type: null, reasons: [] };
}
