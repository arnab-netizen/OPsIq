import Link from "next/link";

/**
 * CanonicalCockpitLink (PASS 38) — a small, low-load banner that points an owner from a legacy owner
 * surface (/owner, /owner/now, /owner/process-intelligence) to the CANONICAL cockpit at /owner/cockpit.
 * Presentational only; no business logic. Reduces owner confusion by giving one obvious daily entry point
 * without deleting or hiding the detail pages.
 */
export function CanonicalCockpitLink({ from }: { from?: string }) {
  return (
    <div
      data-testid="canonical-cockpit-link"
      style={{
        display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
        border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", fontSize: 13, background: "#f9fafb",
      }}
    >
      <span style={{ color: "#374151" }}>
        Your one daily view with the top action, safety limits and recovery status is the cockpit.
        {from ? ` This ${from} page keeps the full detail.` : ""}
      </span>
      <Link href="/owner/cockpit" data-testid="canonical-cockpit-href" style={{ fontWeight: 600, color: "#111827", textDecoration: "underline" }}>
        Go to your cockpit →
      </Link>
    </div>
  );
}
