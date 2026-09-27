"use client";

/**
 * Cockpit → "Do-not-repeat rules": the active do-not-repeat rules that apply to the selected business, and
 * the one owner write on them — record what has changed since the rule was set (the changed-context
 * override the owner action gate honours). Presentation only: which rules apply, validation and the
 * override itself are decided server-side (do-not-repeat.service.ts). After a save the caller reloads,
 * so the canonical owner decision reflects the lifted hold.
 */

import { useCallback, useEffect, useState } from "react";
import { Button, Textarea } from "@/ui/primitives";
import { classifyOperatorError } from "@/lib/operator-error-governance";

export interface OwnerDoNotRepeatRuleRow {
  id: string;
  summary: string;
  reason: string;
  changedContextExplanation: string | null;
  holds: string;
  createdAt: string;
}

async function call(path: string, init?: RequestInit) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || data?.error || `Request failed (${res.status})`);
  return data;
}

export function OwnerDoNotRepeatPanel({ businessId, onChanged }: { businessId: string | null; onChanged: () => void }) {
  const [rules, setRules] = useState<OwnerDoNotRepeatRuleRow[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = useCallback(async (id: string | null, isCurrent: () => boolean) => {
    if (!id) { setRules([]); return; }
    try {
      const data = await call(`/api/owner/do-not-repeat/rules?businessId=${encodeURIComponent(id)}`);
      if (isCurrent()) setRules(Array.isArray(data.rules) ? data.rules : []);
    } catch {
      if (isCurrent()) setRules([]);
    }
  }, []);

  useEffect(() => {
    let current = true;
    // A business switch never shows the previous business's rules.
    setRules(null);
    void load(businessId, () => current);
    return () => { current = false; };
  }, [businessId, load]);

  async function save(ruleId: string) {
    const text = (drafts[ruleId] ?? "").trim();
    setSavingId(ruleId);
    setErrors((e) => ({ ...e, [ruleId]: "" }));
    try {
      await call(`/api/owner/do-not-repeat/${ruleId}`, { method: "PATCH", body: JSON.stringify({ changedContextExplanation: text }) });
      await load(businessId, () => true);
      onChanged();
    } catch (err) {
      setErrors((e) => ({ ...e, [ruleId]: classifyOperatorError(err, { context: "save" }).operatorMessage }));
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
