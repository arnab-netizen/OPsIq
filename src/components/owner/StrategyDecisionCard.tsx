/**
 * Owner Strategy — the decision, as the owner reads it (presentational only).
 *
 * Renders a server-derived StrategyDecision (src/domain/owner-strategy/decision.ts) in the
 * hierarchy: headline decision → why → Profit / Cash / Downside / Evidence → required
 * conditions → one next step. Every sentence comes from the decision; this component only maps
 * states to labels/styles. No business logic here.
 */
import { Badge } from "@/ui/primitives";
import type { StrategyDecision, StrategyDimensionState } from "@/domain/owner-strategy/decision";

type Variant = "default-accessible" | "success-accessible" | "warning-accessible" | "destructive-accessible" | "muted-accessible";

const HEADLINE_BORDER: Record<StrategyDecision["code"], string> = {
  GO: "border-success/40",
  GO_WITH_CONDITIONS: "border-primary/40",
  NOT_YET: "border-warning/50",
  DONT_AS_PLANNED: "border-destructive/40",
  NEED_INFO: "border-border",
};

const DIMENSION_STATE: Record<StrategyDimensionState, { label: string; variant: Variant }> = {
  good: { label: "OK", variant: "success-accessible" },
  caution: { label: "Watch", variant: "warning-accessible" },
  blocker: { label: "Blocker", variant: "destructive-accessible" },
  unknown: { label: "Unknown", variant: "muted-accessible" },
};

const DIMENSIONS: Array<{ key: keyof StrategyDecision["dimensions"]; label: string }> = [
  { key: "profit", label: "Profit" },
  { key: "cash", label: "Cash" },
  { key: "downside", label: "Downside" },
  { key: "evidence", label: "Evidence" },
];

export interface StrategyNextStepRow {
  status: string;
  statusLabel: string;
}

export function StrategyDecisionCard({
  decision,
  caption,
  nextStepRow,
}: {
  decision: StrategyDecision;
  caption: string;
  /** The persisted action carrying the primary step, when one exists. */
  nextStepRow: StrategyNextStepRow | null;
}) {
  // Conditions are listed under "Before you go ahead"; every other reason is a "why". For "Not yet"
  // the gap is already the detail line, the Cash line and the next step — not repeated as a "why".
  const why =
    decision.code === "GO_WITH_CONDITIONS"
      ? []
      : decision.reasons.filter((r) => !(decision.code === "NOT_YET" && r.code === "FUNDING_GAP"));
  // The detail line completes the headline unless it would repeat a "why" line word for word.
  const detail = decision.headlineDetail && !why.some((r) => r.message === decision.headlineDetail) ? decision.headlineDetail : null;
  return (
    <section
      aria-labelledby="strategy-decision-headline"
      data-testid="strategy-decision"
      data-decision={decision.code}
      className={`rounded-lg border-2 bg-card p-4 space-y-4 ${HEADLINE_BORDER[decision.code]}`}
    >
      <div>
        <div className="text-xs uppercase text-muted-foreground">{caption}</div>
        <h2 id="strategy-decision-headline" className="text-2xl font-bold mt-1">
          {decision.headline}
        </h2>
        {detail && <p className="text-base mt-1">{detail}</p>}
      </div>

      {why.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">Why</h3>
          <ul className="list-disc pl-5 text-sm space-y-1">
            {why.map((r) => (
              <li key={r.code}>{r.message}</li>
            ))}
          </ul>
        </div>
      )}

      <dl className="grid gap-2 sm:grid-cols-2" data-testid="strategy-decision-dimensions">
        {DIMENSIONS.map(({ key, label }) => {
          const dim = decision.dimensions[key];
          const state = DIMENSION_STATE[dim.state];
          return (
            <div key={key} className="rounded-md border p-3 min-w-0">
              <dt className="flex items-center justify-between gap-2 text-xs uppercase text-muted-foreground">
                <span>{label}</span>
                <Badge variant={state.variant}>{state.label}</Badge>
              </dt>
              <dd className="text-sm mt-1 break-words" data-testid={`strategy-dimension-${key}`}>
                {dim.line}
              </dd>
              {key === "evidence" && decision.dimensions.evidence.missingLabels.length > 0 && (
                <dd className="text-xs text-muted-foreground mt-1 break-words" data-testid="strategy-evidence-missing">
                  Not entered: {decision.dimensions.evidence.missingLabels.join(", ")}
                </dd>
              )}
            </div>
          );
        })}
      </dl>

      {decision.conditions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">Before you go ahead</h3>
          <ol className="list-decimal pl-5 text-sm space-y-1">
            {decision.conditions.map((c) => (
              <li key={c.code}>{c.message}</li>
            ))}
          </ol>
        </div>
      )}

      {decision.promising.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">Why this looks promising</h3>
          <ul className="list-disc pl-5 text-sm space-y-1">
            {decision.promising.map((p) => (
              <li key={p.code}>{p.text}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-md bg-muted/40 p-3" data-testid="strategy-next-step">
        <h3 className="text-xs uppercase text-muted-foreground font-normal">Your next step</h3>
        <div className="font-semibold">{decision.primaryStep.title}</div>
        <p className="text-sm">{decision.primaryStep.description}</p>
        {decision.primaryStep.options.length > 0 && (
          <ul className="list-disc pl-5 text-sm mt-1">
            {decision.primaryStep.options.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground mt-2">
          {nextStepRow
            ? `In your action list below — ${nextStepRow.statusLabel.toLowerCase()}.`
            : "Click “Evaluate scenario” to add this step to your action list."}
        </p>
      </div>
    </section>
  );
}
