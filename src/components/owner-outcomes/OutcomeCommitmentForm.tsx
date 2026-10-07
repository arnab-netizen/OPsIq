"use client";

/**
 * Records an owner decision on a trackable candidate ("decide"), or amends the outcome contract of the current
 * ACCEPTED / MODIFIED decision ("amend"), through the EXISTING decisions / outcome-contracts routes.
 *
 * This component only collects text and sends it. Every rule (states, contract shape, baseline provenance, candidate
 * resolution inside the workspace + business) is enforced by the server; field errors it returns are shown on the field.
 * Blank means unknown (null), a typed 0 is a known zero, and direction is sent exactly as chosen — never inferred.
 */
import { useRef, useState, type FormEvent } from "react";
import { Button, Input, Select, Textarea } from "@/ui/primitives";
import { fieldErrorMap, toOperatorSafeError } from "@/lib/operator-safe-errors";
import {
  DECISION_CHOICE_ORDER, DECISION_LABELS, EMPTY_CONTRACT_FORM, attemptFor, contractFormToRequest, decisionCommits,
  type ContractFormValues, type SubmitAttempt,
} from "@/domain/owner-spine/owner-outcome-presentation";
import type { OwnerDecisionState } from "@/domain/owner-spine/owner-decision-record";
import { postOutcomeContract, postOwnerDecision } from "./outcome-api";

const newKey = (): string => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);

const BASELINE_OPTIONS = [
  { value: "", label: "Not specified" }, { value: "MEASURED", label: "Measured by OpsIQ" }, { value: "OWNER_REPORTED", label: "Reported by me" },
  { value: "EXTERNAL_SOURCE", label: "From an outside source" }, { value: "UNKNOWN", label: "Source unknown" },
];
const DIRECTION_OPTIONS = [
  { value: "", label: "Not specified" }, { value: "up", label: "Higher is better" }, { value: "down", label: "Lower is better" }, { value: "unknown", label: "Don't know" },
];
const SOURCE_OPTIONS = [
  { value: "", label: "Not specified" }, { value: "AUTHORITATIVE_SNAPSHOT", label: "An authoritative snapshot" }, { value: "SYSTEM_MEASUREMENT", label: "OpsIQ's own measurement" },
  { value: "EXTERNAL_RECORD", label: "An outside record" }, { value: "OWNER_ENTERED", label: "Figures I enter" },
];

type Mode = { kind: "decide" } | { kind: "amend"; state: OwnerDecisionState };

