import Link from "next/link";
import { bankBalanceEntryFor } from "@/domain/owner-finance/bank-balance-entry";

/**
 * A link straight to the bank-balance entry, shown only next to an action whose code asks for the bank balance
 * (decided by the pure domain helper — this component decides nothing).
 */
export function BankBalanceEntryLink({ code, className = "" }: { code: string | null | undefined; className?: string }) {
  const entry = bankBalanceEntryFor(code);
  if (!entry) return null;
  return (
    <Link
      href={entry.href}
      data-testid="bank-balance-entry-link"
      className={`inline-flex self-start items-center text-sm font-medium text-[var(--primary-text)] underline underline-offset-2 ${className}`.trim()}
    >
      {entry.label}
    </Link>
  );
}
