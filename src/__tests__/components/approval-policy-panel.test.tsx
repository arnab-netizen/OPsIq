/**
 * ApprovalPolicyPanel — jsdom component test (browser-free UI proof).
 *
 * Proves the Executive Cockpit surface: the single most-restrictive action decision by default (action +
 * decision first, rationale, guardrail), the capability-gap recommendation, evidence collapsed in a
 * <details>, the summary counts, an honest empty state, and no fabricated money / disciplinary label /
 * hidden score.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ApprovalPolicyPanel, type ApprovalPolicyDecisionView, type ApprovalPolicyView } from "@/components/owner/ProcessIntelligencePanel";

afterEach(() => cleanup());

const decision = (over: Partial<ApprovalPolicyDecisionView> = {}): ApprovalPolicyDecisionView => ({
  actionKey: "k1",
  actionType: "REQUEST_MISSING_PROOF",
  title: "Request a fresh, job-specific proof",
  riskCategory: "OPERATIONAL",
  impactLevel: "LOW",
  confidence: "HIGH",
  approvalDecision: "AUTO_ALLOWED",
  requiredApprovalLevel: "STAFF",
  autoExecutable: true,
  blocked: false,
  rationale: "This is a safe, reversible action that commits no money, staff or legal state.",
  riskGuardrail: "It changes no money, staff, or legal state.",
  capabilityGap: false,
  missingCapabilityType: null,
  systemCapabilityRecommendation: null,
  supportingEvidenceIds: [],
  missingData: [],
  ...over,
});

const view = (over: Partial<ApprovalPolicyView> = {}): ApprovalPolicyView => ({
  decisions: [decision()],
  topDecision: decision(),
  summary: { autoAllowed: 1, managerRequired: 0, ownerRequired: 0, neverAuto: 0, needsData: 0 },
  capabilityRecommendations: [],
  ...over,
});

describe("ApprovalPolicyPanel", () => {
  it("shows the top action decision: action, decision badge, rationale, guardrail", () => {
    const { getByTestId } = render(<ApprovalPolicyPanel data={view()} />);
    expect(getByTestId("approval-policy-panel").getAttribute("data-approval-decision")).toBe("AUTO_ALLOWED");
    expect(getByTestId("app-action").textContent).toMatch(/fresh, job-specific proof/i);
    expect(getByTestId("app-decision").textContent).toMatch(/Auto-allowed/i);
    expect(getByTestId("app-rationale").textContent).toMatch(/safe, reversible/i);
    expect(getByTestId("app-guardrail").textContent).toMatch(/no money, staff/i);
  });

  it("surfaces an owner decision and a capability-gap recommendation", () => {
    const owner = decision({
      actionType: "REFUND_ABOVE_THRESHOLD", title: "Approve a refund above the routine threshold",
      approvalDecision: "OWNER_APPROVAL_REQUIRED", requiredApprovalLevel: "OWNER", autoExecutable: false,
      riskCategory: "FINANCIAL", impactLevel: "MEDIUM",
      capabilityGap: true, missingCapabilityType: "REFUND_RECONCILIATION",
      systemCapabilityRecommendation: "OpsIQ cannot yet reconcile a refund against a verified transaction ledger. Keep this an owner decision.",
    });
    const { getByTestId } = render(<ApprovalPolicyPanel data={view({ decisions: [owner], topDecision: owner, summary: { autoAllowed: 0, managerRequired: 0, ownerRequired: 1, neverAuto: 0, needsData: 0 } })} />);
    expect(getByTestId("app-decision").textContent).toMatch(/Owner approval required/i);
    expect(getByTestId("app-capability").textContent).toMatch(/reconcile a refund/i);
  });

  it("collapses evidence by default in a <details> element (no owner overload)", () => {
    const { getByTestId } = render(<ApprovalPolicyPanel data={view({
      decisions: [decision({ supportingEvidenceIds: ["p1", "p2"] })],
      topDecision: decision({ supportingEvidenceIds: ["p1", "p2"] }),
    })} />);
    const details = getByTestId("app-evidence");
    expect(details.tagName.toLowerCase()).toBe("details");
    expect(details.hasAttribute("open")).toBe(false);
  });

  it("renders only the top decision by default; the rest are behind a summary + a counts line", () => {
    const { getByTestId, queryAllByTestId } = render(<ApprovalPolicyPanel data={view({
      decisions: [
        decision({ actionType: "REPUTATION_RESPONSE", approvalDecision: "OWNER_APPROVAL_REQUIRED", title: "Respond to a reputation risk" }),
        decision({ actionKey: "k2", approvalDecision: "AUTO_ALLOWED", title: "Draft a checklist" }),
      ],
      topDecision: decision({ actionType: "REPUTATION_RESPONSE", approvalDecision: "OWNER_APPROVAL_REQUIRED", title: "Respond to a reputation risk" }),
      summary: { autoAllowed: 1, managerRequired: 0, ownerRequired: 1, neverAuto: 0, needsData: 0 },
    })} />);
    expect(queryAllByTestId("approval-policy-panel")).toHaveLength(1);
    expect(getByTestId("app-more").textContent).toMatch(/1 more action decision/i);
    expect(getByTestId("app-summary").textContent).toMatch(/1 owner/i);
  });

  it("renders an honest empty state when there is nothing to govern", () => {
    const { getByTestId, queryByTestId } = render(<ApprovalPolicyPanel data={{ decisions: [], topDecision: null, summary: { autoAllowed: 0, managerRequired: 0, ownerRequired: 0, neverAuto: 0, needsData: 0 }, capabilityRecommendations: [] }} />);
    expect(getByTestId("approval-policy-empty")).toBeTruthy();
    expect(queryByTestId("approval-policy-panel")).toBeNull();
  });

  it("a never-auto owner-only decision carries no fabricated money, no disciplinary label, no hidden score", () => {
    const never = decision({
      actionType: "MISCONDUCT_ACCUSATION", title: "Owner-only: investigate a neutral pattern in person",
      approvalDecision: "NEVER_AUTO", requiredApprovalLevel: "OWNER", autoExecutable: false, blocked: true,
      rationale: "This is a high-harm or irreversible action. OpsIQ never performs it automatically.",
      riskGuardrail: "OpsIQ prepares context only; the owner decides and acts in person.",
    });
    const { getByTestId, container } = render(<ApprovalPolicyPanel data={view({ decisions: [never], topDecision: never, summary: { autoAllowed: 0, managerRequired: 0, ownerRequired: 0, neverAuto: 1, needsData: 0 } })} />);
    expect(getByTestId("app-decision").textContent).toMatch(/Never auto-executed/i);
    const text = (container.textContent ?? "").toLowerCase();
    expect(text).not.toMatch(/[$£€]\s?\d/);
    expect(text).not.toMatch(/\b(fraud|negligence|fire|firing|payroll|discipline|punish)\b/);
    expect(text).not.toMatch(/\bscore\b/);
  });
});
