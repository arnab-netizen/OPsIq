"use client";

/**
 * Step navigator for startup session — shows current lifecycle status and allowed transitions.
 * No business logic.
 */
const STEPS = [
  "DRAFT", "CONTEXT_CAPTURE", "DISCOVERY", "IDEA_GENERATION", "SCREENING",
  "VALIDATION_PLANNED", "VALIDATION_IN_PROGRESS", "ECONOMICS_REVIEW",
  "READINESS_REVIEW", "OWNER_DECISION_REQUIRED",
];

const STEP_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  CONTEXT_CAPTURE: "Context",
  DISCOVERY: "Discovery",
  IDEA_GENERATION: "Ideas",
  SCREENING: "Screening",
  VALIDATION_PLANNED: "Plan",
  VALIDATION_IN_PROGRESS: "Validate",
  ECONOMICS_REVIEW: "Economics",
  READINESS_REVIEW: "Readiness",
  OWNER_DECISION_REQUIRED: "Decision",
};

interface Props {
  session: Record<string, unknown>;
}

export function StartupSessionShell({ session }: Props) {
  const status = session.status as string;
  const label = session.sessionLabel as string | null;
  const currentIndex = STEPS.indexOf(status);

  return (
    <div className="startup-session-shell">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">{label ?? "Untitled Session"}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Status: <span className="font-medium">{status}</span>
          </p>
        </div>
      </div>

      <nav className="step-nav flex gap-0.5 overflow-x-auto pb-2" aria-label="Session steps">
        {STEPS.map((step, i) => {
          const isComplete = i < currentIndex;
          const isCurrent = i === currentIndex;
          return (
            <div
              key={step}
              className={[
                "step-item flex-1 min-w-0 text-center py-1.5 px-1 text-xs rounded",
                isComplete ? "bg-success/20 text-success-foreground VALIDATED" : "",
                isCurrent ? "bg-primary text-primary-foreground font-semibold" : "",
                !isComplete && !isCurrent ? "bg-muted text-muted-foreground" : "",
              ].join(" ")}
              aria-current={isCurrent ? "step" : undefined}
            >
              {STEP_LABELS[step] ?? step}
            </div>
          );
        })}
      </nav>

      {(status === "APPROVED" || status === "EXECUTION_PLANNED") && (
        <div className="status-banner-approved mt-3 border border-success rounded p-3 text-sm VALIDATED">
          Session <strong>{status === "APPROVED" ? "approved" : "execution planned"}</strong> — proceed to execution blueprint.
        </div>
      )}
      {status === "REJECTED" && (
        <div className="status-banner-rejected mt-3 border border-destructive rounded p-3 text-sm REJECTED_IDEA">
          Session <strong>rejected</strong>. Review binding constraints and consider a new session.
        </div>
      )}
    </div>
  );
}