export function OutcomeCommitmentForm({
  businessId, candidateId, mode, initialContract = EMPTY_CONTRACT_FORM, onRecorded, idPrefix,
}: {
  businessId: string;
  candidateId: string;
  mode: Mode;
  initialContract?: ContractFormValues;
  onRecorded: () => void | Promise<void>;
  /** Unique per rendered form so labels/ids never collide when several forms are on one page. */
  idPrefix: string;
}) {
  const [choice, setChoice] = useState<OwnerDecisionState | null>(mode.kind === "amend" ? mode.state : null);
  const [reason, setReason] = useState("");
  const [revisit, setRevisit] = useState("");
  const [contract, setContract] = useState<ContractFormValues>(initialContract);
  const [submitting, setSubmitting] = useState(false);
  const [safeMessage, setSafeMessage] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);
  const inFlight = useRef(false);
  const attempt = useRef<SubmitAttempt | null>(null);

  const state = choice;
  const commits = decisionCommits(state);
  const set = (k: keyof ContractFormValues) => (v: string) => setContract((c) => ({ ...c, [k]: v }));
  const fe = (k: string): string | undefined => fields[`contract.${k}`];

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current || !state) return; // double-click / double-tap: the in-flight request already covers it
    inFlight.current = true;
    setSubmitting(true); setSafeMessage(null); setFields({}); setDone(null);
    const contractBody = contractFormToRequest(contract);
    const hasContract = Object.values(contractBody).some((v) => v !== null);
    const ownerReason = reason.trim() === "" ? null : reason.trim();
    try {
      if (mode.kind === "amend") {
        const payload = { candidateId, ownerReason, contract: contractBody };
        attempt.current = attemptFor(attempt.current, payload, newKey);
        await postOutcomeContract(businessId, { ...payload, idempotencyKey: attempt.current.key });
      } else {
        const payload = {
          candidateId, state, ownerReason, revisitAt: state === "DEFERRED" && revisit ? `${revisit}T00:00:00.000Z` : null,
          ...(commits && hasContract ? { contract: contractBody } : {}),
        };
        attempt.current = attemptFor(attempt.current, payload, newKey);
        await postOwnerDecision(businessId, { ...payload, idempotencyKey: attempt.current.key });
      }
      attempt.current = null;
      setDone(mode.kind === "amend" ? "Saved. Your earlier commitment stays in the history." : "Saved.");
      await onRecorded();
    } catch (err) {
      setFields(fieldErrorMap(err));
      setSafeMessage(toOperatorSafeError(err, "save").error);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  const errId = `${idPrefix}-error`;
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-describedby={safeMessage ? errId : undefined} data-testid="outcome-commitment-form">
      {mode.kind === "decide" && (
        <fieldset className="flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1 text-sm font-medium text-foreground">What do you want to do about this?</legend>
          {DECISION_CHOICE_ORDER.map((s) => (
            <label key={s} className="flex min-h-[44px] cursor-pointer items-start gap-2 rounded-md border border-border p-2 text-sm has-[:checked]:border-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
              <input type="radio" name={`${idPrefix}-choice`} value={s} checked={choice === s} onChange={() => setChoice(s)} className="mt-1" />
              <span><strong className="font-medium text-foreground">{DECISION_LABELS[s].choice}</strong><span className="block text-muted-foreground">{DECISION_LABELS[s].blurb}</span></span>
            </label>
          ))}
        </fieldset>
      )}

      {state === "DEFERRED" && (
        <Input id={`${idPrefix}-revisit`} type="date" label="Revisit on (optional)" value={revisit} onChange={(e) => setRevisit(e.target.value)} error={fields.revisitAt} />
      )}

      {commits && (
        <div className="flex flex-col gap-3" data-testid="outcome-contract-fields">
          <p className="m-0 text-sm text-muted-foreground">Everything below is optional unless marked. Leave a box empty if you don&apos;t know — empty means &ldquo;unknown&rdquo;, not zero.</p>
          <Textarea
            id={`${idPrefix}-commitment`} label={state === "MODIFIED" ? "What will you do instead?" : "What exactly will you do? (optional)"} required={state === "MODIFIED"}
            value={contract.commitmentDescription} onChange={(e) => set("commitmentDescription")(e.target.value)} error={fe("commitmentDescription")} rows={3}
          />
          <Input id={`${idPrefix}-metric`} label="What should be measured?" value={contract.verificationMetric} onChange={(e) => set("verificationMetric")(e.target.value)} error={fe("verificationMetric")} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input id={`${idPrefix}-baseline`} type="number" inputMode="decimal" step="any" label="Where it is today" value={contract.baselineValue} onChange={(e) => set("baselineValue")(e.target.value)} error={fe("baselineValue")} />
            <Select id={`${idPrefix}-baseline-src`} label="Where that number came from" options={BASELINE_OPTIONS} value={contract.baselineProvenance} onChange={(e) => set("baselineProvenance")(e.target.value)} error={fe("baselineProvenance")} hint="Needed when you enter a number." />
            <Select id={`${idPrefix}-direction`} label="Which way is better?" options={DIRECTION_OPTIONS} value={contract.targetDirection} onChange={(e) => set("targetDirection")(e.target.value)} error={fe("targetDirection")} />
            <Input id={`${idPrefix}-target`} type="number" inputMode="decimal" step="any" label="Target (optional)" value={contract.targetValue} onChange={(e) => set("targetValue")(e.target.value)} error={fe("targetValue")} />
            <Input id={`${idPrefix}-window`} type="number" inputMode="numeric" min={1} step={1} label="Measure after how many days?" value={contract.observationWindowDays} onChange={(e) => set("observationWindowDays")(e.target.value)} error={fe("observationWindowDays")} />
            <Input id={`${idPrefix}-finish`} type="date" label="Planned finish date" value={contract.intendedCompletionDate} onChange={(e) => set("intendedCompletionDate")(e.target.value)} error={fe("intendedCompletionAt")} />
          </div>
          <Select id={`${idPrefix}-source`} label="Where will the result be measured from?" options={SOURCE_OPTIONS} value={contract.expectedMeasurementSource} onChange={(e) => set("expectedMeasurementSource")(e.target.value)} error={fe("expectedMeasurementSource")} />
        </div>
      )}

      {state && (
        <Textarea id={`${idPrefix}-reason`} label="Why? (optional)" value={reason} onChange={(e) => setReason(e.target.value)} error={fields.ownerReason} rows={2} />
      )}

      {safeMessage && <p id={errId} role="alert" className="m-0 text-sm text-destructive">{safeMessage}</p>}
      {done && <p role="status" className="m-0 text-sm text-foreground">{done}</p>}

      <div>
        <Button type="submit" isLoading={submitting} disabled={submitting || !state} aria-busy={submitting}>
          {mode.kind === "amend" ? "Save what I'm tracking" : "Save my decision"}
        </Button>
      </div>
    </form>
  );
}
