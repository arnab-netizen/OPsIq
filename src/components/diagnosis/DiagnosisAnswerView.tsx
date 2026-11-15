/**
 * Quick-diagnosis answer (presentational only).
 *
 * Renders the server-built GenericDiagnosisAnswer in answer-first order:
 * main problem → why → evidence (with where each item came from) → how sure → what this means →
 * do this first → then → do not do yet → what OpsIQ still needs. Supporting detail (what can and
 * can't be concluded, the stated concern, intervention mode) is collapsed underneath.
 * Every sentence comes from the answer; this component only lays it out.
 */
import { Badge, Disclosure } from "@/ui/primitives";
import { PROVENANCE_LABEL, type GenericDiagnosisAnswer } from "@/domain/generic-diagnosis/answer";

/** Plain-language names for the engagement's starting intervention mode. */
const INTERVENTION_MODE_TEXT: Record<string, string> = {
  recovery: "recovery (urgent)",
  stabilization: "stabilization",
  growth: "growth",
  shock_response: "shock response",
  mixed: "not decided yet — more evidence needed",
};

const CERTAINTY_VARIANT: Record<GenericDiagnosisAnswer["confidence"]["certainty"]["level"], "success-accessible" | "default-accessible" | "warning-accessible" | "muted-accessible"> = {
  high: "success-accessible",
  medium: "default-accessible",
  low: "warning-accessible",
  cannot_determine: "muted-accessible",
};

export function DiagnosisAnswerView({
  answer,
  engagementCode,
  interventionMode,
}: {
  answer: GenericDiagnosisAnswer;
  engagementCode: string;
  interventionMode: string;
}) {
  const { confidence } = answer;
  return (
    <div className="space-y-4" data-testid="diagnosis-answer" data-status={answer.status} data-main-problem={answer.mainProblem.code}>
      <section aria-labelledby="diagnosis-main-problem" className="rounded-lg border-2 border-border bg-card p-4">
        <div className="text-xs uppercase text-muted-foreground">Main problem</div>
        <h2 id="diagnosis-main-problem" className="text-2xl font-bold mt-1" data-testid="diagnosis-headline">
          {answer.mainProblem.headline}
        </h2>
        <p className="mt-1 text-base" data-testid="diagnosis-detail">{answer.mainProblem.detail}</p>
        {answer.dataWarnings.length > 0 && (
          <ul className="mt-3 rounded-md border border-warning/40 bg-warning/5 p-3 text-sm" data-testid="diagnosis-data-warnings">
            {answer.dataWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border bg-card p-4" data-testid="diagnosis-why">
        <h3 className="font-semibold">Why OpsIQ thinks this</h3>
        <ul className="mt-2 list-disc pl-5 text-sm space-y-1">
          {answer.why.map((r) => (
            <li key={r.text}>
              {r.text} <span className="text-xs text-muted-foreground">({PROVENANCE_LABEL[r.provenance]})</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border bg-card p-4" data-testid="diagnosis-evidence">
        <h3 className="font-semibold">Evidence</h3>
        <dl className="mt-2 grid gap-2 sm:grid-cols-2">
          {answer.evidence.map((e) => (
            <div key={e.key} className="rounded-md border p-2 min-w-0" data-provenance={e.provenance}>
              <dt className="text-xs text-muted-foreground">{e.label}</dt>
              <dd className="text-sm font-medium break-words">{e.value}</dd>
              <dd className="text-xs text-muted-foreground">{PROVENANCE_LABEL[e.provenance]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-lg border bg-card p-4" data-testid="diagnosis-confidence">
        <h3 className="font-semibold">How sure OpsIQ is</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant={CERTAINTY_VARIANT[confidence.certainty.level]}>{confidence.certainty.label}</Badge>
          <span className="text-sm">{confidence.certainty.explanation}</span>
        </div>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Data entered</dt>
            <dd data-testid="diagnosis-data-completeness">{confidence.dataCompleteness.label}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Kind of evidence</dt>
            <dd data-testid="diagnosis-evidence-strength">{confidence.evidenceStrength.label}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border bg-card p-4" data-testid="diagnosis-meaning">
        <h3 className="font-semibold">What this means</h3>
        <p className="mt-1 text-sm">{answer.whatThisMeans}</p>
      </section>

      <section className="rounded-lg border-2 border-primary bg-card p-4" data-testid="diagnosis-first-step">
        <h3 className="font-semibold">Do this first</h3>
        <div className="mt-1 text-lg font-semibold break-words">{answer.firstStep.title}</div>
        <p className="text-sm break-words">{answer.firstStep.why}</p>
      </section>

      {answer.thenSteps.length > 0 && (
        <section className="rounded-lg border bg-card p-4" data-testid="diagnosis-then">
          <h3 className="font-semibold">Then</h3>
          <ol className="mt-1 list-decimal pl-5 text-sm space-y-1">
            {answer.thenSteps.map((s) => (
              <li key={s.title} className="break-words">
                <span className="font-medium">{s.title}</span> — {s.why}
              </li>
            ))}
          </ol>
        </section>
      )}

      {answer.doNotDoYet.length > 0 && (
        <section className="rounded-lg border bg-card p-4" data-testid="diagnosis-do-not-do-yet">
          <h3 className="font-semibold">Don&apos;t do yet</h3>
          <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
            {answer.doNotDoYet.map((s) => (
              <li key={s.title} className="break-words">
                <span className="font-medium">{s.title}</span> — {s.why}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-lg border bg-card p-4" data-testid="diagnosis-missing">
        <h3 className="font-semibold">What OpsIQ still needs</h3>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          {answer.missingInformation.map((m) => (
            <li key={m.field} className="break-words">
              <span className="font-medium">{m.field}</span> — {m.why}
            </li>
          ))}
        </ul>
      </section>

      <Disclosure summary="Details">
        <div className="space-y-2 text-sm" data-testid="diagnosis-details">
          <div>
            <div className="font-medium">What can be concluded</div>
            <ul className="list-disc pl-5">{answer.canConclude.map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
          <div>
            <div className="font-medium">What can&apos;t be concluded yet</div>
            <ul className="list-disc pl-5">{answer.cannotConclude.map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
          <p>
            {answer.statedConcern.mainIssue === "unclear"
              ? "No specific concern was chosen."
              : `Stated concern: ${answer.statedConcern.label} — not yet tested; see what OpsIQ still needs.`}
          </p>
          <p className="text-muted-foreground">
            Saved as draft engagement {engagementCode} · starting approach: {INTERVENTION_MODE_TEXT[interventionMode] ?? interventionMode}
          </p>
        </div>
      </Disclosure>
    </div>
  );
}
