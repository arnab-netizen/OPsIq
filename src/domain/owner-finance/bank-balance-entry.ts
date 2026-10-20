/**
 * Where an owner enters the bank balance, and which recommendations ask for it (pure).
 *
 * The bank balance is stored on a Cashflow snapshot (unchanged), but "Cashflow" is not a destination an owner can
 * reach from the navigation. Every surface that asks for the figure therefore describes it in plain words and links
 * straight to the entry, rather than telling the owner to go to a page they cannot find.
 */

/** The existing entry for the bank balance. The link follows the owner's active business. */
export const BANK_BALANCE_ENTRY_HREF = "/owner/cashflow";

export const BANK_BALANCE_ENTRY_LABEL = "Enter your bank balance →";

/** The finding / recommendation codes whose next action is "add your bank balance". */
const BANK_BALANCE_ACTION_CODES: ReadonlySet<string> = new Set(["FIN_LIQUIDITY_UNCONFIRMED", "FINREC_CONFIRM_BANK_BALANCE"]);

/** The bank-balance entry link for a recommendation / target code, or null when that action is not about the bank balance. */
export function bankBalanceEntryFor(code: string | null | undefined): { href: string; label: string } | null {
  return code && BANK_BALANCE_ACTION_CODES.has(code) ? { href: BANK_BALANCE_ENTRY_HREF, label: BANK_BALANCE_ENTRY_LABEL } : null;
}

/**
 * The current owner instruction for the bank-balance action. The single source: the recommendation template
 * stores this text, and `presentBankBalanceActionText` falls back to it for rows saved before the wording changed.
 */
export const BANK_BALANCE_OWNER_ACTION =
  "Enter the total across your bank accounts right now, and your cash in hand too if you know it — the “Enter your bank balance” link on Home or Money opens the entry. Enter 0 only if you really hold nothing there, and leave a figure blank if you don't know it — OpsIQ will say what it can't conclude rather than guess.";

/** The historical wording that sent the owner to pages they could not reach ("Guided setup", the Cashflow page). */
const LEGACY_NAVIGATION = /Guided setup|Cashflow/i;

/**
 * Presentation compatibility for ALREADY-SAVED bank-balance actions: a finance action stores its description when it
 * is created, so a row from before the wording changed still carries the old navigation text. For a bank-balance
 * action (proved by its code) whose stored text is that legacy navigation wording, show the current instruction.
 * Any other action, and a bank-balance action whose text is already current, is returned exactly as stored.
 * Stored rows are never rewritten.
 */
export function presentBankBalanceActionText(code: string | null | undefined, stored: string | null | undefined): string {
  const text = stored ?? "";
  if (!bankBalanceEntryFor(code)) return text;
  return LEGACY_NAVIGATION.test(text) ? BANK_BALANCE_OWNER_ACTION : text;
}

/** The exact clause a saved bank-balance finding's evidence line used to end with. */
const LEGACY_EVIDENCE_CLAUSE = " in Guided setup or Cashflow";

/** The same compatibility for a saved bank-balance finding's evidence line: only that exact historical clause is dropped. */
export function presentBankBalanceEvidenceLine(code: string | null | undefined, line: string): string {
  return bankBalanceEntryFor(code) ? line.replace(LEGACY_EVIDENCE_CLAUSE, "") : line;
}
