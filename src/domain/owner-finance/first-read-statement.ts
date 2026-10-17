/**
 * Owner Finance — what the first read rests on, in owner words (pure).
 *
 * Derived ONLY from the canonical first-read sufficiency (which facts are known / unknown, and the period they belong to), so
 * the statement can never say a figure was given when it is unknown, and never lets a rough first read pass for knowing the
 * whole business. Cash is not part of the first-read contract (it may be unknown), so its absence is stated, not hidden.
 */
import type { FirstReadSufficiency } from "./first-read-sufficiency";
import { periodLabel } from "@/domain/owner-first-run/first-money-read";

export interface FirstReadStatement {
  /** "You have given OpsIQ revenue and a cost figure for September 2026." */
  given: string;
  /** What is not entered and what that limits, or null when everything the first read looks for is known. */
  notGiven: string | null;
  /** Always shown: a first read is a rough picture. */
  caveat: string;
}

const CAVEAT = "That is a rough financial picture — it does not mean OpsIQ knows the whole business.";

function joinWords(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export function firstReadStatement(firstRead: FirstReadSufficiency | null | undefined): FirstReadStatement {
  if (!firstRead || firstRead.basis === "none") {
    return { given: "OpsIQ has enough saved to run a first read.", notGiven: null, caveat: CAVEAT };
  }
  const known: string[] = [];
  if (firstRead.revenueKnown) known.push("revenue");
  if (firstRead.costKnown) known.push("a cost figure");
  if (firstRead.cashKnown) known.push("cash in hand");
  const forPeriod = firstRead.period ? ` for ${periodLabel({ start: firstRead.period.start, end: firstRead.period.end })}` : "";
  const provisional = firstRead.basis === "provisional" ? ", a month that is still in progress, so the read is provisional" : "";
  const given = known.length > 0 ? `You have given OpsIQ ${joinWords(known)}${forPeriod}${provisional}.` : `OpsIQ holds saved figures${forPeriod}${provisional}.`;

  const missing: string[] = [];
  if (!firstRead.revenueKnown) missing.push("revenue");
  if (!firstRead.costKnown) missing.push("a cost figure");
  const notGivenParts: string[] = [];
  if (missing.length > 0) notGivenParts.push(`${joinWords(missing)} ${missing.length === 1 ? "is" : "are"} not entered yet.`);
  if (!firstRead.cashKnown) notGivenParts.push("Cash in hand is not entered, so OpsIQ can't yet say how long your cash will last.");
  return { given, notGiven: notGivenParts.length > 0 ? notGivenParts.join(" ") : null, caveat: CAVEAT };
}
