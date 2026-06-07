/**
 * Beta data-safety notice shown above the diagnosis input form.
 * Presentational only — no logic, no data fetching.
 */
export default function DiagnosisBetaNotice() {
  return (
    <div className="mb-6 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
      <span className="font-medium text-foreground">Beta note:</span> do not enter sensitive
      personal, customer, employee, financial-account, password, or confidential business
      information.
    </div>
  );
}
