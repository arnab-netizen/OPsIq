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
