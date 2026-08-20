"use client";

import { useEffect, useState } from "react";
import { use } from "react";

interface IdeaRecord {
  id: string;
  name: string;
  industry: string;
  screeningStatus: string;
  accepted: boolean;
  version: number;
}

interface SystemRec {
  id: string;
  recommendation: string;
  rationale: string;
  confidence: number;
  createdAt: string;
}

interface OwnerDecision {
  id: string;
  decisionType: string;
  rationale: string | null;
  actorId: string;
  createdAt: string;
  supersededById: string | null;
}

/** Owner-supplied startup intake, captured once at session creation (see
 * src/domain/owner-strategy/startup-mode.validation.ts:startupIntakeSchema).
 * Every field is honestly nullable — an owner may not have supplied it. */
interface StartupIntake {
  location: string | null;
  capitalAvailable: number | null;
  riskTolerance: "low" | "medium" | "high" | null;
  hoursPerWeekAvailable: number | null;
}

interface SessionData {
  id: string;
  sessionLabel: string | null;
  status: string;
  intake: StartupIntake;
  profileVersion: number;
  currentProfileVersionId: string | null;
  currentSystemRecId: string | null;
  currentOwnerDecisionId: string | null;
  currentBlueprintId: string | null;
  ideas: IdeaRecord[];
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
  ACTIVE: "Active",
};

const SCREENING_STATUS_CLASS: Record<string, string> = {
  PASSED: "VALIDATED",
  CONDITIONALLY_PASSED: "UNTESTED_ASSUMPTION",
  REJECTED: "REJECTED_IDEA",
  EVIDENCE_REQUIRED: "EVIDENCE_REQUIRED",
  UNSCREENED: "UNKNOWN_INPUT",
};

