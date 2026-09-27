/**
 * Alerts and blocked decisions vs the canonical owner decision (owner-directed item 5).
 *
 * Proven provenance: every owner-visible CRITICAL alert is a notification about a canonical candidate
 * source — a critical BusinessRiskEntry (business-risk.service.ts) or a compliance breach
 * (compliance.service.ts). The only other critical producer, triggerExecutionFailureAlert, is reached
 * solely through consultant decision execution (DECISION_UPDATE / ENGAGEMENT_CREATE), which owners
 * never hold, and alerts are stored per acting user. So a critical alert is linked to its place in the
 * canonical order, never shown as a second priority. The consultant Decision Inbox is not fetched by
 * owner surfaces.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import OwnerPrioritiesPage from "@/app/(authenticated)/owner/priorities/page";
import { ActiveBusinessProvider } from "@/context/active-business-context";
import { getCapabilitiesForRole } from "@/policies/capability-check";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { ownerDecisionCandidateIdForEntity } from "@/domain/owner-spine/owner-decision";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (p.includes("__tests__")) return [];
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });
}

describe("critical alert provenance", () => {
  it("every direct critical createAlert names a risk or compliance entity (a canonical candidate source)", () => {
    const root = path.resolve(__dirname, "../../services");
    const offenders: string[] = [];
    for (const file of walk(root)) {
      if (file.endsWith(path.join("alerts", "alert-service.ts"))) continue; // its trigger helpers are checked below
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/createAlert\(\{([\s\S]*?)\}\)/g)) {
        const body = m[1];
        if (!/severity:\s*"critical"/.test(body)) continue;
        if (!/entityType:\s*"(BusinessRiskEntry|OwnerComplianceItem)"/.test(body)) offenders.push(path.relative(root, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("alert-service's entity-less critical helpers: execution failure is used only by consultant decision execution; the others are unused", () => {
    const root = path.resolve(__dirname, "../..");
    const callers = (fn: string) => walk(root).filter((f) => !f.endsWith("alert-service.ts") && new RegExp(`\\b${fn}\\(`).test(readFileSync(f, "utf8"))).map((f) => path.relative(root, f));
    expect(callers("triggerExecutionFailureAlert")).toEqual(["services/execution/execution-service.ts"]);
    expect(callers("triggerCriticalStateAlert")).toEqual([]);
    expect(callers("triggerComplianceDeadlineAlert")).toEqual([]);
  });

  it("the only other critical producer (execution failure) is consultant-only: owners hold neither capability that reaches it", () => {
    const caps = getCapabilitiesForRole("ADMIN_OR_PORTFOLIO_MANAGER" as never, "owner");
    expect(caps).not.toContain(CAPABILITIES.DECISION_UPDATE);
    expect(caps).not.toContain(CAPABILITIES.ENGAGEMENT_CREATE);
    expect(caps).not.toContain(CAPABILITIES.ENGAGEMENT_VIEW);
  });

  it("maps alert entities to candidate ids", () => {
    expect(ownerDecisionCandidateIdForEntity("BusinessRiskEntry", "r1")).toBe("business_risk:r1");
    expect(ownerDecisionCandidateIdForEntity("OwnerComplianceItem", "c1")).toBe("compliance_item:c1");
    expect(ownerDecisionCandidateIdForEntity("Decision", "d1")).toBeNull();
  });
});

describe("Priorities: no second priority system", () => {
  it("never fetches the consultant Decision Inbox, and does not repeat a notification about an item already ranked", async () => {
    const calls: string[] = [];
    const decision = {
      contractVersion: "owner-decision-v1", businessId: "biz-1", workspaceId: "ws-1", generatedAt: "2026-09-27T10:00:00.000Z", state: "TARGET",
      primaryTarget: { candidateId: "compliance_item:c1", source: "compliance_item", domain: "compliance", domainLabel: "Compliance", priorityClass: "SAFETY_COMPLIANCE", findingCode: "COMPLIANCE_BREACH", title: "Resolve the breach of \"Fire cert\"", explanation: "", severity: "critical", status: "breached", targetRoute: "/owner/compliance" },
      primaryCandidateId: "compliance_item:c1", primaryDomain: "compliance", whyThisWins: [], evidence: [],
      confidence: { level: "high", score: 100, capped: false, reasons: [] }, whatToDoFirst: "x", supportingSteps: [], whatCanWait: [], whatNotToDo: [],
      missingInformation: [], whatChanged: [], reassessmentTrigger: "", excluded: [],
      attention: [{ candidateId: "compliance_item:c1", source: "compliance_item", domain: "compliance", domainLabel: "Compliance", priorityClass: "SAFETY_COMPLIANCE", findingCode: "COMPLIANCE_BREACH", title: "Resolve the breach of \"Fire cert\"", explanation: "", severity: "critical", status: "breached", targetRoute: "/owner/compliance" }],
      memory: { generatedAt: "2026-09-27T10:00:00.000Z", primaryKey: null, primaryTitle: null, criticalKeys: [], confidenceScore: 100, confidenceLevel: "high", fundingGap: null },
    };
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body });
      if (url.includes("/api/owner/businesses")) return ok({ businesses: [{ id: "biz-1", name: "QA", isActive: true }] });
      if (url.includes("/api/owner/now-view")) return ok({ ownerDecision: decision, processExecution: null });
      if (url.includes("/api/owner/alerts")) return ok({ alerts: [
        { id: "a1", message: "Compliance breach recorded for item: Fire cert", severity: "critical", entityType: "OwnerComplianceItem", entityId: "c1" },
        { id: "a2", message: "Risk review overdue: supplier", severity: "high", entityType: "BusinessRiskEntry", entityId: "r9" },
      ] });
      return ok({ risks: [] });
    }));
    render(<ActiveBusinessProvider><OwnerPrioritiesPage /></ActiveBusinessProvider>);
    await waitFor(() => expect(screen.getAllByTestId("priority-item").length).toBe(1));
    expect(calls.some((u) => u.includes("/api/decisions"))).toBe(false);
    const radar = screen.getAllByTestId("priority-radar-item").map((el) => el.textContent);
    expect(radar.join(" ")).not.toMatch(/Compliance breach recorded/);
    expect(radar.join(" ")).toMatch(/Risk review overdue/);
  });
});
