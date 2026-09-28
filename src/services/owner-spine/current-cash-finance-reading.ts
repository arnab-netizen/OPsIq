/**
 * The ONE definition of the business's CURRENT cash/finance survival reading, used by every surface that
 * shows or enforces it (Owner Home's candidates and cash card, Now View, the owner action gate and the
 * recommendation cash-safety gate).
 *
 * Inputs are each source's CURRENT diagnosis cycle (current-diagnosis-cycle.ts): Cash flow's
 * `cashflowState` and Finance's `survivalState`, with the snapshot each ran on.
 *   - Freshness is the evidence PERIOD a reading describes (its snapshot's periodEnd), never when the
 *     cycle row was written; a reading older than the freshness window cannot be shown to be current, and
 *     neither can one whose period ends AFTER `now` (future-dated figures are not trusted current
 *     evidence: they never supersede the other source and never win arbitration by sorting latest).
 *   - A Finance diagnosis whose snapshot the owner has since AMENDED (supersededById) rests on
 *     corrected-away figures: it is not a current reading. Its state is kept only as the last known
 *     Finance state until the amended figures are diagnosed.
 *   - The two current readings are arbitrated by resolveCashFinanceSignal (a newer disagreeing reading
 *     supersedes; incomparable disagreement is an explicit conflict — never silently resolved).
 *   - `gateState` is what a safety gate enforces: the arbitrated state, the worse of the two when they
 *     conflict, and never safer than an amended-but-undiagnosed unsafe Finance reading (fail safe until
 *     the amended figures are diagnosed). When readings exist but NONE is current (out of date, or only an
 *     amended Finance reading), an unverified reading is never treated as safe: it is at least AT_RISK.
 *     null only when there is no reading at all.
 *   - PROVISIONAL evidence (the in-progress current period, current-diagnosis-cycle.ts) is supplied
 *     separately. It is never completed truth: it may only TIGHTEN — effective = worse(completed gate
 *     state, provisional state) — so a provisional SAFE/WATCH never clears or relaxes a stricter completed
 *     reading, and never supersedes one because its period ends later. With no completed reading at all,
 *     a provisional unsafe reading applies; a provisional SAFE/WATCH alone never claims safety (AT_RISK,
 *     unverified). `provisional` says when the in-progress period decides the enforced state (surfaces
 *     label it as in progress).
 *   - `gateConfidence` is how far the enforced state can be trusted: the deciding source's own data
 *     confidence, capped at UNVERIFIED_GATE_CONFIDENCE when the state rests on unverified or provisional
 *     figures; null when the deciding source supplied no confidence (the caller then treats it as unknown).
 *   - `gateSource` names the source whose figures decide it (cash flow or finance), so a refresh target
 *     points at the source that actually needs refreshing (an amended Finance snapshot → Finance).
 *   - `gateDriver` says what drives `gateState` — cash, a Finance survival state driven by profit/margin
 *     (the Finance diagnosis's own findings, supplied by the caller), or unverified figures — so a block is
 *     named by its real cause (a margin problem is never called a cash danger).
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
  /** Finance only: what drives its survival state, from its own findings (financeSurvivalDriver). */
  driver?: "cash" | "profit" | null;
  /** The diagnosis's own data confidence, 0..1 (null/absent when unknown). */
  confidence?: number | null;
}

/** Provisional (in-progress current period) readings, one per source; never completed truth. */
export interface ProvisionalCashFinanceReads {
  cash?: CashFinanceCycleRead | null;
  finance?: CashFinanceCycleRead | null;
}

/** Confidence cap for a state resting on unverified (stale, amended) or provisional figures. */
export const UNVERIFIED_GATE_CONFIDENCE = 0.4;

/** What drives a gate state: cash, a profit/margin-driven Finance state, or figures that are not current. */
export type CashFinanceGateDriver = "cash" | "finance_profit" | "unverified";

