"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface SessionSummary {
  sessionId: string;
  sessionLabel: string | null;
  status: string;
  recommendedName: string | null;
  ideaCount: number;
  acceptedCount: number;
  createdAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  CONTEXT_CAPTURE: "Context Capture",
  DISCOVERY: "Discovery",
  IDEA_GENERATION: "Idea Generation",
  SCREENING: "Screening",
  VALIDATION_PLANNED: "Validation Planned",
  VALIDATION_IN_PROGRESS: "Validation In Progress",
  ECONOMICS_REVIEW: "Economics Review",
  READINESS_REVIEW: "Readiness Review",
  OWNER_DECISION_REQUIRED: "Decision Required",
  APPROVED: "Approved",
  MODIFICATION_REQUIRED: "Modification Required",
  ON_HOLD: "On Hold",
  REJECTED: "Rejected",
  EXECUTION_PLANNED: "Execution Planned",
  STALE_REAPPROVAL_REQUIRED: "Reapproval Required",
  ACTIVE: "Active",
};

export default function StartupModePage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [pageMsg, setPageMsg] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");

  useEffect(() => {
    fetch("/api/owner/startup/sessions")
      .then((r) => r.json())
      .then((d) => setSessions(d.sessions ?? []))
      .catch(() => setPageMsg("Failed to load sessions"));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setPageMsg(null);
    try {
      const res = await fetch("/api/owner/startup/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionLabel: label || null,
          intake: {
            capitalAvailable: 0,
            ownerHoursPerWeek: 0,
            riskTolerance: "MEDIUM",
            location: "",
            cashReserveMonths: 0,
            minimumMonthlyIncome: 0,
            skills: [],
          },
          ideas: [{ name: "Placeholder", industry: "General", startupCostEstimate: 0, monthlyRevenueEstimate: 0 }],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPageMsg(data.error ?? "Failed to create session");
        return;
      }
      window.location.href = `/owner/startup/${data.sessionId}`;
    } catch {
      setPageMsg("Network error");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="startup-mode-page" style={{ maxWidth: 900, margin: "0 auto", padding: "2rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
        Startup Mode
      </h1>
      <p style={{ color: "var(--text-secondary, #666)", marginBottom: "2rem" }}>
        Zero-to-validated business engine. Screen ideas, validate hypotheses, and create execution blueprints.
      </p>

      {pageMsg && (
        <div className="page-message" role="alert" style={{ color: "red", marginBottom: "1rem" }}>
          {pageMsg}
        </div>
      )}

      <form onSubmit={handleCreate} style={{ display: "flex", gap: "0.75rem", marginBottom: "2rem" }}>
        <input
          type="text"
          placeholder="Session label (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          style={{ flex: 1, padding: "0.5rem", borderRadius: 4, border: "1px solid #ccc" }}
          data-testid="startup-session-label-input"
        />
        <button
          type="submit"
          disabled={creating}
          data-testid="create-startup-session-btn"
          style={{
            padding: "0.5rem 1.25rem",
            background: "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: creating ? "not-allowed" : "pointer",
          }}
        >
          {creating ? "Creating…" : "New Session"}
        </button>
      </form>

      {sessions.length === 0 ? (
        <p data-testid="no-startup-sessions">No startup sessions yet. Create one above.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #e5e7eb" }}>
              <th style={{ padding: "0.5rem" }}>Label</th>
              <th style={{ padding: "0.5rem" }}>Status</th>
              <th style={{ padding: "0.5rem" }}>Ideas</th>
              <th style={{ padding: "0.5rem" }}>Recommended</th>
              <th style={{ padding: "0.5rem" }}>Created</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr
                key={s.sessionId}
                data-testid={`startup-session-row-${s.sessionId}`}
                style={{ borderBottom: "1px solid #e5e7eb" }}
              >
                <td style={{ padding: "0.5rem" }}>
                  <Link
                    href={`/owner/startup/${s.sessionId}`}
                    data-testid={`startup-session-link-${s.sessionId}`}
                    style={{ color: "#2563eb" }}
                  >
                    {s.sessionLabel ?? "Untitled"}
                  </Link>
                </td>
                <td style={{ padding: "0.5rem" }}>
                  <span
                    className={`startup-status startup-status--${s.status.toLowerCase()}`}
                    data-testid={`startup-status-${s.sessionId}`}
                  >
                    {STATUS_LABELS[s.status] ?? s.status}
                  </span>
                </td>
                <td style={{ padding: "0.5rem" }}>
                  {s.acceptedCount}/{s.ideaCount}
                </td>
                <td style={{ padding: "0.5rem" }}>{s.recommendedName ?? "—"}</td>
                <td style={{ padding: "0.5rem" }}>
                  {new Date(s.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
