/**
 * Plain-language label for a machine metric key (e.g. `verificationMetric`/`sourceMetric` on a
 * finance/operations/sales/... finding or action). These keys are real, deliberately raw
 * identifiers used internally to know exactly which computed value a finding/action refers to
 * (e.g. "dataConfidenceScore", "netMarginPct", "cashRunwayDays") — but a real human usability test
 * confirmed an owner should never see the raw camelCase token itself. This is a generic
 * camelCase -> words converter, not a per-key lookup table, so it covers every current and future
 * metric key from every domain (finance, operations, sales, marketing, strategy, cashflow, sop)
 * without needing to be updated each time a new one is added.
 */
export function humanizeMetricKey(key: string): string {
  if (!key) return key;
  const withSpaces = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase();
  return withSpaces
    .replace(/\bpct\b/g, "%")
    .replace(/\bid\b/g, "ID")
    .trim();
}

// A camelCase identifier (lowercase start, at least one internal uppercase letter) — e.g.
// "dataConfidenceScore", "netMarginPct" — as opposed to an ordinary English word like "missing",
// "Compare", or "target", none of which have that lowercase-start-plus-internal-uppercase shape.
const CAMEL_CASE_TOKEN = /\b([a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*)\b/g;

/**
 * Humanizes free-text evidence/rationale copy that domain rule engines build with a raw camelCase
 * metric key embedded in it — either leading (`` `${key} = 70 < 100` ``) or mid-sentence
 * (`"Re-measure dataConfidenceScore next snapshot; target higher."`). Every domain (finance,
 * operations, sales, marketing, strategy, cashflow, sop) builds copy this same way — this is a
 * single, generic fix point rather than editing every rule/recommendation file's template string.
 * Text with no camelCase token is returned unchanged.
 */
export function humanizeEvidenceLine(line: string): string {
  return line.replace(CAMEL_CASE_TOKEN, (token) => humanizeMetricKey(token));
}
