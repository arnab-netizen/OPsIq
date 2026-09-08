"use client";

/**
 * The insufficient-data explanation for a diagnosis-engine domain (Money, Operations): honest
 * framing instead of a plain "No snapshot yet" box or fabricated KPI tiles. Matches the same
 * structure Customers uses for its own empty state (What OpsIQ can assess now / What is missing /
 * Why it matters / One obvious next step) -- both are "not enough data yet" experiences and
 * should read as the same product, not two different empty-state recipes.
 */
export function DiagnosisEmptyState({
  domainLabel,
  hasSnapshot,
  snapshotLabel,
  diagnosisLabel,
}: {
  /** "financial" | "operations" -- used only in prose, never rendered as a raw token. */
  domainLabel: string;
  hasSnapshot: boolean;
  /** e.g. "financial snapshot" / "operations snapshot" */
  snapshotLabel: string;
  /** e.g. "Run finance diagnosis" / "Run operations diagnosis" -- the exact button label above. */
  diagnosisLabel: string;
}) {
  const article = /^[aeiou]/i.test(snapshotLabel) ? "an" : "a";
  return (
    <div className="border-l-2 pl-5 py-1" style={{ borderColor: "var(--accent-ink)" }}>
      <span className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--accent-ink)" }}>
        {hasSnapshot ? "Ready for a first diagnosis" : `Not enough ${domainLabel} information yet`}
      </span>
      <div className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
        {hasSnapshot ? (
          <>
            <p><span className="font-medium text-foreground">What OpsIQ can assess now:</span> a first diagnosis, using the {snapshotLabel} you already added.</p>
            <p><span className="font-medium text-foreground">What is missing:</span> nothing required to start — click &ldquo;{diagnosisLabel}&rdquo; above to generate real findings and an action plan.</p>
            <p><span className="font-medium text-foreground">Why it matters:</span> until a diagnosis runs, OpsIQ has your numbers on file but hasn&rsquo;t yet turned them into a read of your business.</p>
            <p><span className="font-medium text-foreground">One obvious next step:</span> click &ldquo;{diagnosisLabel}&rdquo; above.</p>
          </>
        ) : (
          <>
            <p><span className="font-medium text-foreground">What OpsIQ can assess now:</span> nothing yet — no {snapshotLabel} has been added for this business.</p>
            <p><span className="font-medium text-foreground">What is missing:</span> at least one {snapshotLabel} with your real numbers for a reporting period.</p>
            <p><span className="font-medium text-foreground">Why it matters:</span> without {article} {snapshotLabel}, OpsIQ has nothing to measure, compare against a threshold, or turn into a recommendation.</p>
            <p><span className="font-medium text-foreground">One obvious next step:</span> add {article} {snapshotLabel} using the button above, even with estimates — you can refine it later.</p>
          </>
        )}
      </div>
    </div>
  );
}