export interface CurrentCashFinanceReading extends CashFinanceResolution {
  /** Cash flow's state (null when there is no Cash flow diagnosis). */
  cashState: SurvivalLikeState | null;
  /** Finance's state while its diagnosed figures are still the owner's figures; null once amended. */
  financeState: SurvivalLikeState | null;
  /** The last Finance diagnosis's state when its figures have since been amended (not yet re-diagnosed). */
  financeAmendedLastKnown: SurvivalLikeState | null;
  /** Whether Cash flow's reading is CURRENT completed evidence (within the freshness window, not future). */
  cashCurrent: boolean;
  /** Whether Finance's reading is CURRENT completed evidence (within the window, not future, not amended). */
  financeCurrent: boolean;
  /** The state a safety gate enforces (see the module doc); null only when there is no reading. */
  gateState: SurvivalLikeState | null;
  /** What drives `gateState` (see the module doc); null when there is no reading. */
  gateDriver: CashFinanceGateDriver | null;
  /** The source whose figures decide `gateState`; null when there is no reading. */
  gateSource: "cashflow" | "finance" | null;
  /** The worst in-progress (provisional) state, when one was supplied. */
  provisionalState: SurvivalLikeState | null;
  /** True when the in-progress current period's figures decide `gateState` (label as in progress). */
  provisional: boolean;
  /** Source-derived confidence in `gateState`, 0..1 (see the module doc). */
  gateConfidence: number | null;
}

function asState(v: unknown): SurvivalLikeState | null {
  return typeof v === "string" && STATES.has(v) ? (v as SurvivalLikeState) : null;
}

/**
 * The evidence period a reading's snapshot describes, or null when that evidence cannot be shown to be
 * current: older than the freshness window, dated after `now` (a future period), or an amended Finance
 * snapshot.
 */
export function currentEvidenceTime(
  snapshot: { periodEnd?: unknown; supersededById?: unknown } | null | undefined,
  staleCutoffMs: number,
  nowMs: number
): Date | null {
  if (!snapshot?.periodEnd || snapshot.supersededById) return null;
  const periodEnd = asDate(snapshot.periodEnd);
  return periodEnd && periodEnd.getTime() >= staleCutoffMs && periodEnd.getTime() <= nowMs ? periodEnd : null;
}

function worst(...states: Array<SurvivalLikeState | null>): SurvivalLikeState | null {
  let out: SurvivalLikeState | null = null;
  for (const s of states) if (s && (!out || RANK[s] > RANK[out])) out = s;
  return out;
}

function unitConfidence(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : null;
}

function capped(v: number | null): number {
  return v === null ? UNVERIFIED_GATE_CONFIDENCE : Math.min(v, UNVERIFIED_GATE_CONFIDENCE);
}

