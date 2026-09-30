"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Select, Disclosure, CardDashboardSkeleton, PageHeader, PageContainer } from "@/ui/primitives";
import { BusinessContextSelector } from "@/components/owner/BusinessContextSelector";
import { useActiveBusiness } from "@/context/active-business-context";
import { humanizeMetricKey } from "@/lib/metric-label";
import { cycleDataGapUnion, findingGapStatement } from "@/domain/owner-trust/explainability";
import { findingTypeLabel, eventNameLabel, entityTypeLabel } from "@/lib/audit-label";
import { classifyOperatorError } from "@/lib/operator-error-governance";

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect -- dynamic trust payloads are untyped; load() fetch-on-mount is intentional */

// Presentation-only: "-accessible" variants keep the exact same
// severity/confidence -> color mapping as before (which state gets which
// semantic color is unchanged), only the badge text color changes to the
// AA-contrast-checked token for that same tinted fill (see badge.tsx's own
// comment on the PR #385 readable-text fix this repo already ships).
const LABEL_VARIANT: Record<string, "success-accessible" | "warning-accessible" | "destructive-accessible"> = {
  high: "success-accessible",
  moderate: "warning-accessible",
  low: "destructive-accessible",
};
const SEVERITY_VARIANT: Record<
  string,
  "success-accessible" | "default-accessible" | "warning-accessible" | "destructive-accessible"
