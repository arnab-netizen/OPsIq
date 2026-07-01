/**
 * GATE-PROTECTION (§4) — machine-checked guards that prevent silently weakening the exhaustive proof or
 * overclaiming readiness. Fails if: the exhaustive scenario count drops below 180; the FULL-mobile proof
 * count drops below 180 (for a full-mobile claim); any counted scenario lacks a proof-ledger entry; a
 * "skipped" layer is ever treated as a pass; or a claimed classification exceeds the available evidence.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { CHAOS_LEDGER, EXPECTED_LEDGER_COUNT, type LayerStatus } from "@/behavioral-validation/chaos-replay/chaos-ledger";
import { highestSupportedState, canClaimLiveOutcome, type ReadinessEvidence } from "@/domain/owner-mode/pilot-readiness-policy";

function readRun(name: string): { count: number; results: Record<string, Record<string, unknown>> } | null {
  const p = join(process.cwd(), name);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}

describe("gate-protection (§4)", () => {
  it("1. exhaustive counted scenario count never drops below 180", () => {
    expect(CHAOS_LEDGER.length).toBe(EXPECTED_LEDGER_COUNT);
    expect(EXPECTED_LEDGER_COUNT).toBeGreaterThanOrEqual(180);
  });

  it("2. the FULL-mobile proof covers 180/180 (required for any full-mobile classification)", () => {
    const mobile = readRun("OPSIQ_EXHAUSTIVE_CHAOS_REPLAY_MOBILE_FULL.run.json");
    expect(mobile, "full-mobile run artifact must exist").not.toBeNull();
    expect(mobile!.count).toBe(180);
    const pass = Object.values(mobile!.results).filter((r) => r.playwrightMobileStatus === "pass").length;
    expect(pass, "full mobile must be 180/180").toBe(180);
    // every mobile result id is a real ledger scenarioId (no untracked scenario counted).
    const ledgerIds = new Set(CHAOS_LEDGER.map((e) => e.scenarioId));
    for (const id of Object.keys(mobile!.results)) expect(ledgerIds.has(id), `untracked mobile id ${id}`).toBe(true);
  });

  it("3. every counted scenario has a proof-ledger entry across DB + desktop + mobile artifacts", () => {
    const ledgerIds = CHAOS_LEDGER.map((e) => e.scenarioId);
    for (const [file, key] of [
      ["OPSIQ_EXHAUSTIVE_CHAOS_REPLAY_LEDGER.run.json", "dbBackedStatus"],
      ["OPSIQ_EXHAUSTIVE_CHAOS_REPLAY_DESKTOP.run.json", "playwrightDesktopStatus"],
      ["OPSIQ_EXHAUSTIVE_CHAOS_REPLAY_MOBILE_FULL.run.json", "playwrightMobileStatus"],
    ] as const) {
      const run = readRun(file);
      expect(run, `${file} must exist`).not.toBeNull();
      for (const id of ledgerIds) {
        expect(run!.results[id], `${file} missing ${id}`).toBeTruthy();
        expect(run!.results[id][key], `${file} ${id} not pass`).toBe("pass");
      }
    }
  });

  it("4. a skipped layer is NEVER counted as a pass", () => {
    const passSet: LayerStatus[] = ["pass"];
    for (const bad of ["skipped", "fail", "not_run"] as LayerStatus[]) {
      expect(passSet.includes(bad)).toBe(false);
    }
    // no committed run artifact may mark a scenario "skipped" and have it count toward coverage.
    for (const file of ["OPSIQ_EXHAUSTIVE_CHAOS_REPLAY_LEDGER.run.json", "OPSIQ_EXHAUSTIVE_CHAOS_REPLAY_DESKTOP.run.json", "OPSIQ_EXHAUSTIVE_CHAOS_REPLAY_MOBILE_FULL.run.json"]) {
      const run = readRun(file);
      if (!run) continue;
      for (const r of Object.values(run.results)) {
        for (const v of Object.values(r)) expect(v).not.toBe("skipped");
      }
    }
  });

  it("5. a claimed classification never exceeds the evidence (no live/profit claim from proof-only evidence)", () => {
    // OpsIQ's actual evidence in this repo: simulation + DB/browser + full mobile, but NO live business data.
    const evidence: ReadinessEvidence = {
      hasSimulationProof: true, hasDbBrowserProof: true, hasFullMobileProof: true, hasShadowPilotIntake: false,
      hasLiveBusinessData: false, hasRealDates: false, hasBeforeAfterMetrics: false, ownerWaiver: false, publicSaasApproved: false,
    };
    expect(highestSupportedState(evidence)).toBe("FULL_MOBILE_PROVEN");
    expect(canClaimLiveOutcome(evidence)).toBe(false);
  });
});
