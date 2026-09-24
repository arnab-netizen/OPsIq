/**
 * Shared fixtures for the Execution/Strategy/Marketing/Cashflow finding-label-lookup regression
 * suites (see the sibling `<domain>-finding-label-lookup.test.tsx` files). These 4 pages each
 * define their own local `FINDING_TYPE_LABEL`/`SEVERITY_LABEL`/`SEVERITY_VARIANT` maps and index
 * them with `f.findingType`/`f.severity` from a `cycle.findings` array returned by the dashboard
 * API -- server-controlled data. Before this fix, `map[key]` was a bare, unguarded lookup: every
 * plain JS object inherits `Object.prototype` members, so a findingType/severity value equal to
 * one of those names could resolve to the inherited member instead of `undefined`, producing a
 * value React cannot render (a function or the prototype object itself) instead of falling
 * through to the pre-existing raw-value fallback. Same root cause PR #525 fixed in
 * `FindingCard.tsx`; these are the "4 remaining direct lookup sites" that PR's own description
 * named as a known, deferred limitation.
 */
export const POISON_VALUES = ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"];

export function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

export interface FindingFixtureOverrides {
  id?: string;
  findingType?: string;
  severity?: string;
  title?: string;
}

export function buildFinding(overrides: FindingFixtureOverrides = {}) {
  return {
    id: overrides.id ?? "finding-1",
    findingType: overrides.findingType ?? "risk",
    title: overrides.title ?? "Customers are churning fast",
    summary: "A large share of the customer base is being lost.",
    sourceMetric: "lostCustomerRatePercent",
    sourceValue: 57.1,
    threshold: 35,
    severity: overrides.severity ?? "critical",
    confidence: 0.8,
    evidence: [],
  };
}
