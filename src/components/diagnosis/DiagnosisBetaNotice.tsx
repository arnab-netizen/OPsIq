/**
 * Beta data-safety notice shown above the diagnosis input form.
 * Presentational only — no logic, no data fetching.
 */
export default function DiagnosisBetaNotice() {
  return (
    <div className="mb-6 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
      <span className="font-medium text-foreground">Beta note:</span> enter only the monthly totals
      this form asks for. Otherwise, do not enter sensitive personal, customer, employee,
      financial-account, password, or other confidential business information.
    </div>
  );
}
