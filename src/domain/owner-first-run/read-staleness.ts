/**
 * Stale-read contract. A first read is only usable while the figures it was built on are still the current ones.
 * The server decides (compare-at-write inside the decision transaction); this module only owns the shared
 * vocabulary so the API error and the owner-facing copy cannot drift apart. Pure.
 */
export const READ_STALE_CODE = "READ_STALE" as const;

export const READ_STALE_MESSAGE =
  "Your numbers changed since this read was created. Update the read before using this recommendation.";

/** Corrected numbers WERE saved but the read could not be re-run: never imply the old evidence still applies. */
export const CORRECTION_SAVED_READ_PENDING_MESSAGE =
  "Your corrected numbers are saved, but OpsIQ couldn't update the read yet. Retry the read before using the previous recommendation.";

/** A correction request that failed before anything was confirmed saved. */
export const CORRECTION_UNCONFIRMED_MESSAGE =
  "We couldn't confirm your correction. Reload this page to see whether it was saved before you rely on this read.";

export function isReadStaleMessage(message: string | null | undefined): boolean {
  return message === READ_STALE_MESSAGE;
}

/** The refusal happened, but the screen has already been brought up to date: say so instead of asking for an update that is done. */
export const READ_REFRESHED_AFTER_STALE_MESSAGE =
  "Your numbers changed since this read was created, so OpsIQ has refreshed it. Review the new read, then choose again.";

/** Why a read is out of date (decided on the server; the screens only render it). */
export type ReadStaleReason = "FIGURES_CHANGED" | "CASH_POSITION_CHANGED";

/** The figures were corrected after the last read. */
export const FIGURES_CHANGED_NOTE = "Your earlier numbers are kept on record. OpsIQ will work out a fresh read from the new ones.";

/** A Cashflow entry this read depended on (bank balance or cash in hand) was added or edited after the read was made. */
export const CASH_POSITION_CHANGED_NOTE = "Your cash figures changed since this read was made, so the read may no longer match them. Update the read to include them.";

export const CASH_POSITION_CHANGED_HEADLINE = "Your cash figures changed since this read.";

export function staleReadHeadline(reason: ReadStaleReason): string {
  return reason === "CASH_POSITION_CHANGED" ? CASH_POSITION_CHANGED_HEADLINE : "Your numbers have changed since your last read.";
}

export function staleReadNote(reason: ReadStaleReason): string {
  return reason === "CASH_POSITION_CHANGED" ? CASH_POSITION_CHANGED_NOTE : FIGURES_CHANGED_NOTE;
}
