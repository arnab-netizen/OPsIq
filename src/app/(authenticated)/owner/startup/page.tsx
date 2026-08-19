"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Input, Select, Button } from "@/ui/primitives";

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

const RISK_TOLERANCE_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const FAST_CASH_OPTIONS = [
  { value: "fast_cash", label: "Fast cash" },
  { value: "long_term_scale", label: "Long-term scale" },
];

/** Parses a comma-separated free-text field into a trimmed, non-empty string array — or null when blank. */
function parseListField(raw: string): string[] | null {
  const items = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return items.length > 0 ? items : null;
}

/** Parses a numeric field, returning null (never NaN or 0) when blank — honest-by-default, matching startupIntakeSchema. */
function parseNumberField(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export default function StartupModePage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [pageMsg, setPageMsg] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");

  // Owner-supplied startup intake (src/domain/owner-strategy/startup-mode.validation.ts:
  // startupIntakeSchema). Every field is genuinely optional there — an owner who leaves
  // a field blank here submits an honest null, not a fabricated value.
  const [location, setLocation] = useState("");
  const [capitalAvailable, setCapitalAvailable] = useState("");
  const [monthlySurvivalNeed, setMonthlySurvivalNeed] = useState("");
  const [hoursPerWeekAvailable, setHoursPerWeekAvailable] = useState("");
  const [targetMonthlyIncome, setTargetMonthlyIncome] = useState("");
  const [skills, setSkills] = useState("");
  const [existingAssets, setExistingAssets] = useState("");
  const [preferredIndustries, setPreferredIndustries] = useState("");
  const [riskTolerance, setRiskTolerance] = useState("");
  const [fastCashVsScale, setFastCashVsScale] = useState("");
  const [canSell, setCanSell] = useState(false);
  const [canOperateDaily, setCanOperateDaily] = useState(false);

  // First candidate idea (src/domain/owner-strategy/startup-mode.validation.ts:
  // startupIdeaSchema requires at least one idea with a real name/industry; further
  // ideas and structural detail are added later via the session's Ideas tab).
  const [ideaName, setIdeaName] = useState("");
  const [ideaIndustry, setIdeaIndustry] = useState("");

  useEffect(() => {
    fetch("/api/owner/startup/sessions")
      .then((r) => r.json())
      .then((d) => setSessions(d.sessions ?? []))
      .catch(() => setPageMsg("Failed to load sessions"));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!ideaName.trim() || !ideaIndustry.trim()) {
      setPageMsg("A starting idea name and industry are required.");
      return;
    }
    setCreating(true);
    setPageMsg(null);
    try {
      const res = await fetch("/api/owner/startup/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionLabel: label || null,
          intake: {
            location: location.trim() || null,
            capitalAvailable: parseNumberField(capitalAvailable),
            monthlySurvivalNeed: parseNumberField(monthlySurvivalNeed),
            hoursPerWeekAvailable: parseNumberField(hoursPerWeekAvailable),
            targetMonthlyIncome: parseNumberField(targetMonthlyIncome),
            skills: parseListField(skills),
            existingAssets: parseListField(existingAssets),
            preferredIndustries: parseListField(preferredIndustries),
            riskTolerance: riskTolerance || null,
            fastCashVsScale: fastCashVsScale || null,
            canSell,
            canOperateDaily,
          },
          ideas: [{ name: ideaName.trim(), industry: ideaIndustry.trim(), structural: {} }],
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

      <form
        onSubmit={handleCreate}
        data-testid="startup-intake-form"
        className="flex flex-col gap-4 mb-8 rounded-lg border border-border p-4"
      >
        <Input
          label="Session label (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          data-testid="startup-session-label-input"
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Idea name"
            value={ideaName}
            onChange={(e) => setIdeaName(e.target.value)}
            data-testid="startup-idea-name-input"
            required
          />
          <Input
            label="Idea industry"
            value={ideaIndustry}
            onChange={(e) => setIdeaIndustry(e.target.value)}
            data-testid="startup-idea-industry-input"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            data-testid="startup-intake-location-input"
          />
          <Select
            label="Risk tolerance"
            value={riskTolerance}
            onChange={(e) => setRiskTolerance(e.target.value)}
            options={RISK_TOLERANCE_OPTIONS}
            placeholder="Not specified"
            data-testid="startup-intake-risk-tolerance-select"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Capital available"
            type="number"
            value={capitalAvailable}
            onChange={(e) => setCapitalAvailable(e.target.value)}
            data-testid="startup-intake-capital-input"
          />
          <Input
            label="Monthly survival need"
            type="number"
            value={monthlySurvivalNeed}
            onChange={(e) => setMonthlySurvivalNeed(e.target.value)}
            data-testid="startup-intake-survival-need-input"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Hours per week available"
            type="number"
            value={hoursPerWeekAvailable}
            onChange={(e) => setHoursPerWeekAvailable(e.target.value)}
            data-testid="startup-intake-hours-input"
          />
          <Input
            label="Target monthly income"
            type="number"
            value={targetMonthlyIncome}
            onChange={(e) => setTargetMonthlyIncome(e.target.value)}
            data-testid="startup-intake-target-income-input"
          />
        </div>

        <Input
          label="Skills (comma-separated)"
          value={skills}
          onChange={(e) => setSkills(e.target.value)}
          hint="e.g. sales, plumbing, bookkeeping"
          data-testid="startup-intake-skills-input"
        />
        <Input
          label="Existing assets (comma-separated)"
          value={existingAssets}
          onChange={(e) => setExistingAssets(e.target.value)}
          hint="e.g. van, workshop, existing customer list"
          data-testid="startup-intake-assets-input"
        />
        <Input
          label="Preferred industries (comma-separated)"
          value={preferredIndustries}
          onChange={(e) => setPreferredIndustries(e.target.value)}
          data-testid="startup-intake-preferred-industries-input"
        />

        <Select
          label="Priority"
          value={fastCashVsScale}
          onChange={(e) => setFastCashVsScale(e.target.value)}
          options={FAST_CASH_OPTIONS}
          placeholder="Not specified"
          data-testid="startup-intake-priority-select"
        />

        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={canSell}
              onChange={(e) => setCanSell(e.target.checked)}
              data-testid="startup-intake-can-sell-checkbox"
            />
            Comfortable selling
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={canOperateDaily}
              onChange={(e) => setCanOperateDaily(e.target.checked)}
              data-testid="startup-intake-can-operate-checkbox"
            />
            Can operate day-to-day
          </label>
        </div>

        <Button
          type="submit"
          disabled={creating}
          data-testid="create-startup-session-btn"
          className="self-start"
        >
          {creating ? "Creating…" : "New Session"}
        </Button>
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
