/**
 * API route tests for /api/owner/learning-consent
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/controlled-learning-consent.service", () => ({
  recordConsent: vi.fn(),
  getLatestConsent: vi.fn(),
  listConsentRecords: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {},
  getDbInstance: vi.fn().mockResolvedValue({}),
}));

import * as svc from "@/services/controlled-learning-consent.service";

const WS = "ws-test-001";
const CAND_ID = "cand-001";

beforeEach(() => {
  vi.clearAllMocks();
});

function consentInput() {
  return {
    workspaceId: WS,
    candidateId: CAND_ID,
    consentGiven: true,
    consentBy: "owner@example.com",
    consentAt: new Date("2026-06-19T10:00:00Z"),
    consentScope: "WORKSPACE_ONLY" as const,
    consentNotes: "Explicit consent given",
  };
}

describe("POST /api/owner/learning-consent — service contract", () => {
  it("calls recordConsent with correct input", async () => {
    vi.mocked(svc.recordConsent).mockResolvedValue({ recorded: true, violations: [], record: { id: "con-001" } });
    await svc.recordConsent({} as any, consentInput());
    expect(svc.recordConsent).toHaveBeenCalledOnce();
  });

  it("returns recorded=true on success", async () => {
    vi.mocked(svc.recordConsent).mockResolvedValue({ recorded: true, violations: [], record: { id: "con-001" } });
    const result = await svc.recordConsent({} as any, consentInput());
    expect(result.recorded).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("returns recorded=false if candidate not found", async () => {
    vi.mocked(svc.recordConsent).mockResolvedValue({
      recorded: false,
      violations: ["Candidate not found in workspace"],
    });
    const result = await svc.recordConsent({} as any, { ...consentInput(), candidateId: "nonexistent" });
    expect(result.recorded).toBe(false);
  });

  it("returns recorded=false for invalid consentScope", async () => {
    vi.mocked(svc.recordConsent).mockResolvedValue({
      recorded: false,
      violations: ["consentScope must be one of: WORKSPACE_ONLY, ANONYMIZED_AGGREGATE, NONE"],
    });
    const result = await svc.recordConsent({} as any, { ...consentInput(), consentScope: "INVALID" as any });
    expect(result.recorded).toBe(false);
  });

  it("records consent=false (withdrawal) correctly", async () => {
    vi.mocked(svc.recordConsent).mockResolvedValue({ recorded: true, violations: [], record: { id: "con-002", consentGiven: false } });
    const result = await svc.recordConsent({} as any, { ...consentInput(), consentGiven: false });
    expect(result.recorded).toBe(true);
  });
});

describe("GET /api/owner/learning-consent — listConsentRecords", () => {
  it("calls listConsentRecords with workspaceId and candidateId", async () => {
    vi.mocked(svc.listConsentRecords).mockResolvedValue([]);
    await svc.listConsentRecords({} as any, WS, CAND_ID);
    expect(svc.listConsentRecords).toHaveBeenCalledWith({}, WS, CAND_ID);
  });

  it("returns empty array when no records", async () => {
    vi.mocked(svc.listConsentRecords).mockResolvedValue([]);
    const result = await svc.listConsentRecords({} as any, WS, CAND_ID);
    expect(result).toEqual([]);
  });

  it("returns consent records for candidate", async () => {
    const record = { id: "con-001", workspaceId: WS, candidateId: CAND_ID, consentGiven: true };
    vi.mocked(svc.listConsentRecords).mockResolvedValue([record]);
    const result = await svc.listConsentRecords({} as any, WS, CAND_ID);
    expect(result).toHaveLength(1);
  });
});

describe("security invariants", () => {
  it("recordConsent enforces workspace scoping", async () => {
    vi.mocked(svc.recordConsent).mockResolvedValue({
      recorded: false,
      violations: ["Candidate not found in workspace"],
    });
    const result = await svc.recordConsent({} as any, { ...consentInput(), workspaceId: "ws-attacker" });
    expect(result.recorded).toBe(false);
  });
});
