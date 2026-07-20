"use client";

/**
 * Idea card — name, industry, screening status badge, evidence gap indicators.
 * Uses required CSS class distinctions per plan spec.
 */
const SCREENING_BADGE: Record<string, string> = {
  ADVANCE: "VALIDATED badge-success",
  ADVANCE_WITH_EVIDENCE_GAPS: "EVIDENCE_REQUIRED badge-warning",
  VALIDATE_FIRST: "UNTESTED_ASSUMPTION badge-warning",
  MODIFY: "BINDING_CONSTRAINT badge-warning",
  HOLD: "badge-secondary",
  REJECT: "REJECTED_IDEA badge-error",
};

interface Props {
  idea: Record<string, unknown>;
}

export function IdeaCard({ idea }: Props) {
  const name = idea.name as string;
  const industry = idea.industry as string | undefined;
  const description = idea.description as string | null | undefined;
  const screeningStatus = idea.screeningStatus as string | undefined;
  const evidenceRequired = (idea.evidenceRequired as string[] | undefined) ?? [];

  return (
    <div className="idea-card border rounded-lg p-4 bg-card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{name}</p>
          {industry && <p className="text-xs text-muted-foreground">{industry}</p>}
          {description && <p className="text-sm mt-1 text-muted-foreground line-clamp-2">{description}</p>}
        </div>
        {screeningStatus && (
          <span className={`badge flex-shrink-0 ${SCREENING_BADGE[screeningStatus] ?? "badge-secondary"}`}>
            {screeningStatus}
          </span>
        )}
      </div>

      {evidenceRequired.length > 0 && (
        <div className="mt-3 EVIDENCE_REQUIRED">
          <p className="text-xs font-medium text-warning-foreground mb-1">Evidence Required:</p>
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {evidenceRequired.map((e, i) => (
              <li key={i} className="UNKNOWN_INPUT">• {e}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
