"use client";

/**
 * Cockpit → "Do-not-repeat rules": the do-not-repeat rules the owner can act on for the selected business,
 * and the one owner write on them — record what has changed since the rule was set, for Owner Mode of THIS
 * business only (the business-scoped Owner override the owner action gate honours). Presentation only:
 * which rules apply, validation and the override itself are decided server-side (do-not-repeat.service.ts).
 *
 * A save belongs to the business it was made for: it is sent with that business, and after it the caller
 * is told which business changed (`onChanged(businessId)`) — if the owner has since switched business,
 * neither this panel nor the caller reloads the previous business's view over the current one.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Textarea } from "@/ui/primitives";
import { httpResponseErrorFromBody, toOperatorSafeError } from "@/lib/operator-safe-errors";
import { MIN_CHANGED_CONTEXT_LENGTH } from "@/domain/owner-mode/decision-memory";

export interface OwnerDoNotRepeatRuleRow {
  id: string;
  summary: string;
  reason: string;
  changedContextExplanation: string | null;
  holds: string;
  createdAt: string;
}

/** The owner-facing text for each refusal code the server returns (actionable, never generic). */
const REFUSAL_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  REASON_TOO_SHORT: `Describe what has changed in at least ${MIN_CHANGED_CONTEXT_LENGTH} characters.`,
  RULE_INACTIVE: "This rule is no longer active, so it holds nothing back. Reload to see the current rules.",
  ALREADY_RECORDED: "What has changed was already recorded on this rule for this business. Reload to see it.",
});

/** A refusal the server named by a stable code: shown by its code's owner text, never by any server text. */
class RefusedError extends Error {
  constructor(readonly code: keyof typeof REFUSAL_MESSAGES & string) {
    super(code);
  }
}

/** The anchor id of one rule in the panel (the Cockpit's and Home's links land on the exact rule). */
export function ownerDnrRuleAnchor(ruleId: string): string {
  return `dnr-rule-${ruleId}`;
}

/** The rule a `#dnr-rule-<id>` location hash points at, or null. */
function hashFocusRuleId(): string | null {
  if (typeof window === "undefined") return null;
  const m = /^#dnr-rule-([0-9a-f-]{36})$/i.exec(window.location.hash);
  return m ? m[1] : null;
}

/** The error a failed response becomes: a named refusal by its code, else a status-classified HTTP error. */
export function ownerDnrErrorFromResponse(status: number, body: unknown): Error {
  const code = (body as { code?: unknown } | null)?.code;
  if (typeof code === "string" && REFUSAL_MESSAGES[code]) return new RefusedError(code);
  return httpResponseErrorFromBody(status, body);
}

async function call(path: string, init?: RequestInit) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw ownerDnrErrorFromResponse(res.status, data);
  return data;
}

/** Owner text for a failed save: a named refusal's own text, otherwise the operator-safe classification. */
export function ownerDnrSaveErrorText(err: unknown): string {
  return err instanceof RefusedError ? REFUSAL_MESSAGES[err.code] : toOperatorSafeError(err, "save").error;
}

type Loaded =
  | { businessId: string; status: "loaded"; rules: OwnerDoNotRepeatRuleRow[] }
  | { businessId: string; status: "failed"; message: string };

