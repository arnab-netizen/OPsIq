"use client";

/**
 * /admin/beta-cohort — Controlled Beta Cohort operator table.
 *
 * Renders what GET /api/admin/beta-cohort returns and posts the two operator forms (assign an invited request to an
 * owner code; record one evidence entry). It contains NO business rules, permission checks or state transitions: the
 * stage, T+7 status, next step and expansion gate are all computed server-side, and every rule (including who may use
 * this page) is enforced by the API routes.
 *
 * Reminder shown to the operator on the page: do not type the owner's financial figures into any field.
 */

import { useCallback, useEffect, useState } from "react";
import { Button, LoadingState } from "@/ui/primitives";
import { GovernedEmptyState } from "@/components/ui/GovernedEmptyState";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { createClientIdempotencyKey } from "@/lib/client-idempotency";
import { useOperatorMutation } from "@/hooks/useOperatorMutation";
import { assignmentInputSchema, evidenceInputSchema } from "@/domain/beta-cohort/evidence";

const COHORT_ID = "CB1";

interface OwnerRow {
  assignment: { betaRequestId: string; cohortId: string; ownerCode: string; kind: string; assignedAt: string };
  automatic: {
    invitedAt: string | null; signupAt: string | null; emailVerifiedAt: string | null; firstFindingAt: string | null;
    firstResultViewedAt: string | null; firstFindingCode: string | null; firstRecommendationCode: string | null;
    firstRecommendationConfidence: number | null; evidenceCorrectionCount: number;
    recommendationChangedAfterCorrection: boolean | null;
    productDecision: { state: string; decidedAt: string } | null;
    productFeedback: { rating: string | null; reason: string | null; at: string } | null;
    ownerReportedOutcome: { status: string; at: string } | null;
    firstReturnVisitAt: string | null; returnVisitCount: number; isFixtureBusiness: boolean; accountFound: boolean;
  };
  evidence: {
    understanding: string; trust: string; wouldTakeAction: string; realWorldAction: string; actionTakenOn: string | null;
    outcome: string; severity: string; openP2TrustBlockers: number; entryCount: number;
    openIssues: Array<{ id: string; severity: string; category: string; summary: string; trustBlocker: boolean }>;
  };
  firstTrustedValue: { reachedAt: string; secondsFromVerification: number | null; stillHolds: boolean; trustWasExplicit: boolean } | null;
  stage: string;
  t7: { dueAt: string | null; status: string };
  nextOperatorStep: string;
  countedInGate: boolean;
}

interface CohortView {
  cohortId: string;
  generatedAt: string;
  owners: OwnerRow[];
  gate: {
    gate: "OPEN" | "CLOSED"; realOwnersCounted: number; required: number; p0Open: number; p1Open: number;
    p2TrustBlockersOpen: number; criteria: Record<string, string>; unmet: string[];
  };
  candidates: Array<{ betaRequestId: string; firstName: string | null; emailHint: string; invitedAt: string | null; internalAddress: boolean }>;
}

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");
const dur = (s: number | null) => (s === null ? "—" : s < 3600 ? `${Math.round(s / 60)} min` : s < 172800 ? `${(s / 3600).toFixed(1)} h` : `${(s / 86400).toFixed(1)} d`);

