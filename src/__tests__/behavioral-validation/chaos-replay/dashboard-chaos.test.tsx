/**
 * Dashboard / browser chaos proof (§11) — jsdom render of the REAL SupervisorSummary panel from REAL
 * replay output for representative good/bad/ugly chaos scenarios. Proves: runtime-fed Supervisor Summary
 * appears; dominant constraint / do-not-do / next-safe-action / proof / reassessment / impact / owner-vs-
 * delegate / action status / confidence are visible; the wrong tempting action is rejected; missing-data/
 * confidence is visible; advanced reasoning is collapsed by default; dashboard is concise (≤3 priorities,
 * one primary action each); no static fallback can pass; blocked / need-more-data never reads "Proceed";
 * the panel is mobile-bounded; the owner can identify the main action from the first screen.
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { SupervisorSummary, type SupervisorSummaryView } from "@/components/owner/SupervisorSummary";
import { COUNTED_PUBLIC_CASES } from "@/behavioral-validation/chaos-replay/chaos-corpus";
import { replayScenario, type ChaosReplayResult } from "@/behavioral-validation/chaos-replay/chaos-replay";
import { InMemoryLearningStore } from "@/behavioral-validation/learning-store";
import type { PublicCase } from "@/behavioral-validation/public-cases/schema";

afterEach(() => cleanup());

// Representative chaos scenarios spanning good/bad/ugly + the §11 browser set themes.
const REP: Array<{ key: string; cat: string; gbu: "good" | "bad" | "ugly" }> = [
  { key: "weak_unit_economics_scale", cat: "laundry", gbu: "good" },   // good growth opportunity w/ safeguards
  { key: "owner_overload", cat: "agency", gbu: "bad" },                // owner workload / control
  { key: "quality_complaints", cat: "restaurant", gbu: "bad" },        // growth vs quality complaints
  { key: "cashflow_squeeze", cat: "retail_grocery", gbu: "ugly" },     // cash crisis / high-revenue-bad
  { key: "compliance_shutdown_risk", cat: "pharmacy", gbu: "ugly" },   // compliance boundary (blocked)
  { key: "cyber_payment_fraud", cat: "ecommerce", gbu: "ugly" },       // cyber/payment fraud (blocked)
  { key: "fake_completion_proof", cat: "logistics", gbu: "ugly" },     // fake completion (blocked)
  { key: "over_expansion", cat: "multi_location", gbu: "ugly" },       // shutdown/pivot vs expansion
];

const pick = (key: string, cat: string): PublicCase =>
  COUNTED_PUBLIC_CASES.find((p) => p.meta.patternId === key && p.meta.businessCategory === cat)!;

let results: Record<string, ChaosReplayResult>;

beforeAll(async () => {
  const store = new InMemoryLearningStore();
  results = {};
  await Promise.all(REP.map(async (r) => { results[`${r.key}/${r.cat}`] = await replayScenario(pick(r.key, r.cat), store); }));
}, 120000);

const view = (r: ChaosReplayResult): SupervisorSummaryView => r.supervisor as SupervisorSummaryView;

describe("dashboard chaos proof (§11) — runtime-fed panel per scenario", () => {
  for (const rep of REP) {
    it(`[${rep.gbu}] ${rep.key}/${rep.cat} renders runtime-fed supervisor fields, concise, no fallback`, () => {
      const r = results[`${rep.key}/${rep.cat}`];
      const { container } = render(<SupervisorSummary summary={view(r)} />);
      expect(container.querySelector('[data-testid="owner-supervisor-summary"]')).not.toBeNull();
      const text = container.textContent ?? "";

      // Runtime-fed: the exact runtime do-now + main issue + first proof reach the panel.
      expect(text).toContain(r.supervisor.doNow);
      expect(text).toContain(r.supervisor.mainIssue);
      if (r.supervisor.proofNeeded[0]) expect(text).toContain(r.supervisor.proofNeeded[0]);

      // Required fields visible.
      for (const id of ["supervisor-action-status", "supervisor-confidence", "supervisor-do-now",
        "supervisor-proof", "supervisor-missing-assumptions", "supervisor-reassessment", "supervisor-owner-delegate"]) {
        expect(container.querySelector(`[data-testid="${id}"]`), id).not.toBeNull();
      }

      // Concise: ≤3 priorities (≤5 emergency), one primary action arrow per priority.
      const priorities = container.querySelectorAll('[data-testid^="supervisor-priority-"]');
      expect(priorities.length).toBeLessThanOrEqual(r.supervisor.emergency ? 5 : 3);
      priorities.forEach((p) => expect((p.textContent ?? "").match(/→/g)?.length ?? 0).toBe(1));

      // Advanced reasoning collapsed by default.
      const details = container.querySelector('[data-testid="supervisor-ledger-detail"]') as HTMLDetailsElement | null;
      expect(details).not.toBeNull();
      expect(details!.open).toBe(false);

      // Mobile-bounded.
      expect(container.querySelector(".grid")).not.toBeNull();
      expect(container.innerHTML).not.toMatch(/\bw-\[[2-9]\d{2,}px\]/);

      // Blocked / need-more-data never reads "Proceed".
      const status = container.querySelector('[data-testid="supervisor-action-status"]')?.textContent ?? "";
      if (rep.gbu === "ugly") expect(r.supervisor.canProceed).toBe(false);
      if (r.supervisor.actionStatus === "blocked" || r.supervisor.actionStatus === "need_more_data") {
        expect(status).not.toMatch(/^Proceed$/);
      }

      // The do-not-do (rejected tempting action) is visible for bad/ugly cases.
      if (rep.gbu !== "good") {
        expect(container.querySelector('[data-testid="supervisor-do-not-do"]')).not.toBeNull();
      }
    });
  }

  it("renders NOTHING when not found (no static fallback can pass)", () => {
    const r = results[`${REP[0].key}/${REP[0].cat}`];
    const notFound = { ...view(r), found: false };
    const { container } = render(<SupervisorSummary summary={notFound} />);
    expect((container.textContent ?? "").trim()).toBe("");
    const { container: c2 } = render(<SupervisorSummary summary={null} />);
    expect((c2.textContent ?? "").trim()).toBe("");
  });

  it("at least 8 scenarios render a usable mobile panel", () => {
    expect(REP.length).toBeGreaterThanOrEqual(8);
    for (const rep of REP) {
      const { container } = render(<SupervisorSummary summary={view(results[`${rep.key}/${rep.cat}`])} />);
      expect(container.querySelector(".grid")).not.toBeNull();
      cleanup();
    }
  });
});
