/**
 * Deterministic case-expansion generator.
 *
 * Derives 200+ structured validation cases from the 31 chaos seeds WITHOUT erasing any seed
 * invariant. Every variant:
 *   - keeps the seed's hiddenRootCause, temptingBadDecision, correctExpertDecision, reassessment
 *     trigger, learningRuleIfFails and numbers EXACTLY (append-only on the guidance arrays),
 *   - keeps a traceable sourceSeedCaseId,
 *   - is re-localised into one of the 13 location presets, and
 *   - is stressed by a "chaos lens" (hostile / stale-data / remote-owner / multi-branch /
 *     owner-emotional / compliance) that adds real-world mess and the matching guidance anchors.
 *
 * Generation is fully deterministic (no Math.random / Date) so the corpus and its distribution are
 * reproducible and test-assertable. The required distribution is guaranteed by construction and
 * re-checked by `distributionOf` + the expansion-integrity test.
 */
import type { BehavioralCase, CaseFlags } from "./schema";
import { LOCATIONS, type LocationKey } from "./locations";
import { SEED_CASES } from "./seed-cases";

const LOCATION_KEYS = Object.keys(LOCATIONS) as LocationKey[];

type Lens = "plain" | "hostile" | "stale" | "remote" | "multibranch" | "emotional" | "compliance";

interface LensOverlay {
  flags: Partial<CaseFlags>;
  facts: (c: BehavioralCase) => string[];
  say: string[];
  block: string[];
  proof: string[];
}

const LENS_OVERLAYS: Record<Lens, LensOverlay> = {
  plain: {
    flags: {},
    facts: (c) => [
      `Local reality: ${c.location.localCustomerBehavior}; payment: ${c.location.localPaymentBehavior}.`,
    ],
    say: ["Adapt the plan to local customer, labour and payment reality — do not copy a generic playbook"],
    block: [],
    proof: [],
  },
  hostile: {
    flags: { hostile: true },
    facts: () => [
      "A staff member is self-reporting the numbers and may be inflating/gaming them to look better",
      "Some 'proof' offered is a screenshot or verbal claim that cannot be independently checked",
    ],
    say: ["Some figures may be gamed — require independent, system-level proof before acting"],
    block: ["Acting on self-reported or unverifiable numbers without independent verification"],
    proof: ["Independent system/third-party verification of the claimed numbers"],
  },
  stale: {
    flags: { missingOrStaleData: true },
    facts: () => [
      "Key figures are weeks stale and conflict across the owner's notes, the till and WhatsApp",
      "At least one critical number the decision depends on is simply missing",
    ],
    say: ["Data is stale, missing or conflicting — do not act with high confidence; reconcile current data first"],
    block: ["Giving a confident recommendation on stale/missing/conflicting data"],
    proof: ["Reconciled current-period data before any irreversible action"],
  },
  remote: {
    flags: { remoteOwner: true },
    facts: () => [
      "The owner is running this remotely and only sees what staff choose to report",
      "There is no on-site presence to catch problems early",
    ],
    say: ["Owner is remote — install delegated, proof-based controls instead of presence-based oversight"],
    block: ["Plans that silently assume the owner is physically present to supervise"],
    proof: ["Async dashboard / dated photo / system proof from the site"],
  },
  multibranch: {
    flags: { multiBranch: true },
    facts: () => [
      "The same pattern repeats across several branches with very different performance",
      "A portfolio average is hiding at least one failing branch",
    ],
    say: ["Break the problem down per branch — do not let a portfolio average hide a failing location"],
    block: ["Acting on a blended average that masks a failing branch"],
    proof: ["Per-branch P&L / per-branch breakdown"],
  },
  emotional: {
    flags: { ownerEmotional: true },
    facts: () => [
      "The owner is emotionally attached to this decision (pride, fear of looking weak, or loyalty) and wants to act now",
      "The emotional preference is pushing against what the numbers suggest",
    ],
    say: ["Separate emotion from evidence — require proof before the emotionally-preferred action and offer a safer alternative"],
    block: ["Enabling an emotion-driven action without proof or a cooling-off check"],
    proof: ["Evidence that the emotionally-preferred action is also the financially sound one"],
  },
  compliance: {
    flags: { complianceRisk: true },
    facts: () => [
      "There is a licensing / tax / regulatory grey area the owner would prefer to ignore",
      "The owner is asking for a definitive legal/tax answer the business cannot safely self-certify",
    ],
    say: ["Compliance is uncertain here — flag for professional review and do not give definitive legal/tax advice"],
    block: ["Proceeding past a compliance grey area without professional review"],
    proof: ["Written professional compliance / tax review"],
  },
};

/** Per-seed lens schedule — guarantees the required distribution minimums by construction. */
const LENS_SCHEDULE: Lens[] = [
  "plain",
  "hostile",
  "hostile",
  "stale",
  "stale",
  "remote",
  "multibranch",
  "emotional",
  "compliance",
];

function mergeFlags(base: CaseFlags, overlay: Partial<CaseFlags>): CaseFlags {
  return { ...base, ...overlay };
}

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