export default function BetaCohortPage() {
  const [view, setView] = useState<CohortView | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [assign, setAssign] = useState({ betaRequestId: "", ownerCode: "", kind: "REAL_OWNER" });
  const [ev, setEv] = useState({
    betaRequestId: "", entryType: "OBSERVATION", source: "OPERATOR_OBSERVED",
    understanding: "", trust: "", wouldTakeAction: "", realWorldAction: "", actionTakenOn: "", whatLooksWrong: "", ownerFeedback: "",
    severity: "P2", category: "OTHER", summary: "", trustBlocker: false, issueId: "", resolutionNote: "",
    actionTaken: "UNKNOWN", recommendationStillRelevant: "UNKNOWN", measurableSignalChanged: "UNKNOWN", signalNote: "",
    ownerUsefulness: "UNKNOWN", shouldChangeConclusion: "UNKNOWN", outcome: "UNKNOWN", causalBasis: "NOT_ESTABLISHED", notes: "",
  });
  const [noticeKey, setNoticeKey] = useState(0);
  const say = useCallback((m: string) => { setNotice(m); setNoticeKey((k) => k + 1); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/beta-cohort?cohortId=${COHORT_ID}`);
      if (res.status === 403) { setForbidden(true); return; }
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Could not load the cohort");
      setView(await res.json());
    } catch (e) {
      setError(classifyOperatorError(e instanceof Error ? e : new Error(String(e)), { context: "load" }).operatorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Submissions go through the governed mutation hook (duplicate-submit protection, timeout, retry-safe: the idempotency
  // key lives in the payload, so a retry is a replay, never a second entry).
  const onDone = useCallback((d: { replayed?: boolean }) => { say(d?.replayed ? "Already recorded (no change)." : "Recorded."); void load(); }, [say, load]);
  const onFail = useCallback((g: { operatorMessage: string; recovery: string }) => say(`${g.operatorMessage} ${g.recovery}`), [say]);
  const assignMutation = useOperatorMutation<{ replayed?: boolean }, unknown>({ url: "/api/admin/beta-cohort/assign", method: "POST", operationName: "cohort-assign", onSuccess: onDone, onError: onFail });
  const evidenceMutation = useOperatorMutation<{ replayed?: boolean }, unknown>({ url: "/api/admin/beta-cohort/evidence", method: "POST", operationName: "cohort-evidence", onSuccess: onDone, onError: onFail });
  const busy = assignMutation.isLoading || evidenceMutation.isLoading;

  const submitAssign = async () => {
    const payload = {
      betaRequestId: assign.betaRequestId, cohortId: COHORT_ID, ownerCode: assign.ownerCode.trim().toUpperCase(),
      kind: assign.kind, idempotencyKey: createClientIdempotencyKey("cohort-assign"),
    };
    const checked = assignmentInputSchema.safeParse(payload);
    if (!checked.success) { say(checked.error.issues.map((i) => i.message).join("; ")); return; }
    await assignMutation.mutate(checked.data);
  };

  const submitEvidence = async () => {
    const opt = <T,>(v: T | "") => (v === "" ? undefined : v);
    let entry: Record<string, unknown>;
    if (ev.entryType === "OBSERVATION") {
      entry = {
        entryType: "OBSERVATION", source: ev.source, understanding: opt(ev.understanding), trust: opt(ev.trust),
        wouldTakeAction: opt(ev.wouldTakeAction), realWorldAction: opt(ev.realWorldAction), actionTakenOn: opt(ev.actionTakenOn),
        whatLooksWrong: opt(ev.whatLooksWrong), ownerFeedback: opt(ev.ownerFeedback),
      };
    } else if (ev.entryType === "ISSUE") {
      entry = { entryType: "ISSUE", severity: ev.severity, category: ev.category, summary: ev.summary, trustBlocker: ev.trustBlocker };
    } else if (ev.entryType === "ISSUE_RESOLUTION") {
      entry = { entryType: "ISSUE_RESOLUTION", issueId: ev.issueId, resolutionNote: ev.resolutionNote };
    } else {
      entry = {
        entryType: "FOLLOW_UP_T7", source: ev.source, actionTaken: ev.actionTaken, recommendationStillRelevant: ev.recommendationStillRelevant,
        measurableSignalChanged: ev.measurableSignalChanged, signalNote: opt(ev.signalNote), ownerUsefulness: ev.ownerUsefulness,
        shouldChangeConclusion: ev.shouldChangeConclusion, outcome: ev.outcome, causalBasis: ev.causalBasis, notes: opt(ev.notes),
      };
    }
    const checked = evidenceInputSchema.safeParse({ betaRequestId: ev.betaRequestId, idempotencyKey: createClientIdempotencyKey("cohort-evidence"), entry });
    if (!checked.success) { say(checked.error.issues.map((i) => i.message).join("; ")); return; }
    await evidenceMutation.mutate(checked.data);
  };

  if (loading) return <LoadingState message="Loading beta cohort..." />;
  if (forbidden) return <GovernedEmptyState reason="permission_denied" />;
  if (error) {
    return (
      <div className="p-6"><div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-medium text-red-700">{error}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>Try again</Button>
      </div></div>
    );
  }
  if (!view) return null;

  const sel = "w-full rounded border border-border bg-background p-2 text-sm";
  const states = ["", "YES", "PARTIAL", "NO", "UNKNOWN"];
  const ynu = ["", "YES", "NO", "UNKNOWN"];
  const field = (label: string, node: React.ReactNode) => (<label className="block text-sm"><span className="mb-1 block text-xs text-gray-600">{label}</span>{node}</label>);
  const select = (value: string, onChange: (v: string) => void, options: string[]) => (
    <select className={sel} value={value} onChange={(e) => onChange(e.target.value)}>{options.map((o) => <option key={o} value={o}>{o === "" ? "(not stating)" : o}</option>)}</select>
  );
  const text = (value: string, onChange: (v: string) => void, ph = "") => (
    <input className={sel} value={value} placeholder={ph} onChange={(e) => onChange(e.target.value)} />
  );

  return (
    <div className="space-y-8 p-4 sm:p-6">
      <div>
        <h1 className="text-3xl font-bold">Beta cohort {view.cohortId}</h1>
        <p className="text-gray-600">Observed milestones are automatic. Understanding, trust, real-world action and outcome are only what a person told us — they start UNKNOWN.</p>
        <p className="mt-1 text-sm font-medium text-amber-700">Never type an owner&rsquo;s financial figures, names or contact details into any field.</p>
      </div>

      <section className="rounded-lg border border-border p-4" data-testid="cohort-gate" aria-live="polite">
        <h2 className="text-lg font-semibold">Expansion gate: <span data-testid="cohort-gate-value">{view.gate.gate}</span></h2>
        <p className="text-sm text-gray-700">Genuine owners counted: {view.gate.realOwnersCounted} (need {view.gate.required}). Open P0: {view.gate.p0Open} · P1: {view.gate.p1Open} · P2 trust blockers: {view.gate.p2TrustBlockersOpen}</p>
        {view.gate.unmet.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm text-gray-700">{view.gate.unmet.map((u) => <li key={u}>{u}</li>)}</ul>}
      </section>

      <section className="overflow-x-auto rounded-lg border border-border" data-testid="cohort-table">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-gray-50 text-gray-700">
            <tr>{["Owner", "Kind", "Stage", "Invited", "Signed up", "Verified", "Read viewed", "First trusted value", "Understands", "Trusts", "Corrected", "Rec changed", "In-product decision", "In-product usefulness", "Real action", "Return", "T+7", "Outcome", "Severity", "Next step"].map((h) => <th key={h} className="whitespace-nowrap px-2 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {view.owners.length === 0 && <tr><td className="px-2 py-3 text-gray-600" colSpan={20}>No owners assigned yet.</td></tr>}
            {view.owners.map((o) => (
              <tr key={o.assignment.betaRequestId} className="border-t border-border align-top">
                <td className="whitespace-nowrap px-2 py-2 font-medium">{o.assignment.ownerCode}{!o.countedInGate && <span className="ml-1 text-amber-700">(not counted)</span>}</td>
                <td className="px-2 py-2">{o.assignment.kind}</td>
                <td className="px-2 py-2">{o.stage}</td>
                <td className="px-2 py-2">{day(o.automatic.invitedAt)}</td>
                <td className="px-2 py-2">{day(o.automatic.signupAt)}</td>
                <td className="px-2 py-2">{day(o.automatic.emailVerifiedAt)}</td>
                <td className="px-2 py-2">{day(o.automatic.firstResultViewedAt)}</td>
                <td className="px-2 py-2">{o.firstTrustedValue ? `${dur(o.firstTrustedValue.secondsFromVerification)}${o.firstTrustedValue.stillHolds ? "" : " (withdrawn)"}` : "not yet"}</td>
                <td className="px-2 py-2">{o.evidence.understanding}</td>
                <td className="px-2 py-2">{o.evidence.trust}</td>
                <td className="px-2 py-2">{o.automatic.evidenceCorrectionCount}</td>
                <td className="px-2 py-2">{o.automatic.recommendationChangedAfterCorrection === null ? "n/a" : o.automatic.recommendationChangedAfterCorrection ? "YES" : "NO"}</td>
                <td className="px-2 py-2">{o.automatic.productDecision?.state ?? "UNKNOWN"}</td>
                <td className="px-2 py-2">{o.automatic.productFeedback?.rating ?? "UNKNOWN"}</td>
                <td className="px-2 py-2">{o.evidence.realWorldAction}{o.evidence.actionTakenOn ? ` (${o.evidence.actionTakenOn})` : ""}</td>
                <td className="px-2 py-2">{o.automatic.firstReturnVisitAt ? `${day(o.automatic.firstReturnVisitAt)} ×${o.automatic.returnVisitCount}` : "none"}</td>
                <td className="px-2 py-2">{o.t7.status}{o.t7.dueAt ? ` · due ${day(o.t7.dueAt)}` : ""}</td>
                <td className="px-2 py-2">{o.evidence.outcome}</td>
                <td className="px-2 py-2">{o.evidence.severity}{o.evidence.openIssues.length ? ` (${o.evidence.openIssues.length} open)` : ""}</td>
                <td className="min-w-[16rem] px-2 py-2">{o.nextOperatorStep}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {notice && <p key={noticeKey} role="status" className="text-sm text-gray-800">{notice}</p>}

      <section className="space-y-3 rounded-lg border border-border p-4">
        <h2 className="text-lg font-semibold">Assign an invited request to an owner</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {field("Invited request", select(assign.betaRequestId, (v) => setAssign({ ...assign, betaRequestId: v }), ["", ...view.candidates.map((c) => c.betaRequestId)]))}
          {field("Owner code (e.g. CB1-001)", text(assign.ownerCode, (v) => setAssign({ ...assign, ownerCode: v }), "CB1-001"))}
          {field("Kind", select(assign.kind, (v) => setAssign({ ...assign, kind: v }), ["REAL_OWNER", "QA_MECHANICS"]))}
        </div>
        {view.candidates.length > 0 && (
          <ul className="text-xs text-gray-600">{view.candidates.map((c) => <li key={c.betaRequestId}>{c.betaRequestId} — {c.firstName ?? "(no name)"} · {c.emailHint} · invited {day(c.invitedAt)}{c.internalAddress ? " · INTERNAL address (QA only)" : ""}</li>)}</ul>
        )}
        <Button size="sm" disabled={busy || !assign.betaRequestId || !assign.ownerCode} onClick={() => void submitAssign()}>Assign</Button>
      </section>

      <section className="space-y-3 rounded-lg border border-border p-4">
        <h2 className="text-lg font-semibold">Record evidence</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {field("Owner", select(ev.betaRequestId, (v) => setEv({ ...ev, betaRequestId: v }), ["", ...view.owners.map((o) => o.assignment.betaRequestId)]))}
          {field("Entry type", select(ev.entryType, (v) => setEv({ ...ev, entryType: v }), ["OBSERVATION", "ISSUE", "ISSUE_RESOLUTION", "FOLLOW_UP_T7"]))}
          {(ev.entryType === "OBSERVATION" || ev.entryType === "FOLLOW_UP_T7") && field("Who said it", select(ev.source, (v) => setEv({ ...ev, source: v }), ["OPERATOR_OBSERVED", "OWNER_STATED"]))}
        </div>
        {ev.entryType === "OBSERVATION" && (
          <div className="grid gap-3 sm:grid-cols-3">
            {field("Understands what OpsIQ is telling them", select(ev.understanding, (v) => setEv({ ...ev, understanding: v }), states))}
            {field("Believes it is accurate enough to act on", select(ev.trust, (v) => setEv({ ...ev, trust: v }), states))}
            {field("Would take the recommended action", select(ev.wouldTakeAction, (v) => setEv({ ...ev, wouldTakeAction: v }), ynu))}
            {field("Real-world action", select(ev.realWorldAction, (v) => setEv({ ...ev, realWorldAction: v }), ["", "DONE", "NOT_DONE", "UNKNOWN"]))}
            {field("Date they acted (required if DONE)", <input type="date" className={sel} value={ev.actionTakenOn} onChange={(e) => setEv({ ...ev, actionTakenOn: e.target.value })} />)}
            {field("What looks wrong", text(ev.whatLooksWrong, (v) => setEv({ ...ev, whatLooksWrong: v })))}
            {field("Owner feedback (their words, no figures)", text(ev.ownerFeedback, (v) => setEv({ ...ev, ownerFeedback: v })))}
          </div>
        )}
        {ev.entryType === "ISSUE" && (
          <div className="grid gap-3 sm:grid-cols-3">
            {field("Severity", select(ev.severity, (v) => setEv({ ...ev, severity: v }), ["P0", "P1", "P2"]))}
            {field("Category", select(ev.category, (v) => setEv({ ...ev, category: v }), ["COMPREHENSION", "TRUST", "BAD_RECOMMENDATION", "CORRECTION_FAILURE", "OWNER_VISIBLE_ERROR", "WORKFLOW_FRICTION", "FALSE_CONFIDENCE", "MISSING_CONTEXT", "ACCESS_OR_SIGNUP", "OTHER"]))}
            {field("Stops them trusting/understanding a finding?", select(ev.trustBlocker ? "YES" : "NO", (v) => setEv({ ...ev, trustBlocker: v === "YES" }), ["NO", "YES"]))}
            {field("Summary (no figures or contact details)", text(ev.summary, (v) => setEv({ ...ev, summary: v })))}
          </div>
        )}
        {ev.entryType === "ISSUE_RESOLUTION" && (
          <div className="grid gap-3 sm:grid-cols-2">
            {field("Issue",
              select(ev.issueId, (v) => setEv({ ...ev, issueId: v }), ["", ...view.owners.filter((o) => o.assignment.betaRequestId === ev.betaRequestId).flatMap((o) => o.evidence.openIssues.map((i) => i.id))]))}
            {field("Resolution note", text(ev.resolutionNote, (v) => setEv({ ...ev, resolutionNote: v })))}
          </div>
        )}
        {ev.entryType === "FOLLOW_UP_T7" && (
          <div className="grid gap-3 sm:grid-cols-3">
            {field("Action actually taken?", select(ev.actionTaken, (v) => setEv({ ...ev, actionTaken: v }), ["DONE", "NOT_DONE", "UNKNOWN"]))}
            {field("Recommendation still relevant?", select(ev.recommendationStillRelevant, (v) => setEv({ ...ev, recommendationStillRelevant: v }), ["YES", "NO", "UNKNOWN"]))}
            {field("Measurable business signal changed?", select(ev.measurableSignalChanged, (v) => setEv({ ...ev, measurableSignalChanged: v }), ["YES", "NO", "UNKNOWN"]))}
            {field("What changed (no figures)", text(ev.signalNote, (v) => setEv({ ...ev, signalNote: v })))}
            {field("Owner found it useful", select(ev.ownerUsefulness, (v) => setEv({ ...ev, ownerUsefulness: v }), ["YES", "PARTIAL", "NO", "UNKNOWN"]))}
            {field("OpsIQ should change its conclusion?", select(ev.shouldChangeConclusion, (v) => setEv({ ...ev, shouldChangeConclusion: v }), ["YES", "NO", "UNKNOWN"]))}
            {field("Outcome", select(ev.outcome, (v) => setEv({ ...ev, outcome: v }), ["PROVED", "PARTIAL", "FAILED", "UNKNOWN"]))}
            {field("Causal basis", select(ev.causalBasis, (v) => setEv({ ...ev, causalBasis: v }), ["NOT_ESTABLISHED", "CORRELATION_ONLY", "CAUSAL_EVIDENCE"]))}
            {field("Notes", text(ev.notes, (v) => setEv({ ...ev, notes: v })))}
          </div>
        )}
        <Button size="sm" disabled={busy || !ev.betaRequestId} onClick={() => void submitEvidence()}>Record</Button>
        <p className="text-xs text-gray-600">Entries are append-only: nothing is edited or deleted. A newer statement supersedes an older one; the history stays.</p>
      </section>
    </div>
  );
}
