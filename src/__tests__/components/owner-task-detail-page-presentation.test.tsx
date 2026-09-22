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
import { render, cleanup, screen } from "@testing-library/react";
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

    expect(await screen.findByText("MANAGER")).toBeInTheDocument();
    expect(screen.queryByText(RAW_UUID)).not.toBeInTheDocument();
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

describe("Candidate 9 (NOT authorized this phase) — dead 'Review & Approve' link is untouched", () => {
  it("COMPLETED_PENDING_REVIEW still links to the nonexistent /complete route, unchanged", async () => {
    installFetchMock(baseTask({ status: "COMPLETED_PENDING_REVIEW" }));
    render(<TaskDetailPage />);

    const link = await screen.findByRole("link", { name: "Review & Approve" });
    expect(link).toHaveAttribute("href", `/owner/tasks/11111111-1111-4111-8111-111111111111/complete`);
  });
});
