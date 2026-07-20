"use client";

/**
 * Startup Mode — sessions list + new session CTA.
 * No business logic. Server is authoritative for all data.
 */
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface StartupSession {
  id: string;
  status: string;
  sessionLabel: string | null;
  entryPath: string;
  createdAt: string;
  updatedAt: string;
}

async function apiGet(path: string) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Request failed (${res.status})`);
  return data;
}

async function apiPost(path: string, body: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
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
};

const STATUS_BADGE: Record<string, string> = {
  APPROVED: "badge-success",
  REJECTED: "badge-error",
  ON_HOLD: "badge-warning",
  OWNER_DECISION_REQUIRED: "badge-warning",
  EXECUTION_PLANNED: "badge-success",
};

export default function StartupModeListPage() {
  const [sessions, setSessions] = useState<StartupSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageMsg, setPageMsg] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [entryPath, setEntryPath] = useState<"HAVE_IDEA" | "NEED_OPTIONS">("HAVE_IDEA");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiGet("/api/owner/startup/sessions");
      setSessions(data.sessions ?? []);
    } catch (e) {
      setPageMsg(e instanceof Error ? e.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    setPageMsg(null);
    try {
      const { ok, data } = await apiPost("/api/owner/startup/sessions", {
        sessionLabel: newLabel.trim() || null,
        entryPath,
        intake: { geography: null, industry: null, ownerHoursPerWeek: null, capitalAvailableCents: null, riskTolerance: null, requiresLicence: false, hasConnectors: false, ownerExclusions: [], targetCustomer: null },
        ideas: [{ name: "Initial Idea", description: null }],
      });
      if (!ok) throw new Error(data?.error?.message || "Failed to create session");
      window.location.href = `/owner/startup/${data.sessionId}`;
    } catch (e) {
      setPageMsg(e instanceof Error ? e.message : "Failed to create session");
      setCreating(false);
    }
  }, [newLabel, entryPath]);

  return (
    <div className="startup-sessions-page max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Startup Mode</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Zero-to-validated business engine. Structured screening, hypothesis testing, and economic validation.
          </p>
        </div>
      </div>

      <div className="new-session-card border rounded-lg p-6 mb-8 bg-card">
        <h2 className="text-lg font-semibold mb-4">Start a New Session</h2>
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-sm font-medium mb-1 block">Session label (optional)</label>
            <input
              className="input w-full max-w-sm"
              placeholder="e.g. Dog grooming idea Q3"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Entry path</label>
            <div className="flex gap-3">
              <button
                className={`btn btn-sm ${entryPath === "HAVE_IDEA" ? "btn-primary" : "btn-outline"}`}
                onClick={() => setEntryPath("HAVE_IDEA")}
              >
                I have an idea
              </button>
              <button
                className={`btn btn-sm ${entryPath === "NEED_OPTIONS" ? "btn-primary" : "btn-outline"}`}
                onClick={() => setEntryPath("NEED_OPTIONS")}
              >
                I need options
              </button>
            </div>
          </div>
          <div>
            <button
              className="btn btn-primary"
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? "Creating..." : "Start Session"}
            </button>
          </div>
          {pageMsg && <p className="text-sm text-destructive">{pageMsg}</p>}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading sessions…</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No startup sessions yet. Start one above.</p>
      ) : (
        <div className="sessions-list flex flex-col gap-3">
          <h2 className="text-base font-semibold">Your Sessions</h2>
          {sessions.map((s) => (
            <Link
              key={s.id}
              href={`/owner/startup/${s.id}`}
              className="session-row border rounded-lg p-4 flex items-center justify-between hover:bg-accent transition-colors"
            >
              <div>
                <p className="font-medium">{s.sessionLabel ?? "Untitled Session"}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {s.entryPath === "HAVE_IDEA" ? "Have an idea" : "Need options"} · Created {new Date(s.createdAt).toLocaleDateString()}
                </p>
              </div>
              <span className={`badge ${STATUS_BADGE[s.status] ?? "badge-secondary"}`}>
                {STATUS_LABELS[s.status] ?? s.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
