/**
 * P0-A — existing (pre-`isFixtureBusiness`) acceptance/QA business remediation.
 *
 * `isFixtureBusiness` (see ACCEPTANCE_FIXTURE_ISOLATION_PLAN.md) only tags rows created AFTER
 * that migration shipped. Every "OPSIQ Acceptance ..." / "OPSIQ Production Acceptance ..."
 * business created before it defaults to `isFixtureBusiness: false` under the additive migration
 * and is indistinguishable from a real owner's business by that column alone.
 *
 * This module is the classification logic ONLY — it never queries or mutates the database. It
 * is deliberately conservative and fails closed: a row is only ever proposed as a confident
 * historical-fixture candidate when BOTH an independent name signal and an independent actor
 * signal agree. A name-only match (the previous, forbidden approach of hiding rows purely by
 * matching their display name) is downgraded to "ambiguous" and is never proposed for
 * reclassification — ambiguous rows require manual review, not automatic action.
 *
 * Nothing in this module mutates `isFixtureBusiness` on any row. The dry-run script
 * (scripts/dry-run-legacy-fixture-classification.ts) calls this with real data and only ever
 * REPORTS the result; a separate, explicitly-authorized change would be required to act on it.
 */

/** The naming convention every known acceptance/production-acceptance business-creation path in
 *  this repo uses (see tests/production/helpers/domain-business.ts and
 *  tests/production/10-startup-mode-acceptance.spec.ts). Anchored at the start of the name so an
 *  unrelated real business that merely mentions "acceptance" elsewhere in its name (e.g. "Client
 *  Acceptance Corp") never matches — a substring match would be exactly the forbidden
 *  "string-match/hide in React" approach this remediation must avoid. */
const ACCEPTANCE_NAME_PATTERN = /^OPSIQ (Production )?Acceptance\b/i;

export interface LegacyBusinessCandidateInput {
  id: string;
  name: string;
  /** Current value of OwnerBusiness.isFixtureBusiness. Rows already tagged true are not
   *  candidates for this remediation — there is nothing left to classify for them. */
  isFixtureBusiness: boolean;
  /** Email of the row's createdBy user, resolved by the caller (this module never queries the
   *  database). Null when createdBy is null or does not resolve to a known user. */
  createdByEmail: string | null;
}

export interface LegacyFixtureClassificationResult {
  /** Rows where BOTH the name pattern and a known acceptance-actor email agree. The only rows a
   *  future, explicitly-authorized remediation step may consider reclassifying. */
  confidentFixtureIds: string[];
  /** Rows where the name pattern matches but the actor signal does not confirm it (unknown actor,
   *  or createdBy could not be resolved to any user). These must NEVER be auto-reclassified —
   *  they require manual review by whoever owns acceptance testing and/or the real business. */
  ambiguousIds: string[];
}

/**
 * Classifies candidate `OwnerBusiness` rows using two independent signals — the row's display
 * name and the email of the actor who created it — so that neither signal alone can trigger a
 * classification. `knownAcceptanceActorEmails` should be sourced from the real
 * `PRODUCTION_ACCEPTANCE_EMAIL`-style account(s) used to run acceptance testing, never guessed.
 */
export function classifyLegacyFixtureCandidates(
  rows: readonly LegacyBusinessCandidateInput[],
  knownAcceptanceActorEmails: readonly string[]
): LegacyFixtureClassificationResult {
  const knownEmails = new Set(knownAcceptanceActorEmails.map((e) => e.toLowerCase()));
  const confidentFixtureIds: string[] = [];
  const ambiguousIds: string[] = [];

  for (const row of rows) {
    if (row.isFixtureBusiness) continue;
    if (!ACCEPTANCE_NAME_PATTERN.test(row.name)) continue;

    const actorKnown = !!row.createdByEmail && knownEmails.has(row.createdByEmail.toLowerCase());
    if (actorKnown) {
      confidentFixtureIds.push(row.id);
    } else {
      ambiguousIds.push(row.id);
    }
  }

  return { confidentFixtureIds, ambiguousIds };
}
