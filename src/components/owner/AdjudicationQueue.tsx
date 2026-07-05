"use client";

/**
 * AdjudicationQueue — the owner-facing proof-risk review queue (prop-driven; no business logic here).
 *
 * It renders the queue items the server already built (source type, finding, severity, source
 * completeness, plain explanation, supporting-proof count + a few representative refs, actor, current
 * status, recommended action, missing data) and lets the owner pick one of the seven governed outcomes
 * and enter a required reason. On submit it delegates to `onAdjudicate` (the page wires that to the
 * canonical `POST /api/proof-risk/adjudicate` route) — this component never mutates anything itself,
 * never re-derives a risk, and shows no fraud/theft/negligence wording or hidden score.
 */

import { useState } from "react";
import { Badge, Button, Textarea, Select } from "@/ui/primitives";

export interface QueueItemView {
  id: string;
  sourceType: string;
  sourceRef: string;
  findingType: string;
  title: string;
  severity: string;
  sourceCompleteness: "COMPLETE" | "PARTIAL" | "BLOCKED_BY_DATA";
  ownerExplanation: string;
  supportingProofCount: number;
  representativeProofRefs: string[];
  proofIds: string[];
  actorId: string | null;
  actorRole: string | null;
  recommendedAction: string;
  missingData: string[];
  currentAdjudicationStatus: string | null;
  adjudicable: boolean;
}

export interface OutcomeOption {
  outcome: string;
  label: string;
  effect: "REDUCES_NOISE" | "KEEPS_ACTIVE" | "INCONCLUSIVE";
  note: string;
}

export interface AdjudicationResult {
  ok: boolean;
  message: string;
}

export interface AdjudicationQueueProps {
  items: QueueItemView[];
  outcomeOptions: OutcomeOption[];
  /** Wired by the page to POST /api/proof-risk/adjudicate. Returns a safe, owner-facing result. */
  onAdjudicate: (item: QueueItemView, outcome: string, reason: string) => Promise<AdjudicationResult>;
}

const SEVERITY_VARIANT = (s: string): "destructive" | "warning" | "default" | "muted" =>
  s === "CRITICAL" || s === "HIGH" ? "destructive" : s === "MEDIUM" ? "warning" : "default";

const COMPLETENESS_LABEL: Record<string, string> = {
  COMPLETE: "Evidence complete",
  PARTIAL: "Evidence partial",
  BLOCKED_BY_DATA: "Data missing — cannot decide yet",
};

const FAIRNESS_NOTE =
  "This is a review flag, not a fraud, theft, or negligence accusation. Owner review/adjudication is required before taking any personnel action.";

interface RowState {
  outcome: string;
  reason: string;
  submitting: boolean;
  result: AdjudicationResult | null;
}

export function AdjudicationQueue({ items, outcomeOptions, onAdjudicate }: AdjudicationQueueProps) {
  const [rows, setRows] = useState<Record<string, RowState>>({});

  const rowOf = (id: string): RowState => rows[id] ?? { outcome: "", reason: "", submitting: false, result: null };
  const setRow = (id: string, patch: Partial<RowState>): void =>
    setRows((prev) => ({ ...prev, [id]: { ...rowOf(id), ...patch } }));

  if (items.length === 0) {
    return (
      <div data-testid="adjudication-queue-empty" style={{ padding: 16, color: "#6b7280" }}>
        No active proof-risk findings to review right now.
      </div>
    );
  }

  return (
    <div data-testid="adjudication-queue" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>{FAIRNESS_NOTE}</p>
      {items.map((item) => {
        const row = rowOf(item.id);
        const reasonValid = row.reason.trim().length >= 3;
        const selected = outcomeOptions.find((o) => o.outcome === row.outcome) ?? null;
        const canSubmit = item.adjudicable && !!row.outcome && reasonValid && !row.submitting;

        const submit = async (): Promise<void> => {
          if (!canSubmit) return;
          setRow(item.id, { submitting: true, result: null });
          const result = await onAdjudicate(item, row.outcome, row.reason.trim());
          setRow(item.id, { submitting: false, result });
        };

        return (
          <article
            key={item.id}
            data-testid="adjudication-item"
            data-source-type={item.sourceType}
            data-finding-type={item.findingType}
            style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}
          >
            <header style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <strong data-testid="item-title">{item.title}</strong>
              <Badge variant={SEVERITY_VARIANT(item.severity)}>{item.severity}</Badge>
              <Badge variant="muted">{item.sourceType}</Badge>
              <Badge variant={item.sourceCompleteness === "COMPLETE" ? "success" : "warning"}>
                {COMPLETENESS_LABEL[item.sourceCompleteness] ?? item.sourceCompleteness}
              </Badge>
              {item.currentAdjudicationStatus && (
                <Badge variant="outline" data-testid="item-status">Status: {item.currentAdjudicationStatus}</Badge>
              )}
            </header>

            <p style={{ margin: 0 }}>{item.ownerExplanation}</p>

            <div style={{ fontSize: 13, color: "#374151" }}>
              <span data-testid="item-proof-count">Supporting proofs: {item.supportingProofCount}</span>
              {item.representativeProofRefs.length > 0 && (
                <span> · Refs: {item.representativeProofRefs.join(", ")}</span>
              )}
              {item.actorId && <span> · Person: {item.actorRole ?? "staff"} ({item.actorId})</span>}
            </div>

            <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>Recommended: {item.recommendedAction}</p>

            {item.missingData.length > 0 && (
              <p style={{ margin: 0, fontSize: 13, color: "#b45309" }} data-testid="item-missing-data">
                Missing data: {item.missingData.join("; ")}
              </p>
            )}

            {!item.adjudicable ? (
              <p style={{ margin: 0, fontSize: 13, color: "#b45309" }} data-testid="item-not-adjudicable">
                This finding cannot be adjudicated yet — its supporting evidence is not fully persisted. It stays visible.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Select
                  label="Decision"
                  data-testid="item-outcome-select"
                  value={row.outcome}
                  placeholder="Choose an outcome…"
                  onChange={(e) => setRow(item.id, { outcome: e.target.value, result: null })}
                  options={outcomeOptions.map((o) => ({ value: o.outcome, label: o.label }))}
                />
                {selected && (
                  <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }} data-testid="item-outcome-note">{selected.note}</p>
                )}
                <Textarea
                  label="Reason (required)"
                  data-testid="item-reason"
                  value={row.reason}
                  placeholder="Why are you making this decision?"
                  onChange={(e) => setRow(item.id, { reason: e.target.value, result: null })}
                />
                {!reasonValid && row.outcome !== "" && (
                  <p style={{ margin: 0, fontSize: 12, color: "#b91c1c" }} data-testid="item-reason-required">
                    A reason is required before you can submit.
                  </p>
                )}
                <div>
                  <Button
                    data-testid="item-submit"
                    disabled={!canSubmit}
                    isLoading={row.submitting}
                    onClick={() => void submit()}
                  >
                    Submit decision
                  </Button>
                </div>
                {row.result && (
                  <p
                    data-testid="item-result"
                    style={{ margin: 0, fontSize: 13, color: row.result.ok ? "#166534" : "#b91c1c" }}
                  >
                    {row.result.message}
                  </p>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
