"use client";

/**
 * /owner/feedback — "Send beta feedback" / "Report a problem".
 *
 * Minimal in-product Owner Mode feedback form. Posts to POST /api/feedback
 * (authenticated, workspace-scoped — see that route for the server-side
 * contract). No business logic here beyond simple client-side required-field
 * checks; the server is the source of truth for validation.
 */

import { useEffect, useState } from "react";
import { Button, Select, Textarea } from "@/ui/primitives";
import { classifyOperatorError } from "@/lib/operator-error-governance";

type Category = "BUG" | "CONFUSION" | "FEATURE_REQUEST" | "OTHER";

const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
  { value: "BUG", label: "Something's broken" },
  { value: "CONFUSION", label: "Something's confusing" },
  { value: "FEATURE_REQUEST", label: "I wish this could do…" },
  { value: "OTHER", label: "Other" },
];

/**
 * Best-effort "what page were you on" signal: the browser sets
 * document.referrer to the page the user navigated from when they followed a
 * link/button to get here. Empty or cross-origin referrers are common and
 * simply omitted — this is a nice-to-have for triage, never required.
 */
function captureReferrerPath(): string | undefined {
  try {
    if (typeof document === "undefined" || !document.referrer) return undefined;
    const referrer = new URL(document.referrer);
    if (referrer.origin !== window.location.origin) return undefined;
    return referrer.pathname;
  } catch {
    return undefined;
  }
}

export default function FeedbackPage() {
  const [category, setCategory] = useState<Category | "">("");
  const [description, setDescription] = useState("");
  const [expectedResult, setExpectedResult] = useState("");
  const [route, setRoute] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Reading document.referrer is a sync-with-external-system effect (the external
    // system being the browser's navigation history, not React state) — same
    // established pattern/justification as src/ui/shell/app-shell.tsx's route-change effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time capture of the browser's referrer on mount, not derived-state sync
    setRoute(captureReferrerPath());
  }, []);

  async function handleSubmit() {
    setError(null);
    if (!category) {
      setError("Please choose a category.");
      return;
    }
    if (!description.trim()) {
      setError("Please describe the problem or feedback.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          description: description.trim(),
          ...(route ? { route } : {}),
          ...(expectedResult.trim() ? { expectedResult: expectedResult.trim() } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Request failed (${res.status})`);
      }
      setSuccess(true);
      setCategory("");
      setDescription("");
      setExpectedResult("");
    } catch (err) {
      setError(classifyOperatorError(err, { context: "save" }).operatorMessage);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8" data-testid="feedback-page">
      <h1 className="text-2xl font-semibold mb-2">Send beta feedback</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Report a problem, tell us what&apos;s confusing, or request something you wish OpsIQ could do.
        This goes straight to the team building it.
      </p>

      {success ? (
        <div className="rounded-lg border border-border p-6 text-center">
          <p className="text-sm font-medium mb-1">Thanks — feedback received.</p>
          <p className="text-sm text-muted-foreground mb-4">
            We read every submission during the beta.
          </p>
          <Button size="sm" variant="outline" onClick={() => setSuccess(false)}>
            Send another
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {error && <p className="text-destructive text-sm">{error}</p>}

          <Select
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            options={CATEGORY_OPTIONS}
            placeholder="Choose a category"
          />

          <Textarea
            label="What happened?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the problem or feedback in as much detail as helps."
            maxLength={5000}
            rows={5}
          />

          <Textarea
            label="What did you expect instead? (optional)"
            value={expectedResult}
            onChange={(e) => setExpectedResult(e.target.value)}
            placeholder="Optional — what you expected to happen"
            maxLength={2000}
            rows={3}
          />

          <div>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Sending…" : "Send feedback"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
