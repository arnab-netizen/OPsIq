/**
 * Owner Intelligence Spine — survival-evidence sufficiency (pure, deterministic, no I/O, no clock).
 *
 * A numeric `BusinessConditionProfile.survivalRiskScore` below a bar is a NUMBER, not proof that survival risk is
 * low. Whether that number may be used to CLEAR a material, discretionary commitment (Portfolio investment advice)
 * is a separate fact, owned here once:
 *   - every survival-family domain that contributes to the rollup (SURVIVAL_DOMAINS) must be current — the SAME
 *     canonical `staleDomains` Owner Home resolved the decision with (no second freshness rule or constant);
 *   - Finance's liquidity must not be unconfirmed: the persisted FIN_LIQUIDITY_UNCONFIRMED finding means the bank
 *     balance is unknown, so Finance's low/zero risk is not a reading of the cash position;
 *   - a current Cashflow position must establish total cash from BOTH components (`cashflowTotalCash`, the single
 *     completeness primitive); a half-filled position never clears.
 * UNKNOWN is neither safe nor dangerous: this never alters a risk score or manufactures a risk, it only withholds
 * clearance. The facts are gathered once by Owner Home's resolution and carried as INTERNAL context.
 */
import { SURVIVAL_DOMAINS, type OwnerDomain } from "./contracts";
import { cashflowTotalCash } from "@/domain/owner-finance/liquidity";

export interface SurvivalEvidenceFacts {
  /** Every domain with a score in this business's current evidence (the survival family is filtered here). */
  domainsPresent: readonly string[];
  /** The canonical stale-evidence domains of the same resolution (owner-candidate-builder). */
  staleDomains: readonly string[];
  /** The current Finance cycle carries the FIN_LIQUIDITY_UNCONFIRMED finding (false when there is no Finance cycle). */
  financeLiquidityUnconfirmed: boolean;
  /** The current Cashflow cycle's snapshot cash components; null when there is no current Cashflow cycle. */
  cashflowPosition: { cashInHand?: number | null; bankBalance?: number | null } | null;
}

export interface SurvivalEvidenceAssessment {
  /** True only when the survival reading may be used to clear a material investment recommendation. */
  sufficient: boolean;
  /** The survival-family domains this assessment covered (a consumer must find its profile's survival domains here). */
  coveredDomains: OwnerDomain[];
  /** Contributing survival-family domains whose evidence is out of date. */
  staleSurvivalDomains: OwnerDomain[];
  financeLiquidityUnconfirmed: boolean;
  /** A current Cashflow position exists but its total cash cannot be established from both components. */
  cashflowPositionIncomplete: boolean;
}

const isSurvivalDomain = (d: string): d is OwnerDomain => (SURVIVAL_DOMAINS as readonly string[]).includes(d);

/** Pure: one deterministic assessment from the facts. A missing Cashflow cycle is not an incomplete position. */
export function assessSurvivalEvidence(facts: SurvivalEvidenceFacts): SurvivalEvidenceAssessment {
  const coveredDomains = SURVIVAL_DOMAINS.filter((d) => facts.domainsPresent.includes(d));
  const stale = new Set(facts.staleDomains);
  const staleSurvivalDomains = coveredDomains.filter((d) => stale.has(d));
  const cashflowPositionIncomplete = facts.cashflowPosition !== null && cashflowTotalCash(facts.cashflowPosition) === null;
  const financeLiquidityUnconfirmed = facts.financeLiquidityUnconfirmed;
  return {
    sufficient: staleSurvivalDomains.length === 0 && !financeLiquidityUnconfirmed && !cashflowPositionIncomplete,
    coveredDomains: [...coveredDomains],
    staleSurvivalDomains,
    financeLiquidityUnconfirmed,
    cashflowPositionIncomplete,
  };
}

export { isSurvivalDomain };
