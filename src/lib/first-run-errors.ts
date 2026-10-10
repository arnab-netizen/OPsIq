/**
 * Owner-facing text for a failed first-run request. The generic operator-safe classifier is built for operator consoles:
 * for a 5xx or a network drop it promises an "automatic retry" that no first-run screen performs, and for a 403 it speaks
 * of a "workspace". Here the text is fixed and truthful: a server-stated reason for an expected 4xx is shown verbatim
 * (it is governed, owner-safe copy), anything else is a plain "try again".
 */
import { HttpResponseError } from "@/lib/operator-safe-errors";

export const FIRST_RUN_TRY_AGAIN = "Something went wrong on our side. Please try again in a moment. If it keeps happening, contact support.";
export const FIRST_RUN_NO_ACCESS = "You don't have access to this. Sign in again, or contact support.";

export function firstRunErrorText(failure: unknown): string {
  if (failure instanceof HttpResponseError) {
    if (failure.status === 401 || failure.status === 403) return FIRST_RUN_NO_ACCESS;
    if (failure.status >= 400 && failure.status < 500 && failure.hasServerMessage) return failure.message;
  }
  return FIRST_RUN_TRY_AGAIN;
}
