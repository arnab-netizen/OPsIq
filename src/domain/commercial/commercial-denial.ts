/**
 * Client-side recognition of a commercial denial. Presentation only: the server already made the
 * decision (HTTP 402 from PlanLimitError); this just names the signal so the UI can show the
 * upgrade state. The UI is never the security boundary.
 */
export const COMMERCIAL_DENIED_EVENT = "opsiq:commercial-denied";

export function isCommercialDenialStatus(httpStatus: number | undefined): boolean {
  return httpStatus === 402;
}
