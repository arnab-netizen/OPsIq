/**
 * The ONE definition of the business's CURRENT cash/finance survival reading, used by every surface that
 * shows or enforces it (Owner Home's candidates and cash card, Now View, the owner action gate and the
 * recommendation cash-safety gate).
 *
 * Inputs are each source's CURRENT diagnosis cycle (current-diagnosis-cycle.ts): Cash flow's
 * `cashflowState` and Finance's `survivalState`, with the snapshot each ran on.
 *   - Freshness is the evidence PERIOD a reading describes (its snapshot's periodEnd), never when the
 *     cycle row was written; a reading older than the freshness window cannot be shown to be current.
 *   - A Finance diagnosis whose snapshot the owner has since AMENDED (supersededById) rests on
 *     corrected-away figures: it is not a current reading. Its state is kept only as the last known
 *     Finance state until the amended figures are diagnosed.
 *   - The two current readings are arbitrated by resolveCashFinanceSignal (a newer disagreeing reading
 *     supersedes; incomparable disagreement is an explicit conflict — never silently resolved).
 *   - `gateState` is what a safety gate enforces: the arbitrated state, the worse of the two when they
 *     conflict, and never safer than an amended-but-undiagnosed unsafe Finance reading (fail safe until
 *     the amended figures are diagnosed). null only when there is no reading at all.
 */
import { resolveCashFinanceSignal, type CashFinanceResolution, type SurvivalLikeState } from "@/domain/owner-guidance/cash-finance-conflict";
import { asDate, OWNER_DECISION_STALE_EVIDENCE_DAYS } from "@/services/owner-home/owner-decision-candidates";

const DAY_MS = 86_400_000;
const STATES: ReadonlySet<string> = new Set(["SAFE", "WATCH", "AT_RISK", "CRITICAL", "INSOLVENT_RISK"]);
const SAFE: ReadonlySet<string> = new Set(["SAFE", "WATCH"]);
const RANK: Record<SurvivalLikeState, number> = { SAFE: 0, WATCH: 1, AT_RISK: 2, CRITICAL: 3, INSOLVENT_RISK: 4 };

/** A source's current diagnosis cycle, as far as this reading needs it. */
export interface CashFinanceCycleRead {
  state: string | null | undefined;
  snapshot?: { periodEnd?: unknown; supersededById?: unknown } | null;
}

export interface CurrentCashFinanceReading extends CashFinanceResolution {
  /** Cash flow's state (null when there is no Cash flow diagnosis). */
  cashState: SurvivalLikeState | null;
  /** Finance's state while its diagnosed figures are still the owner's figures; null once amended. */
  financeState: SurvivalLikeState | null;
  /** The last Finance diagnosis's state when its figures have since been amended (not yet re-diagnosed). */
  financeAmendedLastKnown: SurvivalLikeState | null;
  /** The state a safety gate enforces (see the module doc); null only when there is no reading. */
  gateState: SurvivalLikeState | null;
}

function asState(v: unknown): SurvivalLikeState | null {
  return typeof v === "string" && STATES.has(v) ? (v as SurvivalLikeState) : null;
}

/**
 * The evidence period a reading's snapshot describes, or null when that evidence cannot be shown to be
 * current (older than the freshness window, or an amended Finance snapshot).
 */
export function currentEvidenceTime(snapshot: { periodEnd?: unknown; supersededById?: unknown } | null | undefined, staleCutoffMs: number): Date | null {
  if (!snapshot?.periodEnd || snapshot.supersededById) return null;
  const periodEnd = asDate(snapshot.periodEnd);
  return periodEnd && periodEnd.getTime() >= staleCutoffMs ? periodEnd : null;
}

function worst(...states: Array<SurvivalLikeState | null>): SurvivalLikeState | null {
  let out: SurvivalLikeState | null = null;
  for (const s of states) if (s && (!out || RANK[s] > RANK[out])) out = s;
  return out;
}

export function currentCashFinanceReading(
  cash: CashFinanceCycleRead | null,
  finance: CashFinanceCycleRead | null,
  nowMs: number
): CurrentCashFinanceReading {
  const staleCutoffMs = nowMs - OWNER_DECISION_STALE_EVIDENCE_DAYS * DAY_MS;
  const cashState = asState(cash?.state);
  const financeRaw = asState(finance?.state);
  const amended = Boolean(finance?.snapshot?.supersededById);
  const financeState = amended ? null : financeRaw;
  const financeAmendedLastKnown = amended ? financeRaw : null;
  const resolution = resolveCashFinanceSignal(
    { state: cashState, generatedAt: currentEvidenceTime(cash?.snapshot, staleCutoffMs) },
    { state: financeState, generatedAt: currentEvidenceTime(finance?.snapshot, staleCutoffMs) }
  );
  const arbitrated = resolution.conflicting ? worst(cashState, financeState) : resolution.effectiveState;
  const amendedUnsafe = financeAmendedLastKnown && !SAFE.has(financeAmendedLastKnown) ? financeAmendedLastKnown : null;
  const gateState = worst(arbitrated, amendedUnsafe) ?? (financeAmendedLastKnown ?? null);
  return { ...resolution, cashState, financeState, financeAmendedLastKnown, gateState };
}
