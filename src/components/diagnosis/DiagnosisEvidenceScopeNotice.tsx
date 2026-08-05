import Link from "next/link";

/**
 * Honest scope notice for the current diagnosis path.
 *
 * The `/diagnosis` flow produces its findings from the fields typed into its own form. It does not
 * read the workspace's stored `OwnerDataIntake` records, uploads or ingestion confidence, so its
 * output must not be presented as evidence-grounded analysis of the business.
 *
 * This notice states that limitation plainly and routes the owner to the surface that fixes it.
 * Presentational only — no logic, no data fetching.
 *
 * Remove this when the diagnosis pipeline is rebuilt to consume stored intake (see the roadmap entry
 * "Diagnosis grounding"). Until then it is the difference between a limitation and a false claim.
 */
export default function DiagnosisEvidenceScopeNotice({
  placement = "form",
}: {
  placement?: "form" | "result";
}) {
  return (
    <div
      data-testid="diagnosis-evidence-scope-notice"
      className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
    >
      <p className="font-medium">
        {placement === "result"
          ? "This assessment used only what you typed above."
          : "This assessment will use only what you type below."}
      </p>
      <p className="mt-1">
        It does not yet read the revenue, costs, uploads or records stored in your workspace, so treat
        it as a starting point rather than an evidence-based diagnosis of your business.
      </p>
      <Link href="/owner/data" className="mt-2 inline-block font-medium underline hover:no-underline">
        Add your real business data →
      </Link>
    </div>
  );
}
