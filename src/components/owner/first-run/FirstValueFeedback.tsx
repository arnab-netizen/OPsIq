"use client";

/** Lightweight first-value feedback: three choices, then (only if not fully useful) one structured reason. */
import { useRef, useState } from "react";
import { Button } from "@/ui/primitives";
import { firstRunApi, newIdempotencyKey } from "@/lib/owner-first-run-client";

const RATINGS = [
  { value: "USEFUL", label: "Useful" },
  { value: "PARTLY_USEFUL", label: "Partly useful" },
  { value: "NOT_USEFUL", label: "Not useful" },
] as const;

const REASONS = [
  { value: "WRONG_PRIORITY", label: "Wrong priority" },
  { value: "MISSING_INFORMATION", label: "Missing information" },
  { value: "RECOMMENDATION_IMPRACTICAL", label: "Recommendation impractical" },
  { value: "EXPLANATION_UNCLEAR", label: "Explanation unclear" },
  { value: "OTHER", label: "Other" },
] as const;

export function FirstValueFeedback({ businessId }: { businessId: string }) {
  const [rating, setRating] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(newIdempotencyKey());

  async function send(r: string, reason?: string) {
    setError(null);
    try {
      await firstRunApi.feedback({ businessId, rating: r, ...(reason ? { reason } : {}), idempotencyKey: key.current });
      setDone(true);
    } catch {
      setError("We couldn't send that just now. You can skip it or try again.");
    }
  }

  if (done) return <p className="text-sm text-foreground" data-testid="first-value-feedback-thanks">Thanks — that helps.</p>;
  return (
    <div data-testid="first-value-feedback" className="rounded-lg border border-border bg-background p-3">
      <p className="text-sm font-medium text-foreground">Was this read useful?</p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {RATINGS.map((r) => (
          <Button
            key={r.value}
            type="button"
            variant="secondary"
            className="min-h-11"
            aria-pressed={rating === r.value}
            onClick={() => {
              setRating(r.value);
              if (r.value === "USEFUL") void send(r.value);
            }}
          >
            {r.label}
          </Button>
        ))}
      </div>
      {rating && rating !== "USEFUL" && (
        <div className="mt-3" data-testid="first-value-feedback-reasons">
          <p className="text-sm text-muted-foreground">What got in the way? (optional)</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {REASONS.map((r) => (
              <Button key={r.value} type="button" variant="secondary" className="min-h-11" onClick={() => void send(rating, r.value)}>
                {r.label}
              </Button>
            ))}
            <Button type="button" variant="secondary" className="min-h-11" onClick={() => void send(rating)}>Skip</Button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
