"use client";

/**
 * Startup Session View — full step-by-step journey for a single session.
 * No business logic in this component. Server is authoritative for all state.
 * Renders distinct badges for SYSTEM_RECOMMENDATION vs OWNER_DECISION.
 */
import { useEffect, useState, useCallback, use } from "react";
import { StartupSessionShell } from "@/components/owner/startup/StartupSessionShell";
import { IdeaCard } from "@/components/owner/startup/IdeaCard";
import { ScreeningResultPanel } from "@/components/owner/startup/ScreeningResultPanel";
import { HypothesisTable } from "@/components/owner/startup/HypothesisTable";
import { EconomicScenariosPanel } from "@/components/owner/startup/EconomicScenariosPanel";
import { ReadinessGatePanel } from "@/components/owner/startup/ReadinessGatePanel";
import { ExplanationPanel } from "@/components/owner/startup/ExplanationPanel";
import { OwnerDecisionForm } from "@/components/owner/startup/OwnerDecisionForm";
import { ExecutionBlueprintPanel } from "@/components/owner/startup/ExecutionBlueprintPanel";

async function apiGet(path: string) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Request failed (${res.status})`);
  return data;
}

async function apiPost(path: string, body?: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export default function StartupSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const [session, setSession] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiGet(`/api/owner/startup/sessions/${sessionId}`);
      setSession(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load session");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (path: string, body?: unknown) => {
    setWorking(true);
    setActionError(null);
    try {
      const { ok, data } = await apiPost(path, body);
      if (!ok) throw new Error(data?.error?.message || "Action failed");
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setWorking(false);
    }
  }, [load]);

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading session…</div>;
  if (error) return <div className="p-8 text-sm text-destructive">{error}</div>;
  if (!session) return null;

  const ideas = (session.ideas as Record<string, unknown>[] | undefined) ?? [];
  const status = session.status as string;
  const explanation = session.explanation as Record<string, unknown> | null ?? null;
  const ownerDecisions = (session.ownerDecisions as Record<string, unknown>[] | undefined) ?? [];
  const blueprint = session.blueprint as Record<string, unknown> | null ?? null;
  const latestDecision = ownerDecisions[0] ?? null;

  return (
    <div className="startup-session-page max-w-5xl mx-auto px-4 py-6">
      <StartupSessionShell session={session} />

      {actionError && (
        <div className="action-error border border-destructive rounded p-3 mb-4 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <div className="ideas-section mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Ideas</h2>
          {!["APPROVED", "REJECTED", "EXECUTION_PLANNED"].includes(status) && (
            <button
              className="btn btn-sm btn-outline"
              disabled={working}
              onClick={() => {
                const name = prompt("Idea name:");
                const industry = prompt("Industry:");
                if (name && industry) {
                  void handleAction(`/api/owner/startup/sessions/${sessionId}/ideas`, { name, industry });
                }
              }}
            >
              + Add Idea
            </button>
          )}
        </div>

        {ideas.length === 0 && (
          <p className="text-sm text-muted-foreground">No ideas yet. Add one to begin.</p>
        )}

        {ideas.map((idea) => {
          const ideaId = idea.id as string;
          const screeningStatus = idea.screeningStatus as string | undefined;
          return (
            <div key={ideaId} className="idea-block mb-6">
              <IdeaCard idea={idea} />

              <div className="idea-actions flex flex-wrap gap-2 mt-2">
                {!screeningStatus && (
                  <button
                    className="btn btn-sm btn-outline EVIDENCE_REQUIRED"
                    disabled={working}
                    onClick={() => void handleAction(`/api/owner/startup/sessions/${sessionId}/ideas/${ideaId}/screen`)}
                  >
                    Screen Idea
                  </button>
                )}
                <button
                  className="btn btn-sm btn-outline"
                  disabled={working}
                  onClick={() => void handleAction(`/api/owner/startup/sessions/${sessionId}/ideas/${ideaId}/hypotheses`)}
                >
                  Generate Hypotheses
                </button>
                <button
                  className="btn btn-sm btn-outline"
                  disabled={working}
                  onClick={() => void handleAction(`/api/owner/startup/sessions/${sessionId}/ideas/${ideaId}/readiness`, {
                    regulatoryEvidenceConfirmed: false,
                    missingLicences: [],
                    unresolvedCriticalRisks: 0,
                    executionPlanExists: false,
                    measurementPlanExists: false,
                    stopConditionsDefined: false,
                    riskRegisterConfidence: null,
                  })}
                >
                  Assess Readiness
                </button>
              </div>

              {screeningStatus && (
                <ScreeningResultPanel
                  status={screeningStatus}
                  reasons={(idea.screeningReasons as string[] | undefined) ?? []}
                  bindingConstraints={(idea.screeningConstraints as unknown[] | undefined) ?? [] as unknown[]}
                />
              )}

              {(idea.hypotheses as unknown[] | undefined) && (
                <HypothesisTable hypotheses={(idea.hypotheses as unknown[]).map((h) => h as Record<string, unknown>)} />
              )}

              {idea.economicModel != null && (
                <EconomicScenariosPanel model={idea.economicModel as Record<string, unknown>} />
              )}

              {(idea.readinessAssessments as unknown[] | undefined) && (idea.readinessAssessments as unknown[]).length > 0 && (
                <ReadinessGatePanel assessment={(idea.readinessAssessments as Record<string, unknown>[])[0]} />
              )}
            </div>
          );
        })}
      </div>

      {ideas.length > 1 && (
        <div className="arbitration-section mt-6 border-t pt-6">
          <h2 className="text-lg font-semibold mb-3">SYSTEM_RECOMMENDATION</h2>
          <ExplanationPanel explanation={explanation} />
          <button
            className="btn btn-sm btn-outline mt-3"
            disabled={working}
            onClick={() => void handleAction(`/api/owner/startup/sessions/${sessionId}/arbitrate`, {
              capitalAvailableCents: null, ownerHoursPerWeek: null, riskTolerance: null,
            })}
          >
            Run Arbitration
          </button>
        </div>
      )}

      <div className="decision-section mt-6 border-t pt-6">
        <h2 className="text-lg font-semibold mb-1">OWNER_DECISION</h2>
        {latestDecision && (
          <div className="current-decision border rounded p-3 mb-4 text-sm OWNER_DECISION">
            <span className="badge badge-secondary mr-2">Current Decision</span>
            <strong>{latestDecision.decisionType as string}</strong>
            {latestDecision.rationale ? ` — ${latestDecision.rationale as string}` : ""}
          </div>
        )}
        {!["APPROVED", "REJECTED", "EXECUTION_PLANNED"].includes(status) && (
          <OwnerDecisionForm
            sessionId={sessionId}
            ideas={ideas}
            working={working}
            onDecision={(decisionType, ideaId, rationale) =>
              handleAction(`/api/owner/startup/sessions/${sessionId}/decision`, {
                decisionType, ideaId: ideaId ?? null, rationale: rationale ?? null,
              })
            }
          />
        )}
      </div>

      {latestDecision && (latestDecision.decisionType as string) === "GO" && !blueprint && (
        <div className="blueprint-section mt-6 border-t pt-6">
          <h2 className="text-lg font-semibold mb-3">Execution Blueprint</h2>
          <button
            className="btn btn-primary"
            disabled={working}
            onClick={() => {
              const approvedIdeaId = latestDecision.ideaId as string | undefined;
              if (!approvedIdeaId) { setActionError("No idea ID on decision"); return; }
              void handleAction(`/api/owner/startup/sessions/${sessionId}/blueprint`, {
                approvedIdeaId,
                ownerDecisionId: latestDecision.id as string,
              });
            }}
          >
            Create Execution Blueprint
          </button>
        </div>
      )}

      {blueprint && <ExecutionBlueprintPanel blueprint={blueprint} />}
    </div>
  );
}
