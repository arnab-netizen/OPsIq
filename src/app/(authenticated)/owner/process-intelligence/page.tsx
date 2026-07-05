"use client";

/**
 * Owner Process Intelligence page — the minimal owner surface for the top process breakdown. It loads
 * the Owner Now View payload (`/api/owner/now-view`, which already carries the server-computed
 * `processIntelligence` block) and renders it via ProcessIntelligencePanel. No business logic here: the
 * finding is built server-side. Errors are shown safely; no raw internal error is exposed.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/ui/primitives";
import { ProcessIntelligencePanel, ProcessCorrectionsPanel, SopChecklistCorrectionsPanel, type ProcessIntelligenceView, type ProcessCorrectionsView, type SopChecklistCorrectionsView } from "@/components/owner/ProcessIntelligencePanel";

const FETCH_TIMEOUT_MS = 10_000;

async function api(path: string): Promise<{ res: Response; data: Record<string, unknown> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(path, { headers: { "Content-Type": "application/json" }, signal: controller.signal });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { res, data };
  } finally {
    clearTimeout(timer);
  }
}

function safeError(data: Record<string, unknown>, status: number): string {
  const body = data.error as string | { message?: unknown } | undefined;
  const serverText = typeof body === "string" ? body : body && typeof body === "object" && typeof body.message === "string" ? body.message : "";
  if (serverText) return serverText;
  if (status === 401 || status === 403) return "You are not authorized to view this workspace.";
  return `Could not load the process view (${status}).`;
}

export default function OwnerProcessIntelligencePage() {
  const [pi, setPi] = useState<ProcessIntelligenceView | null>(null);
  const [corrections, setCorrections] = useState<ProcessCorrectionsView | null>(null);
  const [sopCorrections, setSopCorrections] = useState<SopChecklistCorrectionsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { res, data } = await api("/api/owner/now-view");
      if (!res.ok) throw new Error(safeError(data, res.status));
      setPi((data.processIntelligence as ProcessIntelligenceView) ?? null);
      setCorrections((data.processCorrections as ProcessCorrectionsView) ?? null);
      setSopCorrections((data.sopChecklistCorrections as SopChecklistCorrectionsView) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the process view.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main style={{ padding: 24, maxWidth: 920, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ margin: 0 }}>Where your process is breaking</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/owner/now" data-testid="back-to-now">Owner Now View</Link>
          <Button onClick={() => void load()}>Refresh</Button>
        </div>
      </header>

      <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>
        OpsIQ points to the single stage most worth fixing today — with the evidence behind it and one
        recommended correction. It is a process signal, not an accusation.
      </p>

      {loading && <p>Loading the process view…</p>}
      {error && (
        <div>
          <p style={{ color: "#b91c1c" }} data-testid="pi-error">{error}</p>
          <Button onClick={() => void load()}>Retry</Button>
        </div>
      )}
      {!loading && !error && (
        <>
          <ProcessIntelligencePanel data={pi} />
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>What to do about it</h2>
            <ProcessCorrectionsPanel data={corrections} />
          </section>
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>SOP &amp; checklist changes</h2>
            <SopChecklistCorrectionsPanel data={sopCorrections} />
          </section>
        </>
      )}
    </main>
  );
}