export function OwnerDoNotRepeatPanel({ businessId, onChanged, focusRuleId = null }: {
  businessId: string | null;
  onChanged: (businessId: string) => void;
  /** The rule a surface names as holding work (the gate's exact blocking rule): the panel shows and focuses it. */
  focusRuleId?: string | null;
}) {
  // The business currently shown (a save made for another business never reloads over it).
  const currentBusinessRef = useRef(businessId);
  useEffect(() => {
    currentBusinessRef.current = businessId;
  }, [businessId]);
  // Rules are held with the business they were loaded for: a business switch never shows the previous
  // business's rules (they are simply not this business's until its own load completes). A failed load is
  // a failure, never "no rules".
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const current = loaded && loaded.businessId === businessId ? loaded : null;
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hashRuleId, setHashRuleId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const focus = focusRuleId ?? hashRuleId;

  useEffect(() => {
    const read = () => setHashRuleId(hashFocusRuleId());
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const load = useCallback(async (id: string | null, isCurrent: () => boolean) => {
    if (!id) return;
    try {
      const data = await call(`/api/owner/do-not-repeat/rules?businessId=${encodeURIComponent(id)}`);
      if (isCurrent()) setLoaded({ businessId: id, status: "loaded", rules: Array.isArray(data.rules) ? data.rules : [] });
    } catch (err) {
      if (isCurrent()) setLoaded({ businessId: id, status: "failed", message: toOperatorSafeError(err, "load").error });
    }
  }, []);

  useEffect(() => {
    if (!businessId) return;
    let live = true;
    void load(businessId, () => live && currentBusinessRef.current === businessId);
    return () => { live = false; };
  }, [businessId, load, attempt]);

  // Land on the exact rule once it is listed (the link's target exists only after the load).
  const listedFocus = current?.status === "loaded" && focus !== null && current.rules.some((r) => r.id === focus) ? focus : null;
  useEffect(() => {
    if (!listedFocus) return;
    document.getElementById(ownerDnrRuleAnchor(listedFocus))?.scrollIntoView({ block: "center" });
  }, [listedFocus]);

  async function save(ruleId: string) {
    const forBusiness = businessId;
    if (!forBusiness) return;
    const text = (drafts[ruleId] ?? "").trim();
    if (text.length < MIN_CHANGED_CONTEXT_LENGTH) {
      setErrors((e) => ({ ...e, [ruleId]: REFUSAL_MESSAGES.REASON_TOO_SHORT }));
      return;
    }
    setSavingId(ruleId);
    setErrors((e) => ({ ...e, [ruleId]: "" }));
    const stillCurrent = () => currentBusinessRef.current === forBusiness;
    try {
      await call(`/api/owner/do-not-repeat/${ruleId}`, { method: "PATCH", body: JSON.stringify({ businessId: forBusiness, changedContextExplanation: text }) });
      if (!stillCurrent()) return;
      await load(forBusiness, stillCurrent);
      if (stillCurrent()) onChanged(forBusiness);
    } catch (err) {
      if (!stillCurrent()) return;
      const text = ownerDnrSaveErrorText(err);
      setErrors((e) => ({ ...e, [ruleId]: text }));
    } finally {
      setSavingId(null);
    }
  }

  if (!businessId) return null;
  // A surface that links here (a named blocking rule) always finds the panel: loading, failed or empty.
  const linked = focus !== null;
  if (current?.status === "failed") {
    return (
      <section id="do-not-repeat-rules" data-testid="do-not-repeat-rules" className="rounded-lg border border-border p-5 scroll-mt-20">
        <h2 className="text-sm font-semibold mb-1">Do-not-repeat rules</h2>
        <p role="alert" className="text-sm text-destructive mb-3">{current.message}</p>
        <Button size="sm" variant="outline" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
      </section>
    );
  }
  if (!current) {
    if (!linked) return null;
    return (
      <section id="do-not-repeat-rules" data-testid="do-not-repeat-rules" className="rounded-lg border border-border p-5 scroll-mt-20">
        <h2 className="text-sm font-semibold mb-1">Do-not-repeat rules</h2>
        <p className="text-xs text-muted-foreground">Loading the rules for this business…</p>
      </section>
    );
  }
  const rules = current.rules;
  if (rules.length === 0 && !linked) return null;
  return (
    <section id="do-not-repeat-rules" data-testid="do-not-repeat-rules" className="rounded-lg border border-border p-5 scroll-mt-20">
      <h2 className="text-sm font-semibold mb-1">Do-not-repeat rules</h2>
      <p className="text-xs text-muted-foreground mb-4">
        Decisions marked not to be repeated after an earlier result. While OpsIQ&apos;s safety checks are on for this business, a rule holds that work back until you record what has changed.
      </p>
      {rules.length === 0 && (
        <p className="text-sm">No do-not-repeat rule currently holds back work for this business. Reload the Cockpit to see its current main target.</p>
      )}
      {focus !== null && rules.length > 0 && !rules.some((r) => r.id === focus) && (
        <p className="text-sm mb-3">The rule that was named is no longer in force for this business (it was lifted or ended). Reload the Cockpit to see its current main target.</p>
      )}
      <ul className="flex flex-col gap-4">
        {rules.map((r) => (
          <li key={r.id} id={ownerDnrRuleAnchor(r.id)} data-focused={r.id === focus ? "true" : undefined} className={`flex flex-col gap-2 scroll-mt-20${r.id === focus ? " rounded-md border border-amber-400 p-3" : ""}`}>
            <p className="text-sm font-medium">{r.summary}</p>
            <p className="text-xs text-muted-foreground">Why: {r.reason}</p>
            <p className="text-xs text-muted-foreground">Holds back: {r.holds}</p>
            {r.changedContextExplanation ? (
              <p className="text-xs">What has changed (recorded): {r.changedContextExplanation}</p>
            ) : (
              <div className="flex flex-col gap-2">
                <label htmlFor={`dnr-changed-${r.id}`} className="text-xs font-medium">What has changed since this was decided?</label>
                <p className="text-xs text-muted-foreground">
                  At least {MIN_CHANGED_CONTEXT_LENGTH} characters. This lifts the rule for this business&apos;s owner steps only.
                </p>
                <Textarea
                  id={`dnr-changed-${r.id}`}
                  rows={2}
                  value={drafts[r.id] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                  placeholder="For example: new supplier terms cut the cost that made this fail."
                />
                {errors[r.id] && <p className="text-destructive text-xs">{errors[r.id]}</p>}
                <div>
                  <Button size="sm" onClick={() => void save(r.id)} disabled={savingId === r.id}>
                    {savingId === r.id ? "Saving…" : "Record what has changed"}
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
