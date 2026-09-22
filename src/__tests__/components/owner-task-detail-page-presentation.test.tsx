/**
 * /owner/tasks/[taskId] — presentation-only regression proof (UX-05B, cosmetic scope only).
 *
 * Covers exactly two authorized candidates from docs/opsiq/ux/UX-05A-ACTIONS-LAYER-CONTRACT.md:
 *  - Candidate 7: "Assigned to" fell back to the raw assignedUserId UUID when assignedRole was
 *    null, contradicting the sibling list page's own already-shipped safe fallback.
 *  - Candidate 8: status-history rows rendered the raw TaskActorRole enum token
 *    (EMPLOYEE/MANAGER/OWNER/SYSTEM) instead of a humanized label.
 *
 * The dead "Review & Approve" link (Candidate 9) is explicitly NOT authorized for this phase and
 * is asserted here to still exist unchanged, so this test suite cannot silently drift into
 * covering that separately-authorized workflow repair.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import TaskDetailPage from "@/app/(authenticated)/owner/tasks/[taskId]/page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ taskId: "11111111-1111-4111-8111-111111111111" }),
}));

const RAW_UUID = "22222222-2222-4222-8222-222222222222";

function baseTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Follow up with overdue accounts",
    description: null,
    status: "IN_PROGRESS",
    priority: null,
    assignedUserId: null,
    assignedRole: null,
    dueAt: null,
    workStartedAt: null,
    createdAt: new Date().toISOString(),
    proofRequirementId: null,
    sourceOperatorItemId: null,
    proof: null,
    proofRequirement: null,
    statusHistory: [],
    ...overrides,
  };
}

function installFetchMock(task: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ task }) } as Response))
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Candidate 7 — /owner/tasks/[taskId] 'Assigned to' never leaks a raw UUID", () => {
  it("renders 'Assigned' (not the raw UUID) when only assignedUserId is set", async () => {
    installFetchMock(baseTask({ assignedRole: null, assignedUserId: RAW_UUID }));
    render(<TaskDetailPage />);

    expect(await screen.findByText("Assigned")).toBeInTheDocument();
    expect(screen.queryByText(RAW_UUID)).not.toBeInTheDocument();
  });

  it("renders '—' when neither assignedRole nor assignedUserId is set", async () => {
    installFetchMock(baseTask({ assignedRole: null, assignedUserId: null }));
    render(<TaskDetailPage />);

    await screen.findByText("Follow up with overdue accounts");
    const label = screen.getByText("Assigned to:");
    expect(label.parentElement?.textContent).toContain("—");
  });

  it("still renders the role when assignedRole is set (unaffected by the fix)", async () => {
    installFetchMock(baseTask({ assignedRole: "MANAGER", assignedUserId: RAW_UUID }));
    render(<TaskDetailPage />);

    expect(await screen.findByText("Manager")).toBeInTheDocument();
    expect(screen.queryByText(RAW_UUID)).not.toBeInTheDocument();
  });
});

// UX-06A1 hostile-audit remediation: assignedRole must render humanized, never the
// raw "MANAGER"/"STAFF" token — the test above previously asserted the wrong
// (raw-leaking) behavior as correct.
describe("UX-06A1 — /owner/tasks/[taskId] 'Assigned to' humanizes assignedRole", () => {
  it("assignedRole 'MANAGER' renders 'Manager', never the raw token", async () => {
    installFetchMock(baseTask({ assignedRole: "MANAGER" }));
    render(<TaskDetailPage />);

    expect(await screen.findByText("Manager")).toBeInTheDocument();
    expect(screen.queryByText("MANAGER")).not.toBeInTheDocument();
  });

  it("assignedRole 'STAFF' renders 'Staff', never the raw token", async () => {
    installFetchMock(baseTask({ assignedRole: "STAFF" }));
    render(<TaskDetailPage />);

    expect(await screen.findByText("Staff")).toBeInTheDocument();
    expect(screen.queryByText("STAFF")).not.toBeInTheDocument();
  });
});

describe("Candidate 8 — /owner/tasks/[taskId] status history humanizes TaskActorRole", () => {
  it("renders 'Employee', 'Manager', 'Owner', and 'System' -- never the raw enum tokens", async () => {
    installFetchMock(
      baseTask({
        statusHistory: [
          { id: "h1", fromStatus: null, toStatus: "ASSIGNED", actorId: "u1", actorRole: "OWNER", occurredAt: new Date().toISOString() },
          { id: "h2", fromStatus: "ASSIGNED", toStatus: "ACKNOWLEDGED", actorId: "u2", actorRole: "EMPLOYEE", occurredAt: new Date().toISOString() },
          { id: "h3", fromStatus: "ACKNOWLEDGED", toStatus: "IN_PROGRESS", actorId: "u3", actorRole: "MANAGER", occurredAt: new Date().toISOString() },
          { id: "h4", fromStatus: "IN_PROGRESS", toStatus: "EXPIRED", actorId: null, actorRole: "SYSTEM", occurredAt: new Date().toISOString() },
        ],
      })
    );
    render(<TaskDetailPage />);

    expect(await screen.findByText("(Owner)")).toBeInTheDocument();
    expect(screen.getByText("(Employee)")).toBeInTheDocument();
    expect(screen.getByText("(Manager)")).toBeInTheDocument();
    expect(screen.getByText("(System)")).toBeInTheDocument();
    expect(screen.queryByText("(OWNER)")).not.toBeInTheDocument();
    expect(screen.queryByText("(EMPLOYEE)")).not.toBeInTheDocument();
    expect(screen.queryByText("(MANAGER)")).not.toBeInTheDocument();
    expect(screen.queryByText("(SYSTEM)")).not.toBeInTheDocument();
  });

  it("a history row with no actorRole renders no parenthetical at all (unaffected by the fix)", async () => {
    installFetchMock(
      baseTask({
        statusHistory: [
          { id: "h1", fromStatus: null, toStatus: "ASSIGNED", actorId: null, actorRole: null, occurredAt: new Date().toISOString() },
        ],
      })
    );
    render(<TaskDetailPage />);
    await screen.findByText("Follow up with overdue accounts");
    expect(screen.queryByText(/\(.*\)/)).not.toBeInTheDocument();
  });
});

describe("UX-06 Wave A1 (Section G8) — AI Precheck owner wording", () => {
  it("renders 'Automatically checked — passed' for AI_PRECHECK_PASSED, never the raw label", async () => {
    installFetchMock(
      baseTask({
        proofRequirementId: "pr1",
        proof: { status: "AI_PRECHECK_PASSED", duplicateFlagged: false },
      })
    );
    render(<TaskDetailPage />);

    expect(await screen.findByText("Automatically checked — passed")).toBeInTheDocument();
    expect(screen.queryByText("AI Precheck Passed")).not.toBeInTheDocument();
  });

  it("renders 'Automatically checked — needs review' for AI_PRECHECK_FAILED, never the raw label", async () => {
    installFetchMock(
      baseTask({
        proofRequirementId: "pr1",
        proof: { status: "AI_PRECHECK_FAILED", duplicateFlagged: false },
      })
    );
    render(<TaskDetailPage />);

    expect(await screen.findByText("Automatically checked — needs review")).toBeInTheDocument();
    expect(screen.queryByText("AI Precheck Failed")).not.toBeInTheDocument();
  });
});

// UX-06 Wave A2 (Section T.2, Candidate 9): the dead "Review & Approve" link to a
// nonexistent /complete route is repaired into a same-page final-approval block.
// The behavioral approval flow itself (POST call, blocked-reason mapping, success
// reload, double-submit guard) is covered in owner-task-approval.test.tsx; this file
// stays scoped to presentation.
describe("UX-06 Wave A2 — /owner/tasks/[taskId] same-page 'Ready for approval' presentation", () => {
  it("COMPLETED_PENDING_REVIEW with no proof requirement renders 'Ready for approval' and 'Approve task', never the old dead link", async () => {
    installFetchMock(baseTask({ status: "COMPLETED_PENDING_REVIEW", proofRequirementId: null }));
    render(<TaskDetailPage />);

    expect(await screen.findByText("Ready for approval")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve task" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "The work has been completed. Review the details above, then approve it to mark this task as complete."
      )
    ).toBeInTheDocument();

    expect(screen.queryByText("Review & Approve")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Review & Approve" })).not.toBeInTheDocument();
    const complete = screen.queryAllByRole("link").filter((el) => el.getAttribute("href")?.endsWith("/complete"));
    expect(complete).toHaveLength(0);
  });
});

describe("UX-06 Wave A2 — Proof panel remains above the approval action", () => {
  it("a proof-required pending-review task still renders Proof, the proof-aware copy, and no second proof-review step, with Proof before Ready for approval in document order", async () => {
    installFetchMock(
      baseTask({
        status: "COMPLETED_PENDING_REVIEW",
        proofRequirementId: "pr1",
        proofRequirement: { id: "pr1", proofType: "PHOTO", riskLevel: "LOW", reviewerRole: null, ownerOverrideAllowed: false },
        proof: {
          id: "proof1",
          status: "ACCEPTED",
          proofType: "PHOTO",
          submittedByUserId: "u1",
          submittedAt: new Date().toISOString(),
          reviewedByUserId: "u2",
          reviewedAt: new Date().toISOString(),
          reviewReason: null,
          duplicateFlagged: false,
        },
      })
    );
    render(<TaskDetailPage />);

    await screen.findByText("Ready for approval");

    expect(screen.getByText("Proof")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The work has been completed. Review the details and any proof above, then approve it to mark this task as complete."
      )
    ).toBeInTheDocument();

    // Document order: Proof heading must precede the approval heading.
    const proofHeading = screen.getByText("Proof");
    const approvalHeading = screen.getByText("Ready for approval");
    expect(proofHeading.compareDocumentPosition(approvalHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // No re-selection of already-accepted proof, no extra confirmation control.
    expect(screen.queryByText("Submit proof")).not.toBeInTheDocument();
    expect(screen.queryByText("Review proof")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /submit review/i })).not.toBeInTheDocument();
  });
});

describe("Candidate 9 — dead 'Review & Approve' link no longer exists anywhere in the file", () => {
  it("no link anywhere in a rendered COMPLETED_PENDING_REVIEW page points at /complete", async () => {
    installFetchMock(baseTask({ status: "COMPLETED_PENDING_REVIEW" }));
    render(<TaskDetailPage />);

    await screen.findByText("Ready for approval");
    const links = screen.queryAllByRole("link");
    for (const link of links) {
      expect(link.getAttribute("href")).not.toMatch(/\/complete$/);
    }
  });
});

// UX-06 Wave B1 (Section K, N): Submit proof / Review proof previously used placeholder-only
// fields with no persistent <label>, an accessibility/labeling gap. Payload/handler unchanged.
describe("UX-06 Wave B1 — Submit proof / Review proof persistent label associations", () => {
  it("Submit proof: Proof type and Note have persistent, correctly-associated labels", async () => {
    installFetchMock(
      baseTask({
        status: "PROOF_REQUIRED",
        proofRequirementId: "pr1",
        proofRequirement: { id: "pr1", proofType: "PHOTO", riskLevel: "LOW", reviewerRole: null, ownerOverrideAllowed: false },
      })
    );
    render(<TaskDetailPage />);

    const proofTypeSelect = await screen.findByLabelText("Proof type");
    expect(proofTypeSelect.tagName).toBe("SELECT");
    const noteInput = screen.getByLabelText("Note");
    expect(noteInput.tagName).toBe("INPUT");
  });

  it("Review proof: Outcome has a persistent label, and Rejection reason gains one only once Reject is selected", async () => {
    installFetchMock(
      baseTask({
        status: "IN_PROGRESS",
        proofRequirementId: "pr1",
        proofRequirement: { id: "pr1", proofType: "PHOTO", riskLevel: "LOW", reviewerRole: null, ownerOverrideAllowed: false },
        proof: {
          id: "proof1",
          status: "SUBMITTED",
          proofType: "PHOTO",
          submittedByUserId: "u1",
          submittedAt: new Date().toISOString(),
          reviewedByUserId: null,
          reviewedAt: null,
          reviewReason: null,
          duplicateFlagged: false,
        },
      })
    );
    render(<TaskDetailPage />);

    const outcomeSelect = await screen.findByLabelText("Outcome");
    expect(outcomeSelect.tagName).toBe("SELECT");
    expect(screen.queryByLabelText("Rejection reason")).not.toBeInTheDocument();

    fireEvent.change(outcomeSelect, { target: { value: "REJECTED" } });
    const rejectionInput = screen.getByLabelText("Rejection reason");
    expect(rejectionInput.tagName).toBe("INPUT");
  });
});
