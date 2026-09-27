/**
 * Presentational priority command strip — renders the top 3–5 runtime-fed priority cards. NO business
 * logic and NO static fallback: if there are no runtime cards it renders nothing (the page shows its
 * own honest empty state). Each card answers the seven owner questions.
 */
import { Badge } from "@/ui/primitives";

export interface PriorityCardView {
  id: string;
  severity: "critical" | "high" | "medium" | "low";
  whatIsWrong: string;
  whyItMatters: string;
  nextStep: string;
  owner: string;
  proof: string;
  reassess: string;
  confidenceNote: string;
}

const SEVERITY_VARIANT: Record<string, "destructive" | "warning" | "muted"> = {
  critical: "destructive",
  high: "warning",
  medium: "muted",
  low: "muted",
};

/**
 * `hideStopInstructions`: when the page shows the ONE canonical owner decision, the plan's own
 * "do_not_do" stop card is not shown — the canonical decision's reconciled guardrails are the only
 * "do not" list, so no plan card can veto the main target.
 */
export function PriorityCommandStrip({ cards: allCards, hideStopInstructions = false }: { cards: PriorityCardView[]; hideStopInstructions?: boolean }) {
  const cards = hideStopInstructions ? (allCards ?? []).filter((c) => c.id !== "do_not_do") : allCards;
  if (!cards || cards.length === 0) return null;

  return (
    <section className="mb-6" data-testid="owner-priority-strip">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase text-muted-foreground">Plan checkpoints (supporting analysis)</div>
        <Badge variant="muted">{cards.length} of 5</Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c, i) => (
          <div key={c.id} className="rounded-lg border p-3 bg-card" data-testid={`priority-card-${i}`}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <Badge variant={SEVERITY_VARIANT[c.severity] ?? "muted"}>{c.severity}</Badge>
              <span className="text-[11px] uppercase text-muted-foreground">Checkpoint {i + 1}</span>
            </div>
            <div className="text-sm font-medium" data-testid={`priority-what-${i}`}>{c.whatIsWrong}</div>
            <p className="text-xs text-muted-foreground mt-1"><strong>Why:</strong> {c.whyItMatters}</p>
            <p className="text-xs mt-1" data-testid={`priority-next-${i}`}><strong>Plan step:</strong> {c.nextStep}</p>
            <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-muted-foreground">
              <span><strong>Who:</strong> {c.owner}</span>
              <span><strong>Proof:</strong> {c.proof}</span>
              <span className="col-span-2"><strong>Reassess:</strong> {c.reassess}</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1" data-testid={`priority-confidence-${i}`}>{c.confidenceNote}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