export function currentCashFinanceReading(
  cash: CashFinanceCycleRead | null,
  finance: CashFinanceCycleRead | null,
  nowMs: number,
  provisionalReads: ProvisionalCashFinanceReads | null = null
): CurrentCashFinanceReading {
  const staleCutoffMs = nowMs - OWNER_DECISION_STALE_EVIDENCE_DAYS * DAY_MS;
  const cashState = asState(cash?.state);
  const financeRaw = asState(finance?.state);
  const amended = Boolean(finance?.snapshot?.supersededById);
  const financeState = amended ? null : financeRaw;
  const financeAmendedLastKnown = amended ? financeRaw : null;
  const cashAt = currentEvidenceTime(cash?.snapshot, staleCutoffMs, nowMs);
  const financeAt = currentEvidenceTime(finance?.snapshot, staleCutoffMs, nowMs);
  const resolution = resolveCashFinanceSignal({ state: cashState, generatedAt: cashAt }, { state: financeState, generatedAt: financeAt });
  const arbitrated = resolution.conflicting ? worst(cashState, financeState) : resolution.effectiveState;
  const amendedUnsafe = financeAmendedLastKnown && !SAFE.has(financeAmendedLastKnown) ? financeAmendedLastKnown : null;
  const known = worst(arbitrated, amendedUnsafe) ?? (financeAmendedLastKnown ?? null);
  // Readings exist but none is current: unverified figures are never treated as safe.
  const anyCurrent = (cashState !== null && cashAt !== null) || (financeState !== null && financeAt !== null);
  const completedGate = known === null ? null : anyCurrent ? known : worst(known, "AT_RISK");
  // Which completed reading DECIDES the enforced state (names the block by its real cause and says how far it
  // can be trusted). Every reading that reaches the enforced state competes — a superseded reading never
  // does — and a CURRENT one is preferred: when a current source supports the state, it decides. Only when
  // the state rests on a reading that is NOT current (out of date, or an amended Finance reading kept as a
  // fail-safe) is it unverified: the last-known figure keeps the fail-safe, but it is never a fully trusted
  // current driver — driver "unverified", refresh routed to that source, confidence capped.
  type Contributor = { src: "cashflow" | "finance"; state: SurvivalLikeState; current: boolean };
  const contributors: Contributor[] = [];
  if (cashState !== null && resolution.supersededSource !== "cash") contributors.push({ src: "cashflow", state: cashState, current: cashAt !== null });
  if (financeState !== null && resolution.supersededSource !== "finance") contributors.push({ src: "finance", state: financeState, current: financeAt !== null });
  if (financeAmendedLastKnown !== null) contributors.push({ src: "finance", state: financeAmendedLastKnown, current: false });
  const reaches = (c: Contributor) =>
    completedGate !== null && (RANK[c.state] >= RANK[completedGate] || (SAFE.has(c.state) && SAFE.has(completedGate)));
  const deciders = contributors.filter(reaches);
  const pick = (cs: Contributor[]): Contributor | null =>
    // Between two readings at the enforced state, Finance decides only when it is strictly worse (a tie is
    // named by Cash flow, as before).
    cs.length === 0 ? null : cs.reduce((a, b) => (RANK[b.state] > RANK[a.state] ? b : a));
  const currentDecider = pick(deciders.filter((c) => c.current));
  const decider = currentDecider ?? pick(deciders) ?? pick(contributors);
  const unverified = completedGate !== null && currentDecider === null;
  let gateSource: "cashflow" | "finance" | null = completedGate === null ? null : decider?.src ?? (cashState !== null ? "cashflow" : "finance");
  let gateDriver: CashFinanceGateDriver | null = completedGate === null
    ? null
    : unverified
      ? "unverified"
      : gateSource === "finance" && finance?.driver === "profit"
        ? "finance_profit"
        : "cash";
  const sourceConfidence = (src: "cashflow" | "finance" | null) =>
    src === "finance" ? unitConfidence(finance?.confidence) : src === "cashflow" ? unitConfidence(cash?.confidence) : null;
  let gateConfidence: number | null = completedGate === null ? null : unverified ? capped(sourceConfidence(gateSource)) : sourceConfidence(gateSource);

  // Provisional (in-progress) evidence: tightens only; never clears, relaxes or proves safety.
  const provCash = asState(provisionalReads?.cash?.state);
  const provFinance = asState(provisionalReads?.finance?.state);
  const provisionalState = worst(provCash, provFinance);
  let gateState = completedGate;
  let provisional = false;
  if (provisionalState !== null) {
    const provSource: "cashflow" | "finance" = provFinance !== null && (provCash === null || RANK[provFinance] > RANK[provCash]) ? "finance" : "cashflow";
    const provConfidence = capped(
      provSource === "finance" ? unitConfidence(provisionalReads?.finance?.confidence) : unitConfidence(provisionalReads?.cash?.confidence)
    );
    if (completedGate === null) {
      if (SAFE.has(provisionalState)) {
        // An in-progress SAFE/WATCH alone is not evidence of safety.
        gateState = "AT_RISK";
        gateDriver = "unverified";
      } else {
        gateState = provisionalState;
        gateDriver = provSource === "finance" && provisionalReads?.finance?.driver === "profit" ? "finance_profit" : "cash";
      }
      gateSource = provSource;
      gateConfidence = provConfidence;
      provisional = true;
    } else if (RANK[provisionalState] > RANK[completedGate]) {
      gateState = provisionalState;
      gateDriver = provSource === "finance" && provisionalReads?.finance?.driver === "profit" ? "finance_profit" : "cash";
      gateSource = provSource;
      gateConfidence = provConfidence;
      provisional = true;
    }
  }
  return {
    ...resolution,
    cashState,
    financeState,
    financeAmendedLastKnown,
    cashCurrent: cashState !== null && cashAt !== null,
    financeCurrent: financeState !== null && financeAt !== null,
    gateState,
    gateDriver,
    gateSource,
    provisionalState,
    provisional,
    gateConfidence,
  };
}
