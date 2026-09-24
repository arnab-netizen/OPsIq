/**
 * Shared fixtures for the Sales/Operations/Execution/Strategy/Recovery/Marketing/Cashflow
 * error-banner accessibility-semantics regression suites (see the sibling
 * `<domain>-error-banner-a11y.test.tsx` files). Each of these 7 pages renders its shared
 * page-top `error` state in an identical `<div className="mb-4 rounded-md border
 * border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>` with no
 * live-region semantics at all -- a screen-reader user got no announcement when a load/save/action
 * request failed, unlike Money (owner/finance/page.tsx) and several other owner pages
 * (Trust, onboarding, tasks/new, CreateBusinessPanel, ...) which already mark the identical
 * banner shape `role="alert"`. Fix: add `role="alert"` (an implicit assertive, atomic live
 * region) plus a stable `data-testid` to the same 7 divs, matching Money's own established
 * pattern exactly -- no other change to text, visibility conditions, or styling.
 */
export const BIZ_A = { id: "biz-a", name: "Alpha Bakery", currency: "USD", isActive: true };
export const BIZ_B = { id: "biz-b", name: "Beta Services", currency: "USD", isActive: true };

export function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

export function seedActiveBusiness(id: string) {
  window.sessionStorage.setItem("opsiq.activeBusinessId", id);
}
