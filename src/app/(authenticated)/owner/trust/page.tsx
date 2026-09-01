"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Select, CardDashboardSkeleton } from "@/ui/primitives";
import { BusinessContextSelector } from "@/components/owner/BusinessContextSelector";

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect -- dynamic trust payloads are untyped; load() fetch-on-mount is intentional */

const LABEL_VARIANT: Record<string, "success" | "warning" | "destructive"> = {
  high: "success",
  moderate: "warning",
  low: "destructive",
};
const SEVERITY_VARIANT: Record<string, "success" | "default" | "warning" | "destructive"> = {
  critical: "destructive",
  high: "destructive",
  medium: "warning",
  low: "default",
};

async function api(path: string) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || data?.error || `Request failed (${res.status})`);
  return data;
}

function fmt(n: number | null): string {
  return n === null || n === undefined ? "—" : String(Math.round(n * 100) / 100);
}

export default function OwnerTrustPage() {
  const [overview, setOverview] = useState<any | null>(null);
  const [selectedBusiness, setSelectedBusiness] = useState<string | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [cards, setCards] = useState<any[] | null>(null);
  const [audit, setAudit] = useState<{ entityId: string; events: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async (businessId?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const qs = businessId ? `?businessId=${businessId}` : "";
      const data = await api(`/api/owner/trust/cycles${qs}`);
      setOverview(data);
      setSelectedBusiness(data.selectedBusinessId);
      setSelectedDomain(data.cycles?.[0]?.domain ?? null);
      setCards(null);
      setAudit(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const cycleFor = (domain: string | null): any =>
    (overview?.cycles ?? []).find((c: any) => c.domain === domain) ?? null;

  const loadExplanations = useCallback(async (domain: string, cycleId: string) => {
    setCardsLoading(true);
    setError(null);
    setAudit(null);
    try {
      const data = await api(`/api/owner/trust/explanations?domain=${domain}&cycleId=${cycleId}`);
      setCards(data.explanations ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load explanations");
    } finally {
      setCardsLoading(false);
    }
  }, []);

  useEffect(() => {
    const cycle = cycleFor(selectedDomain);
    if (selectedDomain && cycle) loadExplanations(selectedDomain, cycle.cycleId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDomain, overview]);

  const loadAudit = useCallback(async (entityId: string) => {
    setError(null);
    try {
      const data = await api(`/api/owner/trust/audit-trail?entityId=${entityId}`);
      setAudit(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load audit trail");
    }
  }, []);

  if (loading) return <CardDashboardSkeleton label="Loading trust & explainability" />;

  const businesses: any[] = overview?.businesses ?? [];
  const cycles: any[] = overview?.cycles ?? [];
  const activeCycle = cycleFor(selectedDomain);

  return (
    <div className="mx-auto max-w-5xl py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Trust &amp; Explainability</h1>
          <p className="text-muted-foreground text-sm">
            For every recommendation: what was detected, why it matters, the data and
            calculation used, confidence, risk if ignored, expected impact, and how to
            verify it — with a full audit trail. Nothing is invented.
          </p>
        </div>
        <Link href="/owner"><Button>Command Center</Button></Link>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {businesses.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          No businesses yet. Create one and run a diagnosis to see explanations.
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-4 items-end">
            <BusinessContextSelector
              businesses={businesses}
              selectedId={selectedBusiness}
              onChange={(businessId) => loadOverview(businessId)}
            />
            {cycles.length > 0 && (
              <div className="w-72">
                <Select
                  name="domainSelector"
                  label="Diagnosis domain"
                  value={selectedDomain ?? undefined}
                  onChange={(e: any) => setSelectedDomain(e.target.value)}
                  options={cycles.map((c) => ({
                    value: c.domain,
                    label: `${c.domain} — cycle #${c.sequenceNumber}`,
                  }))}
                />
              </div>
            )}
          </div>

          {cycles.length === 0 ? (
            <div className="border rounded-lg p-8 text-center text-muted-foreground">
              No diagnosis cycles yet for this business. Run a diagnosis in any domain to
              generate explainable recommendations.
            </div>
          ) : cardsLoading ? (
            <div className="p-8 text-muted-foreground">Loading explanations…</div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  {cards?.length ?? 0} explanation(s) ·{" "}
                  {activeCycle ? `generated ${new Date(activeCycle.generatedAt).toLocaleString()}` : ""}
                </div>
                {activeCycle && (
                  <Button onClick={() => loadAudit(activeCycle.cycleId)}>View audit trail</Button>
                )}
              </div>

              {(cards ?? []).length === 0 ? (
                <div className="border rounded-lg p-8 text-center text-muted-foreground">
                  This diagnosis cycle produced no findings to explain.
                </div>
              ) : (
                (cards ?? []).map((c: any) => (
                  <section key={c.findingCode} className="border rounded-lg p-4 bg-card space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold">{c.whatWasDetected}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.domain} · {c.findingType} · {c.findingCode}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 shrink-0">
                        <Badge variant={SEVERITY_VARIANT[c.severity] || "default"}>{c.severity}</Badge>
                        <Badge variant={LABEL_VARIANT[c.confidence?.label] || "default"}>
                          confidence {c.confidence?.label} ({fmt(c.confidence?.score)})
                        </Badge>
                        <Badge variant={LABEL_VARIANT[c.expectedImpact?.label] || "default"}>
                          impact {c.expectedImpact?.label} ({Math.round(c.expectedImpact?.score ?? 0)})
                        </Badge>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-xs uppercase text-muted-foreground">Why it matters</div>
                        <p>{c.whyItMatters}</p>
                      </div>
                      <div>
                        <div className="text-xs uppercase text-muted-foreground">Risk if ignored</div>
                        <p>{c.riskIfIgnored}</p>
                      </div>
                      <div>
                        <div className="text-xs uppercase text-muted-foreground">Source data used</div>
                        <p>
                          <strong>{c.sourceDataUsed?.metric}</strong>: {c.sourceDataUsed?.valueLabel}
                          {c.sourceDataUsed?.thresholdLabel ? ` (threshold ${c.sourceDataUsed.thresholdLabel})` : ""}
                        </p>
                        {Array.isArray(c.sourceDataUsed?.evidence) && c.sourceDataUsed.evidence.length > 0 && (
                          <ul className="list-disc list-inside text-xs text-muted-foreground mt-1">
                            {c.sourceDataUsed.evidence.map((ev: string, i: number) => <li key={i}>{ev}</li>)}
                          </ul>
                        )}
                      </div>
                      <div>
                        <div className="text-xs uppercase text-muted-foreground">Calculation used</div>
                        <p>{c.calculationUsed}</p>
                      </div>
                      <div>
                        <div className="text-xs uppercase text-muted-foreground">Verification method</div>
                        <p>
                          {c.verification?.method || "—"}
                          {c.verification?.metric ? ` (metric: ${c.verification.metric})` : ""}
                        </p>
                      </div>
                      <div>
                        <div className="text-xs uppercase text-muted-foreground">Data integrity</div>
                        <p className="text-xs">
                          {c.hasInventedValues === false ? "No values invented." : ""}
                          {Array.isArray(c.dataGaps) && c.dataGaps.length > 0
                            ? ` Missing data: ${c.dataGaps.join(", ")}.`
                            : " No data gaps."}
                        </p>
                      </div>
                    </div>
                  </section>
                ))
              )}

              {audit && (
                <section className="border-2 border-foreground/10 rounded-lg p-4 bg-card">
                  <h2 className="font-bold mb-3">Audit trail — {audit.entityId}</h2>
                  {audit.events.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No audit events for this entity.</p>
                  ) : (
                    <div className="space-y-1">
                      {audit.events.map((e: any) => (
                        <div key={e.id} className="flex justify-between items-center border-b py-1 text-sm">
                          <span>
                            <strong>{e.eventName}</strong>
                            <span className="text-muted-foreground"> · {e.entityType}</span>
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(e.occurredAt).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
