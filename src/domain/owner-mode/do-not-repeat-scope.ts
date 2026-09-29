/**
 * The ONE do-not-repeat scope taxonomy (pure).
 *
 * A "scope" do-not-repeat memory is keyed `scope:<area>`. Every producer and every reader builds that key
 * here — no file writes the `scope:` prefix by hand (src/__tests__/governance/owner-dnr-scope-taxonomy.test.ts).
 *
 * Owner Mode: owner action domains are the scope areas. The cash area has two historical spellings
 * ("cash" — Now View's issue vocabulary — and "cashflow" — the owner domain); the canonical area is the
 * owner domain, and readers still match the legacy spelling so a rule recorded under it keeps applying.
 *
 * A broad scope rule (`scope:<domain>`) records that a decision in that AREA failed before. It does not
 * prove that a given action repeats the failed tactic, so in Owner Mode it may hold back only growth work
 * (a GROW step, or an action whose intent is unknown — the conservative legacy fallback). It never stops
 * SAFETY / STABILISE / REPAIR / EVIDENCE work (refreshing cash data, collecting receivables, stopping a
 * leak, stabilising runway), and never an EXECUTE step: executing an existing plan is not proven to
 * repeat the failed lever by an area token. An EXACT memory (a finding-specific key,
 * `scope:<area>:finding:<id>`) is a proven repeat of that decision and applies whatever the intent.
 *
 * Formal Consulting Mode keeps its own semantics: its keys are `scope:<impactArea>` exactly as recorded
 * (consultingScopeKey — no aliasing, no intent exemption).
 */
import type { OwnerTargetIntent } from "@/domain/owner-spine/owner-imperatives";

export const DNR_SCOPE_PREFIX = "scope:";

/** Owner action domains that carry do-not-repeat scope memories. */
export const OWNER_DNR_SCOPE_DOMAINS = ["finance", "cashflow", "sales", "operations", "sop", "marketing", "strategy", "recovery"] as const;
export type OwnerDnrScopeDomain = (typeof OWNER_DNR_SCOPE_DOMAINS)[number];

/** Legacy / alternate spellings of an owner scope area → the canonical owner domain. */
const OWNER_SCOPE_ALIASES: Readonly<Record<string, OwnerDnrScopeDomain>> = Object.freeze({
  cash: "cashflow",
  "cash-flow": "cashflow",
  cash_flow: "cashflow",
  execution: "sop",
});

function normalizeArea(area: string | null | undefined): string | null {
  if (!area) return null;
  const norm = area.trim().toLowerCase();
  return norm || null;
}

/** The canonical owner scope domain for an area name (alias-resolved), or null when it is not an owner domain. */
export function canonicalOwnerScopeDomain(area: string | null | undefined): OwnerDnrScopeDomain | null {
  const norm = normalizeArea(area);
  if (!norm) return null;
  const aliased = OWNER_SCOPE_ALIASES[norm] ?? norm;
  return (OWNER_DNR_SCOPE_DOMAINS as readonly string[]).includes(aliased) ? (aliased as OwnerDnrScopeDomain) : null;
}

/** The canonical key a new Owner-Mode scope memory is written under (null when the area is not an owner domain). */
export function ownerScopeKey(area: string | null | undefined): string | null {
  const d = canonicalOwnerScopeDomain(area);
  return d ? `${DNR_SCOPE_PREFIX}${d}` : null;
}

/** Every key a reader matches for an owner domain's broad scope: the canonical key and its legacy spellings. */
export function ownerScopeLookupKeys(area: string | null | undefined): string[] {
  const d = canonicalOwnerScopeDomain(area);
  if (!d) return [];
  const aliases = Object.entries(OWNER_SCOPE_ALIASES).filter(([, to]) => to === d).map(([from]) => `${DNR_SCOPE_PREFIX}${from}`);
  return [`${DNR_SCOPE_PREFIX}${d}`, ...aliases];
}

/**
 * A stored memory key as an owner do-not-repeat rule: a broad area key (`scope:<domain>`) or an exact,
 * finding-specific key (`scope:<domain>:finding:<id>`), alias-resolved. Null when the key names no owner domain.
 */
export function parseOwnerDnrKey(memoryKey: string): { domain: OwnerDnrScopeDomain; match: "broad" | "exact"; findingId: string | null } | null {
  if (!memoryKey.startsWith(DNR_SCOPE_PREFIX)) return null;
  const parts = memoryKey.slice(DNR_SCOPE_PREFIX.length).split(":");
  const domain = canonicalOwnerScopeDomain(parts[0]);
  if (!domain) return null;
  if (parts.length === 1) return { domain, match: "broad", findingId: null };
  if (parts.length === 3 && parts[1] === "finding" && parts[2]) return { domain, match: "exact", findingId: parts[2] };
  return null;
}

/** The exact (finding-specific) key under a scope key. */
export function exactScopeKey(scopeKey: string, findingId: string): string {
  return `${scopeKey}:finding:${findingId}`;
}

/** Formal Consulting Mode: its scope key for a finding's impact area, exactly as recorded (unchanged semantics). */
export function consultingScopeKey(impactArea: string | null | undefined): string | null {
  const norm = normalizeArea(impactArea);
  return norm ? `${DNR_SCOPE_PREFIX}${norm}` : null;
}

/**
 * Owner Mode: whether a matched do-not-repeat memory holds back an action of this intent.
 *   - "exact": a finding-specific memory — a proven repeat — applies to every intent;
 *   - "broad": an area memory — applies only to GROW, or to an unknown intent (legacy fallback).
 */
export function ownerDoNotRepeatApplies(match: "exact" | "broad", intent: OwnerTargetIntent | null): boolean {
  if (match === "exact") return true;
  return intent === null || intent === "GROW";
}
