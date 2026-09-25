/**
 * QuickBooks Online — OAuth callback outcome classification.
 *
 * Maps an error thrown while completing the connection to the non-sensitive
 * outcome code carried back to the owner Integrations page
 * (?quickbooks_error=<code>). Classification is by error CLASS/name only —
 * no provider message, code, state or token is ever reflected into the URL.
 * Name-based (not instanceof) so it is stable across module boundaries.
 */
export const QBO_CONNECT_ERROR_CODES = [
  "access_denied",
  "invalid_state",
  "exchange_failed",
  "company_mismatch",
  "not_configured",
  "unknown",
] as const;

export type QboConnectErrorCode = (typeof QBO_CONNECT_ERROR_CODES)[number];

export function classifyQuickBooksConnectError(err: unknown): QboConnectErrorCode {
  const name = err instanceof Error ? err.name : "";
  switch (name) {
    case "UnauthorizedError":
    case "ValidationError":
      return "invalid_state";
    case "ConflictError":
      return "company_mismatch";
    case "FeatureDisabledError":
      return "not_configured";
    case "QboApiError":
      return "exchange_failed";
    default:
      return "unknown";
  }
}