export default function StartupSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const [session, setSession] = useState<SessionData | null>(null);
  const [systemRec, setSystemRec] = useState<SystemRec | null>(null);
  const [ownerDecision, setOwnerDecision] = useState<OwnerDecision | null>(null);
  const [pageMsg, setPageMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "overview" | "ideas" | "evidence" | "analysis" | "decision" | "blueprint"
  >("overview");
  const [arbitrationResult, setArbitrationResult] = useState<{
    recommendedIdeaId: string | null;
    recommendedIdeaName: string | null;
    closestAlternativeId: string | null;
    closestAlternativeName: string | null;
    bindingConstraints: string[];
    opportunityCost: string | null;
    whatWouldChangeRanking: string;
  } | null>(null);
  const [explanation, setExplanation] = useState<{
    recommendation: string;
    rationale: string;
    confidence: number;
    confidenceLevel: string;
    evidenceGaps: string[];
    bindingConstraints: string[];
    hardGateFailures: string[];
  } | null>(null);
  const [freshnessReport, setFreshnessReport] = useState<{
    hasStale: boolean;
    materialConflictCount: number;
    freshnessList: { evidenceId: string; state: string }[];
  } | null>(null);
  const [blueprintDetail, setBlueprintDetail] = useState<{
    initiativeId: string | null;
    executionPlanId: string | null;
    verificationWindowCount: number;
    taskCount: number;
  } | null>(null);

  // Form states
  const [newIdeaName, setNewIdeaName] = useState("");
  const [newIdeaIndustry, setNewIdeaIndustry] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function loadSession() {
    try {
      const res = await fetch(`/api/owner/startup/sessions/${sessionId}`);
      if (!res.ok) { setPageMsg("Failed to load session"); return; }
      const data = await res.json();
      setSession(data.session);
    } catch {
      setPageMsg("Network error loading session");
    }
  }

  async function loadDecision() {
    try {
      const res = await fetch(`/api/owner/startup/sessions/${sessionId}/decision`);
      if (res.ok) {
        const data = await res.json();
        setSystemRec(data.systemRec ?? null);
        setOwnerDecision(data.ownerDecision ?? null);
      }
    } catch {
      // Non-fatal
    }
  }

  async function loadArbitration() {
    try {
      const res = await fetch(`/api/owner/startup/sessions/${sessionId}/arbitrate`);
      if (res.ok) {
        const data = await res.json();
        if (data.recommendedIdeaId !== undefined) setArbitrationResult(data);
      }
    } catch { /* Non-fatal */ }
  }

  async function loadExplanation() {
    try {
      const res = await fetch(`/api/owner/startup/sessions/${sessionId}/explanation`);
      if (res.ok) {
        const data = await res.json();
        if (data.recommendation !== undefined) setExplanation(data);
      }
    } catch { /* Non-fatal */ }
  }

  async function loadFreshness() {
    try {
      const res = await fetch(`/api/owner/startup/sessions/${sessionId}/evidence/freshness`);
      if (res.ok) {
        const data = await res.json();
        setFreshnessReport(data);
      }
    } catch { /* Non-fatal */ }
  }

  async function loadBlueprintDetail(currentBlueprintId: string | null, ideas: IdeaRecord[]) {
    if (!currentBlueprintId) return;
    // Use canonical blueprint ID to derive execution plan — no client-side accepted heuristic
    // Try GET /blueprint which returns the canonical blueprint details including initiativeId
    try {
      const bpRes = await fetch(`/api/owner/startup/sessions/${sessionId}/blueprint`);
      if (bpRes.ok) {
        const bpData = await bpRes.json();
        const initiativeId: string | null = bpData.initiativeId ?? null;
        const ideaId: string | null = bpData.ideaId ?? ideas.find((i) => i.accepted)?.id ?? null;
        // Load execution plan if we have ideaId
        if (ideaId) {
          try {
            const epRes = await fetch(
              `/api/owner/startup/sessions/${sessionId}/ideas/${ideaId}/execution-plan`
            );
            if (epRes.ok) {
              const epData = await epRes.json();
              setBlueprintDetail({
                initiativeId: initiativeId ?? epData.initiativeId ?? null,
                executionPlanId: epData.id ?? epData.executionPlanId ?? null,
                verificationWindowCount: bpData.verificationWindowCount ?? epData.verificationWindowCount ?? 0,
                taskCount: Array.isArray(epData.tasks) ? epData.tasks.length : (epData.taskCount ?? 0),
              });
              return;
            }
          } catch { /* Non-fatal inner */ }
        }
        // Blueprint exists but no execution plan yet
        setBlueprintDetail({
          initiativeId,
          executionPlanId: null,
          verificationWindowCount: bpData.verificationWindowCount ?? 0,
          taskCount: 0,
        });
      }
    } catch { /* Non-fatal */ }
  }

  useEffect(() => {
    async function load() {
      // Single fetch — get session + all parallel data in one round trip
      const res = await fetch(`/api/owner/startup/sessions/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        setSession(data.session ?? null);
        const ideas: IdeaRecord[] = data.session?.ideas ?? [];
        const blueprintId: string | null = data.session?.currentBlueprintId ?? null;
        await Promise.all([
          loadDecision(),
          loadArbitration(),
          loadExplanation(),
          loadFreshness(),
          loadBlueprintDetail(blueprintId, ideas),
        ]);
      } else {
        setPageMsg("Failed to load session");
      }
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function handleAddIdea(e: React.FormEvent) {
    e.preventDefault();
    if (!newIdeaName.trim()) return;
    setSubmitting(true);
    setPageMsg(null);
    try {
      const res = await fetch(`/api/owner/startup/sessions/${sessionId}/ideas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newIdeaName, industry: newIdeaIndustry || "General" }),
      });
      if (!res.ok) {
        const d = await res.json();
        setPageMsg(d.error ?? "Failed to add idea");
        return;
      }
      setNewIdeaName("");
      setNewIdeaIndustry("");
      await loadSession();
    } catch {
      setPageMsg("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTransition(newStatus: string) {
    setPageMsg(null);
    try {
      const res = await fetch(`/api/owner/startup/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const d = await res.json();
        setPageMsg(d.error ?? `Failed to transition to ${newStatus}`);
        return;
      }
      await loadSession();
    } catch {
      setPageMsg("Network error");
    }
  }

  async function handleScreenIdea(ideaId: string) {
    setPageMsg(null);
    try {
      // Screen using the owner's own intake, captured once at session
      // creation — never re-asked, never fabricated. capitalAvailable is a
      // plain currency amount in the intake domain (see
      // src/domain/owner-strategy/startup-mode.ts's direct arithmetic use);
      // the screening profile expects cents, hence the explicit conversion.
      // riskTolerance is lowercase in startupIntakeSchema ("low"/"medium"/
      // "high") but uppercase in the analysis route's profileSchema
      // ("LOW"/"MEDIUM"/"HIGH") — case-converted here, not re-validated as a
      // new enum, since both sides already independently enforce the same
      // three values.
      const intake = session?.intake;
      const capitalAvailableCents =
        intake?.capitalAvailable != null ? Math.round(intake.capitalAvailable * 100) : null;
      const res = await fetch(`/api/owner/startup/sessions/${sessionId}/analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SCREEN",
          ideaId,
          profile: {
            capitalAvailableCents,
            ownerHoursPerWeek: intake?.hoursPerWeekAvailable ?? null,
            riskTolerance: intake?.riskTolerance ? intake.riskTolerance.toUpperCase() : null,
            location: intake?.location ?? null,
          },
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setPageMsg(d.error ?? "Screening failed");
        return;
      }
      await loadSession();
    } catch {
      setPageMsg("Network error");
    }
  }

  async function handleGenerateHypotheses(ideaId: string) {
    setPageMsg(null);
    try {
      const res = await fetch(`/api/owner/startup/sessions/${sessionId}/analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "GENERATE_HYPOTHESES", ideaId }),
      });
      if (!res.ok) {
        const d = await res.json();
        setPageMsg(d.error ?? "Failed to generate hypotheses");
        return;
      }
      setPageMsg("Hypotheses generated successfully");
    } catch {
      setPageMsg("Network error");
    }
  }

  async function handleOwnerDecision(decisionType: string) {
    setPageMsg(null);
    try {
      const res = await fetch(`/api/owner/startup/sessions/${sessionId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decisionType,
          rationale: `Owner decision: ${decisionType}`,
          linkedSystemRecId: systemRec?.id ?? null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setPageMsg(d.error ?? "Failed to record decision");
        return;
      }
      await Promise.all([loadSession(), loadDecision()]);
    } catch {
      setPageMsg("Network error");
    }
  }

  if (!session) {
    return (
      <div style={{ padding: "2rem" }} data-testid="startup-session-loading">
        {pageMsg ?? "Loading…"}
      </div>
    );
  }

  return (
    <div className="startup-session-shell" style={{ maxWidth: 1000, margin: "0 auto", padding: "2rem" }}>
      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 700 }} data-testid="startup-session-title">
          {session.sessionLabel ?? "Startup Session"}
        </h1>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginTop: "0.5rem" }}>
          <span
            className={`startup-status startup-status--${session.status.toLowerCase()}`}
            data-testid="session-status"
          >
            {STATUS_LABELS[session.status] ?? session.status}
          </span>
          <span data-testid="startup-profile-version">Profile v{session.profileVersion}</span>
        </div>
      </div>

      {pageMsg && (
        <div className="page-message" role="alert" data-testid="startup-page-msg"
          style={{ color: "red", marginBottom: "1rem", padding: "0.5rem", background: "#fee2e2", borderRadius: 4 }}>
          {pageMsg}
        </div>
      )}

      {/* Status transitions */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        {session.status === "DRAFT" && (
          <button onClick={() => handleTransition("CONTEXT_CAPTURE")}
            data-testid="btn-to-context-capture" style={btnStyle}>
            Start Context Capture →
          </button>
        )}
        {session.status === "CONTEXT_CAPTURE" && (
          <button onClick={() => handleTransition("IDEA_GENERATION")}
            data-testid="btn-to-idea-generation" style={btnStyle}>
            Generate Ideas →
          </button>
        )}
        {session.status === "IDEA_GENERATION" && (
          <button onClick={() => handleTransition("SCREENING")}
            data-testid="btn-to-screening" style={btnStyle}>
            Screen Ideas →
          </button>
        )}
        {session.status === "SCREENING" && (
          <button onClick={() => handleTransition("ECONOMICS_REVIEW")}
            data-testid="btn-to-economics" style={btnStyle}>
            Economics Review →
          </button>
        )}
        {session.status === "ECONOMICS_REVIEW" && (
          <button onClick={() => handleTransition("READINESS_REVIEW")}
            data-testid="btn-to-readiness" style={btnStyle}>
            Readiness Review →
          </button>
        )}
        {session.status === "READINESS_REVIEW" && (
          <button onClick={() => handleTransition("OWNER_DECISION_REQUIRED")}
            data-testid="btn-to-decision" style={btnStyle}>
            Request Owner Decision →
          </button>
        )}
      </div>

      {/* Tab navigation */}
      <div style={{ display: "flex", gap: "0", borderBottom: "2px solid #e5e7eb", marginBottom: "1.5rem" }}>
        {(["overview", "ideas", "evidence", "analysis", "decision", "blueprint"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            data-testid={`tab-${tab}`}
            style={{
              padding: "0.5rem 1rem",
              border: "none",
              borderBottom: activeTab === tab ? "2px solid #2563eb" : "none",
              background: "none",
              cursor: "pointer",
              fontWeight: activeTab === tab ? 700 : 400,
              marginBottom: -2,
            }}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (
        <div data-testid="startup-tab-content-overview">
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "1rem" }}>Session Overview</h2>
          <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            <dt style={{ fontWeight: 600 }}>Status</dt>
            <dd data-testid="overview-status">{session.status}</dd>
            <dt style={{ fontWeight: 600 }}>Ideas</dt>
            <dd data-testid="overview-idea-count">{session.ideas?.length ?? 0}</dd>
            <dt style={{ fontWeight: 600 }}>Profile Version</dt>
            <dd>{session.profileVersion}</dd>
          </dl>
        </div>
      )}

      {activeTab === "ideas" && (
        <div data-testid="startup-tab-content-ideas">
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "1rem" }}>Ideas</h2>
          <form onSubmit={handleAddIdea} style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
            <input placeholder="Idea name" value={newIdeaName}
              onChange={(e) => setNewIdeaName(e.target.value)}
              data-testid="new-idea-name-input"
              style={{ flex: 1, padding: "0.5rem", border: "1px solid #ccc", borderRadius: 4 }} />
            <input placeholder="Industry" value={newIdeaIndustry}
              onChange={(e) => setNewIdeaIndustry(e.target.value)}
              data-testid="new-idea-industry-input"
              style={{ flex: 1, padding: "0.5rem", border: "1px solid #ccc", borderRadius: 4 }} />
            <button type="submit" disabled={submitting}
              data-testid="add-idea-btn" style={btnStyle}>
              Add Idea
            </button>
          </form>

          {(session.ideas ?? []).length === 0 ? (
            <p data-testid="no-ideas">No ideas yet.</p>
          ) : (
            <div>
              {(session.ideas ?? []).map((idea) => (
                <div key={idea.id}
                  data-testid={`idea-card-${idea.id}`}
                  className={`idea-card ${SCREENING_STATUS_CLASS[idea.screeningStatus] ?? ""}`}
                  style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: "1rem", marginBottom: "0.75rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                    <div>
                      <strong data-testid={`idea-name-${idea.id}`}>{idea.name}</strong>
                      <span style={{ marginLeft: "0.5rem", color: "#666" }}>{idea.industry}</span>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <span
                        className={`screening-badge ${SCREENING_STATUS_CLASS[idea.screeningStatus] ?? ""}`}
                        data-testid={`idea-status-${idea.id}`}>
                        {idea.screeningStatus}
                      </span>
                    </div>
                  </div>
                  <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem" }}>
                    <button onClick={() => handleScreenIdea(idea.id)}
                      data-testid={`screen-idea-btn-${idea.id}`}
                      style={{ ...btnStyle, fontSize: "0.8rem", padding: "0.3rem 0.75rem" }}>
                      Screen
                    </button>
                    <button onClick={() => handleGenerateHypotheses(idea.id)}
                      data-testid={`gen-hypotheses-btn-${idea.id}`}
                      style={{ ...btnStyle, fontSize: "0.8rem", padding: "0.3rem 0.75rem" }}>
                      Generate Hypotheses
                    </button>
                    <a href={`/owner/startup/${sessionId}/ideas/${idea.id}`}
                      data-testid={`idea-detail-link-${idea.id}`}
                      style={{ ...btnStyle, fontSize: "0.8rem", padding: "0.3rem 0.75rem", textDecoration: "none", display: "inline-block" }}>
                      Detail →
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "decision" && (
        <div data-testid="decision-section">
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "1rem" }}>Decision</h2>

          <div className="SYSTEM_RECOMMENDATION system-recommendation-section" data-testid="system-recommendation-section">
            {systemRec ? (
              <div data-testid="system-recommendation"
                style={{ border: "1px solid #3b82f6", borderRadius: 6, padding: "1rem", marginBottom: "1rem", background: "#eff6ff" }}>
                <div style={{ fontWeight: 700, marginBottom: "0.25rem" }}>
                  System Recommendation
                </div>
                <div data-testid="system-rec-value" style={{ fontSize: "1.1rem", fontWeight: 600 }}>
                  {systemRec.recommendation}
                </div>
                <div style={{ marginTop: "0.5rem", color: "#374151" }}>{systemRec.rationale}</div>
                <div style={{ marginTop: "0.25rem", color: "#6b7280", fontSize: "0.85rem" }}>
                  Confidence: {systemRec.confidence}%
                </div>
              </div>
            ) : (
              <p style={{ color: "#6b7280", fontStyle: "italic", marginBottom: "1rem" }}>No system recommendation yet.</p>
            )}
          </div>

          <div className="OWNER_DECISION owner-decision-section" data-testid="owner-decision-section">
            {ownerDecision ? (
              <div
                className={ownerDecision.supersededById ? "SUPERSEDED_DECISION" : ""}
                data-testid="owner-decision"
                style={{ border: "1px solid #10b981", borderRadius: 6, padding: "1rem", marginBottom: "1rem", background: "#ecfdf5" }}>
                <div style={{ fontWeight: 700 }}>Owner Decision</div>
                <div data-testid="owner-decision-type" style={{ fontSize: "1.1rem", fontWeight: 600 }}>
                  {ownerDecision.decisionType}
                </div>
                {ownerDecision.rationale && <div style={{ marginTop: "0.5rem" }}>{ownerDecision.rationale}</div>}
                {ownerDecision.supersededById && (
                  <div className="SUPERSEDED_DECISION" style={{ marginTop: "0.25rem", color: "#ef4444", fontSize: "0.8rem" }}>
                    Superseded
                  </div>
                )}
              </div>
            ) : (
              <p style={{ color: "#6b7280", fontStyle: "italic", marginBottom: "1rem" }}>No owner decision recorded yet.</p>
            )}
          </div>

          {session.status === "OWNER_DECISION_REQUIRED" && (
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {(["GO", "MODIFY", "HOLD", "REJECT", "REQUEST_MORE_EVIDENCE"] as const).map((dt) => (
                <button key={dt} onClick={() => handleOwnerDecision(dt)}
                  data-testid={`decision-btn-${dt.toLowerCase()}`}
                  style={{ ...btnStyle, background: dt === "GO" ? "#10b981" : dt === "REJECT" ? "#ef4444" : "#6b7280" }}>
                  {dt.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "blueprint" && (
        <div data-testid="blueprint-section">
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "1rem" }}>Execution Blueprint</h2>
          {session.currentBlueprintId ? (
            <div data-testid="blueprint-exists">
              <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "1rem" }}>
                <dt style={{ fontWeight: 600 }}>Blueprint ID</dt>
                <dd><code data-testid="blueprint-id">{session.currentBlueprintId}</code></dd>
                {blueprintDetail?.initiativeId && (
                  <>
                    <dt style={{ fontWeight: 600 }}>Initiative ID</dt>
                    <dd><code data-testid="blueprint-initiative-id">{blueprintDetail.initiativeId}</code></dd>
                  </>
                )}
                {blueprintDetail?.executionPlanId && (
                  <>
                    <dt style={{ fontWeight: 600 }}>Execution Plan ID</dt>
                    <dd><code data-testid="blueprint-execution-plan-id">{blueprintDetail.executionPlanId}</code></dd>
                  </>
                )}
                {blueprintDetail !== null && (
                  <>
                    <dt style={{ fontWeight: 600 }}>Tasks</dt>
                    <dd data-testid="blueprint-task-count">{blueprintDetail.taskCount}</dd>
                    <dt style={{ fontWeight: 600 }}>Verification Windows</dt>
                    <dd data-testid="blueprint-verification-window-count">{blueprintDetail.verificationWindowCount}</dd>
                  </>
                )}
              </dl>
            </div>
          ) : (
            <p data-testid="no-blueprint">
              No execution blueprint yet. Approve an idea and record a GO decision to create one.
            </p>
          )}
        </div>
      )}

      {activeTab === "evidence" && (
        <div data-testid="evidence-section">
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "1rem" }}>Evidence</h2>

          {freshnessReport && (
            <div data-testid="evidence-freshness-summary"
              style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: "1rem", marginBottom: "1rem" }}>
              <div style={{ fontWeight: 700, marginBottom: "0.5rem" }}>Evidence Freshness</div>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                <span
                  className={freshnessReport.hasStale ? "EVIDENCE_REQUIRED" : "VALIDATED"}
                  data-testid="freshness-stale-flag">
                  {freshnessReport.hasStale ? "Stale evidence present" : "All evidence current"}
                </span>
                {freshnessReport.materialConflictCount > 0 && (
                  <span className="BINDING_CONSTRAINT" data-testid="freshness-conflict-count">
                    {freshnessReport.materialConflictCount} material conflict{freshnessReport.materialConflictCount !== 1 ? "s" : ""} detected
                  </span>
                )}
              </div>
              {freshnessReport.freshnessList.length > 0 && (
                <div style={{ marginTop: "0.75rem" }}>
                  {freshnessReport.freshnessList.map((item) => (
                    <div key={item.evidenceId}
                      data-testid={`freshness-item-${item.evidenceId}`}
                      style={{ display: "flex", justifyContent: "space-between", padding: "0.25rem 0", borderBottom: "1px solid #f3f4f6" }}>
                      <code style={{ fontSize: "0.8rem", color: "#6b7280" }}>{item.evidenceId}</code>
                      <span className={
                        item.state === "STALE" || item.state === "CURRENT_VERIFICATION_REQUIRED"
                          ? "EVIDENCE_REQUIRED"
                          : item.state === "NEARING_EXPIRY"
                          ? "UNTESTED_ASSUMPTION"
                          : "VALIDATED"
                      } style={{ fontSize: "0.8rem" }}>
                        {item.state}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>Record evidence via the API or use the analysis tab to run assessments.</p>
        </div>
      )}

      {activeTab === "analysis" && (
        <div data-testid="startup-tab-content-analysis">
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "1rem" }}>Analysis</h2>

          {/* Arbitration Winner */}
          {arbitrationResult && (
            <div data-testid="arbitration-result" className="SYSTEM_RECOMMENDATION"
              style={{ border: "1px solid #3b82f6", borderRadius: 6, padding: "1rem", marginBottom: "1rem", background: "#eff6ff" }}>
              <div style={{ fontWeight: 700, marginBottom: "0.5rem" }}>Idea Arbitration Result</div>
              {arbitrationResult.recommendedIdeaId ? (
                <>
                  <div data-testid="arbitration-winner">
                    <span className="VALIDATED" style={{ fontWeight: 600 }}>Recommended: </span>
                    {arbitrationResult.recommendedIdeaName ?? arbitrationResult.recommendedIdeaId}
                  </div>
                  {arbitrationResult.closestAlternativeName && (
                    <div style={{ color: "#6b7280", fontSize: "0.85rem", marginTop: "0.25rem" }}>
                      Closest alternative: {arbitrationResult.closestAlternativeName}
                    </div>
                  )}
                  {arbitrationResult.opportunityCost && (
                    <div style={{ color: "#92400e", fontSize: "0.85rem", marginTop: "0.25rem" }}>
                      Opportunity cost: {arbitrationResult.opportunityCost}
                    </div>
                  )}
                  {arbitrationResult.bindingConstraints.length > 0 && (
                    <div className="BINDING_CONSTRAINT" style={{ marginTop: "0.5rem" }}>
                      <strong>Binding constraints:</strong> {arbitrationResult.bindingConstraints.join(", ")}
                    </div>
                  )}
                  <div style={{ fontSize: "0.8rem", color: "#6b7280", marginTop: "0.25rem" }}>
                    {arbitrationResult.whatWouldChangeRanking}
                  </div>
                </>
              ) : (
                <div className="BINDING_CONSTRAINT" data-testid="no-arbitration-winner">
                  No viable ideas — all rejected or blocked.
                </div>
              )}
            </div>
          )}

          {/* System Explanation */}
          {explanation && (
            <div data-testid="explanation-panel" className="SYSTEM_RECOMMENDATION"
              style={{ border: "1px solid #8b5cf6", borderRadius: 6, padding: "1rem", marginBottom: "1rem", background: "#f5f3ff" }}>
              <div style={{ fontWeight: 700, marginBottom: "0.5rem" }}>System Explanation</div>
              <div data-testid="explanation-recommendation" style={{ fontWeight: 600 }}>{explanation.recommendation}</div>
              <div style={{ marginTop: "0.25rem", color: "#374151" }}>{explanation.rationale}</div>
              <div style={{ marginTop: "0.25rem", fontSize: "0.85rem", color: "#6b7280" }}>
                Confidence: {explanation.confidence}% ({explanation.confidenceLevel})
              </div>
              {explanation.evidenceGaps.length > 0 && (
                <div className="EVIDENCE_REQUIRED" style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}>
                  <strong>Evidence gaps:</strong> {explanation.evidenceGaps.join(", ")}
                </div>
              )}
              {explanation.hardGateFailures.length > 0 && (
                <div className="BINDING_CONSTRAINT" style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}>
                  <strong>Hard gate failures:</strong> {explanation.hardGateFailures.join(", ")}
                </div>
              )}
            </div>
          )}

          {!arbitrationResult && !explanation && (
            <p>Use the ideas tab to screen ideas and generate hypotheses. Full economic and readiness analysis available via API.</p>
          )}
        </div>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "0.5rem 1rem",
  background: "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
};