function makeVariant(seed: BehavioralCase, lens: Lens, locKey: LocationKey, slot: number): BehavioralCase {
  const ov = LENS_OVERLAYS[lens];
  return {
    ...seed,
    id: `${seed.id}__v${slot}_${lens}_${locKey}`,
    sourceSeedCaseId: seed.sourceSeedCaseId, // preserved invariant
    location: LOCATIONS[locKey],
    flags: mergeFlags(seed.flags, ov.flags),
    messyFacts: uniq([...seed.messyFacts, ...ov.facts(seed)]),
    // hiddenRootCause / temptingBadDecision / correctExpertDecision / numbers / reassessmentTrigger /
    // learningRuleIfFails are intentionally untouched — append-only guidance below.
    opsiqShouldSay: uniq([...seed.opsiqShouldSay, ...ov.say]),
    opsiqShouldBlock: uniq([...seed.opsiqShouldBlock, ...ov.block]),
    proofRequired: uniq([...seed.proofRequired, ...ov.proof]),
  };
}

/** Expand seeds into the full deterministic corpus (seeds first, then variants). */
export function expandCases(seeds: BehavioralCase[] = SEED_CASES): BehavioralCase[] {
  const out: BehavioralCase[] = [...seeds];
  seeds.forEach((seed, s) => {
    LENS_SCHEDULE.forEach((lens, i) => {
      const locKey = LOCATION_KEYS[(s * LENS_SCHEDULE.length + i) % LOCATION_KEYS.length];
      out.push(makeVariant(seed, lens, locKey, i));
    });
  });
  // Defensive: ids must be unique (traceability + dedupe).
  const seen = new Set<string>();
  for (const c of out) {
    if (seen.has(c.id)) throw new Error(`expansion produced duplicate id: ${c.id}`);
    seen.add(c.id);
  }
  return out;
}

export const EXPANDED_CASES: BehavioralCase[] = expandCases();

// ─── Distribution reporting (used by tests + report) ─────────────────────────────────────────────
export interface Distribution {
  total: number;
  hostile: number;
  missingOrStaleData: number;
  cashMarginWorkingCapital: number;
  staffProcessEquipment: number;
  marketingOpportunityContract: number;
  complianceLocation: number;
  ownerEmotional: number;
  remoteOwner: number;
  multiBranch: number;
  distinctLocations: number;
  distinctArchetypes: number;
  distinctSeeds: number;
}

export function distributionOf(cases: BehavioralCase[]): Distribution {
  const locs = new Set<string>();
  const archs = new Set<string>();
  const seeds = new Set<string>();
  let hostile = 0,
    stale = 0,
    cash = 0,
    staff = 0,
    marketing = 0,
    compliance = 0,
    emotional = 0,
    remote = 0,
    multi = 0;
  for (const c of cases) {
    locs.add(`${c.location.country}|${c.location.marketTier}|${c.location.cityRegion}`);
    archs.add(c.archetype);
    seeds.add(c.sourceSeedCaseId);
    if (c.flags.hostile) hostile++;
    if (c.flags.missingOrStaleData) stale++;
    if (c.decisionCategory === "cash_margin_working_capital") cash++;
    if (c.decisionCategory === "staff_process_equipment") staff++;
    if (c.decisionCategory === "marketing_opportunity_contract") marketing++;
    if (c.decisionCategory === "compliance_location_review" || c.flags.complianceRisk) compliance++;
    if (c.flags.ownerEmotional) emotional++;
    if (c.flags.remoteOwner) remote++;
    if (c.flags.multiBranch) multi++;
  }
  return {
    total: cases.length,
    hostile,
    missingOrStaleData: stale,
    cashMarginWorkingCapital: cash,
    staffProcessEquipment: staff,
    marketingOpportunityContract: marketing,
    complianceLocation: compliance,
    ownerEmotional: emotional,
    remoteOwner: remote,
    multiBranch: multi,
    distinctLocations: locs.size,
    distinctArchetypes: archs.size,
    distinctSeeds: seeds.size,
  };
}

/** Required minimums from the brief — asserted by the expansion-integrity test. */
export const REQUIRED_DISTRIBUTION = {
  total: 200,
  hostile: 60,
  missingOrStaleData: 50,
  cashMarginWorkingCapital: 50,
  staffProcessEquipment: 50,
  marketingOpportunityContract: 50,
  complianceLocation: 30,
  ownerEmotional: 30,
  remoteOwner: 20,
  multiBranch: 20,
  distinctLocations: 12,
} as const;

/** Cases for a single validation mode. */
export function casesForMode(mode: "smoke" | "core" | "hostile", all: BehavioralCase[] = EXPANDED_CASES): BehavioralCase[] {
  if (mode === "hostile") return all.filter((c) => c.flags.hostile).slice(0, 60);
  if (mode === "smoke") {
    // 25 cases spanning seeds/archetypes/categories — first variant of the first 25 distinct seeds.
    const bySeed = new Map<string, BehavioralCase>();
    for (const c of all) if (!bySeed.has(c.sourceSeedCaseId)) bySeed.set(c.sourceSeedCaseId, c);
    const picked = Array.from(bySeed.values()).slice(0, 25);
    // top up to 25 if fewer than 25 seeds
    if (picked.length < 25) picked.push(...all.slice(0, 25 - picked.length));
    return picked.slice(0, 25);
  }
  return all.slice(0, Math.max(200, all.length));
}