> = {
  critical: "destructive-accessible",
  high: "destructive-accessible",
  medium: "warning-accessible",
  low: "default-accessible",
};
// Verified against TrustLabel in src/domain/owner-trust/types.ts (confidence.label / expectedImpact.label).
const TRUST_LABEL: Record<string, string> = {
  high: "High",
  moderate: "Moderate",
  low: "Low",
};
// Verified against OwnerSeverity in src/domain/owner-spine/contracts.ts.
const SEVERITY_LABEL: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};
// Verified against OWNER_DOMAINS in src/domain/owner-spine/contracts.ts / owner/page.tsx's nav array.
const DOMAIN_LABEL: Record<string, string> = {
  recovery: "Recovery",
  finance: "Finance",
  cashflow: "Cashflow",
  sales: "Sales",
  operations: "Operations",
  customer: "Customer",
  marketing: "Marketing",
  sop: "Execution",
  strategy: "Strategy",
  portfolio: "Portfolio",
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
  const { activeBusinessId, needsBusinessRecovery, setActiveBusinessId, loading: contextLoading } = useActiveBusiness();
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
      // Keep the shared active-business context in sync — see finance/page.tsx and
      // operations/page.tsx for the root cause this closes (each owner page independently
      // defaulting to a different business, e.g. the first row returned by the server, instead
      // of the business selected elsewhere in the app).
      if (data.selectedBusinessId) setActiveBusinessId(data.selectedBusinessId);
    } catch (e) {
      // UX-06 Wave B (Section U): route through the same governed classifier every other
      // audited owner page already uses, instead of showing e.message (a raw exception) verbatim.
      setError(classifyOperatorError(e instanceof Error ? e : new Error("Failed to load"), { context: "load" }).operatorMessage);
    } finally {
      setLoading(false);
    }
  }, [setActiveBusinessId]);

  useEffect(() => {
    if (contextLoading) return;
    // A pending business-recovery choice must never be silently resolved by letting the server
    // pick its own default businessId — see ActiveBusinessContext.needsBusinessRecovery.
    if (needsBusinessRecovery) return;
    void loadOverview(activeBusinessId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the shared context resolves or the owner explicitly switches business
  }, [contextLoading, activeBusinessId, needsBusinessRecovery]);

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
      setError(classifyOperatorError(e instanceof Error ? e : new Error("Failed to load explanations"), { context: "load" }).operatorMessage);
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
      setError(classifyOperatorError(e instanceof Error ? e : new Error("Failed to load audit trail"), { context: "load" }).operatorMessage);
    }
  }, []);

  if (loading) return <CardDashboardSkeleton label="Loading evidence and trust" />;

  const businesses: any[] = overview?.businesses ?? [];
  const cycles: any[] = overview?.cycles ?? [];
  const activeCycle = cycleFor(selectedDomain);

  return (
    <PageContainer>
      <div className="mb-6">
        <PageHeader
          title="Evidence & Trust"
          description="For every recommendation: what was detected, why it matters, the data and calculation used, confidence, risk if ignored, expected impact, and how to verify it — with a full audit trail. Nothing is invented."
          actions={<Link href="/owner/cockpit"><Button>Home</Button></Link>}
        />
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
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
              onChange={(businessId) => setActiveBusinessId(businessId)}
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
                    label: `${DOMAIN_LABEL[c.domain] ?? c.domain} — cycle #${c.sequenceNumber}`,
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  {cards?.length ?? 0} explanation(s) ·{" "}
                  {activeCycle ? `generated ${new Date(activeCycle.generatedAt).toLocaleString()}` : ""}
                </div>
                {activeCycle && (
                  <Button onClick={() => loadAudit(activeCycle.cycleId)}>View audit trail</Button>
                )}
              </div>

              {cycleDataGapUnion(cards ?? []).length > 0 && (
                <p className="text-sm text-foreground border-l-2 pl-3" style={{ borderColor: "var(--warning-text)" }} data-testid="trust-cycle-data-gaps">
                  This diagnosis is still missing some inputs: {cycleDataGapUnion(cards ?? []).map(humanizeMetricKey).join(", ")}.
                </p>
              )}

              {(cards ?? []).length === 0 ? (
                <div className="border rounded-lg p-8 text-center text-muted-foreground">
                  This diagnosis cycle produced no findings to explain.
                </div>
              ) : (
                (cards ?? []).map((c: any) => (
                  <section key={c.findingCode} className="border rounded-lg p-4 bg-card space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold">{c.whatWasDetected}</div>
                        <div className="text-xs text-muted-foreground">
                          {DOMAIN_LABEL[c.domain] ?? c.domain} · {findingTypeLabel(c.findingType)}
                        </div>
                        {/* UX-06 Wave B (Section G.1): findingType/findingCode used to render raw
                            in the line above. The plain-language label now covers the primary
                            read; the original technical values stay reachable (never removed,
                            only relocated) via this keyboard-accessible disclosure. */}
                        <Disclosure summary="Technical reference" className="mt-1 max-w-xs text-xs">
                          <p>
                            <span className="font-medium text-foreground">Finding type: </span>
                            <code className="select-all">{typeof c.findingType === "string" && c.findingType ? c.findingType : "—"}</code>
                          </p>
                          <p>
                            <span className="font-medium text-foreground">Finding code: </span>
                            <code className="select-all">{typeof c.findingCode === "string" && c.findingCode ? c.findingCode : "—"}</code>
                          </p>
                        </Disclosure>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={SEVERITY_VARIANT[c.severity] || "default-accessible"}>{SEVERITY_LABEL[c.severity] ?? c.severity}</Badge>
                        <Badge variant={LABEL_VARIANT[c.confidence?.label] || "default-accessible"}>
                          confidence {TRUST_LABEL[c.confidence?.label] ?? c.confidence?.label} ({fmt(c.confidence?.score)})
                        </Badge>
                        <Badge variant={LABEL_VARIANT[c.expectedImpact?.label] || "default-accessible"}>
                          impact {TRUST_LABEL[c.expectedImpact?.label] ?? c.expectedImpact?.label} ({Math.round(c.expectedImpact?.score ?? 0)})
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
                          <strong>{c.sourceDataUsed?.metric ? humanizeMetricKey(c.sourceDataUsed.metric) : c.sourceDataUsed?.metric}</strong>: {c.sourceDataUsed?.valueLabel}
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
                          {c.verification?.metric ? ` (metric: ${humanizeMetricKey(c.verification.metric)})` : ""}
                        </p>
                      </div>
                      <div>
                        <div className="text-xs uppercase text-muted-foreground">Data integrity</div>
                        <p className="text-xs">
                          {c.hasInventedValues === false ? "No values invented." : ""}
                          {" "}{findingGapStatement(c.dataGaps, humanizeMetricKey)}
                        </p>
                      </div>
                    </div>
                  </section>
                ))
              )}

              {audit && (
                <section className="border-2 border-foreground/10 rounded-lg p-4 bg-card">
                  {/* UX-06 Wave B (Section G.2): the heading previously interpolated the raw
                      entityId as its own primary text. The id is still fully available -- moved
                      into the disclosure below, never dropped. */}
                  <h2 className="font-bold mb-2">Audit trail</h2>
                  <Disclosure summary="Technical reference" className="mb-3 max-w-sm text-xs">
                    <p>
                      <span className="font-medium text-foreground">Entity ID: </span>
                      <code className="select-all">{audit.entityId || "—"}</code>
                    </p>
                  </Disclosure>
                  {audit.events.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No audit events for this entity.</p>
                  ) : (
                    <div className="space-y-1">
                      {audit.events.map((e: any) => (
                        <div key={e.id} className="border-b py-1 text-sm">
                          <div className="flex justify-between items-center">
                            <span>
                              {/* UX-06 Wave B (Section G.3): eventName/entityType used to render raw.
                                  eventNameLabel/entityTypeLabel (src/lib/audit-label.ts) label only the
                                  curated, repository-confirmed values this audit trail can actually show
                                  (every AUDIT_EVENTS emission tied to a diagnosis cycle's own id, across
                                  all 7 owner domains) -- anything else present is an honest "Other
                                  event"/"Other entity type", never a guessed reformat of an unverified
                                  value. */}
                              <strong>{eventNameLabel(e.eventName)}</strong>
                              <span className="text-muted-foreground"> · {entityTypeLabel(e.entityType)}</span>
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(e.occurredAt).toLocaleString()}
                            </span>
                          </div>
                          <Disclosure summary="Technical reference" className="mt-1 max-w-sm text-xs">
                            <p>
                              <span className="font-medium text-foreground">Event: </span>
                              <code className="select-all">{typeof e.eventName === "string" && e.eventName ? e.eventName : "—"}</code>
                              {"; "}
                              <span className="font-medium text-foreground">Entity type: </span>
                              <code className="select-all">{typeof e.entityType === "string" && e.entityType ? e.entityType : "—"}</code>
                            </p>
                          </Disclosure>
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
    </PageContainer>
  );
}
