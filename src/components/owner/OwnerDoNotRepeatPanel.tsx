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
import { classifyOperatorError } from "@/lib/operator-error-governance";
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

class RefusedError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

async function call(path: string, init?: RequestInit) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (typeof data?.code === "string" && REFUSAL_MESSAGES[data.code]) throw new RefusedError(data.code, REFUSAL_MESSAGES[data.code]);
    throw new Error(data?.error?.message || data?.error || `Request failed (${res.status})`);
  }
  return data;
}

export function OwnerDoNotRepeatPanel({ businessId, onChanged }: { businessId: string | null; onChanged: (businessId: string) => void }) {
  // The business currently shown (a save made for another business never reloads over it).
  const currentBusinessRef = useRef(businessId);
  useEffect(() => {
    currentBusinessRef.current = businessId;
  }, [businessId]);
  // Rules are held with the business they were loaded for: a business switch never shows the previous
  // business's rules (they are simply not this business's until its own load completes).
  const [loaded, setLoaded] = useState<{ businessId: string | null; rules: OwnerDoNotRepeatRuleRow[] } | null>(null);
  const rules = loaded && loaded.businessId === businessId ? loaded.rules : null;
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = useCallback(async (id: string | null, isCurrent: () => boolean) => {
    if (!id) return;
    try {
      const data = await call(`/api/owner/do-not-repeat/rules?businessId=${encodeURIComponent(id)}`);
      if (isCurrent()) setLoaded({ businessId: id, rules: Array.isArray(data.rules) ? data.rules : [] });
    } catch {
      if (isCurrent()) setLoaded({ businessId: id, rules: [] });
    }
  }, []);

  useEffect(() => {
    if (!businessId) return;
    let current = true;
    call(`/api/owner/do-not-repeat/rules?businessId=${encodeURIComponent(businessId)}`)
      .then((data) => { if (current) setLoaded({ businessId, rules: Array.isArray(data.rules) ? data.rules : [] }); })
      .catch(() => { if (current) setLoaded({ businessId, rules: [] }); });
    return () => { current = false; };
  }, [businessId]);

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
      const message = err instanceof RefusedError ? err.message : classifyOperatorError(err, { context: "save" }).operatorMessage;
      setErrors((e) => ({ ...e, [ruleId]: message }));
    } finally {
      setSavingId(null);
    }
  }

  if (!rules || rules.length === 0) return null;
  return (
    <section id="do-not-repeat-rules" data-testid="do-not-repeat-rules" className="rounded-lg border border-border p-5 scroll-mt-20">
      <h2 className="text-sm font-semibold mb-1">Do-not-repeat rules</h2>
      <p className="text-xs text-muted-foreground mb-4">
        Decisions marked not to be repeated after an earlier result. A rule holds that work back until you record what has changed.
      </p>
      <ul className="flex flex-col gap-4">
        {rules.map((r) => (
          <li key={r.id} className="flex flex-col gap-2">
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
