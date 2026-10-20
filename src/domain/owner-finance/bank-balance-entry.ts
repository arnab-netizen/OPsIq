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
